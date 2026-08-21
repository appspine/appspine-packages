#!/usr/bin/env node
/**
 * Gate G4 — Real Plugin-Mode Bootstrap Rehearsal
 *
 * PL4-10's rehearsal (051-pl4-10-rollback-rehearsal.mjs) only proves the DI graph resolves via
 * `Test.createTestingModule(...).compile()` — it never calls `.init()`, never runs a real
 * `prisma migrate`, and never actually starts the HTTP server (`app.listen()`). Gate G4's own bar
 * explicitly requires the identity-store host-wiring fix to be exercised by the
 * "template + representative App tarball rehearsal" — this script closes that gap for the
 * template by doing an actual `appspine build` -> `prisma migrate deploy` against a real,
 * disposable Postgres -> `app.listen()` -> HTTP health probe, in Plugin Mode.
 *
 * Usage: node scripts/051-g4-template-real-bootstrap.mjs
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const templateRoot = path.resolve(repoRoot, '../appspine-app-template');

const PACKAGES = [
  'plugin-api',
  'plugin-host-nest',
  'plugin-cli',
  'plugin-testkit',
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

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
  '.appspine',
]);

const DB_CONTAINER = 'appspine-g4-rehearsal-db';
const DB_PORT = 25901;
const BACKEND_PORT = 25902;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function packAll(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const tarballs = new Map();
  for (const name of PACKAGES) {
    const packageDir = path.join(repoRoot, 'packages', name);
    const before = new Set(fs.readdirSync(destination));
    run('pnpm', ['pack', '--pack-destination', destination], { cwd: packageDir, stdio: 'pipe' });
    const produced = fs.readdirSync(destination).filter((file) => !before.has(file));
    if (produced.length !== 1) throw new Error(`pnpm pack produced ${produced.length} for ${name}`);
    tarballs.set(`@appspine/${name}`, path.join(destination, produced[0]));
  }
  return tarballs;
}

function applyTarballOverrides(appDir, tarballs) {
  const fileSpec = (tarball) => `file:${tarball.split(path.sep).join('/')}`;
  const overrides = Object.fromEntries(
    [...tarballs.entries()].map(([name, tarball]) => [name, fileSpec(tarball)]),
  );

  const rootPkgPath = path.join(appDir, 'package.json');
  const rootPkg = readJson(rootPkgPath);
  delete rootPkg.scripts?.preinstall;
  delete rootPkg.scripts?.prepare;
  rootPkg.devDependencies = { ...(rootPkg.devDependencies ?? {}), ...overrides };
  writeJson(rootPkgPath, rootPkg);

  const workspaceYaml = path.join(appDir, 'pnpm-workspace.yaml');
  const lines = [
    'packages:',
    '  - "backend"',
    '  - "frontend"',
    '',
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

  const backendPkgPath = path.join(appDir, 'backend', 'package.json');
  const backendPkg = readJson(backendPkgPath);
  for (const field of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(backendPkg[field] ?? {})) {
      if (overrides[name]) backendPkg[field][name] = overrides[name];
    }
  }
  // pnpm only symlinks a package into backend/node_modules for deps backend/package.json
  // declares directly. preset-standard/plugin-api/plugin-host-nest etc. are transitive-only
  // there (051-pl4-10-rollback-rehearsal.mjs's applyTarballOverrides does the same
  // force-add) — without this, `appspine build` silently resolves 0 plugins instead of
  // throwing, because backend's own require() can't see preset-standard at all.
  backendPkg.dependencies['@appspine/plugin-host-nest'] = overrides['@appspine/plugin-host-nest'];
  backendPkg.dependencies['@appspine/plugin-api'] = overrides['@appspine/plugin-api'];
  backendPkg.dependencies['@appspine/identity-core'] = overrides['@appspine/identity-core'];
  backendPkg.dependencies['@appspine/oidc-auth'] = overrides['@appspine/oidc-auth'];
  backendPkg.dependencies['@appspine/rbac'] = overrides['@appspine/rbac'];
  backendPkg.dependencies['@appspine/m2m-api-key'] = overrides['@appspine/m2m-api-key'];
  backendPkg.dependencies['@appspine/metadata-schema'] = overrides['@appspine/metadata-schema'];
  backendPkg.dependencies['@appspine/domain-events'] = overrides['@appspine/domain-events'];
  backendPkg.dependencies['@appspine/mcp-server'] = overrides['@appspine/mcp-server'];
  backendPkg.dependencies['@appspine/notification'] = overrides['@appspine/notification'];
  backendPkg.dependencies['@appspine/preset-standard'] = overrides['@appspine/preset-standard'];
  backendPkg.devDependencies = backendPkg.devDependencies ?? {};
  backendPkg.devDependencies['@appspine/plugin-cli'] = overrides['@appspine/plugin-cli'];
  writeJson(backendPkgPath, backendPkg);

  return overrides;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      return res.status;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appspine-g4-'));
  console.log(`Work dir: ${workDir}`);

  console.log('\n=== 0. Removing any stale rehearsal DB container ===');
  run('docker', ['rm', '-f', DB_CONTAINER], { allowFailure: true, stdio: 'pipe' });

  try {
    console.log('\n=== 1. Packing 20 monorepo packages into tarballs ===');
    const tarballs = packAll(path.join(workDir, 'tarballs'));

    console.log('\n=== 2. Copying appspine-app-template and applying tarball overrides ===');
    const appDir = path.join(workDir, 'template-app');
    copyTree(templateRoot, appDir);
    applyTarballOverrides(appDir, tarballs);

    console.log('\n=== 3. pnpm install (tarball overrides, no lifecycle scripts) ===');
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: appDir });

    const backendDir = path.join(appDir, 'backend');
    const cliBin = path.join(appDir, 'node_modules/@appspine/plugin-cli/dist/bin.js');

    console.log('\n=== 4. appspine build (composes preset-standard -> 10 plugins) ===');
    run('node', [cliBin, 'build'], { cwd: backendDir });

    const catalog = readJson(path.join(backendDir, '.appspine/generated/catalog.json'));
    console.log(`Catalog plugins resolved: ${catalog.entries.length}`);
    if (catalog.entries.length !== 10) {
      throw new Error(
        `Expected 10 standard plugins in catalog, found ${catalog.entries.length}. ` +
          `This usually means a package (e.g. preset-standard) isn't symlinked into ` +
          `backend/node_modules — appspine build resolves an empty composition silently ` +
          `instead of failing loudly.`,
      );
    }

    console.log('\n=== 5. Starting a disposable Postgres for this rehearsal only ===');
    run('docker', [
      'run',
      '-d',
      '--name',
      DB_CONTAINER,
      '-p',
      `127.0.0.1:${DB_PORT}:5432`,
      '-e',
      'POSTGRES_USER=postgres',
      '-e',
      'POSTGRES_PASSWORD=rehearsal',
      '-e',
      'POSTGRES_DB=app_db',
      'postgres:17-alpine',
    ]);

    console.log('Waiting for Postgres to accept connections...');
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      const check = spawnSync('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', 'postgres'], {
        encoding: 'utf8',
      });
      ready = check.status === 0;
      if (!ready) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) throw new Error('Postgres never became ready');

    const databaseUrl = `postgresql://postgres:rehearsal@localhost:${DB_PORT}/app_db`;
    const backendEnv = {
      ...process.env,
      APPSPINE_PLUGIN_MODE: '1',
      DATABASE_URL: databaseUrl,
      AUTH_MODE: 'oidc',
      OIDC_ISSUER: 'http://localhost:8180/realms/appspine-dev',
      OIDC_AUDIENCE: 'g4-rehearsal',
      OIDC_JWKS_URL: 'http://localhost:8180/realms/appspine-dev/protocol/openid-connect/certs',
      CORS_ORIGINS: `http://localhost:${BACKEND_PORT + 1}`,
      PORT: String(BACKEND_PORT),
      APP_NAME: 'g4-rehearsal',
      MCP_TOOL_PREFIX: 'g4rehearsal',
      MCP_ALLOWED_HOSTNAMES: 'localhost',
      MCP_ALLOWED_ORIGIN_HOSTNAMES: 'localhost',
      SEED_USER_EMAIL: 'dev-admin@appspine-dev.local',
      SEED_USER_NAME: 'Dev Admin',
    };
    delete backendEnv.DISCOVERY_PUSH_URL;
    delete backendEnv.DISCOVERY_PUSH_TOKEN;

    console.log('\n=== 6. prisma migrate deploy against the real disposable database ===');
    run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema'], {
      cwd: backendDir,
      env: backendEnv,
    });

    console.log('\n=== 7. prisma generate + backend build ===');
    run('npx', ['prisma', 'generate', '--schema', 'prisma/schema'], {
      cwd: backendDir,
      env: backendEnv,
    });
    run('pnpm', ['-C', 'backend', 'build'], { cwd: appDir });

    console.log('\n=== 8. Real bootstrap: node dist/src/main.js against the migrated database ===');
    const child = spawn('node', ['dist/src/main.js'], {
      cwd: backendDir,
      env: backendEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
      process.stdout.write(`[server] ${d}`);
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      process.stderr.write(`[server:err] ${d}`);
    });

    let crashed = false;
    child.on('exit', (code) => {
      if (code !== null && code !== 0) crashed = true;
    });

    try {
      console.log(`Waiting for backend to listen on :${BACKEND_PORT}...`);
      const status = await waitForHttp(`http://localhost:${BACKEND_PORT}/`, 30000);
      if (crashed) throw new Error('Server process exited before responding');
      console.log(
        `✓ Backend responded with HTTP ${status} — real app.listen() succeeded against a real migrated database in Plugin Mode.`,
      );
      console.log(
        '✓ This means every REQUIRED capability token (including appspine.identity-store for m2m-api-key) resolved for real — not just in a .compile()-only test.',
      );
    } finally {
      child.kill();
      await new Promise((r) => setTimeout(r, 500));
    }

    if (crashed) {
      console.log(`\n--- server stdout ---\n${stdout}`);
      console.log(`\n--- server stderr ---\n${stderr}`);
      throw new Error('Backend crashed during/after bootstrap');
    }

    console.log('\n================================================================');
    console.log('GATE G4 REAL BOOTSTRAP REHEARSAL: PASSED');
    console.log('================================================================');
  } finally {
    console.log('\n=== Cleanup: removing disposable DB container ===');
    spawnSync('docker', ['rm', '-f', DB_CONTAINER], { stdio: 'inherit' });
    if (!process.argv.includes('--keep')) {
      fs.rmSync(workDir, { recursive: true, force: true });
    } else {
      console.log(`Kept work dir: ${workDir}`);
    }
  }
}

main().catch((error) => {
  console.error('\nFAILED:', error.message);
  process.exitCode = 1;
});
