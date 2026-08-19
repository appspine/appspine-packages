import { RBAC_POLICY } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Global, Module } from '@nestjs/common';
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
 * Retained as `@Global()` during the Phase 4 transition window (Gate G4 compatibility bridge).
 * Downstream business applications (e.g. calendar, wiki, drive, chat, etc.) currently use
 * `@UseGuards(PermissionGuard)` across 40+ feature controllers without explicit module-level
 * imports. Removing `@Global()` immediately in package migration would cause runtime
 * `UnknownDependenciesException` at application bootstrap. True removal is scheduled for Phase 5
 * when downstream App modules complete feature-level wiring and codemod adoption.
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
  exports: [RolesService, PermissionGuard, RbacAdminGuard, RbacPolicyService, RBAC_POLICY],
})
export class RbacModule {}
