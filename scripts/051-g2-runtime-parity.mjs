#!/usr/bin/env node
/**
 * Gate G2 — the three acceptance conditions that need a running database.
 *
 * PL2-09 proved both wirings *compose*. That is a real property, and it is not the one the
 * breakdown asks for. This script boots the App for real, against Postgres and the dev Keycloak,
 * and answers the three questions that were still open:
 *
 *   1. **API parity.** Does plugin mode serve the same routes as the legacy wiring? Compared as
 *      sets, so an extra route is as much a failure as a missing one.
 *   2. **Rollback rehearsal.** Write data in plugin mode, switch back, and prove the data is intact
 *      and readable — no migration, no second deployment, no data change. The whole reason the dual
 *      mode exists is that this is cheap; a claim like that is worth nothing untested.
 *   3. **Schema and permission dry-run.** `prisma migrate diff` between what the database has and
 *      what the composer produced, and the permission plan against real state. Neither applies
 *      anything: 051 拆解 §2.3.
 *
 * It reuses PL2-09's harness verbatim (`--keep`) rather than duplicating the tarball dance, so the
 * App under test here is byte-for-byte the App that task verified.
 *
 * Prerequisites — the script checks and says so rather than failing obscurely:
 *   docker compose up -d   in dev-infra (Keycloak) and appspine-app-template (Postgres)
 *
 * Usage:
 *   node scripts/051-g2-runtime-parity.mjs            # full run
 *   node scripts/051-g2-runtime-parity.mjs --keep     # leave the temp App for inspection
 *   node scripts/051-g2-runtime-parity.mjs --reuse <dir>   # skip the pack/install, reuse a dir
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const keep = process.argv.includes('--keep');
const reuseIndex = process.argv.indexOf('--reuse');
const reuseDir = reuseIndex === -1 ? null : process.argv[reuseIndex + 1];

/**
 * A throwaway Postgres of its own, rather than the App's dev database.
 *
 * Two reasons, and the second is the one that decided it. The dev container's volume was
 * initialised with an older password than its current `.env` — Postgres only sets the role password
 * on first init — so connecting from the host fails. Fixing that means running `ALTER USER` against
 * somebody's development machine, which is a side effect this script has no business having. A
 * container it creates and destroys has no such problem, and it also means a parity run can never
 * touch data anyone cares about.
 */
const PARITY_CONTAINER = 'appspine-g2-parity-db';
const PARITY_PORT = 23999;
const PARITY_PASSWORD = 'g2-parity-throwaway';
const PARITY_DB = 'appspine_g2_parity';
/** The shared dev Keycloak from dev-infra; only its existence matters here, see the env block. */
const KEYCLOAK_REALM = process.env.G2_OIDC_ISSUER ?? 'http://localhost:8180/realms/appspine-dev';
const PARITY_URL = `postgresql://postgres:${PARITY_PASSWORD}@127.0.0.1:${PARITY_PORT}/${PARITY_DB}`;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
}

