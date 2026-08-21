#!/usr/bin/env node
/**
 * PL2-09 — verify the template's dual-mode wiring against real tarballs.
 *
 * The template consumes `@appspine/*` from a registry, and Phase 2's packages are not published
 * (publishing is PL5's gate). So the template repository cannot `pnpm install` its own new
 * dependencies yet, and verifying it in place is impossible without either publishing early or
 * committing `file:` dependencies to a repository other people fork.
 *
 * Instead: copy the template into a temp directory, point it at packed tarballs there, and run the
 * whole thing. The template repo keeps a clean, reviewable diff; the evidence is real. Same
 * approach as PL1-14's clean consumer, for the same reason — a workspace symlink proves nothing
 * about what a consumer actually installs.
 *
 * Usage:
 *   node scripts/051-pl2-09-template-dual-mode.mjs           # copy, install, verify
 *   node scripts/051-pl2-09-template-dual-mode.mjs --keep    # leave the copy for inspection
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const templateRoot = path.resolve(repoRoot, '../appspine-app-template');
const keep = process.argv.includes('--keep');

/** Everything the template needs from this workspace, packed rather than linked. */
const PACKAGES = [
  'plugin-api',
  'plugin-host-nest',
  'plugin-cli',
  'preset-standard',
  'common',
  'audit-log',
  'health-check',
  'identity-core',
  'rbac',
  'oidc-auth',
  'auth',
  'm2m-api-key',
  'mcp-server',
  'metadata-schema',
  'notification',
  'domain-events',
  'integration-contracts',
  'frontend-shell',
  'master-data-client',
  'oidc-delegation',
];

