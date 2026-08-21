import {
  AuditAction,
  type PaginationQuery,
  paginationQuerySchema,
  ZodValidationPipe,
} from '@appspine/common';
import { AUDIT_SINK, type AuditSinkPort } from '@appspine/plugin-api';
import { CurrentUser, InteractiveAuthGuard } from '@appspine/plugin-host-nest';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import {
  type CreateUserDto,
  createUserSchema,
  type UpdateRolesDto,
  type UpdateUserDto,
  updateRolesSchema,
  updateUserSchema,
} from './dto/user.dto';
import { UsersService } from './users.service';

/**
 * User management is ADMIN-only (AdminGuard).
 * If custom roles should manage users in future, switch to PermissionGuard + @RequirePermissions
 * (from @appspine/rbac).
 *
 * `InteractiveAuthGuard` replaces the old `JwtAuthGuard`: identical behaviour (a human login is
 * required), but the route no longer names OIDC. Whichever interactive provider the App installed
 * resolves the principal through the host's strategy registry (PL1-11).
 */
@Controller('users')
@UseGuards(InteractiveAuthGuard, AdminGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    // Injected by token, not by importing `@appspine/audit-log`: identity must not depend on a
    // capability package (051 plan section 6.1). Optional, because an App may run without audit —
    // the writes below then simply have nowhere to go, which is a deployment choice, not an error.
    @Optional() @Inject(AUDIT_SINK) private readonly auditSink?: AuditSinkPort,
  ) {}

  /**
   * Fire-and-forget: an audit log failure must never block the business response
   * (dev_docs/004-task-breakdown.md T-101). Same semantics as the `recordAuditSafely()` helper this
   * replaces — the failure is logged as a warning and swallowed.
   */
  private recordAudit(
    entityId: string,
    action: AuditAction,
    actor: { sub: string; email?: string },
  ) {
    void this.auditSink
      ?.record({
        entityType: 'User',
        entityId,
        action,
        actorId: actor.sub,
        actorEmail: actor.email ?? `api-key:${actor.sub}`,
        appName: process.env.APP_NAME ?? 'appspine-app-template',
        actingApiKeyId: null,
      })
      .catch((error: unknown) => this.logger.warn(`Failed to record audit log: ${String(error)}`));
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    const user = await this.usersService.create(dto);
    this.recordAudit(user.id, AuditAction.CREATE, actor);
    return user;
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    const user = await this.usersService.update(id, dto);
    this.recordAudit(id, AuditAction.UPDATE, actor);
    return user;
  }

  @Put(':id/roles')
  async updateRoles(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRolesSchema)) dto: UpdateRolesDto,
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    const user = await this.usersService.updateRoles(id, dto.roleIds);
    this.recordAudit(id, AuditAction.UPDATE, actor);
    return user;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() actor: { sub: string; email?: string }) {
    await this.usersService.remove(id);
    this.recordAudit(id, AuditAction.DELETE, actor);
  }
}