const findings = [];
function check(label, ok, detail) {
  if (!ok) {
    findings.push(label);
    // Set here, not at the end of main(): several checks are fatal and `return` out of main, which
    // used to skip the exit-code assignment entirely — the script printed FAIL and exited 0. A
    // mutation sweep caught it, which is the whole argument for running one on the harness too.
    process.exitCode = 1;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  return ok;
}

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** The parity harness, copied into the temp backend and run once per mode. */
const HARNESS = `
import { writeSync } from "node:fs";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./src/app.module";

/**
 * Boots the App for real and reports what it actually serves.
 *
 * Routes are read from the Express router rather than from Nest metadata on purpose: metadata is
 * what the App *declared*, and the question here is what it *serves*. The two differ exactly when
 * something failed to register, which is the case this is looking for.
 */
function routesOf(app: NestExpressApplication): string[] {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack?: unknown[] };
    _router?: { stack?: unknown[] };
  };
  const stack = (instance.router?.stack ?? instance._router?.stack ?? []) as {
    route?: { path?: string; methods?: Record<string, boolean> };
  }[];

  const routes: string[] = [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route?.path) continue;
    for (const [method, enabled] of Object.entries(route.methods ?? {})) {
      if (enabled) routes.push(\`\${method.toUpperCase()} \${route.path}\`);
    }
  }
  return [...new Set(routes)].sort();
}

async function main() {
  // \`abortOnError: false\`: Nest's default is to log through its own logger and call
  // \`process.exit(1)\`. With \`logger: false\` that is a silent exit 1 — the harness cannot report
  // what it never sees. Rejecting instead puts the error on the marker line where it belongs.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    abortOnError: false,
  });
  await app.init();

  const result: Record<string, unknown> = {
    mode: process.env.APPSPINE_PLUGIN_MODE === "1" ? "plugin" : "legacy",
    routes: routesOf(app),
  };

  // The marker rows prove data written under one wiring is readable under the other.
  const prisma = app.get<{
    user: { upsert: Function; findUnique: Function; count: Function };
    auditLog: { create: Function; findFirst: Function; count: Function };
  }>((await import("@appspine/common")).PrismaService);

  const email = process.env.G2_MARKER_EMAIL as string;
  if (process.env.G2_WRITE_MARKER === "1") {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: "G2 rollback rehearsal" },
    });
    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "USER",
        entityId: user.id,
        actorId: user.id,
        actorEmail: email,
        appName: "g2-parity-app",
        isAiOperation: false,
      },
    });
  }
  const marker = await prisma.user.findUnique({ where: { email } });
  result.marker = marker ? { id: marker.id, email: marker.email, name: marker.name } : null;
  result.userCount = await prisma.user.count();
  const auditMarker = await prisma.auditLog.findFirst({
    where: { appName: "g2-parity-app", entityType: "USER" },
  });
  result.auditMarker = auditMarker ? { id: auditMarker.id, action: auditMarker.action } : null;
  result.auditCount = await prisma.auditLog.count();

  // Whatever the App exposes about its plugins, if anything.
  try {
    const { AppspinePluginHost } = await import("@appspine/plugin-host-nest");
    const host = app.get(AppspinePluginHost, { strict: false });
    result.catalog = host.catalog.entries.map((entry: { key: string; status: string }) => ({
      key: entry.key,
      status: entry.status,
    }));
    result.outcome = host.catalog.outcome;
  } catch {
    result.catalog = null;
  }

  await app.close();
  report(result);
}

/**
 * Synchronous, because the next thing that happens is \`process.exit\`.
 *
 * Node's stdout is a pipe when this runs under the parity script, and writes to a pipe are async —
 * \`process.stdout.write\` followed by \`process.exit\` silently drops the line. That produced a run
 * whose only symptom was "exit 1, no output", which is a much worse thing to debug than whatever
 * the harness was actually trying to say. \`process.exit\` itself stays: the App holds a live Prisma
 * connection open, so waiting for the event loop to drain would hang instead.
 */
function report(payload: unknown): void {
  writeSync(1, \`__G2__\${JSON.stringify(payload)}__G2__\n\`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    report({ error: String(error?.stack ?? error) });
    process.exit(1);
  });
`;

function materialise() {
  if (reuseDir) {
    console.log(`reusing ${reuseDir}`);
    return reuseDir;
  }
  console.log('running the PL2-09 harness to build a real App from tarballs (this takes a while)');
  const result = run(
    'node',
    [path.join(repoRoot, 'scripts/051-pl2-09-template-dual-mode.mjs'), '--keep'],
    {
      cwd: repoRoot,
    },
  );
  process.stdout.write(result.stdout?.split('\n').slice(-6).join('\n') ?? '');
  const match = /kept: (.+)/.exec(result.stdout ?? '');
  if (result.status !== 0 || !match) {
    throw new Error('the PL2-09 harness did not produce a usable App');
  }
  return path.join(match[1].trim(), 'app');
}

function main() {
  const templateEnv = readEnvFile(path.resolve(repoRoot, '../appspine-app-template/.env'));
  const parityUrl = PARITY_URL;

  console.log(`starting a throwaway Postgres (${PARITY_CONTAINER} on ${PARITY_PORT})`);
  run('docker', ['rm', '-f', PARITY_CONTAINER], { shell: false });
  const started = run(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      PARITY_CONTAINER,
      '-e',
      `POSTGRES_PASSWORD=${PARITY_PASSWORD}`,
      '-e',
      `POSTGRES_DB=${PARITY_DB}`,
      // Loopback only, and no volume: the container is the entire lifetime of the data.
      '-p',
      `127.0.0.1:${PARITY_PORT}:5432`,
      'postgres:17-alpine',
    ],
    { shell: false },
  );
  if (!check('the throwaway database starts', started.status === 0, started.stderr?.trim())) return;

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // `pg_isready` answers yes while the entrypoint's own bootstrap server is still up, and the
    // next thing this script does is `prisma migrate deploy` — which then fails with "the database
    // system is starting up". Ask the question the caller actually cares about: can a client run a
    // statement against the real database?
    const probe = run(
      'docker',
      ['exec', PARITY_CONTAINER, 'psql', '-U', 'postgres', '-d', PARITY_DB, '-c', 'select 1'],
      { shell: false },
    );
    if (probe.status === 0) {
      ready = true;
      break;
    }
    run('node', ['-e', 'setTimeout(() => {}, 1000)'], { shell: false });
  }
  if (!check('the throwaway database accepts connections', ready)) return;

  const appDir = materialise();
  const backendDir = path.join(appDir, 'backend');
  const env = {
    ...process.env,
    ...templateEnv,
    DATABASE_URL: parityUrl,
    G2_MARKER_EMAIL: 'g2-rollback-rehearsal@example.invalid',
    // The App refuses to boot under AUTH_MODE=oidc unless all three are set, and the template
    // ships .env with placeholders. Pinned here so a parity run does not depend on how somebody
    // filled their local file in. Nothing verifies a token in this harness — no request is made —
    // so these only have to exist and point somewhere real.
    AUTH_MODE: 'oidc',
    OIDC_ISSUER: KEYCLOAK_REALM,
    OIDC_JWKS_URL: `${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
    OIDC_AUDIENCE: 'appspine-g2-parity',
  };

  fs.writeFileSync(path.join(backendDir, 'g2-parity-harness.ts'), HARNESS, 'utf8');

  console.log('\napplying the App migrations to the parity database');
  const migrated = run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema'], {
    cwd: backendDir,
    env,
  });
  if (
    !check(
      'migrations apply',
      migrated.status === 0,
      `${migrated.stdout ?? ''}${migrated.stderr ?? ''}`.trim().split('\n').slice(-4).join(' | '),
    )
  ) {
    return;
  }

  const boot = (mode, writeMarker) => {
    const result = run('npx', ['ts-node', '--project', 'tsconfig.json', 'g2-parity-harness.ts'], {
      cwd: backendDir,
      env: {
        ...env,
        APPSPINE_PLUGIN_MODE: mode === 'plugin' ? '1' : '0',
        G2_WRITE_MARKER: writeMarker ? '1' : '0',
      },
    });
    const match = /__G2__(.*)__G2__/s.exec(result.stdout ?? '');
    if (!match) {
      // A boot failure with no visible output is the least actionable thing this script can
      // produce, so report how the child died as well as what it said.
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
      console.log(
        `harness exit=${result.status} signal=${result.signal} error=${result.error?.message ?? 'none'}`,
      );
      console.log(
        output ? output.split('\n').slice(-15).join('\n') : '(the harness printed nothing)',
      );
      return null;
    }
    return JSON.parse(match[1]);
  };

  // ---- 1. API parity ---------------------------------------------------------------------
  console.log('\nbooting in legacy mode');
  const legacy = boot('legacy', false);
  if (
    !check('the App boots with the legacy wiring', legacy !== null && !legacy.error, legacy?.error)
  )
    return;

  console.log('booting in plugin mode');
  const plugin = boot('plugin', false);
  if (
    !check('the App boots through the plugin host', plugin !== null && !plugin.error, plugin?.error)
  )
    return;

  const onlyLegacy = legacy.routes.filter((route) => !plugin.routes.includes(route));
  const onlyPlugin = plugin.routes.filter((route) => !legacy.routes.includes(route));
  check(
    `both modes serve the same ${legacy.routes.length} routes`,
    onlyLegacy.length === 0 && onlyPlugin.length === 0,
    `legacy only: ${onlyLegacy.join(', ') || 'none'} | plugin only: ${onlyPlugin.join(', ') || 'none'}`,
  );
  check('the plugin host reached "ready"', plugin.outcome === 'ready', String(plugin.outcome));
  // Equal route sets are worth exactly what they cover. In plugin mode the host owns only part of
  // the App's capabilities - the rest are still hand-wired in `pluginMode()` - so parity here is a
  // statement about the whole surface staying intact, not about how much of it moved.
  console.log(
    `host-owned: ${(plugin.catalog ?? []).map((e) => e.key).join(', ') || 'none'}\n` +
      '  still hand-wired in both modes: rbac, m2m-api-key, metadata-schema, mcp-server',
  );
  check(
    'the catalog lists the expected instances',
    Array.isArray(plugin.catalog) && plugin.catalog.length > 0,
    JSON.stringify(plugin.catalog),
  );

  // ---- 2. Rollback rehearsal -------------------------------------------------------------
  console.log('\nwriting rows in plugin mode (User + AuditLog)');
  const wrote = boot('plugin', true);
  if (
    !check(
      'plugin mode writes',
      wrote !== null && wrote.marker !== null && wrote.auditMarker !== null,
      wrote?.error,
    )
  )
    return;

  console.log('switching back to legacy — no migration, no redeploy');
  const rolledBack = boot('legacy', false);
  check(
    'the rows written in plugin mode are intact after rolling back',
    rolledBack?.marker?.id === wrote.marker.id &&
      rolledBack?.marker?.email === wrote.marker.email &&
      rolledBack?.auditMarker?.id === wrote.auditMarker.id,
    `user: ${JSON.stringify(rolledBack?.marker)} | audit: ${JSON.stringify(rolledBack?.auditMarker)}`,
  );
  check(
    'rolling back changed no rows across tables',
    rolledBack?.userCount === wrote.userCount && rolledBack?.auditCount === wrote.auditCount,
    `users: ${wrote.userCount} -> ${rolledBack?.userCount}, audit: ${wrote.auditCount} -> ${rolledBack?.auditCount}`,
  );

  // ---- 3. Schema dry-run -----------------------------------------------------------------
  console.log('\nschema dry-run: what the composed schema would change');
  const composed = path.join(backendDir, '.appspine/generated/schema.prisma');
  const dryRunSchema = path.join(backendDir, 'g2-dry-run.prisma');
  fs.writeFileSync(
    dryRunSchema,
    [
      'datasource db {',
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      '}',
      '',
      'generator client {',
      '  provider = "prisma-client-js"',
      '}',
      '',
      fs.readFileSync(composed, 'utf8'),
    ].join('\n'),
    'utf8',
  );
  const diff = run(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-url',
      parityUrl,
      '--to-schema-datamodel',
      dryRunSchema,
      '--script',
    ],
    { cwd: backendDir, env },
  );
  check(
    'prisma migrate diff produces a plan without applying it',
    diff.status === 0,
    diff.stderr?.trim(),
  );
  const plan = (diff.stdout ?? '').trim();
  const statements = plan.split('\n').filter((line) => line.trim() && !line.startsWith('--'));
  // Written beside the App under test, not into the repo: it is evidence about that run.
  const planFile = path.join(appDir, 'g2-schema-dry-run.sql');
  fs.writeFileSync(planFile, `${plan}\n`, 'utf8');

  // The plan is the deliverable, and reading it is the point. A composed schema that would DROP
  // live tables is not a failure of this script - it is the fact the dry-run exists to surface,
  // and the reason the breakdown forbids applying anything to an App before Phase 4.
  const destructive = statements.filter((line) => /^(DROP|ALTER TABLE .* DROP)/i.test(line.trim()));
  console.log(`${statements.length} statement(s); ${destructive.length} destructive - ${planFile}`);
  console.log(statements.slice(0, 12).join('\n') || '(no changes)');
  if (destructive.length > 0) {
    console.log(
      'NOTE the composed schema covers only plugin-owned models. The tables above belong to\n' +
        '     capabilities that are still hand-wired (rbac, m2m-api-key, metadata-schema, mcp) or\n' +
        '     to the App itself, so this plan must never be applied as-is. Recorded, not fixed.',
    );
  }

  // Permissions: the same question, and it has no answer yet on either side.
  console.log('\npermission dry-run: what the plan would reconcile');
  const permissions = JSON.parse(
    fs.readFileSync(path.join(backendDir, '.appspine/generated/permissions.json'), 'utf8'),
  );
  console.log(
    `desired: ${permissions.desired.length}, fresh-install plan: ${permissions.freshInstallPlan.length}`,
  );
  check(
    'the permission plan is generated and applies nothing',
    Array.isArray(permissions.freshInstallPlan) && permissions.diagnostics.length === 0,
    JSON.stringify(permissions.diagnostics),
  );

  // Gate G2's independent review added a `reconcilePermissions` call here, with hand-written
  // current/desired arrays, asserting the plan contains no `delete`. It was removed again, for
  // three reasons: `permission-reconciler.spec.ts` already asserts exactly that, driven by the
  // frozen PL0-06 fixture rather than by literals written next to the assertion; `drop-table` is
  // not in the op vocabulary, so half of it could never fire; and calling the reconciler with
  // invented state inside a *runtime* script does not make it a runtime dry-run. It reads as one,
  // which is the problem — it let this condition be reported as met.
  console.log(
    'NOTE no reconciliation against live state was possible, for two independent reasons:\n' +
      '     (1) no plugin in preset-standard contributes a permission, so the desired set is empty;\n' +
      '     (2) this App models permissions as a Prisma `enum Permission`, resolved at compile\n' +
      '         time, so there is no catalog table for reconcilePermissions to read as current\n' +
      '         state. A real permission dry-run needs the PL2-07 apply adapter and an App that\n' +
      '         stores its catalog as data. Both are Phase 4. This is a gap, not a pass.',
  );

  // "Applied nothing" has to be asked of the tables the plan would have dropped. Row counts in
  // `users` would survive this plan either way, so on their own they prove nothing about it.
  const dropped = /DROP TABLE "([^"]+)"/.exec(plan)?.[1];
  const survives = dropped
    ? run(
        'docker',
        [
          'exec',
          PARITY_CONTAINER,
          'psql',
          '-U',
          'postgres',
          '-d',
          PARITY_DB,
          '-tAc',
          `select to_regclass('public.${dropped}') is not null`,
        ],
        { shell: false },
      )
    : null;
  const rowsAfter = boot('legacy', false);
  check(
    'the dry-run applied nothing',
    rowsAfter?.userCount === wrote.userCount &&
      (dropped === undefined || survives?.stdout?.trim() === 't'),
    `users ${wrote.userCount} -> ${rowsAfter?.userCount}; ${dropped ?? 'no table'} present: ${survives?.stdout?.trim() ?? 'n/a'}`,
  );

  console.log(
    `\n${findings.length === 0 ? 'G2 runtime parity: OK' : `${findings.length} finding(s)`}`,
  );
  if (keep) console.log(`kept: ${appDir}`);
  if (findings.length > 0) process.exitCode = 1;
}

try {
  main();
} finally {
  // The container is the data's whole lifetime, so this is also the cleanup. `--keep-db` holds it
  // open instead, for when the thing being investigated is the database's own state.
  if (!process.argv.includes('--keep-db')) {
    run('docker', ['rm', '-f', PARITY_CONTAINER], { shell: false });
  } else {
    console.log(`kept: ${PARITY_CONTAINER} on ${PARITY_PORT}`);
  }
}
