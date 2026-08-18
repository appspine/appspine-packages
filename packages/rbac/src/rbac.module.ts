import { RBAC_POLICY } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Global, Module } from '@nestjs/common';
import { RbacAdminGuard } from './guards/admin.guard';
import { PermissionGuard } from './guards/permission.guard';
import { RbacPolicyService } from './rbac-policy.service';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';

/**
 * Still `@Global()` during the transition (051 decision 3 removes it in Phase 4); what is new is
 * `RBAC_POLICY`, the token through which `identity-core` and `oidc-auth` reach role policy without
 * importing this package (PL0-04 section 2).
 */
@Global()
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
  exports: [RolesService, PermissionGuard, RbacPolicyService, RBAC_POLICY],
})
export class RbacModule {}
