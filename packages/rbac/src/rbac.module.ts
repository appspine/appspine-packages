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
 * Provides RBAC policy and role administration behind the stable `RBAC_POLICY` token as well as
 * the concrete `RbacPolicyService`, `RolesService`, `PermissionGuard`, and `RbacAdminGuard`.
 *
 * The module is deliberately scoped. Consumers must import it explicitly or import a generated
 * plugin composition module that exports it.
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
