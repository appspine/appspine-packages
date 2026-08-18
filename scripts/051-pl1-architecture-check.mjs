#!/usr/bin/env node
/**
 * PL1-07 — package / manifest / import / peer graph validator.
 *
 * PL0-07's build-graph checker proved TypeScript project references match `package.json`
 * dependencies. This one closes the remaining gaps that only exist once plugins do: a manifest that
 * requires a capability nothing provides, a source import of a package that is not declared, a
 * framework range the manifest and the peer dependencies disagree about, a foundation package that
 * reverse-depends on a capability plugin, or an import that reaches into another package's `dist/`
 * or `src/`.
 *
 * Every rule reads the working tree directly — never a snapshot of itself — so a generator bug
 * cannot make a check pass (the mistake PL0-07's independent review caught in `051-pl0-build-graph-check`).
 *
 * Usage:
 *   node scripts/051-pl1-architecture-check.mjs              # check the workspace
 *   node scripts/051-pl1-architecture-check.mjs --self-test  # prove each rule actually fires
 */

import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');

/** Host-owned singletons: one copy per App, so the manifest and the peers must agree exactly. */
const HOST_SINGLETON_PEERS = [
  '@nestjs/common',
  '@nestjs/core',
  '@prisma/client',
  'next',
  'react',
  'react-dom',
];

/** Foundation and platform packages must never depend on a capability plugin (051 plan §6.1). */
const FOUNDATION_PACKAGES = new Set([
  '@appspine/common',
  '@appspine/integration-contracts',
  '@appspine/e2e-kit',
  '@appspine/plugin-api',
  '@appspine/plugin-testkit',
  '@appspine/plugin-host-nest',
  '@appspine/plugin-cli',
]);

/** Capabilities the App or host supplies; a plugin may require them with no plugin installed. */
const AMBIENT_CAPABILITIES = new Set([
  'appspine.prisma',
  'appspine.principal-context',
  'appspine.authentication-strategy-registry',
]);

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Node builtins are legitimately imported without a declaration, with or without `node:`. */
const NODE_BUILTINS = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'os',
  'path',
  'process',
  'stream',
  'timers',
  'url',
  'util',
  'worker_threads',
  'zlib',
]);

/** A real specifier, not something the regex scraped out of a string literal or a comment. */
const SPECIFIER_SHAPE = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w.@-]+)*$/i;

function externalSpecifiers(source) {
  const found = new Set();
  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let match = re.exec(source);
    while (match !== null) {
      const specifier = match[1];
      const skip =
        specifier.startsWith('.') ||
        specifier.startsWith('node:') ||
        // tsconfig path alias, not a package
        specifier.startsWith('@/') ||
        NODE_BUILTINS.has(packageNameOf(specifier)) ||
        !SPECIFIER_SHAPE.test(specifier);
      if (!skip) found.add(specifier);
      match = re.exec(source);
    }
  }
  return found;
}

/** `@appspine/plugin-api/loader` -> `@appspine/plugin-api`; `zod/v4` -> `zod`. */
function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function loadWorkspace() {
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')))
    .map((dir) => {
      const pkg = readJson(path.join(dir, 'package.json'));
      const manifestPath = path.join(dir, 'appspine.plugin.json');
      return {
        dir,
        name: pkg.name,
        pkg,
        manifest: fs.existsSync(manifestPath) ? readJson(manifestPath) : null,
        tsconfigBuild: fs.existsSync(path.join(dir, 'tsconfig.build.json'))
          ? readJson(path.join(dir, 'tsconfig.build.json'))
          : null,
      };
    });
}

// --- rules ---------------------------------------------------------------------------------

/** Files that never reach a consumer, so a devDependency import in them is legitimate. */
function isTestOnlyFile(file) {
  // Both separators: `path.join` yields backslashes on Windows, forward slashes everywhere else.
  return /\.(spec|test)\.tsx?$/.test(file) || /[\\/]test-support\.ts$/.test(file);
}

/**
 * Every non-relative import must be declared — but *shipped* source may only use dependencies the
 * consumer will actually have.
 *
 * Gate G1's independent review broke the earlier version by importing `vitest` from
 * `identity-core/src/index.ts`: vitest is a devDependency, the checker accepted it, and the
 * published package would have failed at require time in every consumer. devDependencies are only
 * installed here, so they count as declared only in test files.
 */
