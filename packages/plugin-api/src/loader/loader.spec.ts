import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginManifestV1 } from '../manifest';
import { readFixture, readFixtureIndex } from '../test-support';
import { PLUGIN_API_VERSION } from '../version';
import { canonicalize, canonicalJsonString } from './canonicalize';
import { manifestDigest, resolvedManifestDigest } from './digest';
import { validateEngine } from './engine';
import {
  defaultHostEngine,
  loadPluginManifest,
  parsePluginManifest,
  unwrapManifest,
} from './index';
import { validateManifestSemantics, validateManifestStructure } from './validate';

const index = readFixtureIndex();

const host = defaultHostEngine({ appspinePluginApi: PLUGIN_API_VERSION, node: '22.14.0' });

function parse(file: string, overrides: Record<string, unknown> = {}) {
  return parsePluginManifest(readFixture(file), {
    packageName: '@appspine/fixture',
    packageVersion: '1.2.3',
    host,
    ...overrides,
  });
}

describe('PL0-05 fixture corpus', () => {
  it.each(index.positive.map((entry) => entry.file))('accepts %s', (file) => {
    const result = parse(file);
    if (!result.ok) {
      throw new Error(`expected ${file} to validate, got ${JSON.stringify(result.diagnostics)}`);
    }
    // Warnings are allowed (an app-local fixture legitimately uses unregistered capability names);
    // errors are not, and `ok: true` already guarantees that.
    expect(result.value.manifest.schemaVersion).toBe('appspine.plugin/v1');
  });

  it.each(
    index.negative.map((entry) => [entry.file, entry.expectedFailure] as const),
  )('rejects %s with %s', (file, expectedFailure) => {
    const result = parse(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((d) => d.code)).toContain(expectedFailure);
  });
});

describe('structural validation', () => {
  it('reports every violation at once rather than stopping at the first', () => {
    const diagnostics = validateManifestStructure({
      schemaVersion: 'appspine.plugin/v2',
      id: 'Bad Id',
      displayName: '',
      cardinality: 'many',
      engine: { appspinePluginApi: 'latest', node: '>=22.0.0' },
      provides: [],
      requires: [],
      facets: {},
      surprise: true,
    });

    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain('invalid-schema-version');
    expect(codes).toContain('invalid-format');
    expect(codes).toContain('empty-value');
    expect(codes).toContain('invalid-enum-value');
    expect(codes).toContain('invalid-engine-range');
    expect(codes).toContain('empty-facets');
    expect(codes).toContain('unknown-field');
  });

  it('rejects a manifest that restates the package version', () => {
    const manifest = readFixture('positive/health-check-minimal.json') as Record<string, unknown>;
    const diagnostics = validateManifestStructure({ ...manifest, version: '1.0.0' });
    expect(diagnostics.map((d) => d.code)).toContain('unknown-field');
  });
});

