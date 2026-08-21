import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import {
  bootHarness,
  expectBootOutcome,
  expectCatalogStatus,
  expectResolutionError,
  inventoryEntry,
  resolveHarness,
} from '@appspine/plugin-testkit';
import { describe, expect, it } from 'vitest';
import { HealthModule } from './health.module';
import { healthCheck, healthCheckManifest, healthCheckPlugin } from './plugin';

const packageRoot = process.cwd();
const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;
const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    // The JSON is what a CLI reads without executing this package; the constant is what
    // definePlugin() type-checks. This assertion is the only thing keeping them one truth.
    expect(manifestFile).toEqual(healthCheckManifest);
  });

  it('passes the real loader against the package version', () => {
    const result = parsePluginManifest(manifestFile, {
      packageName: packageJson.name as string,
      packageVersion: packageJson.version as string,
      host: defaultHostEngine({
        frameworks: {
          '@nestjs/common': '11.1.0',
          '@nestjs/core': '11.1.0',
          '@prisma/client': '6.2.0',
        },
      }),
      strictCapabilityRegistry: true,
    });

    if (!result.ok) {
      throw new Error(`manifest rejected: ${JSON.stringify(result.diagnostics)}`);
    }
    expect(result.value.digest.startsWith('sha256:')).toBe(true);
  });

  it('declares every host-owned singleton peer it actually depends on', () => {
    const peers = packageJson.peerDependencies as Record<string, string>;
    for (const [name, range] of Object.entries(healthCheckManifest.engine.frameworks ?? {})) {
      expect(peers[name], `${name} is in the manifest but not a peer dependency`).toBe(range);
    }
  });

  it('points its backend facet at a file the package actually ships', () => {
    const files = packageJson.files as string[];
    expect(healthCheckManifest.facets.backend?.modulePath).toBe('./dist/health.module.js');
    expect(files).toContain('dist');
    expect((packageJson.exports as Record<string, unknown>)['./plugin']).toBeDefined();
  });
});

describe('plugin mode / legacy parity', () => {
  it('contributes the very same Nest module the package root exports', () => {
    const produced = healthCheckPlugin.backend?.({
      pluginId: 'health-check',
      instanceId: 'default',
      key: 'health-check',
      config: {},
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      capabilities: {
        get: () => undefined as never,
        getOptional: () => undefined,
        has: () => false,
      },
    });

    // Identity, not equivalence: legacy `imports: [HealthModule]` and plugin mode compose the same
    // class, so controller routes and responses cannot diverge between the two wirings.
    expect(produced).toBe(HealthModule);
  });

  it('exposes the descriptor through both the constant and the factory', () => {
    expect(healthCheck()).toBe(healthCheckPlugin);
    expect(healthCheckPlugin.id).toBe('health-check');
    expect(healthCheckPlugin.provides).toEqual(['appspine.health-indicator']);
  });
});

describe('inventory behaviour', () => {
  const HOST = { 'appspine.prisma': {} };

  it('boots and reports ready in the catalog', async () => {
    const { catalog } = await bootHarness({
      plugins: [{ plugin: healthCheckPlugin, packageVersion: packageJson.version as string }],
      inventory: [inventoryEntry('health-check')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, { 'health-check': 'ready' });
    expect(catalog.byKey['health-check'].healthIndicatorId).toBe('health-check');
  });

  it('is catalogued but not wired when disabled', async () => {
    const { harness, catalog } = await bootHarness({
      plugins: [{ plugin: healthCheckPlugin }],
      inventory: [inventoryEntry('health-check', { enabled: false })],
      hostCapabilities: HOST,
    });

    expect(harness.graph.order).toEqual([]);
    expect(harness.graph.disabled.map((entry) => entry.key)).toEqual(['health-check']);
    expect(catalog.entries).toEqual([]);
  });

  it('refuses to resolve without the Prisma capability it requires', () => {
    const result = resolveHarness({
      plugins: [{ plugin: healthCheckPlugin }],
      inventory: [inventoryEntry('health-check')],
      hostCapabilities: {},
    });
    expect(expectResolutionError(result, 'missing-required-capability').pluginId).toBe(
      'health-check',
    );
  });

  it('cannot be marked optional, because it declares no degraded behaviour', () => {
    const result = resolveHarness({
      plugins: [{ plugin: healthCheckPlugin }],
      inventory: [inventoryEntry('health-check', { required: false })],
      hostCapabilities: HOST,
    });
    expectResolutionError(result, 'optional-without-failure-policy');
  });
});
