#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const packagesRoot = path.resolve(import.meta.dirname, '..');
const fleetRoot = path.resolve(packagesRoot, '..');
const postgresPort = 39450;
const minioPort = 39451;
const appPort = 3994;

const fleet = [
  { repo: 'appspine-app-template', audience: 'appspine-app-template', corsPort: 3901 },
  { repo: 'wiki', audience: 'wiki', corsPort: 3011 },
  { repo: 'calendar', audience: 'calendar', corsPort: 3012 },
  { repo: 'chat', audience: 'chat', corsPort: 3041 },
  { repo: 'drive', audience: 'drive', corsPort: 3031, minio: true },
  { repo: 'projects', audience: 'projects', corsPort: 3081 },
  { repo: 'approve', audience: 'approve', corsPort: 3080 },
  { repo: 'master-data', audience: 'master-data', corsPort: 3091 },
  { repo: 'mcp-gateway', audience: 'mcp-gateway', corsPort: 3071 },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
          response.resume();
          resolve(response.statusCode);
        });
        request.on('error', reject);
        request.setTimeout(1_000, () => request.destroy(new Error('timeout')));
      });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {
      encoding: 'utf8',
    });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Postgres container ${container} did not become ready`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function verifyApp(app) {
  const suffix = `${app.repo.replaceAll(/[^a-z0-9]/g, '-')}-${Date.now()}`;
  const postgresContainer = `appspine-m3-pg-${suffix}`;
  const minioContainer = app.minio ? `appspine-m3-minio-${suffix}` : undefined;
  const databaseUrl = `postgresql://postgres:rehearsal@127.0.0.1:${postgresPort}/app_db`;
  const backendDir = path.join(fleetRoot, app.repo, 'backend');
  let child;

  console.log(`[${app.repo}] starting disposable services`);
  run('docker', [
    'run',
    '-d',
    '--name',
    postgresContainer,
    '-p',
    `127.0.0.1:${postgresPort}:5432`,
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_PASSWORD=rehearsal',
    '-e',
    'POSTGRES_DB=app_db',
    'postgres:17-alpine',
  ]);

  if (minioContainer) {
    run('docker', [
      'run',
      '-d',
      '--name',
      minioContainer,
      '-p',
      `127.0.0.1:${minioPort}:9000`,
      '-e',
      'MINIO_ROOT_USER=rehearsal',
      '-e',
      'MINIO_ROOT_PASSWORD=rehearsal123',
      'minio/minio:latest',
      'server',
      '/data',
    ]);
  }

  const environment = {
    ...process.env,
    APP_NAME: app.repo,
    APPSPINE_PLUGIN_MODE: '1',
    CORS_ORIGINS: `http://localhost:${app.corsPort}`,
    DATABASE_URL: databaseUrl,
    OIDC_AUDIENCE: app.audience,
    OIDC_ISSUER: 'https://issuer.example/realms/test',
    OIDC_JWKS_URL: 'https://issuer.example/realms/test/protocol/openid-connect/certs',
    PORT: String(appPort),
    ...(app.minio
      ? {
          MINIO_ACCESS_KEY: 'rehearsal',
          MINIO_BUCKET: 'appspine-drive-m3',
          MINIO_ENDPOINT: `http://127.0.0.1:${minioPort}`,
          MINIO_REGION: 'us-east-1',
          MINIO_SECRET_KEY: 'rehearsal123',
          WOPI_TOKEN_SECRET: 'm3-wopi-test-secret',
        }
      : {}),
  };

  try {
    await waitForPostgres(postgresContainer);
    // Docker Desktop can report readiness inside the container before the
    // Windows host-port forward is usable by Prisma's native schema engine.
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    if (minioContainer) {
      await waitForHttp(`http://127.0.0.1:${minioPort}/minio/health/live`, 20_000);
    }
    const prismaCli = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js');
    run(
      process.execPath,
      [prismaCli, 'db', 'push', '--schema', 'prisma/schema', '--skip-generate'],
      {
        cwd: backendDir,
        env: environment,
      },
    );

    child = spawn('node', ['dist/src/main.js'], {
      cwd: backendDir,
      env: environment,
      stdio: 'pipe',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    try {
      const status = await waitForHttp(`http://127.0.0.1:${appPort}/health`, 30_000).catch(() =>
        waitForHttp(`http://127.0.0.1:${appPort}/`, 10_000),
      );
      console.log(`[${app.repo}] bootstrap passed (HTTP ${status})`);
    } catch (error) {
      throw new Error(`${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
  } finally {
    if (child) await stopChild(child);
    const containers = [postgresContainer, minioContainer].filter(Boolean);
    spawnSync('docker', ['rm', '-f', ...containers], { encoding: 'utf8' });
  }
}

async function main() {
  run('docker', ['version']);
  const requested = process.argv.slice(2);
  const selected =
    requested.length > 0 ? fleet.filter((app) => requested.includes(app.repo)) : fleet;
  if (selected.length !== (requested.length || fleet.length)) {
    throw new Error(
      `Unknown fleet member. Valid values: ${fleet.map((app) => app.repo).join(', ')}`,
    );
  }
  for (const app of selected) await verifyApp(app);
  console.log(`M3 fleet bootstrap passed: ${selected.length}/${selected.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
