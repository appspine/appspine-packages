import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PluginManifestV1 } from '@appspine/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../cli';
import { ExitCode } from '../exit-codes';
import { INVENTORY_FILENAME, type InventoryFile, serializeInventory } from '../inventory-file';
import { renderDiff } from '../plan';
import { COMMANDS } from './index';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

const BASE: Omit<PluginManifestV1, 'id' | 'displayName' | 'provides' | 'requires'> = {
  schemaVersion: 'appspine.plugin/v1',
  cardinality: 'singleton',
  distribution: 'official',
  engine: { appspinePluginApi: '^1.0.0', node: '>=22.0.0', frameworks: {} },
  facets: { backend: { modulePath: './dist/index.js', exportName: 'Module' } },
} as PluginManifestV1;

function manifest(overrides: Partial<PluginManifestV1> & { id: string }): PluginManifestV1 {
  return {
    ...BASE,
    displayName: overrides.id,
    provides: [],
    requires: [],
    ...overrides,
  } as PluginManifestV1;
}

const HEALTH = manifest({
  id: 'health-check',
  provides: ['appspine.health-indicator'],
  requires: ['appspine.prisma'],
});
const AUDIT = manifest({
  id: 'audit-log',
  provides: ['appspine.audit-sink'],
  requires: ['appspine.prisma'],
});
const NEEDS_AUDIT = manifest({
  id: 'oidc-auth',
  provides: ['appspine.interactive-auth-provider'],
  requires: ['appspine.audit-sink'],
  // 051 decision 8: an interactive provider must name the providers it excludes, or the loader
  // rejects it. The fixture obeys the same rule a real manifest does.
  conflicts: ['local-auth'],
  configSchema: { configRef: 'oidc' },
});

interface AppOptions {
  installed?: PluginManifestV1[];
  inventory?: InventoryFile['plugins'];
  packageJson?: Record<string, unknown>;
}