/** Copied, not linked: `node_modules` and build output would drag the workspace back in. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0 && !options.allowFailure) {
    if (options.quiet) {
      process.stdout.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
    }
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
  return result;
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

function packAll(destination) {
  const tarballs = new Map();
  for (const name of PACKAGES) {
    const packageDir = path.join(repoRoot, 'packages', name);
    const before = new Set(fs.readdirSync(destination));
    run('pnpm', ['pack', '--pack-destination', destination], { cwd: packageDir, quiet: true });
    const produced = fs.readdirSync(destination).filter((file) => !before.has(file));
    if (produced.length !== 1)
      throw new Error(`pnpm pack produced ${produced.length} files for ${name}`);
    tarballs.set(`@appspine/${name}`, path.join(destination, produced[0]));
  }
  return tarballs;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  if (!fs.existsSync(templateRoot)) {
    throw new Error(`appspine-app-template not found at ${templateRoot}`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appspine-pl2-09-'));
  const tarballDir = path.join(workDir, 'tarballs');
  const appDir = path.join(workDir, 'app');
  fs.mkdirSync(tarballDir);

  try {
    console.log('building the workspace so the tarballs carry current sources');
    run(
      process.execPath,
      [path.join(repoRoot, 'node_modules/typescript/bin/tsc'), '-b', 'tsconfig.json'],
      {
        cwd: repoRoot,
        shell: false,
      },
    );

    console.log('packing');
    const tarballs = packAll(tarballDir);

    console.log(`copying the template into ${appDir}`);
    copyTree(templateRoot, appDir);

    // Point every @appspine dependency at its tarball, in the *copy* only. `overrides` catches the
    // transitive ones too, so nothing reaches the registry and no two copies can coexist.
    const fileSpec = (tarball) => `file:${tarball.split(path.sep).join('/')}`;
    const overrides = Object.fromEntries(
      [...tarballs.entries()].map(([name, tarball]) => [name, fileSpec(tarball)]),
    );

    const rootPackageJson = readJson(path.join(appDir, 'package.json'));
    // The template's preinstall checks registry auth, which is meaningless here: every @appspine
    // package comes from a local file. `prepare` runs husky, which needs a git repo.
    delete rootPackageJson.scripts.preinstall;
    delete rootPackageJson.scripts.prepare;
    // Every tarball as a root devDependency, not only the ones a workspace names directly.
    // `@appspine/metadata-schema` -> `@appspine/m2m-api-key` -> peer `@appspine/plugin-host-nest`
    // reaches the frontend, and pnpm resolves an auto-installed peer from the registry regardless
    // of `overrides` - so the peer has to already exist as a real, file-resolved dependency.
    rootPackageJson.devDependencies = {
      ...rootPackageJson.devDependencies,
      ...overrides,
    };
    writeJson(path.join(appDir, 'package.json'), rootPackageJson);

    // One source of overrides, written from scratch rather than patched. pnpm 11 reads them from
    // pnpm-workspace.yaml; leaving a second copy in package.json invites the two to disagree, and
    // a regex over YAML is a bug waiting for the next comment somebody adds to that file.
    const workspaceYaml = path.join(appDir, 'pnpm-workspace.yaml');
    const lines = [
      'packages:',
      '  - "backend"',
      '  - "frontend"',
      '',
      '# Written by 051-pl2-09-template-dual-mode.mjs: every @appspine package resolves to a local',
      '# tarball, including transitive ones, so nothing reaches the registry.',
      'overrides:',
      ...Object.entries(overrides).map(([name, spec]) => `  '${name}': ${spec}`),
      '',
      'allowBuilds:',
      "  '@biomejs/biome': true",
      "  '@prisma/client': true",
      "  '@prisma/engines': true",
      '  bcrypt: true',
      '  esbuild: true',
      '  prisma: true',
      '  sharp: true',
      '',
    ];
    fs.writeFileSync(workspaceYaml, lines.join('\n'), 'utf8');

    for (const workspace of ['backend', 'frontend']) {
      const file = path.join(appDir, workspace, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = readJson(file);
      for (const field of ['dependencies', 'devDependencies']) {
        for (const name of Object.keys(pkg[field] ?? {})) {
          if (overrides[name]) pkg[field][name] = overrides[name];
        }
      }
      // The backend needs the new packages the dual-mode module imports.
      if (workspace === 'backend') {
        pkg.dependencies['@appspine/plugin-host-nest'] = overrides['@appspine/plugin-host-nest'];
        pkg.dependencies['@appspine/plugin-api'] = overrides['@appspine/plugin-api'];
        pkg.dependencies['@appspine/identity-core'] = overrides['@appspine/identity-core'];
        pkg.dependencies['@appspine/oidc-auth'] = overrides['@appspine/oidc-auth'];
        pkg.dependencies['@appspine/preset-standard'] = overrides['@appspine/preset-standard'];
        pkg.devDependencies['@appspine/plugin-cli'] = overrides['@appspine/plugin-cli'];
      }
      writeJson(file, pkg);
    }

    console.log('\ninstalling');
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: appDir });

    // Prisma's client is generated, not shipped: `--ignore-scripts` above (051 plan section 9 - a
    // tarball must not run install hooks) means it has to happen explicitly and visibly.
    console.log('\nprisma generate');
    run('npx', ['prisma', 'generate', '--schema', 'prisma/schema'], {
      cwd: path.join(appDir, 'backend'),
    });

    // The backend workspace *is* the App as far as the plugin host is concerned: that is where
    // appspine.plugins.json lives, and where the generated composition has to land for
    // `src/appspine.config.ts` to import it.
    const backendDir = path.join(appDir, 'backend');
    const cliBin = path.join(appDir, 'node_modules/@appspine/plugin-cli/dist/bin.js');

    console.log('\nappspine build (composition, catalog, schema, permissions, lock)');
    run('node', [cliBin, 'build'], { cwd: backendDir });

    console.log('\nappspine build --check (must be clean immediately after)');
    run('node', [cliBin, 'build', '--check'], { cwd: backendDir });

    console.log('\nappspine doctor');
    run('node', [cliBin, 'doctor'], { cwd: backendDir, allowFailure: true });

    const composition = path.join(backendDir, '.appspine/generated/backend/composition.ts');
    if (!fs.existsSync(composition)) throw new Error('composition.ts was not generated');
    const compositionText = fs.readFileSync(composition, 'utf8');
    console.log(`\ngenerated ${compositionText.split('\n').length} lines of composition`);

    console.log('\nbackend typecheck (this is what proves the generated file compiles)');
    run('pnpm', ['-C', 'backend', 'typecheck'], { cwd: appDir });

    console.log('\nbackend build');
    run('pnpm', ['-C', 'backend', 'build'], { cwd: appDir });

    console.log('\nbackend unit tests');
    run('pnpm', ['-C', 'backend', 'test'], { cwd: appDir });

    console.log('\nPL2-09 template dual mode: OK');
  } finally {
    if (keep) console.log(`\nkept: ${workDir}`);
    else fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main();
