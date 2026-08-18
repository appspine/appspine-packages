#!/usr/bin/env node

// PL0-02 (051-plugin-platform-engineering-task-breakdown.md): deterministic public API,
// dependency, consumer and direct-import snapshot generator.
//
// Read-only. Scans this repo's packages/* plus the sibling template + 8 App repos
// (../appspine-app-template, ../wiki, ../calendar, ../chat, ../drive, ../projects,
// ../approve, ../master-data, ../mcp-gateway). Re-running against the same HEAD across
// all repos must produce byte-identical output (all object keys and arrays are sorted).
//
// Usage: node scripts/051-pl0-snapshot.mjs [--write|--check]
//   --write            write the snapshot named by --baseline (default: print to stdout)
//   --check            compare canonical output with that snapshot and fail on byte drift
//   --baseline <path>  which snapshot to write/compare
//                      (default fixtures/051-pl0-baseline/snapshot.json, which is frozen and
//                       refuses --write; phases write their own, e.g.
//                       fixtures/051-pl1-baseline/snapshot.json)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const workspaceRoot = path.resolve(repoRoot, '..');
const shouldWrite = process.argv.includes('--write');
const shouldCheck = process.argv.includes('--check');

if (shouldWrite && shouldCheck) {
  throw new Error('--write and --check are mutually exclusive');
}

const CONSUMERS = [
  'appspine-app-template',
  'wiki',
  'calendar',
  'chat',
  'drive',
  'projects',
  'approve',
  'master-data',
  'mcp-gateway',
];

const IGNORED_DIR_NAMES = new Set(['node_modules', 'dist', '.git', '.next', '.turbo', 'coverage']);
const IMPORT_PATTERN = /from\s+['"]@appspine\/([a-zA-Z0-9._-]+)((?:\/[^'"]*)?)['"]/g;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walk(dir, extensions, results = []) {
  if (!fs.existsSync(dir)) {
    return results;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIR_NAMES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, extensions, results);
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      results.push(fullPath);
    }
  }
  return results;
}

function sortedEntries(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function formatJson(value) {
  const biomeBin = path.join(repoRoot, 'node_modules/@biomejs/biome/bin/biome');
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  return execFileSync(
    process.execPath,
    [biomeBin, 'format', '--stdin-file-path', 'fixtures/051-pl0-baseline/snapshot.json'],
    { cwd: repoRoot, input: raw, encoding: 'utf8' },
  );
}

function gitState(repoDir) {
  const git = (...args) =>
    execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' }).trim();
  return {
    head: git('rev-parse', '--verify', 'HEAD'),
    branch: git('branch', '--show-current') || null,
    dirty: git('status', '--short').length > 0,
  };
}

function collectImportEdges(files, baseDir) {
  const edges = {};
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match = IMPORT_PATTERN.exec(content);
    while (match) {
      const subpath = `@appspine/${match[1]}${match[2] ?? ''}`;
      edges[subpath] ??= new Set();
      edges[subpath].add(toPosix(path.relative(baseDir, file)));
      match = IMPORT_PATTERN.exec(content);
    }
  }
  return sortedEntries(
    Object.fromEntries(Object.entries(edges).map(([key, files_]) => [key, [...files_].sort()])),
  );
}

// --- 1. packages/* public API + local dependency surface -----------------------------

