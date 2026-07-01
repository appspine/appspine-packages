# @appspine/health-check

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
