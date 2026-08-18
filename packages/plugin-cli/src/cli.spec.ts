import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PluginManifestV1 } from '@appspine/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import { type CommandDefinition, parseArgs, runCli, usage } from './cli';
import { checkConfigBoundary, configStub, environmentRequirements } from './config-boundary';
import { CLI_RESULT_SCHEMA_VERSION, toJsonEnvelope } from './diagnostics';
import { ExitCode, exitCodeName } from './exit-codes';
import {
  emptyInventory,
  INVENTORY_FILENAME,
  type InventoryFile,
  parseInventory,
  readInventory,
  serializeInventory,
  toResolverInventory,
  writeInventory,
} from './inventory-file';

const created: string[] = [];

function appRoot(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'appspine-cli-'));
  created.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), contents, 'utf8');
  }
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop() as string, { recursive: true, force: true });
  }
});

function captured() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: (l: string) => out.push(l),
      stderr: (l: string) => err.push(l),
      cwd: () => '/nowhere',
    },
  };
}

const HEALTH_CHECK: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'health-check',
  displayName: 'Health Check',
  cardinality: 'singleton',
  distribution: 'official',
  engine: { appspinePluginApi: '^1.0.0', node: '>=22.0.0', frameworks: {} },
  provides: ['appspine.health-indicator'],
  requires: ['appspine.prisma'],
  facets: { backend: { modulePath: './dist/health.module.js', exportName: 'HealthModule' } },
};

const OIDC_AUTH: PluginManifestV1 = {
  ...HEALTH_CHECK,
  id: 'oidc-auth',
  displayName: 'OIDC Authentication',
  provides: ['appspine.interactive-auth-provider'],
  requires: ['appspine.identity-store'],
  configSchema: { configRef: 'oidc' },
  environment: [
    { key: 'OIDC_ISSUER', required: true, secret: false },
    { key: 'OIDC_CLIENT_SECRET', required: true, secret: true, description: 'from the IdP' },
  ],
};

function entry(overrides: Partial<InventoryFile['plugins'][number]> = {}) {
  return {
    plugin: '@appspine/health-check',
    instanceId: 'default',
    enabled: true,
    required: true,
    ...overrides,
  };
}