const packageDirNames = fs.readdirSync(path.join(repoRoot, 'packages')).sort();
const packages = {};
for (const dirName of packageDirNames) {
  const pkgJsonPath = path.join(repoRoot, 'packages', dirName, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    continue;
  }
  const pkg = readJson(pkgJsonPath);
  const localDependencies = sortedEntries(
    Object.fromEntries(
      Object.entries(pkg.dependencies ?? {}).filter(([name]) => name.startsWith('@appspine/')),
    ),
  );
  const localPeerDependencies = sortedEntries(
    Object.fromEntries(
      Object.entries(pkg.peerDependencies ?? {}).filter(([name]) => name.startsWith('@appspine/')),
    ),
  );
  const localDevWorkspaceDependencies = sortedEntries(
    Object.fromEntries(
      Object.entries(pkg.devDependencies ?? {}).filter(([name]) => name.startsWith('@appspine/')),
    ),
  );
  // The union of all three is what a TS project-references graph (PL0-07) and an
  // architecture import-vs-dependency checker (PL1-07) must reconcile against —
  // @appspine/* can be declared as a bundled `dependencies` entry (rbac -> auth/common),
  // a `peerDependencies` entry (auth -> audit-log/common), or only via `devDependencies`
  // `workspace:*` with no matching runtime dependency (a gap PL1-07 should flag).
  const localWorkspaceDependencyUnion = sortedEntries({
    ...localDependencies,
    ...localPeerDependencies,
    ...localDevWorkspaceDependencies,
  });
  packages[pkg.name] = {
    dir: `packages/${dirName}`,
    version: pkg.version,
    type: pkg.type ?? null,
    exports: pkg.exports ?? null,
    localDependencies,
    localPeerDependencies,
    localDevWorkspaceDependencies,
    localWorkspaceDependencyUnion,
    peerDependencies: sortedEntries(pkg.peerDependencies ?? {}),
  };
}

// --- 2. cross-package source imports within appspine-packages -------------------------

const crossPackageImports = {};
for (const dirName of packageDirNames) {
  const fromPkg = `@appspine/${dirName}`;
  const srcDir = path.join(repoRoot, 'packages', dirName, 'src');
  const files = walk(srcDir, ['.ts', '.tsx']);
  const edges = collectImportEdges(files, repoRoot);
  for (const [toSubpath, edgeFiles] of Object.entries(edges)) {
    const toPkg = toSubpath.split('/').slice(0, 2).join('/');
    if (toPkg === fromPkg) {
      continue;
    }
    const key = `${fromPkg} -> ${toSubpath}`;
    crossPackageImports[key] = edgeFiles;
  }
}

// --- 3. Prisma fragments ---------------------------------------------------------------

const prismaFragments = {};
for (const dirName of packageDirNames) {
  const files = walk(path.join(repoRoot, 'packages', dirName), ['.prisma']);
  if (files.length > 0) {
    prismaFragments[`@appspine/${dirName}`] = files
      .map((f) => toPosix(path.relative(repoRoot, f)))
      .sort();
  }
}

// --- 4. frontend ownership (current concentration in frontend-shell) ------------------

const frontendShellAdminDir = path.join(repoRoot, 'packages/frontend-shell/src/components/admin');
const frontendShellAuthDir = path.join(repoRoot, 'packages/frontend-shell/src/components/auth');
const frontendShellNotificationDir = path.join(
  repoRoot,
  'packages/frontend-shell/src/notification',
);
const frontendOwnership = {
  currentOwner: '@appspine/frontend-shell',
  targetOwnerByFeature: {
    'Users Admin': '@appspine/identity-core (Phase 1/3, not yet created)',
    'Roles Admin': '@appspine/rbac',
    'API Keys Admin': '@appspine/m2m-api-key',
    'Domain Events Admin': '@appspine/domain-events',
    'Notification Bell/Inbox': '@appspine/notification',
    'OIDC Login': '@appspine/oidc-auth (Phase 1, not yet created)',
  },
  currentFiles: {
    admin: fs.existsSync(frontendShellAdminDir)
      ? walk(frontendShellAdminDir, ['.ts', '.tsx'])
          .map((f) => toPosix(path.relative(repoRoot, f)))
          .sort()
      : [],
    auth: fs.existsSync(frontendShellAuthDir)
      ? walk(frontendShellAuthDir, ['.ts', '.tsx'])
          .map((f) => toPosix(path.relative(repoRoot, f)))
          .sort()
      : [],
    notification: fs.existsSync(frontendShellNotificationDir)
      ? walk(frontendShellNotificationDir, ['.ts', '.tsx'])
          .map((f) => toPosix(path.relative(repoRoot, f)))
          .sort()
      : [],
  },
};

// --- 5. consumer (template + 8 Apps) version + direct-import matrix -------------------

