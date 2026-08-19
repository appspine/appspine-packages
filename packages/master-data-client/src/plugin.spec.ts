import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CAPABILITY, capabilityInstanceToken, definePlugin } from '@appspine/plugin-api';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import {
  bootHarness,
  createLifecycleRecorder,
  createPluginHarness,
  expectBootOutcome,
  expectCatalogStatus,
  expectRedacted,
  expectResolutionError,
  expectResolutionOk,
  inventoryEntry,
  multiInstanceEntries,
  optionalInventoryEntry,
  resolveHarness,
} from '@appspine/plugin-testkit';
import { describe, expect, it, vi } from 'vitest';
import {
  MasterDataClientConfigurationError,
  masterDataClientConfigSchema,
  validateMasterDataClientConfig,
} from './config';
import {
  MASTER_DATA_CLIENT,
  MasterDataClientModule,
  MasterDataReconciliationService,
  masterDataClient,
  masterDataClientManifest,
  masterDataClientPlugin,
} from './plugin';
import type { MasterDataClientModuleOptions } from './types';

const packageRoot = process.cwd();

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = {
  'appspine.identity-delegation': {},
  'appspine.principal-context': {},
};

const HR_CONFIG: MasterDataClientModuleOptions = {
  endpoint: 'https://hr-master-data.example.com',
  apiKey: 'hr-secret-api-key',
  intervalMs: 60000,
  autoStart: false,
  entities: [],
};

const FINANCE_CONFIG: MasterDataClientModuleOptions = {
  endpoint: 'https://finance-master-data.example.com',
  apiKey: 'fin-secret-api-key',
  intervalMs: 120000,
  autoStart: false,
  entities: [],
};

describe('manifest & loader contract', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(masterDataClientManifest);
  });

  it('passes the real loader with a strict capability registry and cardinality: multiple', () => {
    const result = parsePluginManifest(manifestFile, {
      packageName: packageJson.name as string,
      packageVersion: packageJson.version as string,
      host: defaultHostEngine({
        frameworks: {
          '@nestjs/common': '11.1.0',
        },
      }),
      strictCapabilityRegistry: true,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.manifest.provides).toEqual(['appspine.master-data-client']);
    expect(result.value.manifest.requires).toEqual(['appspine.identity-delegation']);
    expect(result.value.manifest.optionalRequires).toEqual(['appspine.audit-sink']);
    expect(result.value.manifest.cardinality).toBe('multiple');
  });

  it('declares backend and operations facets correctly', () => {
    expect(masterDataClientManifest.facets?.backend).toMatchObject({
      modulePath: './dist/master-data-client.module.js',
      exportName: 'MasterDataClientModule',
    });

    expect(masterDataClientManifest.facets?.operations).toMatchObject({
      healthIndicatorId: 'master-data-client',
      metricsPrefix: 'master_data_client',
      shutdownTimeoutMs: 5000,
    });
  });

  it('declares optionalFailurePolicy with instance isolation boundary', () => {
    expect(masterDataClientManifest.optionalFailurePolicy).toEqual({
      isolationBoundary: 'instance',
      degradedBehavior: {
        readiness: 'degraded',
        catalog: 'degraded',
        alert: 'required',
      },
    });
  });

  it('declares secret redaction for sensitive environment variables', () => {
    const secretVar = masterDataClientManifest.environment?.find(
      (env) => env.key === 'MASTER_DATA_API_KEY',
    );
    expect(secretVar).toBeDefined();
    expect(secretVar?.secret).toBe(true);

    const nonSecretVar = masterDataClientManifest.environment?.find(
      (env) => env.key === 'MASTER_DATA_ENDPOINT',
    );
    expect(nonSecretVar).toBeDefined();
    expect(nonSecretVar?.secret).toBe(false);
  });
});

describe('resolution and multi-instance graph', () => {
  it('resolves multiple named instances cleanly into deterministic graph order and qualified tokens', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: masterDataClientPlugin }],
        inventory: multiInstanceEntries('master-data-client', ['hr', 'finance'], {
          configRef: 'masterData',
        }),
        hostCapabilities: HOST,
      }),
    );

    expect(graph.order).toEqual(['master-data-client#finance', 'master-data-client#hr']);
    expect(graph.providers['appspine.master-data-client#hr']).toEqual(['master-data-client#hr']);
    expect(graph.providers['appspine.master-data-client#finance']).toEqual([
      'master-data-client#finance',
    ]);
    expect(graph.providers['appspine.master-data-client']).toEqual([
      'master-data-client#finance',
      'master-data-client#hr',
    ]);
  });
});

