/**
 * `@appspine/master-data-client/plugin` — manifest and plugin descriptor (PL4-08).
 */

import {
  capabilityInstanceToken,
  definePlugin,
  MASTER_DATA_CLIENT,
  type MasterDataClientPort,
  type PluginManifestV1,
} from '@appspine/plugin-api';
import {
  MASTER_DATA_CLIENT_CONFIG,
  type MasterDataClientConfig,
  masterDataClientConfigSchema,
} from './config';
import { MasterDataClientModule } from './reconciliation/master-data-client.module';
import {
  MASTER_DATA_CLIENT_OPTIONS,
  MasterDataReconciliationService,
} from './reconciliation/reconciliation.service';
import type { MasterDataClientModuleOptions } from './types';

export {
  capabilityInstanceToken,
  MASTER_DATA_CLIENT,
  MASTER_DATA_CLIENT_CONFIG,
  MASTER_DATA_CLIENT_OPTIONS,
  type MasterDataClientConfig,
  MasterDataClientModule,
  type MasterDataClientPort,
  MasterDataReconciliationService,
  masterDataClientConfigSchema,
};

const DEFAULT_INTERVAL_MS = 300000;

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const masterDataClientManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'master-data-client',
  displayName: 'Master Data Client',
  cardinality: 'multiple',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
    },
  },
  provides: ['appspine.master-data-client'],
  requires: ['appspine.identity-delegation'],
  optionalRequires: ['appspine.audit-sink'],
  configSchema: { configRef: 'masterData' },
  // `entities[].listFetcher()` (consumer-supplied) is the only data-fetching path this
  // service actually calls — these two vars are validated and redacted but not yet threaded
  // into it, so they must stay optional; marking them required would make `plugin doctor`
  // block every instance on unused config.
  environment: [
    {
      key: 'MASTER_DATA_ENDPOINT',
      required: false,
      secret: false,
      description: 'Base URL of the master-data source app.',
    },
    {
      key: 'MASTER_DATA_API_KEY',
      required: false,
      secret: true,
      description: 'M2M API key credential used to call master-data.',
    },
  ],
  optionalFailurePolicy: {
    isolationBoundary: 'instance',
    degradedBehavior: {
      readiness: 'degraded',
      catalog: 'degraded',
      alert: 'required',
    },
  },
  facets: {
    backend: {
      modulePath: './dist/master-data-client.module.js',
      exportName: 'MasterDataClientModule',
    },
    operations: {
      healthIndicatorId: 'master-data-client',
      metricsPrefix: 'master_data_client',
      shutdownTimeoutMs: 5000,
    },
  },
};

export const masterDataClientPlugin = definePlugin({
  manifest: masterDataClientManifest,
  configSchema: masterDataClientConfigSchema,
  backend: (ctx) => {
    const instanceId = ctx?.instanceId;
    const instanceToken = instanceId
      ? capabilityInstanceToken('appspine.master-data-client', instanceId)
      : MASTER_DATA_CLIENT;

    const rawConfig = ctx?.config as Partial<MasterDataClientConfig> | undefined;
    const options: MasterDataClientModuleOptions = {
      intervalMs: rawConfig?.intervalMs ?? DEFAULT_INTERVAL_MS,
      autoStart: rawConfig?.autoStart ?? true,
      endpoint: rawConfig?.endpoint ?? process.env.MASTER_DATA_ENDPOINT ?? '',
      apiKey:
        rawConfig?.apiKey ?? rawConfig?.masterDataApiKey ?? process.env.MASTER_DATA_API_KEY ?? '',
      entities: rawConfig?.entities ?? [],
    };

    return {
      module: MasterDataClientModule,
      providers: [
        {
          provide: MASTER_DATA_CLIENT_OPTIONS,
          useValue: {
            intervalMs: options.intervalMs,
            autoStart: options.autoStart,
            entities: options.entities,
          },
        },
        MasterDataReconciliationService,
        {
          provide: instanceToken,
          useExisting: MasterDataReconciliationService,
        },
        {
          provide: MASTER_DATA_CLIENT,
          useExisting: MasterDataReconciliationService,
        },
      ],
      exports: [MasterDataReconciliationService, instanceToken, MASTER_DATA_CLIENT],
    };
  },
});

export function masterDataClient() {
  return masterDataClientPlugin;
}

export default masterDataClientPlugin;
