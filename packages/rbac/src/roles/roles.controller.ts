import { AdminGuard, JwtAuthGuard } from '@appspine/auth';
import { ZodValidationPipe } from '@appspine/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateRoleDto,
  createRoleSchema,
  type ReplacePermissionsDto,
  replacePermissionsSchema,
  type UpdateRoleDto,
  updateRoleSchema,
} from './dto/role.dto';
import { RolesService } from './roles.service';

// Role management is exclusively ADMIN-only (AdminGuard, not PermissionGuard).
// Custom roles cannot self-escalate by acquiring role-management permissions.
@Controller('roles')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createRoleSchema)) dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Put(':id/permissions')
  replacePermissions(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replacePermissionsSchema)) dto: ReplacePermissionsDto,
  ) {
    return this.rolesService.replacePermissions(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
