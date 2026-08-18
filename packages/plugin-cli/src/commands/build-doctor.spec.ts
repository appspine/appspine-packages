import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../cli';
import { ExitCode } from '../exit-codes';
import { CATALOG_ARTIFACT } from '../generate';
import { INVENTORY_FILENAME } from '../inventory-file';
import { COMMANDS } from './index';
import { entry, manifest, type TestApp, testApp } from './test-support';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) rmSync(apps.pop()?.root as string, { recursive: true, force: true });
  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_CLIENT_SECRET;
});

const AUDIT = manifest({
  id: 'audit-log',
  provides: ['appspine.audit-sink'],
  requires: ['appspine.prisma'],
  facets: {
    backend: {
      modulePath: './dist/index.js',
      exportName: 'M',
      providerTokens: ['appspine.audit-sink'],
    },
    prisma: { owns: ['AuditLog'], schemaFragment: 'prisma/a.prisma' },
  },
});

const HEALTH = manifest({
  id: 'health-check',
  provides: ['appspine.health-indicator'],
  requires: ['appspine.prisma'],
  facets: {
    backend: { modulePath: './dist/index.js', exportName: 'M', controllerRoutes: ['health'] },
    operations: { healthIndicatorId: 'health-check' },
  },
});

const OIDC = manifest({
  id: 'oidc-auth',
  provides: ['appspine.interactive-auth-provider'],
  requires: ['appspine.audit-sink'],
  conflicts: ['local-auth'],
  configSchema: { configRef: 'oidc' },
  environment: [
    { key: 'OIDC_ISSUER', required: true, secret: false },
    { key: 'OIDC_CLIENT_SECRET', required: true, secret: true },
  ],
});

function make(options: Parameters<typeof testApp>[0]) {
  const created = testApp(options);
  apps.push(created);
  return created;
}

async function run(argv: string[], root: string) {
  const out: string[] = [];
  const code = await runCli([...argv, '--json', '--cwd', root], {
    commands: COMMANDS,
    version: '9.9.9',
    io: { stdout: (l) => out.push(l), stderr: () => {}, cwd: () => root },
  });
  const text = out.join('\n');
  return { code, envelope: JSON.parse(text.slice(text.lastIndexOf('{\n  "schemaVersion"'))) };
}

