#!/usr/bin/env node
/**
 * PL5-03 — Template Canary Plugin Mode Verification Script
 *
 * Validates:
 *  1. Builds and packs all 21 monorepo packages into clean canary tarballs.
 *  2. Installs canary tarballs into appspine-app-template via concrete tarball overrides.
 *  3. Runs `appspine build` to regenerate backend composition, catalog, frontend artifacts, schema, and plugin-lock.
 *  4. Validates zero drift with `appspine build --check`.
 *  5. Runs `appspine doctor`.
 *  6. Runs Prisma schema generation & client creation.
 *  7. Full typecheck and build for backend & frontend.
 *  8. Executes backend unit/DI test suite proving default Plugin Mode and Legacy Escape Hatch.
 *  9. Real bootstrap verification (NestFactory boot in Plugin Mode).
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve('D:/Source/Private/appspine/appspine-packages');
const templateRoot = path.resolve('D:/Source/Private/appspine/appspine-app-template');

function run(command, args, options = {}) {
  const display = `${command} ${args.join(' ')}`;
  console.log(`> ${display}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${display}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => resolve(res.statusCode));
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return res;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`HTTP endpoint ${url} did not respond within ${timeoutMs}ms`);
}

function applyTarballOverrides(appDir, tarballs) {
  const fileSpec = (tarball) => `file:${tarball.split(path.sep).join('/')}`;
  const overrides = Object.fromEntries(
    Object.entries(tarballs).map(([name, tarball]) => [name, fileSpec(tarball)]),
  );

  const rootPkgPath = path.join(appDir, 'package.json');
  const rootPkg = readJson(rootPkgPath);
  delete rootPkg.scripts?.preinstall;
  delete rootPkg.scripts?.prepare;
  rootPkg.devDependencies = {
    ...(rootPkg.devDependencies ?? {}),
    ...overrides,
  };
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

  for (const ws of ['backend', 'frontend']) {
    const wsPkgPath = path.join(appDir, ws, 'package.json');
    if (!fs.existsSync(wsPkgPath)) continue;
    const wsPkg = readJson(wsPkgPath);
    for (const field of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(wsPkg[field] ?? {})) {
        if (overrides[name]) wsPkg[field][name] = overrides[name];
      }
    }
    if (ws === 'backend') {
      wsPkg.dependencies['@appspine/plugin-host-nest'] = overrides['@appspine/plugin-host-nest'];
      wsPkg.dependencies['@appspine/plugin-api'] = overrides['@appspine/plugin-api'];
      wsPkg.dependencies['@appspine/identity-core'] = overrides['@appspine/identity-core'];
      wsPkg.dependencies['@appspine/oidc-auth'] = overrides['@appspine/oidc-auth'];
      wsPkg.dependencies['@appspine/rbac'] = overrides['@appspine/rbac'];
      wsPkg.dependencies['@appspine/m2m-api-key'] = overrides['@appspine/m2m-api-key'];
      wsPkg.dependencies['@appspine/metadata-schema'] = overrides['@appspine/metadata-schema'];
      wsPkg.dependencies['@appspine/domain-events'] = overrides['@appspine/domain-events'];
      wsPkg.dependencies['@appspine/mcp-server'] = overrides['@appspine/mcp-server'];
      wsPkg.dependencies['@appspine/notification'] = overrides['@appspine/notification'];
      wsPkg.dependencies['@appspine/preset-standard'] = overrides['@appspine/preset-standard'];
      wsPkg.devDependencies['@appspine/plugin-cli'] = overrides['@appspine/plugin-cli'];
      wsPkg.devDependencies['@appspine/plugin-testkit'] = overrides['@appspine/plugin-testkit'];
    }
    writeJson(wsPkgPath, wsPkg);
  }

  return overrides;
}

async function main() {
  console.log('===============================================================');
  console.log('PL5-03: Template Canary Plugin Mode End-to-End Verification');
  console.log('===============================================================\n');

  // 1. Pack all packages
  console.log('=== Stage 1: Packing monorepo canary tarballs ===');
  const tarballDir = path.join(os.tmpdir(), `appspine-pl503-tarballs-${Date.now()}`);
  fs.mkdirSync(tarballDir, { recursive: true });

  const pkgDirs = [
    'packages/plugin-api',
    'packages/plugin-host-nest',
    'packages/plugin-cli',
    'packages/plugin-testkit',
    'packages/preset-standard',
    'packages/common',
    'packages/audit-log',
    'packages/health-check',
    'packages/identity-core',
    'packages/rbac',
    'packages/oidc-auth',
    'packages/m2m-api-key',
    'packages/metadata-schema',
    'packages/notification',
    'packages/domain-events',
    'packages/mcp-server',
    'packages/oidc-delegation',
    'packages/master-data-client',
    'packages/frontend-shell',
    'packages/e2e-kit',
    'packages/integration-contracts',
  ];

  const tarballs = {};
  for (const dir of pkgDirs) {
    const fullDir = path.join(repoRoot, dir);
    if (!fs.existsSync(fullDir)) continue;
    const pkgJson = JSON.parse(fs.readFileSync(path.join(fullDir, 'package.json'), 'utf8'));
    const before = new Set(fs.readdirSync(tarballDir));
    const packRes = spawnSync('pnpm', ['pack', '--pack-destination', tarballDir], {
      cwd: fullDir,
      shell: process.platform === 'win32',
      encoding: 'utf8',
    });
    if (packRes.status !== 0) {
      throw new Error(`Failed to pack ${dir}: ${packRes.stderr || packRes.stdout}`);
    }
    const produced = fs.readdirSync(tarballDir).filter((file) => !before.has(file));
    const tarballPath = path.join(tarballDir, produced[0]);
    tarballs[pkgJson.name] = tarballPath;
  }
  console.log(`Packed ${Object.keys(tarballs).length} packages to ${tarballDir}`);

  // 2. Configure template overrides
  console.log('\n=== Stage 2: Applying tarball overrides to template ===');
  applyTarballOverrides(templateRoot, tarballs);

  // 3. Install dependencies in template
  console.log('\n=== Stage 3: Installing canary packages into template ===');
  run('pnpm', ['install', '--no-frozen-lockfile'], { cwd: templateRoot });

  // 4. Regenerate artifacts via appspine build
  console.log('\n=== Stage 4: Regenerating plugin artifacts (appspine build) ===');
  run('pnpm', ['-C', 'backend', 'appspine:build'], { cwd: templateRoot });

  // 5. Zero-drift check
  console.log('\n=== Stage 5: Verifying zero drift (appspine build --check) ===');
  run('pnpm', ['-C', 'backend', 'appspine:check'], { cwd: templateRoot });

  // 6. Diagnostics doctor check
  console.log('\n=== Stage 6: Running appspine doctor ===');
  const testEnv = {
    ...process.env,
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/app_db',
    OIDC_ISSUER: 'https://issuer.example/realms/test',
    OIDC_AUDIENCE: 'appspine-app-template',
    OIDC_JWKS_URL: 'https://issuer.example/realms/test/protocol/openid-connect/certs',
    APP_NAME: 'appspine-app-template',
  };
  run('pnpm', ['-C', 'backend', 'appspine:doctor'], { cwd: templateRoot, env: testEnv });

  // 7. Prisma generate
  console.log('\n=== Stage 7: Prisma generate ===');
  run('pnpm', ['-C', 'backend', 'prisma:generate'], { cwd: templateRoot });

  // 8. Backend build & typecheck
  console.log('\n=== Stage 8: Backend build and typecheck ===');
  run('pnpm', ['-C', 'backend', 'typecheck'], { cwd: templateRoot });
  run('pnpm', ['-C', 'backend', 'build'], { cwd: templateRoot });

  // 9. Backend test suite (Dual-mode verification)
  console.log('\n=== Stage 9: Backend test suite (Dual-mode) ===');
  run('pnpm', ['-C', 'backend', 'test'], { cwd: templateRoot });

  // 10. Frontend build & typecheck
  console.log('\n=== Stage 10: Frontend typecheck ===');
  run('pnpm', ['-C', 'frontend', 'typecheck'], { cwd: templateRoot });

  // 11. Real bootstrap check in Plugin Mode against a disposable migrated Postgres
  console.log(
    '\n=== Stage 11: Real NestJS Bootstrap in Plugin Mode against Disposable Postgres ===',
  );
  const DB_CONTAINER = `appspine-pl503-db-${Date.now()}`;
  const DB_PORT = 39432;
  const DB_URL = `postgresql://postgres:rehearsal@127.0.0.1:${DB_PORT}/app_db`;
  const backendDir = path.join(templateRoot, 'backend');

  console.log(`Starting disposable postgres container ${DB_CONTAINER} on port ${DB_PORT}...`);
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

  const bootEnv = {
    ...process.env,
    PORT: '3999',
    CORS_ORIGINS: 'http://localhost:3901',
    DATABASE_URL: DB_URL,
    OIDC_ISSUER: 'https://issuer.example/realms/test',
    OIDC_AUDIENCE: 'appspine-app-template',
    OIDC_JWKS_URL: 'https://issuer.example/realms/test/protocol/openid-connect/certs',
    APP_NAME: 'appspine-app-template',
    APPSPINE_PLUGIN_MODE: '1',
  };

  try {
    console.log('Waiting for disposable postgres to accept connections...');
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      const check = spawnSync('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', 'postgres'], {
        encoding: 'utf8',
      });
      ready = check.status === 0;
      if (!ready) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) throw new Error('Disposable Postgres never became ready');
    // Allow host port forwarding on Windows Docker Desktop to stabilize
    await new Promise((r) => setTimeout(r, 1500));

    console.log('Deploying prisma schema to disposable postgres...');
    run('npx', ['prisma', 'db', 'push', '--schema', 'prisma/schema', '--skip-generate'], {
      cwd: backendDir,
      env: bootEnv,
    });

    console.log('Starting Nest backend in Plugin Mode...');
    const child = spawn('node', ['dist/src/main.js'], {
      cwd: backendDir,
      env: bootEnv,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';
    let crashed = false;

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) crashed = true;
    });

    try {
      console.log('Waiting for backend server to listen on :3999...');
      const status = await waitForHttp('http://localhost:3999/', 25000);
      console.log(
        `✓ Backend responded with HTTP ${status} — real app.listen() succeeded in Plugin Mode.`,
      );
    } catch (err) {
      if (crashed) {
        console.log('Stdout:\n', stdout);
        console.log('Stderr:\n', stderr);
      }
      throw err;
    } finally {
      child.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    console.log(`Cleaning up container ${DB_CONTAINER}...`);
    try {
      run('docker', ['rm', '-f', DB_CONTAINER]);
    } catch (e) {
      console.warn('Failed to remove docker container:', e);
    }
  }

  console.log('\n===============================================================');
  console.log('PL5-03: TEMPLATE CANARY PLUGIN MODE VERIFICATION COMPLETED!');
  console.log('===============================================================\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