describe('two endpoints instance isolation', () => {
  it('isolates configuration, DI tokens, and catalog status between two distinct endpoints', async () => {
    const recorder = createLifecycleRecorder();
    const { catalog } = await bootHarness({
      plugins: [
        {
          plugin: definePlugin({
            manifest: masterDataClientManifest,
            backend: masterDataClientPlugin.backend,
            configSchema: masterDataClientConfigSchema,
            lifecycle: recorder.hooks(),
          }),
          config: {
            hr: HR_CONFIG,
            finance: FINANCE_CONFIG,
          },
        },
      ],
      inventory: multiInstanceEntries('master-data-client', ['hr', 'finance'], {
        configRef: 'masterData',
      }),
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, {
      'master-data-client#hr': 'ready',
      'master-data-client#finance': 'ready',
    });

    // HR instance config and tokens
    const hrEntry = catalog.byKey['master-data-client#hr'];
    expect(hrEntry.instanceId).toBe('hr');
    expect(hrEntry.config).toMatchObject({
      endpoint: 'https://hr-master-data.example.com',
      intervalMs: 60000,
    });

    // Finance instance config and tokens
    const finEntry = catalog.byKey['master-data-client#finance'];
    expect(finEntry.instanceId).toBe('finance');
    expect(finEntry.config).toMatchObject({
      endpoint: 'https://finance-master-data.example.com',
      intervalMs: 120000,
    });

    // Verify qualified symbols
    expect(capabilityInstanceToken(CAPABILITY.masterDataClient, 'hr')).toBe(
      Symbol.for('appspine.master-data-client#hr'),
    );
    expect(capabilityInstanceToken(CAPABILITY.masterDataClient, 'finance')).toBe(
      Symbol.for('appspine.master-data-client#finance'),
    );
  });
});

describe('duplicate / renamed instance migration policy', () => {
  it('fails resolution when duplicate instanceIds are registered in inventory', () => {
    expectResolutionError(
      resolveHarness({
        plugins: [{ plugin: masterDataClientPlugin }],
        inventory: [
          inventoryEntry('master-data-client', { instanceId: 'hr' }),
          inventoryEntry('master-data-client', { instanceId: 'hr' }),
        ],
        hostCapabilities: HOST,
      }),
      'duplicate-instance',
    );
  });

  it('preserves distinct identity when an instance is renamed in configuration', () => {
    const graphOld = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: masterDataClientPlugin }],
        inventory: [inventoryEntry('master-data-client', { instanceId: 'legacy-hr' })],
        hostCapabilities: HOST,
      }),
    );
    expect(graphOld.order).toEqual(['master-data-client#legacy-hr']);

    const graphNew = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: masterDataClientPlugin }],
        inventory: [inventoryEntry('master-data-client', { instanceId: 'primary-hr' })],
        hostCapabilities: HOST,
      }),
    );
    expect(graphNew.order).toEqual(['master-data-client#primary-hr']);
  });
});

