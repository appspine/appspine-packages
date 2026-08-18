/**
 * `@appspine/audit-log/plugin` — second pilot (PL1-09).
 *
 * Where `health-check` proved the smallest shape, this one proves the two things a real capability
 * needs: it owns Prisma models, and other plugins depend on it *through a token* rather than by
 * importing it. That inversion is the point of the task — `@appspine/auth` used to import
 * `AuditLogService` as a concrete class, which is exactly the coupling 051 plan section 6.1
 * removes.
 */

import { definePlugin, type PluginManifestV1 } from '@appspine/plugin-api';
import { AuditLogModule } from './audit-log.module';

/** SHA-256 of `prisma/audit-log.prisma` with LF endings; `plugin.spec.ts` recomputes and compares. */
export const AUDIT_LOG_SCHEMA_DIGEST =
  'sha256:852ea6e7deaa4df5686dc9faa8eabdbd2244a85abb017800b7db46df2f84198c';

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const auditLogManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'audit-log',
  displayName: 'Audit Log',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
      '@prisma/client': '^6.2.0',
    },
  },
  provides: ['appspine.audit-sink'],
  requires: ['appspine.prisma'],
  facets: {
    backend: {
      modulePath: './dist/audit-log.module.js',
      exportName: 'AuditLogModule',
      // Transition-only: `AuditLogModule` is still `@Global()`. 051 decision 3 removes that, but
      // not in the same change that introduces the token — a consumer that relies on the global
      // today must keep working while it migrates to injecting AUDIT_SINK.
      global: true,
      providerTokens: ['appspine.audit-sink'],
    },
    prisma: {
      owns: ['AuditLog'],
      ownsEnums: ['AuditAction'],
      schemaFragment: 'prisma/audit-log.prisma',
      schemaDigest: AUDIT_LOG_SCHEMA_DIGEST,
    },
  },
};

export const auditLogPlugin = definePlugin({
  manifest: auditLogManifest,
  backend: () => AuditLogModule,
});

export function auditLog() {
  return auditLogPlugin;
}

export type { AuditRecordInput, AuditSinkPort } from '@appspine/plugin-api';
export { AUDIT_SINK } from '@appspine/plugin-api';
export { AuditLogModule } from './audit-log.module';
export { AuditLogService } from './audit-log.service';
