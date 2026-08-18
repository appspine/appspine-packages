import { AUDIT_SINK } from '@appspine/plugin-api';
import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

/**
 * Provides the audit sink both as a concrete class (legacy) and behind the stable `AUDIT_SINK`
 * token (PL1-09).
 *
 * `useExisting`, not `useClass`: one service instance answers to both, so a consumer migrating
 * from `AuditLogService` to `AUDIT_SINK` cannot end up writing through two different objects.
 *
 * Still `@Global()`. Removing that is 051 decision 3's job and belongs in its own change — doing
 * it here would mean every App that relies on the global picking up a breaking change in the same
 * release that introduces the token they need in order to stop relying on it.
 */
@Global()
@Module({
  providers: [AuditLogService, { provide: AUDIT_SINK, useExisting: AuditLogService }],
  exports: [AuditLogService, AUDIT_SINK],
})
export class AuditLogModule {}