describe('partial degradation (optional failure policy)', () => {
  it('degrades a failed optional instance while healthy instances remain ready', async () => {
    const { catalog } = await bootHarness({
      plugins: [
        {
          plugin: definePlugin({
            manifest: masterDataClientManifest,
            backend: masterDataClientPlugin.backend,
            configSchema: masterDataClientConfigSchema,
            lifecycle: {
              validate: async (ctx) => {
                if (ctx.instanceId === 'finance') {
                  throw new Error('Finance master-data upstream unreachable');
                }
              },
            },
          }),
          config: {
            hr: HR_CONFIG,
            finance: FINANCE_CONFIG,
          },
        },
      ],
      inventory: [
        optionalInventoryEntry('master-data-client', {
          instanceId: 'hr',
          configRef: 'masterData',
        }),
        optionalInventoryEntry('master-data-client', {
          instanceId: 'finance',
          configRef: 'masterData',
        }),
      ],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'degraded-ready');
    expectCatalogStatus(catalog, {
      'master-data-client#hr': 'ready',
      'master-data-client#finance': 'degraded',
    });
  });
});

describe('secret redaction', () => {
  it('redacts sensitive API keys from the catalog output', async () => {
    const { catalog } = await bootHarness({
      plugins: [
        {
          plugin: masterDataClientPlugin,
          config: {
            hr: HR_CONFIG,
            finance: FINANCE_CONFIG,
          },
        },
      ],
      inventory: multiInstanceEntries('master-data-client', ['hr', 'finance'], {
        configRef: 'masterData',
      }),
      hostCapabilities: HOST,
    });

    expectRedacted(catalog.entries, 'hr-secret-api-key', 'fin-secret-api-key');
  });
});

describe('shutdown lifecycle', () => {
  it('stops timers and cleans up resources on shutdown across all instances', async () => {
    vi.useFakeTimers();
    const service = new MasterDataReconciliationService({
      intervalMs: 1000,
      autoStart: true,
      entities: [],
    });
    service.onModuleInit();
    expect((service as unknown as { timer?: unknown }).timer).toBeDefined();
    service.onModuleDestroy();
    expect((service as unknown as { timer?: unknown }).timer).toBeUndefined();

    const harness = createPluginHarness({
      plugins: [
        {
          plugin: masterDataClientPlugin,
          config: {
            hr: { ...HR_CONFIG, autoStart: true },
            finance: { ...FINANCE_CONFIG, autoStart: true },
          },
        },
      ],
      inventory: multiInstanceEntries('master-data-client', ['hr', 'finance'], {
        configRef: 'masterData',
      }),
      hostCapabilities: HOST,
    });

    const catalog = await harness.boot();
    expect(catalog.outcome).toBe('ready');

    // Shutdown harness
    await harness.shutdown();

    vi.useRealTimers();
  });
});

describe('config schema validation', () => {
  it('validates valid configuration options', () => {
    const result = masterDataClientConfigSchema.parse(HR_CONFIG);
    expect(result.endpoint).toBe('https://hr-master-data.example.com');
    expect(result.apiKey).toBe('hr-secret-api-key');
    expect(result.intervalMs).toBe(60000);
  });

  it('rejects invalid intervalMs', () => {
    expect(() =>
      validateMasterDataClientConfig({
        intervalMs: -100,
      }),
    ).toThrow(MasterDataClientConfigurationError);

    expect(() =>
      validateMasterDataClientConfig({
        intervalMs: 'not-a-number' as never,
      }),
    ).toThrow(MasterDataClientConfigurationError);
  });

  it('rejects invalid autoStart', () => {
    expect(() =>
      validateMasterDataClientConfig({
        autoStart: 'yes' as never,
      }),
    ).toThrow(MasterDataClientConfigurationError);
  });

  it('rejects invalid entities array', () => {
    expect(() =>
      validateMasterDataClientConfig({
        entities: 'not-an-array' as never,
      }),
    ).toThrow(MasterDataClientConfigurationError);
  });
});

describe('backend factory and legacy parity', () => {
  it('masterDataClient() helper returns the defined plugin', () => {
    expect(masterDataClient()).toBe(masterDataClientPlugin);
  });

  it('backend factory instantiates MasterDataClientModule with instance-qualified and generic tokens', async () => {
    const backend = await masterDataClientPlugin.backend?.({
      instanceId: 'hr',
      key: 'master-data-client#hr',
      config: HR_CONFIG,
    } as never);

    expect(backend?.module).toBe(MasterDataClientModule);
    expect(backend?.exports).toContain(MasterDataReconciliationService);
    expect(backend?.exports).toContain(MASTER_DATA_CLIENT);
    expect(backend?.exports).toContain(
      capabilityInstanceToken('appspine.master-data-client', 'hr'),
    );
  });

  it('MasterDataClientModule.forRoot() binds and exports MASTER_DATA_CLIENT token for legacy consumers', () => {
    const dynamicModule = MasterDataClientModule.forRoot(HR_CONFIG);
    expect(dynamicModule.module).toBe(MasterDataClientModule);
    expect(dynamicModule.exports).toContain(MASTER_DATA_CLIENT);
    expect(dynamicModule.exports).toContain(MasterDataReconciliationService);
  });

  it('MasterDataClientModule.forRootAsync() binds and exports MASTER_DATA_CLIENT token', async () => {
    const dynamicModule = MasterDataClientModule.forRootAsync({
      useFactory: () => HR_CONFIG,
    });
    expect(dynamicModule.module).toBe(MasterDataClientModule);
    expect(dynamicModule.exports).toContain(MASTER_DATA_CLIENT);
    expect(dynamicModule.exports).toContain(MasterDataReconciliationService);
  });
});
