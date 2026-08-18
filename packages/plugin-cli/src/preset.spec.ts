import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli';
import { COMMANDS } from './commands';
import { entry, manifest, type TestApp, testApp } from './commands/test-support';
import { ExitCode } from './exit-codes';
import { CATALOG_ARTIFACT } from './generate';
import { INVENTORY_FILENAME } from './inventory-file';
import { LOCKFILE_NAME, type PluginLockfile } from './lockfile';
import { PRESET_FILENAME } from './preset';

const apps: TestApp[] = [];
afterEach(() => {
  while (apps.length > 0) rmSync(apps.pop()?.root as string, { recursive: true, force: true });
});

const HEALTH = manifest({
  id: 'health-check',
  provides: ['appspine.health-indicator'],
  requires: [],
});
const AUDIT = manifest({ id: 'audit-log', provides: ['appspine.audit-sink'], requires: [] });
const LOCAL = manifest({
  id: 'acme-billing',
  distribution: 'app-local',
  provides: ['appspine.acme-billing'],
  requires: [],
});

function make(options: Parameters<typeof testApp>[0]) {
  const created = testApp(options);
  apps.push(created);
  return created;
}

function installPreset(
  root: string,
  packageName: string,
  document: Record<string, unknown>,
  version = '1.0.0',
) {
  const dir = path.join(root, 'node_modules', packageName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: packageName, version }, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(path.join(dir, PRESET_FILENAME), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

const STANDARD = {
  schemaVersion: 'appspine.preset/v1',
  id: 'standard',
  displayName: 'Standard',
  plugins: [
    { plugin: '@appspine/health-check', instanceId: 'default', required: true },
    { plugin: '@appspine/audit-log', instanceId: 'default', required: true },
  ],
};

function writeInventoryFile(root: string, document: Record<string, unknown>) {
  writeFileSync(
    path.join(root, INVENTORY_FILENAME),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
}

async function cli(argv: string[], root: string) {
  const out: string[] = [];
  const code = await runCli([...argv, '--json', '--cwd', root], {
    commands: COMMANDS,
    version: '9.9.9',
    io: { stdout: (l) => out.push(l), stderr: () => {}, cwd: () => root },
  });
  const text = out.join('\n');
  return { code, envelope: JSON.parse(text.slice(text.lastIndexOf('{\n  "schemaVersion"'))) };
}

describe('expansion', () => {
  it('expands a preset into ordinary entries', async () => {
    const { root } = make({ installed: [HEALTH, AUDIT] });
    installPreset(root, '@appspine/preset-standard', STANDARD);
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [],
    });

    const { code, envelope } = await cli(['list'], root);

    expect(code).toBe(ExitCode.OK);
    expect(envelope.data.entries.map((e: { pluginId: string }) => e.pluginId)).toEqual([
      'audit-log',
      'health-check',
    ]);
  });

  it('reports a preset package that is not installed', async () => {
    const { root } = make({ installed: [] });
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [],
    });

    const { envelope } = await cli(['list'], root);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain('preset-not-found');
  });

  it('refuses a preset schema version it does not understand', async () => {
    const { root } = make({ installed: [HEALTH] });
    installPreset(root, '@appspine/preset-future', {
      ...STANDARD,
      schemaVersion: 'appspine.preset/v2',
    });
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-future'],
      plugins: [],
    });

    const { envelope } = await cli(['list'], root);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'preset-schema-version-unsupported',
    );
  });

  it('lets an explicit entry override the preset, and says so', async () => {
    // A silent override is how an App ends up running something other than what its own file
    // appears to say.
    const { root } = make({ installed: [HEALTH, AUDIT] });
    installPreset(root, '@appspine/preset-standard', STANDARD);
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [entry('health-check', { enabled: false })],
    });

    const { envelope } = await cli(['list'], root);

    const health = envelope.data.entries.find(
      (e: { pluginId: string }) => e.pluginId === 'health-check',
    );
    expect(health.enabled).toBe(false);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'preset-entry-overridden',
    );
  });

  it('never swallows an app-local plugin', async () => {
    const { root } = make({ installed: [HEALTH, AUDIT, LOCAL] });
    installPreset(root, '@appspine/preset-standard', STANDARD);
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [entry('acme-billing')],
    });

    const { envelope } = await cli(['list'], root);

    expect(envelope.data.entries.map((e: { pluginId: string }) => e.pluginId)).toContain(
      'acme-billing',
    );
    expect(envelope.data.entries).toHaveLength(3);
  });

  it('refuses to pick when two presets contribute the same instance', async () => {
    const { root } = make({ installed: [HEALTH, AUDIT] });
    installPreset(root, '@appspine/preset-standard', STANDARD);
    installPreset(root, '@appspine/preset-rival', { ...STANDARD, id: 'rival' });
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard', '@appspine/preset-rival'],
      plugins: [],
    });

    const { envelope } = await cli(['list'], root);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain('preset-overlap');
  });
});

