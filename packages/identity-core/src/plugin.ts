/**
 * `@appspine/identity-core/plugin` — third pilot, first half (PL1-10).
 *
 * This is the shape the first two pilots could not exercise: a plugin that *owns* a model other
 * plugins augment, exposes a capability others depend on, and has an admin API surface. Together
 * with `oidc-auth` it proves the host can carry an identity split rather than just a leaf module.
 */

import { definePlugin, type PluginManifestV1 } from '@appspine/plugin-api';
import { IdentityCoreModule } from './identity-core.module';

/** SHA-256 of `prisma/user.prisma` with LF endings; `plugin.spec.ts` recomputes and compares. */
export const IDENTITY_CORE_SCHEMA_DIGEST =
  'sha256:b47f2c095a634912f8fc2520c5d679b55599d1076e00295be0eb0efa2479530d';

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const identityCoreManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'identity-core',
  displayName: 'Identity Core',
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
  provides: ['appspine.identity-store'],
  requires: ['appspine.prisma', 'appspine.principal-context'],
  // Audit is genuinely optional: identity works without it, it just stops recording
  // administrative changes.
  optionalRequires: ['appspine.audit-sink'],
  facets: {
    backend: {
      modulePath: './dist/identity-core.module.js',
      exportName: 'IdentityCoreModule',
      controllerRoutes: ['users'],
      providerTokens: ['appspine.identity-store'],
    },
    frontend: {
      adminPages: [
        {
          id: 'users',
          routePath: '/dashboard/users',
          title: 'users',
          componentExport: 'UsersTable',
          requiredPermission: 'identity:user:read',
          order: 10,
        },
      ],
      navigationItems: [
        {
          id: 'users',
          title: 'users',
          href: '/dashboard/users',
          icon: 'Users',
          order: 10,
          section: 'admin',
          requiredPermission: 'identity:user:read',
        },
      ],
      i18nNamespace: 'users',
      clientEntry: './dist/frontend.js',
    },
    prisma: {
      owns: ['User'],
      // RBAC and m2m-api-key add their back-relations here; identity-core declares neither
      // (PL0-04 section 2). PL2-06's composer is what will assemble them.
      augmentedBy: [
        { plugin: 'rbac', field: 'userRoles' },
        { plugin: 'm2m-api-key', field: 'actingApiKeys' },
        { plugin: 'notification', field: 'notifications' },
      ],
      schemaFragment: 'prisma/user.prisma',
      schemaDigest: 'sha256:b47f2c095a634912f8fc2520c5d679b55599d1076e00295be0eb0efa2479530d',
    },
  },
};

export const identityCorePlugin = definePlugin({
  manifest: identityCoreManifest,
  backend: () => IdentityCoreModule,
});

export function identityCore() {
  return identityCorePlugin;
}

export type { IdentityRecord, IdentityStorePort, IdentityWithRoles } from '@appspine/plugin-api';
export { IDENTITY_STORE } from '@appspine/plugin-api';
export { IdentityCoreModule } from './identity-core.module';
export { IdentityStoreService } from './identity-store.service';
