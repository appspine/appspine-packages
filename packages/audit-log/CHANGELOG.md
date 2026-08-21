# @appspine/audit-log

## 2.0.0

### Major Changes

- 057c121: Complete the v3 legacy-removal milestone: remove the `@appspine/auth` facade workspace,
  capability-specific UI transition exports from `@appspine/frontend-shell`, the provider-specific
  `JwtOrApiKeyGuard`, and the deprecated domain-event webhook helper. RBAC, MCP server, M2M API key,
  and audit-log capability modules are no longer global; feature modules must import the composed
  platform bridge explicitly.

## 2.0.0-canary.0

### Major Changes

- Complete the v3 legacy-removal milestone: remove the `@appspine/auth` facade workspace,
  capability-specific UI transition exports from `@appspine/frontend-shell`, the provider-specific
  `JwtOrApiKeyGuard`, and the deprecated domain-event webhook helper. RBAC, MCP server, M2M API key,
  and audit-log capability modules are no longer global; feature modules must import the composed
  platform bridge explicitly.

## 1.1.0

### Minor Changes

- 4c0ce5f: Ship the first two capability plugins (051 PL1-08, PL1-09).

  Both packages now publish an `appspine.plugin.json` manifest and a `./plugin` subpath exporting a
  `definePlugin()` descriptor. Plugin mode contributes the very same Nest module the package root
  already exported, so legacy wiring and plugin wiring cannot diverge in behaviour.

  `@appspine/audit-log` additionally binds its service to the stable `AUDIT_SINK` token and declares
  its Prisma facet with a digest of the shipped fragment, so a consumer can depend on the audit
  capability without importing the package. The concrete `AuditLogService` export and the module's
  `@Global()` marker are unchanged during the transition window.

### Patch Changes

- Updated dependencies [4c0ce5f]
- Updated dependencies [8e67a05]
- Updated dependencies [b75516d]
- Updated dependencies [b92c1c3]
- Updated dependencies [0eaf69d]
- Updated dependencies [9cd2838]
- Updated dependencies [a41aab9]
- Updated dependencies [aeb861d]
- Updated dependencies [96f92e8]
- Updated dependencies [fdff215]
  - @appspine/plugin-api@1.1.0

## 1.0.1

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.
- Updated dependencies [147d374]
  - @appspine/common@0.3.3

## 1.0.0

### Patch Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).
- Updated dependencies
  - @appspine/common@0.3.0

## 0.5.1

### Patch Changes

- Republish shared audit metadata helpers for app migrations.

## 0.5.0

### Minor Changes

- cc3b30a: Add shared audit metadata and fire-and-forget audit recording helpers, then use them from API key and role controllers.

### Patch Changes

- cc3b30a: Standardize internal Appspine package references on peer dependencies with workspace dev dependencies.

## 0.4.1

### Patch Changes

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1

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