/** A temp App: node_modules with real (JSON-only) plugin packages, plus an inventory. */
function app(options: AppOptions = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'appspine-cmd-'));
  roots.push(root);

  writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(options.packageJson ?? { name: 'demo-app', dependencies: {} }, null, 2)}\n`,
    'utf8',
  );

  for (const entry of options.installed ?? []) {
    const dir = path.join(root, 'node_modules', '@appspine', entry.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ name: `@appspine/${entry.id}`, version: '1.2.3' }, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      path.join(dir, 'appspine.plugin.json'),
      `${JSON.stringify(entry, null, 2)}\n`,
      'utf8',
    );
    // A landmine in every installed package: nothing the CLI does may load it.
    writeFileSync(path.join(dir, 'index.js'), "throw new Error('plugin code executed');", 'utf8');
  }

  if (options.inventory) {
    writeFileSync(
      path.join(root, INVENTORY_FILENAME),
      serializeInventory({ schemaVersion: 'appspine.plugins/v1', plugins: options.inventory }),
      'utf8',
    );
  }

  return root;
}

function entry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    plugin: `@appspine/${id}`,
    instanceId: 'default',
    enabled: true,
    required: true,
    ...overrides,
  } as InventoryFile['plugins'][number];
}

async function run(argv: string[], root: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli([...argv, '--json', '--cwd', root], {
    commands: COMMANDS,
    io: { stdout: (l) => out.push(l), stderr: (l) => err.push(l), cwd: () => root },
  });
  const text = out.join('\n');
  // `config-stub` prints the stub before the envelope, so take the last JSON document.
  const start = text.lastIndexOf('{\n  "schemaVersion"');
  return { code, envelope: JSON.parse(text.slice(start)), out, err };
}

function inventoryOf(root: string): InventoryFile {
  return JSON.parse(readFileSync(path.join(root, INVENTORY_FILENAME), 'utf8'));
}

describe('add', () => {
  it('adds an entry and records the package dependency', async () => {
    const root = app({ installed: [HEALTH], inventory: [] });

    const { code, envelope } = await run(['add', '@appspine/health-check'], root);

    expect(code).toBe(ExitCode.OK);
    expect(envelope.data.added).toBe(true);
    expect(inventoryOf(root).plugins).toEqual([
      { plugin: '@appspine/health-check', instanceId: 'default', enabled: true, required: true },
    ]);
    const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(packageJson.dependencies['@appspine/health-check']).toBe('^1.2.3');
  });

  it('never runs the package manager, and says so', async () => {
    // Installing reaches the network and mutates node_modules. A CLI that does that as a side
    // effect of editing a config file is one nobody can run in CI.
    const root = app({ installed: [HEALTH], inventory: [] });
    const { envelope } = await run(['add', '@appspine/health-check'], root);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain('install-required');
  });

  it('refuses a package it cannot read a manifest for', async () => {
    const root = app({ inventory: [] });
    const { code, envelope } = await run(['add', '@appspine/health-check'], root);
    expect(code).toBe(ExitCode.NOT_FOUND);
    // The message lists where it looked, so a typo is distinguishable from a missing install.
    expect(JSON.stringify(envelope.diagnostics)).toContain('node_modules');
  });

  it('is idempotent by refusal, not by silent no-op', async () => {
    const root = app({ installed: [HEALTH], inventory: [entry('health-check')] });

    const { code, envelope } = await run(['add', '@appspine/health-check'], root);

    expect(code).toBe(ExitCode.CONFLICT);
    expect(envelope.data.added).toBe(false);
    expect(inventoryOf(root).plugins).toHaveLength(1);
  });

  it('refuses when the resulting inventory would not resolve', async () => {
    // oidc-auth needs appspine.audit-sink and nothing provides it.
    const root = app({ installed: [NEEDS_AUDIT], inventory: [] });

    const { code, envelope } = await run(['add', '@appspine/oidc-auth'], root);

    expect(code).toBe(ExitCode.RESOLUTION_FAILED);
    expect(JSON.stringify(envelope.diagnostics)).toContain('appspine.audit-sink');
    // Nothing was written: the inventory is still the empty one it started as.
    expect(inventoryOf(root).plugins).toEqual([]);
  });

  it('refuses --optional for a plugin with no failure policy', async () => {
    const root = app({ installed: [HEALTH], inventory: [] });
    const { code, envelope } = await run(['add', '@appspine/health-check', '--optional'], root);
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'optional-without-policy',
    );
  });

  it('carries the manifest configRef into the entry and points at the stub command', async () => {
    const root = app({ installed: [AUDIT, NEEDS_AUDIT], inventory: [entry('audit-log')] });

    const { code, envelope } = await run(['add', '@appspine/oidc-auth'], root);

    expect(code).toBe(ExitCode.OK);
    expect(inventoryOf(root).plugins.find((e) => e.plugin.endsWith('oidc-auth'))?.configRef).toBe(
      'oidc',
    );
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'config-stub-pending',
    );
  });

  it('--dry-run writes nothing and shows the diff it would apply', async () => {
    const root = app({ installed: [HEALTH], inventory: [] });

    const { code, envelope } = await run(['add', '@appspine/health-check', '--dry-run'], root);

    expect(code).toBe(ExitCode.OK);
    expect(envelope.data.dryRun).toBe(true);
    expect(envelope.data.diff).toContain('+++ b/appspine.plugins.json');
    expect(envelope.data.diff).toContain('health-check');
    expect(inventoryOf(root).plugins).toEqual([]);
  });

  it('preserves an existing entry byte-for-byte when adding another', async () => {
    const root = app({
      installed: [HEALTH, AUDIT],
      inventory: [entry('audit-log', { configRef: undefined })],
    });
    const before = readFileSync(path.join(root, INVENTORY_FILENAME), 'utf8');

    await run(['add', '@appspine/health-check'], root);

    const after = readFileSync(path.join(root, INVENTORY_FILENAME), 'utf8');
    for (const line of before.split('\n').filter((l) => l.includes('audit-log'))) {
      expect(after).toContain(line);
    }
  });
});

describe('remove', () => {
  it('removes an entry and leaves package.json alone', async () => {
    const root = app({
      installed: [HEALTH],
      inventory: [entry('health-check')],
      packageJson: { name: 'demo-app', dependencies: { '@appspine/health-check': '^1.2.3' } },
    });

    const { code } = await run(['remove', 'health-check'], root);

    expect(code).toBe(ExitCode.OK);
    expect(inventoryOf(root).plugins).toEqual([]);
    // Uninstalling is a separate decision — the package may still be a transitive dependency.
    const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(packageJson.dependencies['@appspine/health-check']).toBe('^1.2.3');
  });

  it('refuses to remove a plugin another enabled plugin depends on', async () => {
    const root = app({
      installed: [AUDIT, NEEDS_AUDIT],
      inventory: [entry('audit-log'), entry('oidc-auth', { configRef: 'oidc' })],
    });

    const { code, envelope } = await run(['remove', 'audit-log'], root);

    expect(code).toBe(ExitCode.CONFLICT);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'removal-breaks-inventory',
    );
    expect(inventoryOf(root).plugins).toHaveLength(2);
  });

  it('says the data is not deleted', async () => {
    const root = app({ installed: [HEALTH], inventory: [entry('health-check')] });
    const { envelope } = await run(['remove', 'health-check'], root);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain('data-retained');
  });

  it('reports NOT_FOUND for an instance that is not there', async () => {
    const root = app({ installed: [HEALTH], inventory: [entry('health-check')] });
    const { code } = await run(['remove', 'health-check', '--instance-id', 'other'], root);
    expect(code).toBe(ExitCode.NOT_FOUND);
  });

  it('--dry-run writes nothing', async () => {
    const root = app({ installed: [HEALTH], inventory: [entry('health-check')] });
    const { code } = await run(['remove', 'health-check', '--dry-run'], root);
    expect(code).toBe(ExitCode.OK);
    expect(inventoryOf(root).plugins).toHaveLength(1);
  });
});

describe('list', () => {
  it('shows resolution status per entry and still exits OK', async () => {
    const root = app({
      installed: [AUDIT, NEEDS_AUDIT],
      inventory: [entry('audit-log'), entry('oidc-auth', { configRef: 'oidc' })],
    });

    const { code, envelope } = await run(['list'], root);

    expect(code).toBe(ExitCode.OK);
    expect(envelope.data.entries.map((e: { status: string }) => e.status)).toEqual([
      'resolved',
      'resolved',
    ]);
    expect(envelope.data.order).toEqual(['audit-log', 'oidc-auth']);
    expect(envelope.data.resolutionDigest).toMatch(/^sha256:/);
  });

  it('still lists when the inventory does not resolve', async () => {
    // Someone reaching for `list` is usually trying to find out why something is broken. Refusing
    // to show them the state at that exact moment is useless.
    const root = app({
      installed: [NEEDS_AUDIT],
      inventory: [entry('oidc-auth', { configRef: 'oidc' })],
    });

    const { code, envelope } = await run(['list'], root);

    expect(code).toBe(ExitCode.RESOLUTION_FAILED);
    expect(envelope.data.entries).toHaveLength(1);
  });

  it('marks an entry whose package is not installed', async () => {
    const root = app({ inventory: [entry('health-check')] });
    const { envelope } = await run(['list'], root);
    expect(envelope.data.entries[0].status).toBe('manifest-missing');
  });
});

describe('validate', () => {
  it('passes on a resolvable inventory', async () => {
    const root = app({ installed: [AUDIT], inventory: [entry('audit-log')] });
    const { code, envelope } = await run(['validate'], root);
    expect(code).toBe(ExitCode.OK);
    expect(envelope.data.order).toEqual(['audit-log']);
  });

  it('separates "an input is malformed" from "they do not compose"', async () => {
    // The two need different responses: edit a file, versus change what is installed or enabled.
    const missing = app({ inventory: [entry('health-check')] });
    await expect(run(['validate'], missing)).resolves.toMatchObject({
      code: ExitCode.VALIDATION_FAILED,
    });

    const unresolvable = app({
      installed: [NEEDS_AUDIT],
      inventory: [entry('oidc-auth', { configRef: 'oidc' })],
    });
    await expect(run(['validate'], unresolvable)).resolves.toMatchObject({
      code: ExitCode.RESOLUTION_FAILED,
    });
  });

  it('catches a configRef that disagrees with the manifest', async () => {
    const root = app({
      installed: [AUDIT, NEEDS_AUDIT],
      inventory: [entry('audit-log'), entry('oidc-auth', { configRef: 'auth' })],
    });
    const { code, envelope } = await run(['validate'], root);
    expect(code).toBe(ExitCode.RESOLUTION_FAILED);
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'config-ref-mismatch',
    );
  });
});

describe('config-stub', () => {
  it('prints a block and never touches appspine.config.ts', async () => {
    const root = app({ installed: [NEEDS_AUDIT], inventory: [] });
    writeFileSync(path.join(root, 'appspine.config.ts'), 'export default { untouched: true };\n');

    const { code, out } = await run(['config-stub', 'oidc-auth'], root);

    expect(code).toBe(ExitCode.OK);
    expect(out.join('\n')).toContain('oidc: {');
    expect(out.join('\n')).toContain('TODO');
    expect(readFileSync(path.join(root, 'appspine.config.ts'), 'utf8')).toBe(
      'export default { untouched: true };\n',
    );
  });
});

describe('no arbitrary rewriting or execution', () => {
  it('leaves every non-declarative file untouched across a full add/remove cycle', async () => {
    const root = app({ installed: [HEALTH], inventory: [] });
    writeFileSync(path.join(root, 'appspine.config.ts'), 'export const config = 1;\n');
    writeFileSync(path.join(root, 'tsconfig.json'), '{"compilerOptions":{}}\n');
    const snapshot = new Map(
      readdirSync(root)
        .filter((name) => name !== 'node_modules')
        .map((name) => [name, readFileSync(path.join(root, name), 'utf8')]),
    );

    await run(['add', '@appspine/health-check'], root);
    await run(['remove', 'health-check'], root);

    // package.json legitimately changed (the dependency); everything else must be identical.
    for (const [name, before] of snapshot) {
      if (name === 'package.json') continue;
      expect(readFileSync(path.join(root, name), 'utf8'), `${name} was rewritten`).toBe(before);
    }
  });

  it('never loads the plugin package, even though every one of them throws on load', async () => {
    const root = app({ installed: [HEALTH, AUDIT], inventory: [] });
    await expect(run(['add', '@appspine/health-check'], root)).resolves.toMatchObject({
      code: ExitCode.OK,
    });
    await expect(run(['list'], root)).resolves.toMatchObject({ code: ExitCode.OK });
    await expect(run(['validate'], root)).resolves.toMatchObject({ code: ExitCode.OK });
  });
});

describe('diff rendering', () => {
  it('renders a unified diff with context', () => {
    const diff = renderDiff({
      file: 'appspine.plugins.json',
      before: ['a', 'b', 'c'].join('\n'),
      after: ['a', 'b', 'x', 'c'].join('\n'),
    });
    expect(diff.split('\n')).toEqual([
      '--- a/appspine.plugins.json',
      '+++ b/appspine.plugins.json',
      ' a',
      ' b',
      '+x',
      ' c',
    ]);
  });

  it('returns nothing when the file did not change', () => {
    expect(renderDiff({ file: 'x', before: 'same', after: 'same' })).toBe('');
  });
});
