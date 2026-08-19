/**
 * `@appspine/rbac/plugin` — manifest and plugin descriptor (PL3-05).
 */

import { definePlugin, type PluginManifestV1 } from '@appspine/plugin-api';
import { RbacModule } from './rbac.module';

/** SHA-256 of `prisma/role.prisma` with LF endings. */
export const RBAC_SCHEMA_DIGEST =
  'sha256:bcecd51f14428efcbb36fa3ee65971459228741b0cfbb940f2883e2b3379cb5e';

/** Mirrors `appspine.plugin.json`. */
export const rbacManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'rbac',
  displayName: 'Role-Based Access Control',
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
  provides: ['appspine.rbac-policy'],
  requires: ['appspine.identity-store', 'appspine.prisma', 'appspine.principal-context'],
  optionalRequires: ['appspine.audit-sink'],
  facets: {
    backend: {
      modulePath: './dist/rbac.module.js',
      exportName: 'RbacModule',
      global: true,
      controllerRoutes: ['roles'],
      providerTokens: ['appspine.rbac-policy'],
    },
    frontend: {
      adminPages: [
        {
          id: 'roles',
          routePath: '/dashboard/roles',
          title: 'roles',
          componentExport: 'RolesTable',
          requiredPermission: 'rbac:role:read',
          order: 20,
        },
      ],
      navigationItems: [
        {
          id: 'roles',
          title: 'roles',
          href: '/dashboard/roles',
          icon: 'ShieldCheck',
          order: 20,
          section: 'admin',
          requiredPermission: 'rbac:role:read',
          after: 'users',
        },
      ],
      i18nNamespace: 'rbac',
      clientEntry: './dist/frontend.js',
    },
    prisma: {
      owns: ['Role', 'RolePermission', 'UserRole'],
      augments: [{ targetModel: 'User', field: 'userRoles', owner: 'identity-core' }],
      schemaFragment: 'prisma/role.prisma',
      schemaDigest: RBAC_SCHEMA_DIGEST,
    },
    permissions: {
      definitions: ['rbac:role:create', 'rbac:role:update', 'rbac:role:delete', 'rbac:role:read'],
    },
  },
};

export const rbacPlugin = definePlugin({
  manifest: rbacManifest,
  backend: () => RbacModule,
});

export function rbac() {
  return rbacPlugin;
}

export type { PrincipalAuthorization, RbacPolicyPort, RoleGrant } from '@appspine/plugin-api';
export { RBAC_POLICY, SYSTEM_ADMIN_ROLE, SYSTEM_USER_ROLE } from '@appspine/plugin-api';
export { PERMISSIONS_KEY, RequirePermissions } from './decorators/require-permissions.decorator';
export { RbacAdminGuard } from './guards/admin.guard';
export { PermissionGuard } from './guards/permission.guard';
export { RbacModule } from './rbac.module';
export { RbacPolicyService } from './rbac-policy.service';
export { RolesController } from './roles/roles.controller';
export { RolesService } from './roles/roles.service';
export { buildUserContext } from './user-context.util';
