import { RBAC_POLICY } from '@appspine/plugin-api';
import { describe, expect, it } from 'vitest';
import { RbacAdminGuard } from './guards/admin.guard';
import { PermissionGuard } from './guards/permission.guard';
import { rbac } from './plugin';
import { RbacModule } from './rbac.module';
import { RbacPolicyService } from './rbac-policy.service';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';

describe('explicit bridge & non-global RbacModule', () => {
  it('verifies RbacModule has NO @Global() decorator (removed in Phase 4)', () => {
    // NestJS @Global() decorator sets 'global' metadata on the module class
    const isGlobal = Reflect.getMetadata('global', RbacModule);
    expect(isGlobal).toBeFalsy();
  });

  it('declares complete providers and exports on RbacModule for explicit consumer imports', () => {
    const providers = (Reflect.getMetadata('providers', RbacModule) || []) as unknown[];
    const exports = (Reflect.getMetadata('exports', RbacModule) || []) as unknown[];
    const controllers = (Reflect.getMetadata('controllers', RbacModule) || []) as unknown[];

    // Controllers
    expect(controllers).toContain(RolesController);

    // Providers
    expect(providers).toContain(RolesService);
    expect(providers).toContain(PermissionGuard);
    expect(providers).toContain(RbacAdminGuard);
    expect(providers).toContain(RbacPolicyService);
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: RBAC_POLICY, useExisting: RbacPolicyService }),
      ]),
    );

    // Exports
    expect(exports).toContain(RolesService);
    expect(exports).toContain(PermissionGuard);
    expect(exports).toContain(RbacAdminGuard);
    expect(exports).toContain(RbacPolicyService);
    expect(exports).toContain(RBAC_POLICY);
  });

  it('assembles cleanly as the backend factory of rbacPlugin', () => {
    const plugin = rbac();
    expect(plugin.manifest.id).toBe('rbac');
    expect(plugin.manifest.provides).toContain('appspine.rbac-policy');
    expect(plugin.manifest.requires).toEqual([
      'appspine.identity-store',
      'appspine.prisma',
      'appspine.principal-context',
    ]);

    const moduleClass = plugin.backend?.(
      {} as unknown as import('@appspine/plugin-api').PluginRuntimeContext,
    );
    expect(moduleClass).toBe(RbacModule);
  });
});