describe('semantic validation', () => {
  const base = readFixture('positive/health-check-minimal.json') as PluginManifestV1;

  it('flags a plugin that provides a host-owned capability', () => {
    const diagnostics = validateManifestSemantics({
      ...base,
      provides: ['appspine.principal-context'],
    });
    expect(diagnostics.map((d) => d.code)).toContain('host-owned-capability-provided');
  });

  it('flags a plugin that both provides and requires the same capability', () => {
    const diagnostics = validateManifestSemantics({
      ...base,
      provides: ['appspine.audit-sink'],
      requires: ['appspine.audit-sink'],
    });
    expect(diagnostics.map((d) => d.code)).toContain('requires-own-capability');
  });

  it('flags a worker name outside the plugin namespace', () => {
    const diagnostics = validateManifestSemantics({
      ...base,
      facets: {
        ...base.facets,
        backend: {
          modulePath: './dist/health.module.js',
          exportName: 'HealthModule',
          workers: ['appspine.notification.digest-sender'],
        },
      },
    });
    expect(diagnostics.map((d) => d.code)).toContain('worker-namespace-mismatch');
  });

  it('flags a health indicator or metrics prefix from another plugin namespace', () => {
    const diagnostics = validateManifestSemantics({
      ...base,
      facets: {
        ...base.facets,
        operations: { healthIndicatorId: 'rbac', metricsPrefix: 'rbac' },
      },
    });
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain('health-indicator-namespace-mismatch');
    expect(codes).toContain('metrics-prefix-mismatch');
  });

  it('warns about an unregistered capability by default and errors under strict mode', () => {
    const manifest = { ...base, provides: ['appspine.not-registered'] };
    expect(validateManifestSemantics(manifest)[0]).toMatchObject({
      code: 'unregistered-capability',
      severity: 'warning',
    });
    expect(
      validateManifestSemantics(manifest, { strictCapabilityRegistry: true })[0],
    ).toMatchObject({ code: 'unregistered-capability', severity: 'error' });
  });

  it('flags a plugin replacing its own contribution', () => {
    const diagnostics = validateManifestSemantics({
      ...base,
      distribution: 'app-local',
      replaces: [
        { plugin: base.id, facet: 'backend', contribution: 'HealthModule', reason: 'nope' },
      ],
    });
    expect(diagnostics.map((d) => d.code)).toContain('replaces-self');
  });
});

describe('engine validation', () => {
  const engine = { appspinePluginApi: '^1.0.0', node: '>=22.0.0' };

  it('accepts a host inside the declared ranges', () => {
    expect(validateEngine(engine, { appspinePluginApi: '1.4.0', node: '22.14.0' })).toEqual([]);
  });

  it('separates "unsatisfied by this host" from "not a range at all"', () => {
    expect(
      validateEngine({ ...engine, appspinePluginApi: '^2.0.0' }, { appspinePluginApi: '1.0.0' })[0],
    ).toMatchObject({ code: 'engine-range-unsatisfied' });

    expect(
      validateEngine({ ...engine, appspinePluginApi: 'latest' }, { appspinePluginApi: '1.0.0' })[0],
    ).toMatchObject({ code: 'invalid-engine-range' });
  });

  it('rejects a Node version below the declared floor', () => {
    expect(
      validateEngine(engine, { appspinePluginApi: '1.0.0', node: '20.11.0' })[0],
    ).toMatchObject({ code: 'engine-range-unsatisfied', path: 'engine.node' });
  });

  it('intersects framework ranges when the host declares a range rather than a version', () => {
    const withFramework = { ...engine, frameworks: { '@nestjs/common': '^11.0.5' } };

    expect(
      validateEngine(withFramework, {
        appspinePluginApi: '1.0.0',
        node: '22.14.0',
        frameworks: { '@nestjs/common': '^11.1.0' },
      }),
    ).toEqual([]);

    expect(
      validateEngine(withFramework, {
        appspinePluginApi: '1.0.0',
        node: '22.14.0',
        frameworks: { '@nestjs/common': '^10.0.0' },
      })[0],
    ).toMatchObject({ code: 'engine-range-no-intersection' });
  });

  it('warns rather than fails when the host declares no version for a framework', () => {
    expect(
      validateEngine(
        { ...engine, frameworks: { react: '^19.0.0' } },
        { appspinePluginApi: '1.0.0', node: '22.14.0' },
      )[0],
    ).toMatchObject({ code: 'framework-not-declared-by-host', severity: 'warning' });
  });
});

