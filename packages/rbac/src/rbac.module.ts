import { Global, Module } from '@nestjs/common';
import { PermissionGuard } from './guards/permission.guard';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';

@Global()
@Module({
  controllers: [RolesController],
  providers: [RolesService, PermissionGuard],
  exports: [RolesService, PermissionGuard],
})
export class RbacModule {}
