import { AuditAction } from '@appspine/common';
import type { AuditLogService } from './audit-log.service';
import type { AuditActor } from './audit-meta';

export type AuditWarningLogger = {
  warn(message: string): void;
};

export interface RecordAuditSafelyInput {
  auditLogService: AuditLogService;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actor: AuditActor;
  appName?: string;
  logger?: AuditWarningLogger;
}

export function recordAuditSafely({
  auditLogService,
  entityType,
  entityId,
  action,
  actor,
  appName = process.env.APP_NAME ?? 'appspine-app-template',
  logger,
}: RecordAuditSafelyInput): void {
  void auditLogService
    .record({
      entityType,
      entityId,
      action,
      actorId: actor.sub,
      actorEmail: actor.email ?? `api-key:${actor.sub}`,
      appName,
      actingApiKeyId: actor.isApiKey === true ? actor.sub : null,
    })
    .catch((err: unknown) => logger?.warn(`Failed to record audit log: ${String(err)}`));
}
