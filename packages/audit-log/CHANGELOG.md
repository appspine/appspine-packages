# @appspine/audit-log

## 0.5.0

### Minor Changes

- Add 024 distributed trace audit fields, `AuditTraceInput`, `normalizeAuditTrace()`, bounded source-origin/operation metadata validation, and an updated copyable Prisma fragment for run, deployment, workflow, execution, operation, and source correlation.

## 0.4.0

### Minor Changes

- 81bd3a5: Add optional correlation-id support (`workflowId` on `RecordAuditLogDto`, and the `extractWorkflowId()` header helper) for the cross-app operation tracing convention in dev_docs 002/023 §2.5. Additive and backward compatible — `record()` omits the field from the write entirely when the caller doesn't pass a `workflowId`, so apps whose `AuditLog` schema hasn't been migrated to add the `workflow_id` column yet are unaffected. See `prisma/audit-log.prisma` for the field definition consuming apps need to copy into their own schema fragment.

## 0.3.0

### Minor Changes

- Add MCP acting-user context and AuditAction RESTORE/MOVE for wiki app prerequisites.

  Consumers of `@appspine/audit-log` must also update their Prisma schema fragment: the `AuditAction` enum now includes `RESTORE` and `MOVE`. The fragment is not synchronized automatically through the npm package.

### Patch Changes

- Updated dependencies
  - @appspine/common@0.2.0

## 0.2.0

### Minor Changes

- Add acting-user identity binding for M2M API keys (`actingUserId` / `isServiceAccount` / `actingApiKeyId`).

  Consuming apps must coordinate this package upgrade with local Prisma fragment and migration updates in the same deployment window. Copy/sync these schema changes before running the upgraded code:

  - `User.isServiceAccount` plus `User.actingApiKeys` relation from `@appspine/auth/prisma/user.prisma`.
  - `ApiKey.actingUserId` plus `ApiKey.actingUser` relation from `@appspine/m2m-api-key/prisma/api-key.prisma`.
  - `AuditLog.actingApiKeyId` snapshot field from `@appspine/audit-log/prisma/audit-log.prisma`.

## 0.1.1

### Patch Changes

- Updated dependencies
  - @appspine/common@0.1.1

## 0.1.0

### Minor Changes

- 72e7451: Add three independent packages, ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`:

  - `@appspine/audit-log`: `AuditLogService` writing to a local `audit_logs` table (the centralized `pg-boss` aggregation queue from auranest's `audit-emitter/` is intentionally not adopted — see `dev_docs/003`). Ships a `prisma/audit-log.prisma` fragment (`AuditLog` model + `AuditAction` enum).
  - `@appspine/health-check`: `HealthController` (`@nestjs/terminus` + `PrismaHealthIndicator`), near-zero changes from the source.
  - `@appspine/metadata-schema`: `MetaService` (DMMF-derived `SchemaMeta`, `@internal`-tagged models excluded from the scope catalog) plus a new `renderDataDictionary()` function shared between build-time docs generation and the runtime endpoint (`dev_docs/001`'s "two outputs share one transform" requirement — `auranest`'s `gen-data-dictionary.ts` script duplicated this logic standalone instead). `MetaController` now serves `GET /metadata/schema` (matching `dev_docs/001`'s documented path, not `auranest`'s `GET /meta/schema`) gated by `JwtOrApiKeyGuard` + `ScopeGuard` + `@Scopes('metadata:read')` instead of `AdminGuard`, so M2M API keys with the right scope can call it too.

  Verified all four identity-layer Prisma fragments (`User`, `Role`+`RolePermission`+`UserRole`, `ApiKey`, `AuditLog`) assemble into one valid schema via `prisma validate`.

### Patch Changes

- Updated dependencies [a3b22ec]
  - @appspine/common@0.1.0
