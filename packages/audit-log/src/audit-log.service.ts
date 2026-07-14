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
  trace?: AuditTraceInput;
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

export type AuditSourceOrigin =
  | 'USER_UI'
  | 'CHAT_BOT'
  | 'INCOMING_WEBHOOK'
  | 'MCP'
  | 'SYSTEM'
  | 'UNKNOWN';

export interface AuditTraceInput {
  runId?: string | null;
  deploymentId?: string | null;
  workflowId?: string | null;
  executionId?: string | null;
  operationId?: string | null;
  sourceMessageId?: string | null;
  sourceActorId?: string | null;
  sourceOrigin?: AuditSourceOrigin | null;
}

export interface NormalizedAuditTrace {
  runId: string | null;
  deploymentId: string | null;
  workflowId: string | null;
  executionId: string | null;
  operationId: string | null;
  sourceMessageId: string | null;
  sourceActorId: string | null;
  sourceOrigin: AuditSourceOrigin | null;
}

export const AUDIT_TRACE_MAX_ID_LENGTH = 128;
export const AUDIT_TRACE_OPERATION_ID_LENGTH = 32;

const WORKFLOW_ID_HEADER = 'x-appspine-workflow-id';
const OPERATION_ID_PATTERN = /^[a-f0-9]{32}$/;
const SOURCE_ORIGINS = new Set<AuditSourceOrigin>([
  'USER_UI',
  'CHAT_BOT',
  'INCOMING_WEBHOOK',
  'MCP',
  'SYSTEM',
  'UNKNOWN',
]);

export class AuditTraceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditTraceValidationError';
  }
}

export function normalizeAuditTrace(input: AuditTraceInput): NormalizedAuditTrace {
  return {
    runId: normalizeTraceId(input.runId, 'runId'),
    deploymentId: normalizeTraceId(input.deploymentId, 'deploymentId'),
    workflowId: normalizeTraceId(input.workflowId, 'workflowId'),
    executionId: normalizeTraceId(input.executionId, 'executionId'),
    operationId: normalizeOperationId(input.operationId),
    sourceMessageId: normalizeTraceId(input.sourceMessageId, 'sourceMessageId'),
    sourceActorId: normalizeTraceId(input.sourceActorId, 'sourceActorId'),
    sourceOrigin: normalizeSourceOrigin(input.sourceOrigin),
  };
}

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
    const trace = dto.trace ? normalizeAuditTrace(dto.trace) : null;
    const workflowId = trace ? trace.workflowId : dto.workflowId;

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
        ...(trace
          ? {
              runId: trace.runId,
              deploymentId: trace.deploymentId,
              executionId: trace.executionId,
              operationId: trace.operationId,
              sourceMessageId: trace.sourceMessageId,
              sourceActorId: trace.sourceActorId,
              sourceOrigin: trace.sourceOrigin,
            }
          : {}),
        // Omitted (not `workflowId: null`) when the caller never passed one, so this
        // write doesn't depend on the consuming app's schema having the column yet.
        ...(workflowId !== undefined ? { workflowId } : {}),
      },
    });
  }
}

function normalizeTraceId(value: string | null | undefined, fieldName: string): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > AUDIT_TRACE_MAX_ID_LENGTH) {
    throw new AuditTraceValidationError(`${fieldName} must be at most 128 characters`);
  }
  if (hasControlCharacter(trimmed)) {
    throw new AuditTraceValidationError(`${fieldName} must not contain control characters`);
  }
  return trimmed;
}

function normalizeOperationId(value: string | null | undefined): string | null {
  const normalized = normalizeTraceId(value, 'operationId');
  if (normalized === null) return null;
  if (!OPERATION_ID_PATTERN.test(normalized)) {
    throw new AuditTraceValidationError('operationId must be a 32-character lowercase hex string');
  }
  return normalized;
}

function normalizeSourceOrigin(
  value: AuditSourceOrigin | null | undefined,
): AuditSourceOrigin | null {
  if (value === undefined || value === null) return null;
  if (!SOURCE_ORIGINS.has(value)) {
    throw new AuditTraceValidationError(`sourceOrigin is not supported: ${value}`);
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
