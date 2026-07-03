import { AuditAction, PrismaService } from '@appspine/common';
import { Injectable } from '@nestjs/common';

export interface RecordAuditLogDto {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId: string;
  actorEmail: string;
  appName: string;
  isAiOperation?: boolean;
  mcpTool?: string | null;
  actingApiKeyId?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(dto: RecordAuditLogDto) {
    return this.prisma.auditLog.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        action: dto.action,
        actorId: dto.actorId,
        actorEmail: dto.actorEmail,
        appName: dto.appName,
        isAiOperation: dto.isAiOperation ?? false,
        mcpTool: dto.mcpTool ?? null,
        actingApiKeyId: dto.actingApiKeyId ?? null,
      },
    });
  }
}
