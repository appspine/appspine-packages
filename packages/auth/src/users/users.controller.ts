import { AuditLogService } from '@appspine/audit-log';
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
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AdminGuard } from '../guards/admin.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import {
  type CreateUserDto,
  createUserSchema,
  type UpdateRolesDto,
  type UpdateUserDto,
  updateRolesSchema,
  updateUserSchema,
} from './dto/user.dto';
import { UsersService } from './users.service';

// User management is ADMIN-only (AdminGuard).
// If custom roles should manage users in future, switch to PermissionGuard + @RequirePermissions
// (from @appspine/rbac).
@Controller('users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Fire-and-forget: an audit log failure must never block the business response
  // (dev_docs/004-task-breakdown.md T-101).
  private recordAudit(
    entityId: string,
    action: AuditAction,
    actor: { sub: string; email?: string },
  ) {
    void this.auditLogService
      .record({
        entityType: 'User',
        entityId,
        action,
        actorId: actor.sub,
        actorEmail: actor.email ?? `api-key:${actor.sub}`,
        appName: process.env.APP_NAME ?? 'appspine-app-template',
      })
      .catch((err: unknown) => this.logger.warn(`Failed to record audit log: ${String(err)}`));
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({ ...dto, password: hashed });
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