describe('canonicalization and digests', () => {
  const manifest = readFixture('positive/audit-log-with-prisma.json');

  it('sorts object keys but preserves array order', () => {
    expect(canonicalJsonString({ b: 1, a: [3, 1, 2] })).toBe('{"a":[3,1,2],"b":1}');
  });

  it('produces the same digest for reordered keys', () => {
    const reordered = JSON.parse(JSON.stringify(manifest));
    const shuffled = Object.fromEntries(Object.entries(reordered).reverse());
    expect(manifestDigest(shuffled)).toBe(manifestDigest(manifest));
  });

  it('changes the resolved digest when only the package version changes', () => {
    const one = resolvedManifestDigest({
      manifest,
      packageName: '@appspine/audit-log',
      packageVersion: '1.0.1',
    });
    const two = resolvedManifestDigest({
      manifest,
      packageName: '@appspine/audit-log',
      packageVersion: '1.0.2',
    });
    expect(one).not.toBe(two);
    expect(one.startsWith('sha256:')).toBe(true);
  });

  it('refuses to canonicalize values that would serialize ambiguously', () => {
    expect(() => canonicalize({ a: undefined })).toThrow(/undefined/);
    expect(() => canonicalize({ a: Number.NaN })).toThrow(/non-finite/);
  });

  it('detects a tampered manifest through the expected digest', () => {
    const good = parse('positive/audit-log-with-prisma.json');
    expect(good.ok).toBe(true);
    if (!good.ok) return;

    const tampered = parsePluginManifest(
      { ...(manifest as object), displayName: 'Audit Log (tampered)' },
      {
        packageName: '@appspine/fixture',
        packageVersion: '1.2.3',
        host,
        expectedDigest: good.value.digest,
      },
    );
    expect(tampered.ok).toBe(false);
    if (tampered.ok) return;
    expect(tampered.diagnostics.map((d) => d.code)).toContain('manifest-digest-mismatch');
  });
});

describe('loadPluginManifest', () => {
  function withTempPackage(files: Record<string, string>, run: (dir: string) => void): void {
    const dir = mkdtempSync(path.join(tmpdir(), 'appspine-plugin-api-'));
    try {
      for (const [name, contents] of Object.entries(files)) {
        writeFileSync(path.join(dir, name), contents);
      }
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const validManifest = JSON.stringify(readFixture('positive/health-check-minimal.json'));

  it('merges name and version from package.json', () => {
    withTempPackage(
      {
        'package.json': JSON.stringify({ name: '@appspine/health-check', version: '0.1.9' }),
        'appspine.plugin.json': validManifest,
      },
      (dir) => {
        const loaded = unwrapManifest(loadPluginManifest(dir, { host }));
        expect(loaded.packageName).toBe('@appspine/health-check');
        expect(loaded.packageVersion).toBe('0.1.9');
        expect(loaded.source.endsWith('appspine.plugin.json')).toBe(true);
      },
    );
  });

  it('reports a missing manifest without throwing', () => {
    withTempPackage(
      { 'package.json': JSON.stringify({ name: '@appspine/x', version: '1.0.0' }) },
      (dir) => {
        const result = loadPluginManifest(dir, { host });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.diagnostics[0].code).toBe('manifest-not-readable');
      },
    );
  });

  it('does not echo file contents when the manifest is malformed', () => {
    withTempPackage(
      {
        'package.json': JSON.stringify({ name: '@appspine/x', version: '1.0.0' }),
        'appspine.plugin.json': '{ "secret": "hunter2", ',
      },
      (dir) => {
        const result = loadPluginManifest(dir, { host });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.diagnostics[0].code).toBe('manifest-not-json');
        expect(JSON.stringify(result.diagnostics)).not.toContain('hunter2');
      },
    );
  });

  it('never imports the module the backend facet points at', () => {
    withTempPackage(
      {
        'package.json': JSON.stringify({ name: '@appspine/health-check', version: '0.1.9' }),
        'appspine.plugin.json': validManifest,
        // If validation ever required the module, requiring it would blow up the process.
        'health.module.js': 'throw new Error("plugin runtime code must not be executed");',
      },
      (dir) => {
        expect(() => unwrapManifest(loadPluginManifest(dir, { host }))).not.toThrow();
      },
    );
  });

  it('rejects a package.json without a name or version', () => {
    withTempPackage(
      {
        'package.json': JSON.stringify({ name: '@appspine/x' }),
        'appspine.plugin.json': validManifest,
      },
      (dir) => {
        const result = loadPluginManifest(dir, { host });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.diagnostics[0].code).toBe('package-metadata-missing');
      },
    );
  });
});
