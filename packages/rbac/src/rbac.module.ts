import { RBAC_POLICY } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Module } from '@nestjs/common';
import { RbacAdminGuard } from './guards/admin.guard';
import { PermissionGuard } from './guards/permission.guard';
import { RbacPolicyService } from './rbac-policy.service';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';

/**
 * Role-Based Access Control module (PL4-02).
 *
 * Not `@Global()`. `@Global()` was removed in Phase 4 (051 plan section 5.1). An App or a plugin
 * that needs RBAC policy or role management imports this module or injects `RBAC_POLICY`. When
 * wired via `createAppspineModule()`, the host assembles this module dynamically into the root
 * application container.
 */
@Module({
  imports: [AppspineAuthInfrastructureModule],
  controllers: [RolesController],
  providers: [
    RolesService,
    PermissionGuard,
    RbacAdminGuard,
    RbacPolicyService,
    { provide: RBAC_POLICY, useExisting: RbacPolicyService },
  ],
  exports: [RolesService, PermissionGuard, RbacAdminGuard, RbacPolicyService, RBAC_POLICY],
})
export class RbacModule {}