function checkDeclaredImports(pkgInfo, findings) {
  const shipped = new Set([
    ...Object.keys(pkgInfo.pkg.dependencies ?? {}),
    ...Object.keys(pkgInfo.pkg.peerDependencies ?? {}),
    ...Object.keys(pkgInfo.pkg.optionalDependencies ?? {}),
  ]);
  const devOnly = new Set(Object.keys(pkgInfo.pkg.devDependencies ?? {}));

  for (const file of listSourceFiles(path.join(pkgInfo.dir, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    const testOnly = isTestOnlyFile(file);
    for (const specifier of externalSpecifiers(source)) {
      const name = packageNameOf(specifier);
      if (name === pkgInfo.name) continue;
      if (shipped.has(name)) continue;
      if (testOnly && devOnly.has(name)) continue;
      findings.push({
        code: 'undeclared-dependency',
        package: pkgInfo.name,
        detail: devOnly.has(name)
          ? `${path.relative(repoRoot, file)} is shipped source but imports "${specifier}", which is only a devDependency`
          : `${path.relative(repoRoot, file)} imports "${specifier}" but "${name}" is not in package.json`,
      });
    }
  }
}

/** No package may reach into another package's build output or sources. */
function checkForbiddenInternalImports(pkgInfo, findings) {
  for (const file of listSourceFiles(path.join(pkgInfo.dir, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of externalSpecifiers(source)) {
      if (!specifier.startsWith('@appspine/')) continue;
      const subpath = specifier.split('/').slice(2).join('/');
      if (subpath.startsWith('dist') || subpath.startsWith('src')) {
        findings.push({
          code: 'forbidden-internal-import',
          package: pkgInfo.name,
          detail: `${path.relative(repoRoot, file)} imports "${specifier}"; use a public subpath`,
        });
      }
    }
  }
}

/** Foundation and platform packages must not depend on a capability plugin. */
function checkFoundationDirection(pkgInfo, capabilityPackages, findings) {
  if (!FOUNDATION_PACKAGES.has(pkgInfo.name)) return;
  const runtimeDeps = [
    ...Object.keys(pkgInfo.pkg.dependencies ?? {}),
    ...Object.keys(pkgInfo.pkg.peerDependencies ?? {}),
  ];
  for (const dep of runtimeDeps) {
    if (capabilityPackages.has(dep)) {
      findings.push({
        code: 'foundation-reverse-dependency',
        package: pkgInfo.name,
        detail: `foundation package depends on capability plugin "${dep}"`,
      });
    }
  }
}

/** A manifest's `engine.frameworks` and the package's peer ranges must agree, exactly. */
function checkFrameworkPeers(pkgInfo, findings) {
  if (!pkgInfo.manifest) return;
  const peers = pkgInfo.pkg.peerDependencies ?? {};
  const frameworks = pkgInfo.manifest.engine?.frameworks ?? {};

  for (const [name, range] of Object.entries(frameworks)) {
    if (peers[name] === undefined) {
      findings.push({
        code: 'framework-not-a-peer',
        package: pkgInfo.name,
        detail: `manifest declares framework "${name}" that is not a peer dependency`,
      });
    } else if (peers[name] !== range) {
      findings.push({
        code: 'framework-peer-range-mismatch',
        package: pkgInfo.name,
        detail: `manifest says "${name}": "${range}" but package.json peer says "${peers[name]}"`,
      });
    }
  }

  for (const name of HOST_SINGLETON_PEERS) {
    if (peers[name] !== undefined && frameworks[name] === undefined) {
      findings.push({
        code: 'host-singleton-peer-not-declared',
        package: pkgInfo.name,
        detail: `"${name}" is a host-owned singleton peer but the manifest does not declare it`,
      });
    }
  }
}

/** Workspace dependency and peer ranges must accept the version that would actually be packed. */
function checkWorkspaceRanges(pkgInfo, versionByPackage, findings) {
  const sections = ['dependencies', 'peerDependencies', 'optionalDependencies'];
  for (const section of sections) {
    for (const [name, declaredRange] of Object.entries(pkgInfo.pkg[section] ?? {})) {
      const workspaceVersion = versionByPackage.get(name);
      if (!workspaceVersion || typeof declaredRange !== 'string') continue;

      let range = declaredRange;
      if (range.startsWith('workspace:')) {
        range = range.slice('workspace:'.length);
        if (range === '*' || range === '^' || range === '~') continue;
      }
      if (range.startsWith('file:') || range.startsWith('link:')) continue;
      if (!semver.valid(workspaceVersion) || !semver.validRange(range)) continue;

      if (!semver.satisfies(workspaceVersion, range, { includePrerelease: true })) {
        findings.push({
          code: 'workspace-version-range-mismatch',
          package: pkgInfo.name,
          detail: `${section} requires "${name}": "${declaredRange}" but the workspace package is ${workspaceVersion}`,
        });
      }
    }
  }
}

/** A manifest's facet targets must exist in `files` and `exports`. */
function checkFacetExports(pkgInfo, findings) {
  if (!pkgInfo.manifest) return;
  const files = pkgInfo.pkg.files ?? [];
  const exports = pkgInfo.pkg.exports ?? {};

  if (!exports['./plugin']) {
    findings.push({
      code: 'missing-plugin-subpath',
      package: pkgInfo.name,
      detail: 'a package with a manifest must export "./plugin"',
    });
  }
  if (!files.includes('appspine.plugin.json')) {
    findings.push({
      code: 'manifest-not-published',
      package: pkgInfo.name,
      detail: 'appspine.plugin.json is not in the package files allowlist',
    });
  }

  const backendPath = pkgInfo.manifest.facets?.backend?.modulePath;
  if (backendPath && !files.includes('dist')) {
    findings.push({
      code: 'backend-not-published',
      package: pkgInfo.name,
      detail: `backend facet points at "${backendPath}" but "dist" is not published`,
    });
  }

  if (['identity-core', 'oidc-auth'].includes(pkgInfo.manifest.id) && !exports['./frontend']) {
    findings.push({
      code: 'missing-reserved-frontend-subpath',
      package: pkgInfo.name,
      detail: 'Phase 1 identity packages must reserve and publish "./frontend"',
    });
  }

  if (pkgInfo.manifest.id === 'oidc-auth' && !pkgInfo.manifest.configSchema) {
    findings.push({
      code: 'missing-oidc-config-schema',
      package: pkgInfo.name,
      detail: 'oidc-auth must declare the config schema consumed by the host',
    });
  }

  const fragment = pkgInfo.manifest.facets?.prisma?.schemaFragment;
  if (fragment && !fs.existsSync(path.join(pkgInfo.dir, fragment))) {
    findings.push({
      code: 'missing-schema-fragment',
      package: pkgInfo.name,
      detail: `prisma facet points at "${fragment}", which does not exist`,
    });
  }
  if (fragment && !exports[`./${fragment}`]) {
    findings.push({
      code: 'schema-fragment-not-exported',
      package: pkgInfo.name,
      detail: `"./${fragment}" is not in the package exports map`,
    });
  }
}

/**
 * Every workspace package a package *imports* must have a matching TypeScript project reference.
 *
 * Imported, not merely declared. A project reference exists so `tsc -b` compiles a dependency
 * first; a package reached only through a DI token (`@appspine/m2m-api-key` -> `RBAC_POLICY`) has
 * a real runtime relationship and no compile-time one. Requiring a reference there also puts this
 * rule in direct conflict with PL0-07's "no unused references" check, which fails on exactly the
 * reference this one would demand.
 */
function checkProjectReferences(pkgInfo, workspaceNames, findings) {
  if (!pkgInfo.tsconfigBuild) return;
  const referenced = new Set(
    (pkgInfo.tsconfigBuild.references ?? []).map((entry) =>
      path.basename(path.dirname(entry.path)),
    ),
  );
  const imported = new Set();
  for (const file of listSourceFiles(path.join(pkgInfo.dir, 'src'))) {
    if (isTestOnlyFile(file)) continue;
    for (const specifier of externalSpecifiers(fs.readFileSync(file, 'utf8'))) {
      imported.add(packageNameOf(specifier));
    }
  }
  const deps = [
    ...Object.keys(pkgInfo.pkg.dependencies ?? {}),
    ...Object.keys(pkgInfo.pkg.peerDependencies ?? {}),
  ].filter((name) => workspaceNames.has(name) && imported.has(name));

  for (const dep of deps) {
    const dirName = dep.replace('@appspine/', '');
    if (!referenced.has(dirName)) {
      findings.push({
        code: 'missing-project-reference',
        package: pkgInfo.name,
        detail: `depends on "${dep}" but tsconfig.build.json has no reference to ../${dirName}`,
      });
    }
  }
}

/** Manifest requirements must be satisfiable by something in the workspace or by the host. */
function checkCapabilityGraph(packages, findings) {
  const provided = new Map();
  for (const pkgInfo of packages) {
    for (const capability of pkgInfo.manifest?.provides ?? []) {
      provided.set(capability, [...(provided.get(capability) ?? []), pkgInfo.name]);
    }
  }

  for (const pkgInfo of packages) {
    if (!pkgInfo.manifest) continue;
    for (const capability of pkgInfo.manifest.requires ?? []) {
      if (AMBIENT_CAPABILITIES.has(capability) || provided.has(capability)) continue;
      findings.push({
        code: 'unsatisfiable-requirement',
        package: pkgInfo.name,
        detail: `requires "${capability}", which nothing in the workspace provides`,
      });
    }
  }

  for (const [capability, providers] of provided) {
    if (providers.length > 1) {
      findings.push({
        code: 'duplicate-capability-provider',
        package: providers.join(', '),
        detail: `"${capability}" is provided by more than one package`,
      });
    }
  }
}

/**
 * A manifest requirement and a package dependency are different things and neither substitutes for
 * the other (051 plan §6.1) — but importing a package whose capability you never declared is a
 * runtime dependency hidden from the resolver.
 */
function checkManifestMatchesImports(pkgInfo, capabilityByPackage, findings) {
  if (!pkgInfo.manifest) return;
  const declared = new Set([
    ...(pkgInfo.manifest.requires ?? []),
    ...(pkgInfo.manifest.optionalRequires ?? []),
    ...(pkgInfo.manifest.provides ?? []),
  ]);

  const imported = new Set();
  for (const file of listSourceFiles(path.join(pkgInfo.dir, 'src'))) {
    if (/\.spec\.ts$/.test(file)) continue;
    for (const specifier of externalSpecifiers(fs.readFileSync(file, 'utf8'))) {
      imported.add(packageNameOf(specifier));
    }
  }

  for (const packageName of imported) {
    const capability = capabilityByPackage.get(packageName);
    if (!capability || packageName === pkgInfo.name) continue;
    if (!declared.has(capability)) {
      findings.push({
        code: 'undeclared-capability-requirement',
        package: pkgInfo.name,
        detail: `imports "${packageName}" (provides "${capability}") without declaring it in requires/optionalRequires`,
      });
    }
  }
}

export function runChecks(packages) {
  const findings = [];
  const workspaceNames = new Set(packages.map((entry) => entry.name));
  const versionByPackage = new Map(packages.map((entry) => [entry.name, entry.pkg.version]));
  const capabilityPackages = new Set(
    packages.filter((entry) => entry.manifest !== null).map((entry) => entry.name),
  );
  const capabilityByPackage = new Map();
  for (const pkgInfo of packages) {
    const first = pkgInfo.manifest?.provides?.[0];
    if (first) capabilityByPackage.set(pkgInfo.name, first);
  }

  for (const pkgInfo of packages) {
    checkDeclaredImports(pkgInfo, findings);
    checkForbiddenInternalImports(pkgInfo, findings);
    checkFoundationDirection(pkgInfo, capabilityPackages, findings);
    checkFrameworkPeers(pkgInfo, findings);
    checkWorkspaceRanges(pkgInfo, versionByPackage, findings);
    checkFacetExports(pkgInfo, findings);
    checkProjectReferences(pkgInfo, workspaceNames, findings);
    checkManifestMatchesImports(pkgInfo, capabilityByPackage, findings);
  }
  checkCapabilityGraph(packages, findings);

  return findings.sort((a, b) =>
    `${a.package}${a.code}${a.detail}` < `${b.package}${b.code}${b.detail}` ? -1 : 1,
  );
}

// --- self-test -------------------------------------------------------------------------------

/**
 * Deliberately-broken packages, one per rule. A checker nobody has watched fail is a checker
 * nobody knows works — Gate G0 found two PL0 scripts that could not fail for their stated reason,
 * and Gate G1's independent review found this suite covered 7 of the rules while the docs claimed
 * all of them, including one rule (`undeclared-capability-requirement`) that the real workspace is
 * structurally incapable of triggering because no plugin package imports another.
 */
function selfTest() {
  const cases = [
    {
      name: 'undeclared dependency',
      expect: 'undeclared-dependency',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': { name: '@appspine/broken', dependencies: {} },
          'src/index.ts': "import { x } from 'lodash';\nexport { x };\n",
        }),
      }),
    },
    {
      name: 'dist import',
      expect: 'forbidden-internal-import',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': { name: '@appspine/broken', dependencies: { '@appspine/rbac': '*' } },
          'src/index.ts': "export * from '@appspine/rbac/dist/index';\n",
        }),
      }),
    },
    {
      name: 'foundation reverse dependency',
      expect: 'foundation-reverse-dependency',
      fixture: () => ({
        name: '@appspine/plugin-api',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/plugin-api',
            dependencies: { '@appspine/audit-log': '*' },
          },
        }),
        extra: [
          {
            name: '@appspine/audit-log',
            manifest: { id: 'audit-log', provides: ['appspine.audit-sink'] },
          },
        ],
      }),
    },
    {
      name: 'peer range mismatch',
      expect: 'framework-peer-range-mismatch',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/broken',
            files: ['appspine.plugin.json'],
            exports: { './plugin': './dist/plugin.js' },
            peerDependencies: { '@nestjs/common': '^11.0.5' },
          },
          'appspine.plugin.json': {
            id: 'broken',
            provides: [],
            requires: [],
            engine: { frameworks: { '@nestjs/common': '^10.0.0' } },
            facets: {},
          },
        }),
      }),
    },
    {
      name: 'missing project reference',
      expect: 'missing-project-reference',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'src/index.ts': "export * from '@appspine/rbac';\n",
          'package.json': { name: '@appspine/broken', dependencies: { '@appspine/rbac': '*' } },
          'tsconfig.build.json': { references: [] },
        }),
        extra: [{ name: '@appspine/rbac', manifest: null }],
      }),
    },
    {
      name: 'unsatisfiable requirement',
      expect: 'unsatisfiable-requirement',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/broken',
            files: ['appspine.plugin.json'],
            exports: { './plugin': './dist/plugin.js' },
          },
          'appspine.plugin.json': {
            id: 'broken',
            provides: [],
            requires: ['appspine.nothing-provides-this'],
            engine: {},
            facets: {},
          },
        }),
      }),
    },
    {
      name: 'devDependency imported from shipped source',
      expect: 'undeclared-dependency',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': { name: '@appspine/broken', devDependencies: { vitest: '^3.2.4' } },
          'src/index.ts': "import { expect } from 'vitest';\nexport { expect };\n",
        }),
      }),
    },
    {
      name: 'devDependency imported from a spec file (must NOT fire)',
      expect: null,
      fixture: () => ({
        name: '@appspine/fine',
        dir: makeTempPackage({
          'package.json': { name: '@appspine/fine', devDependencies: { vitest: '^3.2.4' } },
          'src/thing.spec.ts': "import { expect } from 'vitest';\nexpect(1).toBe(1);\n",
        }),
      }),
    },
    {
      name: 'manifest not in the files allowlist',
      expect: 'manifest-not-published',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/broken',
            files: ['dist'],
            exports: { './plugin': './dist/plugin.js' },
          },
          'appspine.plugin.json': { id: 'broken', provides: [], requires: [], facets: {} },
        }),
      }),
    },
    {
      name: 'plugin subpath not exported',
      expect: 'missing-plugin-subpath',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/broken',
            files: ['dist', 'appspine.plugin.json'],
            exports: {},
          },
          'appspine.plugin.json': { id: 'broken', provides: [], requires: [], facets: {} },
        }),
      }),
    },
    {
      name: 'prisma fragment declared but missing on disk',
      expect: 'missing-schema-fragment',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/broken',
            files: ['dist', 'appspine.plugin.json'],
            exports: { './plugin': './dist/plugin.js' },
          },
          'appspine.plugin.json': {
            id: 'broken',
            provides: [],
            requires: [],
            facets: { prisma: { schemaFragment: 'prisma/nope.prisma' } },
          },
        }),
      }),
    },
    {
      name: 'imports a capability package it never declared',
      expect: 'undeclared-capability-requirement',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/broken',
            files: ['dist', 'appspine.plugin.json'],
            exports: { './plugin': './dist/plugin.js' },
            dependencies: { '@appspine/audit-log': '*' },
          },
          'appspine.plugin.json': {
            id: 'broken',
            provides: [],
            requires: [],
            facets: {},
          },
          'src/index.ts': "export { AuditLogService } from '@appspine/audit-log';\n",
        }),
        extra: [
          {
            name: '@appspine/audit-log',
            manifest: { id: 'audit-log', provides: ['appspine.audit-sink'] },
          },
        ],
      }),
    },
    {
      name: 'workspace peer range mismatch',
      expect: 'workspace-version-range-mismatch',
      fixture: () => ({
        name: '@appspine/broken',
        dir: makeTempPackage({
          'package.json': {
            name: '@appspine/broken',
            version: '1.0.0',
            peerDependencies: { '@appspine/rbac': '^1.0.0' },
          },
        }),
        extra: [
          {
            name: '@appspine/rbac',
            pkg: { name: '@appspine/rbac', version: '4.0.8' },
            manifest: null,
          },
        ],
      }),
    },
  ];

  let failed = 0;
  for (const testCase of cases) {
    const built = testCase.fixture();
    const packages = [
      {
        dir: built.dir,
        name: built.name,
        pkg: readJson(path.join(built.dir, 'package.json')),
        manifest: fs.existsSync(path.join(built.dir, 'appspine.plugin.json'))
          ? readJson(path.join(built.dir, 'appspine.plugin.json'))
          : null,
        tsconfigBuild: fs.existsSync(path.join(built.dir, 'tsconfig.build.json'))
          ? readJson(path.join(built.dir, 'tsconfig.build.json'))
          : null,
      },
      ...(built.extra ?? []).map((entry) => ({
        dir: built.dir,
        name: entry.name,
        pkg: entry.pkg ?? { name: entry.name },
        manifest: entry.manifest,
        tsconfigBuild: null,
      })),
    ];

    const codes = runChecks(packages).map((finding) => finding.code);
    // `expect: null` is a *negative* case: the rule must stay silent. Without these, tightening a
    // rule until it fires on everything would look like progress.
    const ok = testCase.expect === null ? codes.length === 0 : codes.includes(testCase.expect);
    if (!ok) failed++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} self-test: ${testCase.name} -> ${
        testCase.expect ?? 'no findings'
      }${ok ? '' : ` (got ${JSON.stringify(codes)})`}`,
    );
    fs.rmSync(built.dir, { recursive: true, force: true });
  }

  return { failed, total: cases.length };
}

function makeTempPackage(files) {
  const dir = fs.mkdtempSync(path.join(repoRoot, '.pl1-arch-selftest-'));
  for (const [name, contents] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof contents === 'string' ? contents : JSON.stringify(contents));
  }
  return dir;
}

// --- entry point ------------------------------------------------------------------------------

if (process.argv.includes('--self-test')) {
  const { failed, total } = selfTest();
  console.log(`\n${total} self-tests run, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

const packages = loadWorkspace();
const findings = runChecks(packages);

for (const finding of findings) {
  console.log(`FAIL [${finding.code}] ${finding.package}: ${finding.detail}`);
}

console.log(
  `\n${packages.length} packages checked (${
    packages.filter((entry) => entry.manifest).length
  } with a plugin manifest), ${findings.length} findings`,
);

process.exit(findings.length === 0 ? 0 : 1);
