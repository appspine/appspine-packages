# @appspine/health-check

## 1.0.0

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
- Updated dependencies [6a0e839]
  - @appspine/plugin-api@1.1.0
  - @appspine/plugin-host-nest@2.0.0
  - @appspine/frontend-shell@0.16.4

## 0.1.9

### Patch Changes

- Updated dependencies [3282f18]
  - @appspine/common@0.3.4

## 0.1.8

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.
- Updated dependencies [147d374]
  - @appspine/common@0.3.3

## 0.1.7

### Patch Changes

- 73f1242: Update repository metadata to appspine-packages

## 0.1.6

### Patch Changes

- Updated dependencies [7c9e928]
  - @appspine/common@0.3.2

## 0.1.5

### Patch Changes

- Updated dependencies
  - @appspine/common@0.3.1

## 0.1.4

### Patch Changes

- Updated dependencies
  - @appspine/common@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1

## 0.1.2

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
