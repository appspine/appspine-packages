import { AuditLogService, recordAuditSafely } from '@appspine/audit-log';
import { AdminGuard, CurrentUser, JwtAuthGuard } from '@appspine/auth';
import {
  AuditAction,
  type PaginationQuery,
  paginationQuerySchema,
  ZodValidationPipe,
} from '@appspine/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
  private readonly logger = new Logger(RolesController.name);

  constructor(
    private readonly rolesService: RolesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Fire-and-forget: an audit log failure must never block the business response
  // (dev_docs/004-task-breakdown.md T-101).
  private recordAudit(
    entityId: string,
    action: AuditAction,
    actor: { sub: string; email?: string },
  ) {
    recordAuditSafely({
      auditLogService: this.auditLogService,
      entityType: 'Role',
      entityId,
      action,
      actor,
      logger: this.logger,
    });
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.rolesService.findAll(query);
  }

  // Must be registered before @Get(':id') — otherwise Nest matches "options" as an :id param.
  @Get('options')
  findOptions() {
    return this.rolesService.findOptions();
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createRoleSchema)) dto: CreateRoleDto,
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    const role = await this.rolesService.create(dto);
    this.recordAudit(role.id, AuditAction.CREATE, actor);
    return role;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleDto,
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    const role = await this.rolesService.update(id, dto);
    this.recordAudit(id, AuditAction.UPDATE, actor);
    return role;
  }

  @Put(':id/permissions')
  async replacePermissions(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replacePermissionsSchema)) dto: ReplacePermissionsDto,
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    const role = await this.rolesService.replacePermissions(id, dto);
    this.recordAudit(id, AuditAction.UPDATE, actor);
    return role;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() actor: { sub: string; email?: string }) {
    await this.rolesService.remove(id);
    this.recordAudit(id, AuditAction.DELETE, actor);
  }
}
