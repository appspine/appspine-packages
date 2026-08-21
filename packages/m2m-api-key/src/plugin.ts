/**
 * `@appspine/m2m-api-key/plugin` — manifest and plugin descriptor (PL3-06, PL4-03).
 */

import {
  definePlugin,
  type PluginManifestV1,
  SCOPE_MATCHER,
  type ScopeMatcherPort,
} from '@appspine/plugin-api';
import { ApiKeyMachineStrategy } from './api-key-machine.strategy';
import { ApiKeysModule } from './api-keys.module';
import { matchScope } from './guards/scope.guard';
import { ScopeMatcherService } from './scope-matcher.service';

export {
  ApiKeyMachineStrategy,
  matchScope,
  SCOPE_MATCHER,
  type ScopeMatcherPort,
  ScopeMatcherService,
};

/** SHA-256 of `prisma/api-key.prisma` with LF endings. */
export const M2M_API_KEY_SCHEMA_DIGEST =
  'sha256:e35d38ae46d2a8700bc78623dd2acfbb395c7cc60ec0bee1805d2694dedb6bb1';

/** Mirrors `appspine.plugin.json`. */
export const m2mApiKeyManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'm2m-api-key',
  displayName: 'Machine-to-Machine API Keys',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
      '@prisma/client': '^6.2.0',
      'lucide-react': '^1.22.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
  },
  provides: ['appspine.machine-auth-provider', 'appspine.scope-matcher'],
  requires: [
    'appspine.identity-store',
    'appspine.prisma',
    'appspine.principal-context',
    'appspine.authentication-strategy-registry',
  ],
  optionalRequires: ['appspine.audit-sink', 'appspine.rbac-policy'],
  facets: {
    backend: {
      modulePath: './dist/api-keys.module.js',
      exportName: 'ApiKeysModule',
      controllerRoutes: ['api-keys'],
      providerTokens: ['appspine.scope-matcher'],
    },
    frontend: {
      adminPages: [
        {
          id: 'api-keys',
          routePath: '/dashboard/api-keys',
          title: 'apiKeys',
          componentExport: 'ApiKeysTable',
          requiredPermission: 'm2m:api-key:read',
          order: 30,
        },
      ],
      navigationItems: [
        {
          id: 'api-keys',
          title: 'apiKeys',
          href: '/dashboard/api-keys',
          icon: 'Key',
          order: 30,
          section: 'admin',
          requiredPermission: 'm2m:api-key:read',
          after: 'roles',
        },
      ],
      i18nNamespace: 'apiKeys',
      clientEntry: './dist/frontend.js',
    },
    prisma: {
      owns: ['ApiKey'],
      augments: [
        {
          targetModel: 'User',
          field: 'actingApiKeys',
          owner: 'identity-core',
          type: 'ApiKey[] @relation("ApiKeyActingUser")',
        },
      ],
      schemaFragment: 'prisma/api-key.prisma',
      schemaDigest: M2M_API_KEY_SCHEMA_DIGEST,
    },
    permissions: {
      definitions: [
        'm2m:api-key:create',
        'm2m:api-key:update',
        'm2m:api-key:delete',
        'm2m:api-key:read',
      ],
    },
  },
};

export const m2mApiKeyPlugin = definePlugin({
  manifest: m2mApiKeyManifest,
  backend: () => ApiKeysModule,
});

export function m2mApiKey() {
  return m2mApiKeyPlugin;
}
