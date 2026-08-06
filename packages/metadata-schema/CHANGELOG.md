# @appspine/metadata-schema

## 0.2.19

### Patch Changes

- @appspine/m2m-api-key@4.0.5

## 0.2.18

### Patch Changes

- Updated dependencies [7c9e928]
  - @appspine/common@0.3.2
  - @appspine/m2m-api-key@4.0.4

## 0.2.17

### Patch Changes

- @appspine/m2m-api-key@4.0.3

## 0.2.16

### Patch Changes

- @appspine/m2m-api-key@4.0.2

## 0.2.15

### Patch Changes

- Updated dependencies
  - @appspine/common@0.3.1
  - @appspine/m2m-api-key@4.0.1

## 0.2.14

### Patch Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).
- Updated dependencies
  - @appspine/common@0.3.0
  - @appspine/m2m-api-key@4.0.0

## 0.2.13

### Patch Changes

- @appspine/m2m-api-key@3.0.4

## 0.2.12

### Patch Changes

- @appspine/m2m-api-key@3.0.3

## 0.2.11

### Patch Changes

- @appspine/m2m-api-key@3.0.2

## 0.2.10

### Patch Changes

- @appspine/m2m-api-key@3.0.1

## 0.2.9

### Patch Changes

- Updated dependencies [cc3b30a]
  - @appspine/m2m-api-key@3.0.0

## 0.2.8

### Patch Changes

- @appspine/m2m-api-key@2.1.3

## 0.2.7

### Patch Changes

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1
  - @appspine/m2m-api-key@2.1.2

## 0.2.6

### Patch Changes

- Updated dependencies [0907ff6]
  - @appspine/m2m-api-key@2.1.0

## 0.2.5

### Patch Changes

- @appspine/m2m-api-key@2.0.0

## 0.2.4

### Patch Changes

- @appspine/m2m-api-key@1.0.3

## 0.2.3

### Patch Changes

- @appspine/m2m-api-key@1.0.2

## 0.2.2

### Patch Changes

- Sync internal `@appspine/common` dependency to `0.2.0` (previously pinned to `0.1.1` from the last
  publish). No functional code changes.

  This closes a gap left by the `@appspine/mcp-server`/`@appspine/common`/`@appspine/audit-log` minor
  release (wiki app 011 prerequisites): that release only targeted those three packages, so the
  `changeset version` internal-dependency cascade to these five `@appspine/common` consumers was
  discarded instead of applied, leaving their published manifests pinned to the stale
  `@appspine/common@0.1.1`. Any app installing both a direct `@appspine/common@^0.2.0` dependency and
  one of these five packages ends up with two separate `@appspine/common` copies in `node_modules`,
  which NestJS resolves as two distinct `PrismaService` class tokens and fails DI resolution — see
  `dev_docs/Z05-template-common-singleton-override.md` for the concrete failure and the
  `pnpm-workspace.yaml` override that was needed as a workaround in `appspine-app-template`. This
  release removes the need for that override going forward.

- Updated dependencies
  - @appspine/m2m-api-key@1.0.1

## 0.2.1

### Patch Changes

- Updated dependencies
  - @appspine/m2m-api-key@1.0.0

## 0.2.0

### Minor Changes

- 926e10a: Add enum translation gap collection utilities.

## 0.1.3

### Patch Changes

- Updated dependencies
  - @appspine/common@0.1.1
  - @appspine/m2m-api-key@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [8cd6c2a]
  - @appspine/m2m-api-key@0.1.2

## 0.1.1

### Patch Changes

- @appspine/m2m-api-key@0.1.1

## 0.1.0

### Minor Changes

- 72e7451: Add three independent packages, ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`:

  - `@appspine/audit-log`: `AuditLogService` writing to a local `audit_logs` table (the centralized `pg-boss` aggregation queue from auranest's `audit-emitter/` is intentionally not adopted — see `dev_docs/003`). Ships a `prisma/audit-log.prisma` fragment (`AuditLog` model + `AuditAction` enum).
  - `@appspine/health-check`: `HealthController` (`@nestjs/terminus` + `PrismaHealthIndicator`), near-zero changes from the source.
  - `@appspine/metadata-schema`: `MetaService` (DMMF-derived `SchemaMeta`, `@internal`-tagged models excluded from the scope catalog) plus a new `renderDataDictionary()` function shared between build-time docs generation and the runtime endpoint (`dev_docs/001`'s "two outputs share one transform" requirement — `auranest`'s `gen-data-dictionary.ts` script duplicated this logic standalone instead). `MetaController` now serves `GET /metadata/schema` (matching `dev_docs/001`'s documented path, not `auranest`'s `GET /meta/schema`) gated by `JwtOrApiKeyGuard` + `ScopeGuard` + `@Scopes('metadata:read')` instead of `AdminGuard`, so M2M API keys with the right scope can call it too.

  Verified all four identity-layer Prisma fragments (`User`, `Role`+`RolePermission`+`UserRole`, `ApiKey`, `AuditLog`) assemble into one valid schema via `prisma validate`.

### Patch Changes

- Updated dependencies [a3b22ec]
- Updated dependencies [b742d53]
- Updated dependencies [7fe9011]
  - @appspine/common@0.1.0
  - @appspine/m2m-api-key@0.1.0
