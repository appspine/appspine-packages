import { AuditLogService, recordAuditSafely } from '@appspine/audit-log';
import type { PaginationQuery } from '@appspine/common';
import { AuditAction, paginationQuerySchema, ZodValidationPipe } from '@appspine/common';
import { AppspineAuthGuard, CurrentUser } from '@appspine/plugin-host-nest';
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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import type { CreateApiKeyDto, UpdateApiKeyDto } from './dto/api-key.dto';
import { createApiKeySchema, updateApiKeySchema } from './dto/api-key.dto';
import { ApiKeyAdminGuard } from './guards/admin.guard';

// API key management is ADMIN-only per user requirement.
@Controller('api-keys')
@UseGuards(AppspineAuthGuard, ApiKeyAdminGuard)
export class ApiKeysController {
  private readonly logger = new Logger(ApiKeysController.name);

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Fire-and-forget: an audit log failure must never block the business response
  // (dev_docs/004-task-breakdown.md T-101). Never pass the raw key into `entityId`
  // or any audit payload field — only the key's id/name/scopes are non-secret.
  private recordAudit(
    entityId: string,
    action: AuditAction,
    actor: { sub: string; email?: string; isApiKey?: boolean },
  ) {
    recordAuditSafely({
      auditLogService: this.auditLogService,
      entityType: 'ApiKey',
      entityId,
      action,
      actor,
      logger: this.logger,
    });
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createApiKeySchema)) dto: CreateApiKeyDto,
    // The caller may be JWT (has email) or another API key (only `sub`); fall back accordingly.
    @CurrentUser() actor: { sub: string; email?: string; isApiKey?: boolean },
  ) {
    const result = await this.apiKeysService.create(dto, actor.email ?? `api-key:${actor.sub}`);
    this.recordAudit(result.id, AuditAction.CREATE, actor);
    return result;
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.apiKeysService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.apiKeysService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApiKeySchema)) dto: UpdateApiKeyDto,
    @CurrentUser() actor: { sub: string; email?: string; isApiKey?: boolean },
  ) {
    const result = await this.apiKeysService.update(id, dto);
    this.recordAudit(id, AuditAction.UPDATE, actor);
    return result;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; email?: string; isApiKey?: boolean },
  ) {
    await this.apiKeysService.remove(id);
    this.recordAudit(id, AuditAction.DELETE, actor);
  }
}
