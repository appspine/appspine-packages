import { AUDIT_SINK } from '@appspine/plugin-api';
import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

/**
 * Provides the audit sink both as a concrete class (legacy) and behind the stable `AUDIT_SINK`
 * token (PL1-09).
 *
 * `useExisting`, not `useClass`: one service instance answers to both, so a consumer migrating
 * from `AuditLogService` to `AUDIT_SINK` cannot end up writing through two different objects.
 *
 * The module is deliberately scoped. Consumers must import it explicitly or import a generated
 * plugin composition module that exports it.
 */
@Module({
  providers: [AuditLogService, { provide: AUDIT_SINK, useExisting: AuditLogService }],
  exports: [AuditLogService, AUDIT_SINK],
})
export class AuditLogModule {}
