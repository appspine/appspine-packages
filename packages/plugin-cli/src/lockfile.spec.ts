import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli';
import { COMMANDS } from './commands';
import { entry, manifest, type TestApp, testApp } from './commands/test-support';
import { ExitCode } from './exit-codes';
import { INVENTORY_FILENAME } from './inventory-file';
import { LOCKFILE_NAME, type PluginLockfile } from './lockfile';

const apps: TestApp[] = [];
afterEach(() => {
  while (apps.length > 0) rmSync(apps.pop()?.root as string, { recursive: true, force: true });
});

const AUDIT = manifest({
  id: 'audit-log',
  provides: ['appspine.audit-sink'],
  requires: ['appspine.prisma'],
  facets: {
    backend: { modulePath: './dist/index.js', exportName: 'M' },
    prisma: { owns: ['AuditLog'], schemaFragment: 'prisma/a.prisma' },
  },
});

const HEALTH = manifest({
  id: 'health-check',
  provides: ['appspine.health-indicator'],
  requires: ['appspine.prisma'],
});

const OIDC = manifest({
  id: 'oidc-auth',
  provides: ['appspine.interactive-auth-provider'],
  requires: ['appspine.audit-sink'],
  conflicts: ['local-auth'],
  configSchema: { configRef: 'oidc' },
  environment: [{ key: 'OIDC_CLIENT_SECRET', required: true, secret: true }],
});

const MULTI = manifest({
  id: 'master-data-client',
  cardinality: 'multiple',
  provides: ['appspine.master-data-client'],
  requires: [],
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

function lockOf(root: string): PluginLockfile {
  return JSON.parse(readFileSync(path.join(root, LOCKFILE_NAME), 'utf8'));
}

describe('lockfile contents', () => {
  it('records the resolved graph, not the inputs', async () => {
    const { root } = make({
      installed: [AUDIT, OIDC],
      inventory: [entry('audit-log'), entry('oidc-auth', { configRef: 'oidc' })],
    });

    await run(['build'], root);
    const lock = lockOf(root);

    expect(lock.schemaVersion).toBe('appspine.plugin-lock/v1');
    expect(lock.order).toEqual(['audit-log', 'oidc-auth']);
    expect(lock.capabilities['appspine.audit-sink']).toEqual(['audit-log']);
    expect(lock.instances.find((i) => i.key === 'oidc-auth')?.dependsOn).toEqual(['audit-log']);
    expect(lock.packages.map((p) => p.name)).toEqual([
      '@appspine/audit-log',
      '@appspine/oidc-auth',
    ]);
  });

  it('leaves package resolution and integrity to pnpm', async () => {
    // 051 plan §7: duplicating pnpm's tarball resolution would create a second source of truth
    // that goes stale silently, with nothing to say which one is right.
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    const lock = lockOf(root);
    // Structural, not a text search: the note deliberately mentions both words while saying they
    // belong elsewhere, and a test that fails on its own explanation is a test nobody trusts.
    for (const entry of lock.packages) {
      expect(Object.keys(entry).sort()).toEqual([
        'digest',
        'manifestDigest',
        'name',
        'permissionDigest',
        'schemaDigest',
        'version',
      ]);
    }
    const raw = readFileSync(path.join(root, LOCKFILE_NAME), 'utf8');
    expect(raw).not.toContain('registry.npmjs.org');
    expect(raw).not.toContain('sha512-');
    expect(raw).toContain('pnpm-lock.yaml');
    // Version yes, how to fetch it no.
    expect(lock.packages[0].version).toBe('1.2.3');
  });

  it('records env keys by name and never a value', async () => {
    process.env.OIDC_CLIENT_SECRET = 'never-put-me-in-a-committed-file';
    const { root } = make({
      installed: [AUDIT, OIDC],
      inventory: [entry('audit-log'), entry('oidc-auth', { configRef: 'oidc' })],
    });

    await run(['build'], root);

    const raw = readFileSync(path.join(root, LOCKFILE_NAME), 'utf8');
    expect(raw).toContain('OIDC_CLIENT_SECRET');
    expect(raw).not.toContain('never-put-me-in-a-committed-file');
    delete process.env.OIDC_CLIENT_SECRET;
  });

  it('digests each package Prisma fragment', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);
    expect(lockOf(root).packages[0].schemaDigest).toMatch(/^sha256:/);
  });

  it('keeps multi-instance capabilities separate', async () => {
    const { root } = make({
      installed: [MULTI],
      inventory: [
        entry('master-data-client', { instanceId: 'hr' }),
        entry('master-data-client', { instanceId: 'finance' }),
      ],
    });

    await run(['build'], root);
    const lock = lockOf(root);

    expect(lock.instances.map((i) => i.key)).toEqual([
      'master-data-client#finance',
      'master-data-client#hr',
    ]);
    // Each instance gets its own qualified capability, and the bare one lists both.
    expect(lock.capabilities['appspine.master-data-client#hr']).toEqual(['master-data-client#hr']);
    expect(lock.capabilities['appspine.master-data-client']).toEqual([
      'master-data-client#finance',
      'master-data-client#hr',
    ]);
    // One package, two instances: the package appears once.
    expect(lock.packages).toHaveLength(1);
  });

  it('is byte-identical regardless of inventory order', async () => {
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

    expect(readFileSync(path.join(a.root, LOCKFILE_NAME), 'utf8')).toBe(
      readFileSync(path.join(b.root, LOCKFILE_NAME), 'utf8'),
    );
  });

  it('records a digest for every generated artefact', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);
    const lock = lockOf(root);
    expect(lock.artifacts.map((a) => a.path)).toEqual([
      '.appspine/generated/backend/composition.ts',
      '.appspine/generated/catalog.json',
      '.appspine/generated/permissions.json',
      '.appspine/generated/schema.prisma',
    ]);
    for (const artifact of lock.artifacts) {
      expect(artifact.digest).toMatch(/^sha256:/);
    }
  });
});

