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
  /**
   * Caller-supplied correlation id (dev_docs 002/023 §2.5), typically extracted from the
   * X-Appspine-Workflow-Id request header via {@link extractWorkflowId}. Untrusted — never
   * use for authorization/attribution, debugging and cross-app workflow tracing only.
   * Leave `undefined` (not `null`) when the caller didn't send the header: `record()` then
   * omits the field from the write entirely, so consuming apps whose schema hasn't been
   * migrated to add `workflowId` yet are unaffected (see audit-log.prisma).
   */
  workflowId?: string | null;
}

const WORKFLOW_ID_HEADER = 'x-appspine-workflow-id';

/**
 * Reads the caller-supplied correlation id from request headers (case-insensitive per HTTP,
 * and Node/Express already lower-cases incoming header names). Returns `null` — not
 * `undefined` — when absent, matching {@link RecordAuditLogDto.workflowId}'s "explicitly
 * unknown" vs "not passed" distinction: pass this return value straight through when the
 * call site always wants the field written (once migrated); pass `undefined` instead when
 * the call site wants T-9590's do-nothing-until-migrated behavior.
 */
export function extractWorkflowId(headers: Record<string, unknown>): string | null {
  const value = headers[WORKFLOW_ID_HEADER];
  return typeof value === 'string' && value.length > 0 ? value : null;
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
        // Omitted (not `workflowId: null`) when the caller never passed one, so this
        // write doesn't depend on the consuming app's schema having the column yet.
        ...(dto.workflowId !== undefined ? { workflowId: dto.workflowId } : {}),
      },
    });
  }
}