describe('build', () => {
  it('generates a catalog and is byte-stable across runs', async () => {
    const { root } = make({
      installed: [AUDIT, HEALTH],
      inventory: [entry('audit-log'), entry('health-check')],
    });

    const first = await run(['build'], root);
    expect(first.code).toBe(ExitCode.OK);
    const once = readFileSync(path.join(root, CATALOG_ARTIFACT), 'utf8');

    const second = await run(['build'], root);
    expect(second.code).toBe(ExitCode.OK);
    expect(readFileSync(path.join(root, CATALOG_ARTIFACT), 'utf8')).toBe(once);
    // The second run rewrote nothing, so "drift" never means "somebody re-ran the generator".
    expect(second.envelope.data.written).toEqual([]);
  });

  it('does not depend on inventory order', async () => {
    const a = make({
      installed: [AUDIT, HEALTH],
      inventory: [entry('audit-log'), entry('health-check')],
    });
    const b = make({
      installed: [AUDIT, HEALTH],
      inventory: [entry('health-check'), entry('audit-log')],
    });

    await run(['build'], a.root);
    await run(['build'], b.root);

    expect(readFileSync(path.join(a.root, CATALOG_ARTIFACT), 'utf8')).toBe(
      readFileSync(path.join(b.root, CATALOG_ARTIFACT), 'utf8'),
    );
  });

  it('refuses to generate from an inventory that does not resolve', async () => {
    // Artefacts from a broken graph would look authoritative and describe something that cannot
    // boot — and `doctor` would then compare against them.
    const { root } = make({
      installed: [OIDC],
      inventory: [entry('oidc-auth', { configRef: 'oidc' })],
    });

    const { code, envelope } = await run(['build'], root);

    expect(code).toBe(ExitCode.RESOLUTION_FAILED);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'generation-refused',
    );
    expect(existsSync(path.join(root, CATALOG_ARTIFACT))).toBe(false);
  });

  it('--check reports missing artefacts without writing them', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });

    const { code, envelope } = await run(['build', '--check'], root);

    expect(code).toBe(ExitCode.DRIFT_DETECTED);
    expect(envelope.data.drift).toContainEqual({ path: CATALOG_ARTIFACT, reason: 'missing' });
    expect(existsSync(path.join(root, CATALOG_ARTIFACT))).toBe(false);
  });

  it('--check passes right after a build', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);
    await expect(run(['build', '--check'], root)).resolves.toMatchObject({ code: ExitCode.OK });
  });

  it('--check detects an inventory change and says which kind of staleness it is', async () => {
    const { root, addInstalled } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    addInstalled(HEALTH);
    writeFileSync(
      path.join(root, INVENTORY_FILENAME),
      `${JSON.stringify(
        {
          schemaVersion: 'appspine.plugins/v1',
          plugins: [entry('audit-log'), entry('health-check')],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const { code, envelope } = await run(['build', '--check'], root);

    expect(code).toBe(ExitCode.DRIFT_DETECTED);
    expect(JSON.stringify(envelope.diagnostics)).toContain('the inventory or a manifest changed');
  });

  it('--check tells a generator change apart from an input change', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    // Same recorded sourceDigest, different bytes: only the generator can have changed.
    const file = path.join(root, CATALOG_ARTIFACT);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    parsed.note = 'hand-edited';
    writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    const { envelope } = await run(['build', '--check'], root);
    expect(JSON.stringify(envelope.diagnostics)).toContain('the generator changed');
  });
});

describe('catalog contents', () => {
  it('records routes, tokens, models and env key names', async () => {
    const { root } = make({
      installed: [AUDIT, HEALTH, OIDC],
      inventory: [
        entry('audit-log'),
        entry('health-check'),
        entry('oidc-auth', { configRef: 'oidc' }),
      ],
    });

    await run(['build'], root);
    const catalog = JSON.parse(readFileSync(path.join(root, CATALOG_ARTIFACT), 'utf8'));
    const byId = Object.fromEntries(
      catalog.entries.map((e: { pluginId: string }) => [e.pluginId, e]),
    );

    expect(byId['health-check'].routes).toEqual(['health']);
    expect(byId['health-check'].healthIndicatorId).toBe('health-check');
    expect(byId['audit-log'].providerTokens).toEqual(['appspine.audit-sink']);
    expect(byId['audit-log'].prismaModels).toEqual(['AuditLog']);
    expect(byId['oidc-auth'].environment).toEqual([
      { key: 'OIDC_CLIENT_SECRET', required: true, secret: true },
      { key: 'OIDC_ISSUER', required: true, secret: false },
    ]);
  });

  it('never contains a config value, even when one is set in the environment', async () => {
    process.env.OIDC_CLIENT_SECRET = 'super-secret-value-do-not-emit';
    const { root } = make({
      installed: [AUDIT, OIDC],
      inventory: [entry('audit-log'), entry('oidc-auth', { configRef: 'oidc' })],
    });

    await run(['build'], root);

    const contents = readFileSync(path.join(root, CATALOG_ARTIFACT), 'utf8');
    expect(contents).toContain('OIDC_CLIENT_SECRET');
    expect(contents).not.toContain('super-secret-value-do-not-emit');
  });

  it('marks a disabled entry as disabled rather than dropping it', async () => {
    const { root } = make({
      installed: [AUDIT, HEALTH],
      inventory: [entry('audit-log'), entry('health-check', { enabled: false })],
    });

    await run(['build'], root);
    const catalog = JSON.parse(readFileSync(path.join(root, CATALOG_ARTIFACT), 'utf8'));
    const health = catalog.entries.find((e: { pluginId: string }) => e.pluginId === 'health-check');
    expect(health.status).toBe('disabled');
    expect(catalog.order).not.toContain('health-check');
  });
});

describe('doctor', () => {
  it('reports enabled/disabled counts and does not claim runtime state', async () => {
    const { root } = make({
      installed: [AUDIT, HEALTH],
      inventory: [entry('audit-log'), entry('health-check', { enabled: false })],
    });
    await run(['build'], root);

    const { envelope } = await run(['doctor'], root);

    expect(envelope.data.summary).toMatchObject({ enabled: 1, disabled: 1, unresolved: 0 });
    // `failed` and `degraded` are boot outcomes. A tool that reports them without running the
    // lifecycle is producing output nobody can act on.
    for (const item of envelope.data.entries) {
      expect(item.runtimeState).toBe('unknown-until-boot');
    }
  });

  it('names a missing required env key and never reads a value', async () => {
    process.env.OIDC_ISSUER = 'https://issuer.example';
    const { root } = make({
      installed: [AUDIT, OIDC],
      inventory: [entry('audit-log'), entry('oidc-auth', { configRef: 'oidc' })],
    });
    await run(['build'], root);

    const { envelope } = await run(['doctor'], root);

    const codes = envelope.diagnostics.map((d: { code: string }) => d.code);
    expect(codes).toContain('missing-required-env-key');
    const text = JSON.stringify(envelope);
    expect(text).toContain('OIDC_CLIENT_SECRET');
    // The key that IS set must not have its value echoed anywhere.
    expect(text).not.toContain('https://issuer.example');
  });

  it('reports artefact drift with its own exit code', async () => {
    // Drift means "run build", not "change your inputs" — a different response, so a different
    // code. Anything else outranks it.
    process.env.OIDC_ISSUER = 'x';
    process.env.OIDC_CLIENT_SECRET = 'y';
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });

    const { code, envelope } = await run(['doctor'], root);

    expect(code).toBe(ExitCode.DRIFT_DETECTED);
    expect(envelope.data.drift).toContainEqual({ path: CATALOG_ARTIFACT, reason: 'missing' });
  });

  it('prefers the resolution failure over the drift it also sees', async () => {
    const { root } = make({
      installed: [OIDC],
      inventory: [entry('oidc-auth', { configRef: 'oidc' })],
    });

    const { code } = await run(['doctor'], root);

    expect(code).toBe(ExitCode.RESOLUTION_FAILED);
  });

  it('says the report is incomplete when presets are declared', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    writeFileSync(
      path.join(root, INVENTORY_FILENAME),
      `${JSON.stringify(
        {
          schemaVersion: 'appspine.plugins/v1',
          presets: ['@appspine/preset-standard'],
          plugins: [],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const { envelope } = await run(['doctor'], root);
    // The inventory itself is rejected while presets cannot be expanded, so the operator is told
    // the whole report is unreliable rather than being handed a partial one that looks complete.
    expect(JSON.stringify(envelope.diagnostics)).toContain('presets');
  });

  it('never loads a plugin package', async () => {
    const { root } = make({
      installed: [AUDIT, HEALTH],
      inventory: [entry('audit-log'), entry('health-check')],
    });
    await expect(run(['build'], root)).resolves.toMatchObject({ code: ExitCode.OK });
    await expect(run(['doctor'], root)).resolves.toMatchObject({ code: ExitCode.OK });
  });
});

describe('generated directory', () => {
  it('creates .appspine/generated when it does not exist', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    expect(existsSync(path.join(root, '.appspine'))).toBe(false);
    await run(['build'], root);
    expect(existsSync(path.join(root, CATALOG_ARTIFACT))).toBe(true);
  });

  it('leaves an unrelated file in the generated directory alone', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    mkdirSync(path.join(root, '.appspine/generated'), { recursive: true });
    writeFileSync(path.join(root, '.appspine/generated/notes.txt'), 'keep me\n', 'utf8');

    await run(['build'], root);

    expect(readFileSync(path.join(root, '.appspine/generated/notes.txt'), 'utf8')).toBe(
      'keep me\n',
    );
  });
});