describe('lockfile drift', () => {
  it('reports a missing lock', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    const { code, envelope } = await run(['build', '--check'], root);
    expect(code).toBe(ExitCode.DRIFT_DETECTED);
    expect(envelope.data.lockDrift).toContain('plugin-lock-missing');
  });

  it('passes right after a build', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);
    await expect(run(['build', '--check'], root)).resolves.toMatchObject({ code: ExitCode.OK });
  });

  it('catches a package upgraded through the package manager without a rebuild', async () => {
    // This is the failure the two lockfiles exist to catch together: pnpm moved, the plugin lock
    // did not, and the App would boot on a capability graph nobody reviewed.
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    const packageJson = path.join(root, 'node_modules/@appspine/audit-log/package.json');
    const parsed = JSON.parse(readFileSync(packageJson, 'utf8'));
    parsed.version = '2.0.0';
    writeFileSync(packageJson, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    const { code, envelope } = await run(['build', '--check'], root);

    expect(code).toBe(ExitCode.DRIFT_DETECTED);
    expect(envelope.data.lockDrift).toContain('plugin-lock-version-drift');
  });

  it('moves the source digest when a manifest changes but the order does not', async () => {
    // Pins the property, not the mechanism: a manifest change must invalidate every artefact.
    // It reaches the digest through `graph.digest`, which carries each instance's manifest digest —
    // so this stays green even if `sourceDigest`'s own `manifests` entry is removed. That is the
    // right thing to assert; a test tied to one of two redundant paths would go red on a harmless
    // refactor and stay green on a real regression in the other.
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    const before = await run(['build'], root);

    const manifestPath = path.join(root, 'node_modules/@appspine/audit-log/appspine.plugin.json');
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    parsed.displayName = 'Audit Log (renamed)';
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    const after = await run(['build', '--check'], root);

    expect(after.envelope.data.sourceDigest).not.toBe(before.envelope.data.sourceDigest);
  });

  it('detects an installed manifest modified in place at the same version', async () => {
    // Same version, different manifest: not an upgrade, a tampered package.
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    const manifestPath = path.join(root, 'node_modules/@appspine/audit-log/appspine.plugin.json');
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    parsed.provides = ['appspine.audit-sink', 'appspine.health-indicator'];
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    const { envelope } = await run(['build', '--check'], root);

    expect(JSON.stringify(envelope.diagnostics)).toContain('plugin-lock-manifest-tampered');
  });

  it('detects a Prisma fragment changed inside an installed package', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    writeFileSync(
      path.join(root, 'node_modules/@appspine/audit-log/prisma/a.prisma'),
      'model Placeholder { id String @id\n  extra String\n}\n',
      'utf8',
    );

    const { envelope } = await run(['build', '--check'], root);
    expect(JSON.stringify(envelope.diagnostics)).toContain('plugin-lock-schema-drift');
  });

  it('detects an inventory change as a resolution change', async () => {
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

    const { envelope } = await run(['build', '--check'], root);
    expect(envelope.data.lockDrift).toContain('plugin-lock-resolution-drift');
    expect(envelope.data.lockDrift).toContain('plugin-lock-package-added');
    // The artefacts the lock digested would also come out different now.
    expect(envelope.data.lockDrift).toContain('plugin-lock-artifact-drift');
  });

  it('separates "the file was edited" from "the lock is stale"', async () => {
    // Two different failures with two different owners. Hand-editing a generated file is caught by
    // the artefact comparison; the lock is still internally consistent, so it stays quiet. Saying
    // otherwise would make every artefact edit look like a lockfile problem.
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    const catalog = path.join(root, '.appspine/generated/catalog.json');
    writeFileSync(catalog, readFileSync(catalog, 'utf8').replace('"order"', '"ORDER"'), 'utf8');

    const { code, envelope } = await run(['build', '--check'], root);

    expect(code).toBe(ExitCode.DRIFT_DETECTED);
    expect(envelope.data.drift).toEqual([
      { path: '.appspine/generated/catalog.json', reason: 'stale' },
    ]);
    expect(envelope.data.lockDrift).toEqual([]);
  });
});

describe('doctor and the lockfile', () => {
  it('reports lock drift as rebuildable, not as a broken inventory', async () => {
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });

    const { code, envelope } = await run(['doctor'], root);

    expect(code).toBe(ExitCode.DRIFT_DETECTED);
    expect(envelope.data.lockfile).toContain('plugin-lock-missing');
  });

  it('treats a tampered installed manifest as more than a rebuild', async () => {
    // Everything else in the lock is fixed by running `build`. A package that changed under the
    // same version is not, and telling an operator to rebuild would paper straight over it.
    const { root } = make({ installed: [AUDIT], inventory: [entry('audit-log')] });
    await run(['build'], root);

    const manifestPath = path.join(root, 'node_modules/@appspine/audit-log/appspine.plugin.json');
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    parsed.displayName = 'Audit Log (modified)';
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    const { code } = await run(['doctor'], root);

    expect(code).toBe(ExitCode.RESOLUTION_FAILED);
  });
});
