import type { AuditAction } from '@appspine/common';

export const AUTH_AUDIT_LOG = Symbol('AUTH_AUDIT_LOG');

export type AuthAuditLog = {
  record(input: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    actorId: string;
    actorEmail: string;
    appName: string;
  }): Promise<unknown>;
};