const consumers = {};
for (const consumerName of CONSUMERS) {
  const consumerDir = path.join(workspaceRoot, consumerName);
  if (!fs.existsSync(consumerDir)) {
    consumers[consumerName] = { error: 'repo not present locally' };
    continue;
  }
  const entry = { repo: gitState(consumerDir) };
  // Scan every TypeScript input in each workspace area, not only src/. Seeds, maintenance
  // scripts, Playwright configs and E2E specs are consumers too and must migrate when a
  // public @appspine/* entry point changes.
  for (const side of ['backend', 'frontend', 'e2e']) {
    const sideDir = path.join(consumerDir, side);
    if (!fs.existsSync(sideDir)) continue;
    const pkgJsonPath = path.join(consumerDir, side, 'package.json');
    let dependencies = {};
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = readJson(pkgJsonPath);
      dependencies = sortedEntries(
        Object.fromEntries(
          Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) =>
            name.startsWith('@appspine/'),
          ),
        ),
      );
    }
    const files = walk(sideDir, ['.ts', '.tsx']);
    entry[side] = {
      declaredDependencies: dependencies,
      directImports: collectImportEdges(files, consumerDir),
    };
  }
  consumers[consumerName] = entry;
}

// --- assemble ---------------------------------------------------------------------------

const snapshot = {
  schemaVersion: '051-pl0-snapshot/v1',
  note:
    'Deterministic snapshot for PL0-02. Re-run with the recorded clean consumer HEADs to ' +
    'get byte-identical, Biome-formatted output. This script does not embed Date.now() or ' +
    'other non-deterministic values.',
  packages: sortedEntries(packages),
  crossPackageImports: sortedEntries(crossPackageImports),
  prismaFragments: sortedEntries(prismaFragments),
  frontendOwnership,
  consumers: sortedEntries(consumers),
};

const output = formatJson(snapshot);

// `fixtures/051-pl0-baseline/snapshot.json` is the PL0 *frozen* baseline: the pre-split public API
// PL1-13's acceptance ("every pre-split export is preserved or has an explicit migration
// conclusion") is measured against. Regenerating it in place destroys that measurement — which is
// exactly what happened during Phase 1 and what Gate G1's independent review caught.
//
// So the file each phase re-generates is its own, selected with --baseline. The PL0 file stays put.
const DEFAULT_BASELINE = 'fixtures/051-pl0-baseline/snapshot.json';
// Baselines a gate has already accepted. Each phase seals its own at its gate and never rewrites
// it afterwards; the *current* phase writes to its own file, which is what `verify:snapshot`
// checks. Regenerating a sealed one deletes the evidence its gate was judged against — that is
// what happened to the PL0 baseline during Phase 1 (Gate G1 review B2).
const SEALED_BASELINES = new Set([DEFAULT_BASELINE, 'fixtures/051-pl1-baseline/snapshot.json']);
const baselineFlag = process.argv.indexOf('--baseline');
const baselineRelative = baselineFlag === -1 ? DEFAULT_BASELINE : process.argv[baselineFlag + 1];
if (!baselineRelative) {
  throw new Error('--baseline requires a path');
}
if (shouldWrite && SEALED_BASELINES.has(baselineRelative.split(path.sep).join('/'))) {
  throw new Error(
    `${baselineRelative} is a sealed phase baseline and must not be regenerated; ` +
      'pass --baseline <current phase snapshot> to write a new one',
  );
}
const outPath = path.join(repoRoot, baselineRelative);
const outDir = path.dirname(outPath);

if (shouldWrite) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, output, 'utf8');
  console.log(`wrote ${outPath}`);
} else if (shouldCheck) {
  const saved = fs.readFileSync(outPath, 'utf8');
  if (saved !== output) {
    console.error('snapshot drift: run node scripts/051-pl0-snapshot.mjs --write');
    process.exit(1);
  }
  console.log(`snapshot is byte-identical (${Buffer.byteLength(output)} bytes)`);
} else {
  process.stdout.write(output);
}