describe('the preset name is never the only thing recorded', () => {
  it('lists resolved plugins with versions and digests in the catalog', async () => {
    const { root } = make({ installed: [HEALTH, AUDIT] });
    installPreset(root, '@appspine/preset-standard', STANDARD);
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [],
    });

    await cli(['build'], root);
    const catalog = JSON.parse(readFileSync(path.join(root, CATALOG_ARTIFACT), 'utf8'));

    // The plugins, with everything an operator needs — not a bare "standard@1.0.0".
    expect(catalog.entries).toHaveLength(2);
    for (const item of catalog.entries) {
      expect(item.packageVersion).toBe('1.2.3');
      expect(item.digest).toMatch(/^sha256:/);
      expect(item.fromPreset).toBe('@appspine/preset-standard');
    }
    // ...and the preset recorded alongside, as provenance.
    expect(catalog.presets).toEqual([
      {
        package: '@appspine/preset-standard',
        version: '1.0.0',
        id: 'standard',
        contributes: ['audit-log', 'health-check'],
      },
    ]);
  });

  it('records the same thing in the lockfile', async () => {
    const { root } = make({ installed: [HEALTH, AUDIT] });
    installPreset(root, '@appspine/preset-standard', STANDARD);
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [],
    });

    await cli(['build'], root);
    const lock = JSON.parse(readFileSync(path.join(root, LOCKFILE_NAME), 'utf8')) as PluginLockfile;

    expect(lock.instances.map((i) => i.fromPreset)).toEqual([
      '@appspine/preset-standard',
      '@appspine/preset-standard',
    ]);
    expect(lock.packages.map((p) => p.version)).toEqual(['1.2.3', '1.2.3']);
    expect(lock.presets[0].version).toBe('1.0.0');
  });

  it('changes the source digest when the preset version changes', async () => {
    // Otherwise upgrading a preset would leave every derived artefact looking current while the
    // set of plugins it names had moved underneath.
    const first = make({ installed: [HEALTH, AUDIT] });
    installPreset(first.root, '@appspine/preset-standard', STANDARD, '1.0.0');
    writeInventoryFile(first.root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [],
    });
    const before = await cli(['build'], first.root);

    installPreset(first.root, '@appspine/preset-standard', STANDARD, '2.0.0');
    const after = await cli(['build', '--check'], first.root);

    expect(before.envelope.data.sourceDigest).not.toBe(after.envelope.data.sourceDigest);
    expect(after.code).toBe(ExitCode.DRIFT_DETECTED);
  });
});

describe('add and remove edit the file, not the expansion', () => {
  it('does not write preset-contributed entries into appspine.plugins.json', async () => {
    // Otherwise the first `add` would freeze a copy of the preset, and upgrading it later would
    // change nothing.
    const { root } = make({ installed: [HEALTH, AUDIT] });
    installPreset(root, '@appspine/preset-standard', STANDARD);
    writeInventoryFile(root, {
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [],
    });

    const { root: other } = { root };
    void other;
    await cli(['add', '@appspine/health-check', '--instance-id', 'second'], root);

    const written = JSON.parse(readFileSync(path.join(root, INVENTORY_FILENAME), 'utf8'));
    expect(written.presets).toEqual(['@appspine/preset-standard']);
    expect(written.plugins).toHaveLength(1);
    expect(written.plugins[0].instanceId).toBe('second');
  });
});
