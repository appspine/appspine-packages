/**
 * `@appspine/metadata-schema/plugin` — manifest and plugin descriptor (PL4-04).
 */

import {
  definePlugin,
  METADATA_SCHEMA,
  type MetadataSchemaPort,
  type PluginManifestV1,
} from '@appspine/plugin-api';
import { MetaController } from './meta.controller';
import { MetaModule } from './meta.module';
import { MetaService } from './meta.service';
import { MetadataScopeGuard } from './meta-scope.guard';

export {
  METADATA_SCHEMA,
  MetaController,
  type MetadataSchemaPort,
  MetadataScopeGuard,
  MetaModule,
  MetaService,
};

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const metadataSchemaManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'metadata-schema',
  displayName: 'Metadata Schema Introspection',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
      '@prisma/client': '^6.2.0',
    },
  },
  provides: ['appspine.metadata-schema'],
  requires: ['appspine.prisma'],
  optionalRequires: ['appspine.scope-matcher'],
  facets: {
    backend: {
      modulePath: './dist/meta.module.js',
      exportName: 'MetaModule',
      controllerRoutes: ['metadata'],
      providerTokens: ['appspine.metadata-schema'],
    },
    permissions: {
      definitions: ['metadata:schema:read'],
    },
  },
};

export const metadataSchemaPlugin = definePlugin({
  manifest: metadataSchemaManifest,
  backend: () => ({
    module: MetaModule,
    providers: [
      {
        provide: METADATA_SCHEMA,
        useExisting: MetaService,
      },
    ],
  }),
});

export default metadataSchemaPlugin;