describe('inventory file schema', () => {
  it('accepts a minimal valid inventory', () => {
    const result = parseInventory({ schemaVersion: 'appspine.plugins/v1', plugins: [entry()] });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown top-level field instead of ignoring it', () => {
    // A typo in a committed config file that the tool silently drops is worse than a hard error:
    // the reviewer sees the intent in the diff and the runtime never honours it.
    const result = parseInventory({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [],
      pluginVersions: { 'health-check': '1.0.0' },
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('inventory-schema-violation');
  });

  it('rejects a wrong schema version', () => {
    const result = parseInventory({ schemaVersion: 'appspine.plugins/v2', plugins: [] });
    expect(result.ok).toBe(false);
  });

  it('reports every problem in one pass, not one per run', () => {
    const result = parseInventory({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [entry({ instanceId: 'NOT_KEBAB' }), entry({ enabled: 'yes' as never })],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(1);
  });

  it('catches two entries that collapse to the same instance key', () => {
    const result = parseInventory({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [entry(), entry({ plugin: 'health-check' })],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('duplicate-instance');
  });

  it('flags a disabled entry marked optional as pointless, without failing', () => {
    const result = parseInventory({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [entry({ enabled: false, required: false })],
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toContain('disabled-optional-entry');
  });

  it('refuses presets rather than silently ignoring them', () => {
    // Dropping them would let `validate` pass on an inventory that does not describe what the App
    // runs — the worst thing this tool could do.
    const result = parseInventory({
      schemaVersion: 'appspine.plugins/v1',
      presets: ['@appspine/preset-standard'],
      plugins: [],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('presets-not-supported');

    expect(() =>
      toResolverInventory({
        schemaVersion: 'appspine.plugins/v1',
        presets: ['@appspine/preset-standard'],
        plugins: [],
      }),
    ).toThrow(/cannot be expanded yet/);
  });
});

describe('reading and writing', () => {
  it('reports a missing file as a diagnostic, not an exception', () => {
    const result = readInventory(appRoot());
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('inventory-not-found');
  });

  it('never echoes file contents when the JSON is malformed', () => {
    const root = appRoot({ [INVENTORY_FILENAME]: '{ "secret": "hunter2xyz", oops }' });
    const result = readInventory(root);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.diagnostics)).not.toContain('hunter2xyz');
  });

  it('writes canonically: sorted, stable key order, LF, trailing newline', () => {
    const serialized = serializeInventory({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [
        entry({ plugin: '@appspine/oidc-auth', instanceId: 'default', configRef: 'oidc' }),
        entry({ plugin: '@appspine/audit-log' }),
      ],
    });

    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized).not.toContain('\r');
    expect(serialized.indexOf('audit-log')).toBeLessThan(serialized.indexOf('oidc-auth'));
    const first = JSON.parse(serialized).plugins[0];
    expect(Object.keys(first)).toEqual(['plugin', 'instanceId', 'enabled', 'required']);
  });

  it('round-trips: writing what was read changes nothing', () => {
    // Two developers running `plugin add` must produce the same bytes, and adding one plugin must
    // show as one added block rather than a reshuffle of the whole file.
    const canonical = serializeInventory({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [entry({ plugin: '@appspine/audit-log' }), entry()],
    });
    const root = appRoot({ [INVENTORY_FILENAME]: canonical });
    const read = readInventory(root);
    if (!read.ok) throw new Error('expected a valid inventory');
    expect(serializeInventory(read.inventory)).toBe(canonical);
  });

  it('touches nothing but the inventory file', () => {
    // 051 decision 10: the CLI's write surface is exactly one file. A test that lists the
    // directory before and after is the only way to keep that true as commands are added.
    const root = appRoot({
      'appspine.config.ts': 'export default {};\n',
      'package.json': '{"name":"app"}\n',
    });
    const before = new Map(
      readdirSync(root).map((name) => [name, statSync(path.join(root, name)).mtimeMs]),
    );

    writeInventory(root, { schemaVersion: 'appspine.plugins/v1', plugins: [entry()] });

    const after = readdirSync(root);
    expect(after.filter((name) => !before.has(name))).toEqual([INVENTORY_FILENAME]);
    expect(readFileSync(path.join(root, 'appspine.config.ts'), 'utf8')).toBe(
      'export default {};\n',
    );
    expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe('{"name":"app"}\n');
  });

  it('starts from an empty inventory when asked to', () => {
    const result = readInventory(appRoot(), { createIfMissing: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.inventory).toEqual(emptyInventory());
  });
});

describe('never executes plugin code', () => {
  it('reads an inventory sitting next to a module that throws on load', () => {
    // 051 plan section 9: manifest parsing must not execute package code, and the CLI must not
    // execute an unvalidated plugin runtime at all. The strongest way to assert that is to leave a
    // landmine in the directory and check nothing steps on it.
    const root = appRoot({
      [INVENTORY_FILENAME]: serializeInventory({
        schemaVersion: 'appspine.plugins/v1',
        plugins: [entry()],
      }),
      'plugin.js': "throw new Error('the CLI executed plugin code');",
      'appspine.config.ts': "throw new Error('the CLI evaluated the App config');",
    });

    const result = readInventory(root);

    expect(result.ok).toBe(true);
  });

  it('has no dynamic import or require of a plugin package in its own source', () => {
    // A landmine only proves the paths a test happens to walk. This proves the capability is
    // absent from the shipped source: nothing here can load a package by name at runtime.
    const sourceDir = path.join(process.cwd(), 'src');
    const files = readdirSync(sourceDir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts'))
      .map((e) => path.join(e.parentPath ?? sourceDir, e.name));
    expect(files.length).toBeGreaterThan(3);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not dynamically import`).not.toMatch(/\bimport\s*\(/);
      expect(source, `${file} must not use require()`).not.toMatch(/\brequire\s*\(/);
      expect(source, `${file} must not spawn a process`).not.toMatch(
        /child_process|execSync|spawnSync/,
      );
    }
  });
});

describe('config and secret boundary', () => {
  const manifests = new Map([
    ['health-check', HEALTH_CHECK],
    ['oidc-auth', OIDC_AUTH],
  ]);

  it('accepts a configRef that matches the manifest', () => {
    const diagnostics = checkConfigBoundary(
      {
        schemaVersion: 'appspine.plugins/v1',
        plugins: [entry({ plugin: '@appspine/oidc-auth', configRef: 'oidc' })],
      },
      { manifests },
    );
    expect(diagnostics).toEqual([]);
  });

  it.each([
    ['a bearer token', 'ghp_0123456789abcdefghijklmnopqrstuvwxyz'],
    ['a URL with credentials', 'postgres://user:pw@localhost:5432/db'],
    ['base64', 'aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYSBwYXRoIGF0IGFsbA=='],
    ['hex', '0123456789abcdef0123456789abcdef'],
    ['a PEM header', '-----BEGIN PRIVATE KEY-----'],
  ])('rejects %s pasted into configRef', (_label, value) => {
    const diagnostics = checkConfigBoundary({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [entry({ configRef: value })],
    });
    expect(diagnostics.map((d) => d.code)).toContain('secret-value-in-inventory');
  });

  it('never repeats the offending value back', () => {
    // If this rule fired because a real secret was pasted, echoing it would put the credential
    // into the CI log the check exists to keep it out of.
    const diagnostics = checkConfigBoundary({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [entry({ configRef: 'ghp_0123456789abcdefghijklmnopqrstuvwxyz' })],
    });
    expect(JSON.stringify(diagnostics)).not.toContain('ghp_0123456789');
  });

  it('rejects a configRef whose path segment names a secret', () => {
    const diagnostics = checkConfigBoundary({
      schemaVersion: 'appspine.plugins/v1',
      plugins: [entry({ configRef: 'oidc.clientSecret' })],
    });
    expect(diagnostics.map((d) => d.code)).toContain('secret-looking-config-ref');
  });

  it('rejects a configRef the manifest does not declare', () => {
    const diagnostics = checkConfigBoundary(
      {
        schemaVersion: 'appspine.plugins/v1',
        plugins: [entry({ configRef: 'health' })],
      },
      { manifests },
    );
    expect(diagnostics.map((d) => d.code)).toContain('config-ref-not-declared');
  });

  it('rejects a configRef that disagrees with the manifest', () => {
    const diagnostics = checkConfigBoundary(
      {
        schemaVersion: 'appspine.plugins/v1',
        plugins: [entry({ plugin: '@appspine/oidc-auth', configRef: 'auth' })],
      },
      { manifests },
    );
    expect(diagnostics.map((d) => d.code)).toContain('config-ref-mismatch');
  });

  it('lists declared env keys without reading a single value', () => {
    const before = { ...process.env };
    process.env.OIDC_CLIENT_SECRET = 'do-not-read-me';

    const requirements = environmentRequirements([OIDC_AUTH]);

    expect(requirements).toEqual([
      {
        pluginId: 'oidc-auth',
        key: 'OIDC_CLIENT_SECRET',
        required: true,
        secret: true,
        description: 'from the IdP',
      },
      { pluginId: 'oidc-auth', key: 'OIDC_ISSUER', required: true, secret: false },
    ]);
    expect(JSON.stringify(requirements)).not.toContain('do-not-read-me');

    process.env = before;
  });
});

describe('config stub generation', () => {
  it('emits text to review rather than rewriting TypeScript', () => {
    const stub = configStub(OIDC_AUTH);
    expect(stub).toContain('oidc: {');
    expect(stub).toContain('TODO');
    // Env keys are named, never valued.
    expect(stub).toContain('OIDC_CLIENT_SECRET — required, secret');
    expect(stub).toContain('OIDC_ISSUER — required, public');
  });

  it('says so plainly when a plugin takes no config', () => {
    expect(configStub(HEALTH_CHECK)).toContain('No configSchema');
  });

  it('nests a dotted configRef', () => {
    const stub = configStub({ ...OIDC_AUTH, configSchema: { configRef: 'masterData.hr' } });
    expect(stub).toContain('masterData: {');
    expect(stub).toContain('  hr: {');
  });
});

describe('argument parsing', () => {
  it('separates command, positionals and flags', () => {
    const args = parseArgs(['add', '@appspine/health-check', '--json', '--cwd', '/app']);
    expect(args.command).toBe('add');
    expect(args.positionals).toEqual(['@appspine/health-check']);
    expect(args.flags.get('json')).toBe(true);
    expect(args.flags.get('cwd')).toBe('/app');
  });

  it('supports --flag=value and --no-flag', () => {
    const args = parseArgs(['list', '--cwd=/app', '--no-json']);
    expect(args.flags.get('cwd')).toBe('/app');
    expect(args.flags.get('json')).toBe(false);
  });

  it('does not swallow the next token for a boolean flag', () => {
    const args = parseArgs(['remove', '--json', 'health-check']);
    expect(args.flags.get('json')).toBe(true);
    expect(args.positionals).toEqual(['health-check']);
  });

  it('stops interpreting flags after --', () => {
    const args = parseArgs(['add', '--', '--not-a-flag']);
    expect(args.positionals).toEqual(['--not-a-flag']);
    expect(args.flags.has('not-a-flag')).toBe(false);
  });
});

describe('exit codes', () => {
  it('pins the published numbers', () => {
    // These are a contract: a CI job or deploy script branches on them. Changing what a number
    // means is a breaking change, so the numbers are asserted literally rather than derived.
    expect(ExitCode).toEqual({
      OK: 0,
      INTERNAL_ERROR: 1,
      USAGE: 2,
      VALIDATION_FAILED: 3,
      RESOLUTION_FAILED: 4,
      DRIFT_DETECTED: 5,
      NOT_FOUND: 6,
      CONFLICT: 7,
    });
    expect(exitCodeName(4)).toBe('RESOLUTION_FAILED');
    expect(exitCodeName(99)).toBe('UNKNOWN');
  });
});

describe('runCli', () => {
  const ok: CommandDefinition = {
    name: 'demo',
    summary: 'a command that succeeds',
    usage: 'appspine demo',
    handler: () => ({ command: 'demo', exitCode: ExitCode.OK, diagnostics: [], data: { n: 1 } }),
  };
  const fails: CommandDefinition = {
    name: 'boom',
    summary: 'a command that throws',
    usage: 'appspine boom',
    handler: () => {
      throw new Error('kaboom');
    },
  };

  it('exits USAGE with no command', async () => {
    const { io, out } = captured();
    await expect(runCli([], { io, commands: [ok] })).resolves.toBe(ExitCode.USAGE);
    expect(out.join('\n')).toContain('Usage: appspine');
  });

  it('exits OK for --help', async () => {
    const { io } = captured();
    await expect(runCli(['--help'], { io, commands: [ok] })).resolves.toBe(ExitCode.OK);
  });

  it('exits USAGE for an unknown command', async () => {
    const { io } = captured();
    await expect(runCli(['nope'], { io, commands: [ok] })).resolves.toBe(ExitCode.USAGE);
  });

  it('exits USAGE for an unknown flag rather than ignoring it', async () => {
    const { io } = captured();
    await expect(runCli(['demo', '--frce'], { io, commands: [ok] })).resolves.toBe(ExitCode.USAGE);
  });

  it('turns an unexpected throw into INTERNAL_ERROR, not a stack trace on stdout', async () => {
    const { io, out } = captured();
    await expect(runCli(['boom'], { io, commands: [fails] })).resolves.toBe(
      ExitCode.INTERNAL_ERROR,
    );
    expect(out.join('\n')).not.toContain('kaboom');
  });

  it('emits one JSON document under --json, matching what the text rendering said', async () => {
    const { io, out } = captured();
    await runCli(['demo', '--json'], { io, commands: [ok] });
    const parsed = JSON.parse(out.join('\n'));
    expect(parsed).toEqual({
      schemaVersion: CLI_RESULT_SCHEMA_VERSION,
      ok: true,
      command: 'demo',
      exitCode: 0,
      exitCodeName: 'OK',
      diagnostics: [],
      data: { n: 1 },
    });
  });

  it('renders the same object for humans and machines', () => {
    const result = {
      command: 'demo',
      exitCode: ExitCode.VALIDATION_FAILED,
      diagnostics: [
        { code: 'config-ref-mismatch', severity: 'error' as const, message: 'nope', path: 'a.b' },
      ],
    };
    expect(toJsonEnvelope(result).diagnostics).toBe(result.diagnostics);
  });

  it('lists registered commands in the usage text', () => {
    expect(usage([ok])).toContain('demo');
    expect(usage([])).toContain('(none registered)');
  });
});
