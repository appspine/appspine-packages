# @appspine/m2m-api-key

## 4.0.5

### Patch Changes

- Updated dependencies [fa55e75]
  - @appspine/auth@6.1.0

## 4.0.4

### Patch Changes

- Updated dependencies [7c9e928]
  - @appspine/common@0.3.2
  - @appspine/audit-log@1.0.0
  - @appspine/auth@6.0.1

## 4.0.3

### Patch Changes

- Updated dependencies [15fc8c4]
  - @appspine/auth@6.0.1

## 4.0.2

### Patch Changes

- Updated dependencies [11fac40]
  - @appspine/auth@6.0.0

## 4.0.1

### Patch Changes

- Updated dependencies
  - @appspine/common@0.3.1
  - @appspine/audit-log@1.0.0
  - @appspine/auth@5.0.0

## 4.0.0

### Minor Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).

### Patch Changes

- Updated dependencies
  - @appspine/common@0.3.0
  - @appspine/audit-log@1.0.0
  - @appspine/auth@5.0.0

## 3.0.4

### Patch Changes

- Updated dependencies
  - @appspine/auth@4.0.2

## 3.0.3

### Patch Changes

- Updated dependencies
  - @appspine/auth@4.0.1

## 3.0.2

### Patch Changes

- Updated dependencies
  - @appspine/auth@4.0.0

## 3.0.1

### Patch Changes

- Updated dependencies [70c7586]
  - @appspine/auth@3.1.0

## 3.0.0

### Patch Changes

- cc3b30a: Add shared audit metadata and fire-and-forget audit recording helpers, then use them from API key and role controllers.
- Updated dependencies [cc3b30a]
- Updated dependencies [cc3b30a]
  - @appspine/audit-log@0.5.0
  - @appspine/auth@3.0.0

## 2.1.3

### Patch Changes

- Updated dependencies [6545ac2]
  - @appspine/auth@2.0.2

## 2.1.2

### Patch Changes

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1
  - @appspine/audit-log@0.4.1
  - @appspine/auth@2.0.1

## 2.1.1

### Patch Changes

- Republish of 2.1.0 -- that version was published with plain `npm publish` instead of
  `pnpm publish`, so its `workspace:*` internal dependency ranges (`@appspine/auth`,
  `@appspine/common`) were never rewritten to real semver and are unusable by external
  consumers. No functional code changes from 2.1.0.

## 2.1.0

### Minor Changes

- 0907ff6: Allow `call` as a scope action word (`resource:call`) alongside the existing `read`/`write`/`*`.
  Added for dev_docs 025's `apps/mcp-gateway` aggregator, whose `call_tool` meta-tool declares
  `requiredScopes: ["gateway:call"]` -- a forwarded tool invocation isn't itself a read or a write
  on the gateway's own resources, so neither existing action word fit. Purely additive: every
  previously-valid scope string is still valid.

## 2.0.0

### Patch Changes

- Updated dependencies [81bd3a5]
  - @appspine/audit-log@0.4.0
  - @appspine/auth@2.0.0

## 1.0.3

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.1.1

## 1.0.2

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.1.0

## 1.0.1

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
  - @appspine/auth@1.0.1

## 1.0.0

### Minor Changes

- Add acting-user identity binding for M2M API keys (`actingUserId` / `isServiceAccount` / `actingApiKeyId`).

  Consuming apps must coordinate this package upgrade with local Prisma fragment and migration updates in the same deployment window. Copy/sync these schema changes before running the upgraded code:

  - `User.isServiceAccount` plus `User.actingApiKeys` relation from `@appspine/auth/prisma/user.prisma`.
  - `ApiKey.actingUserId` plus `ApiKey.actingUser` relation from `@appspine/m2m-api-key/prisma/api-key.prisma`.
  - `AuditLog.actingApiKeyId` snapshot field from `@appspine/audit-log/prisma/audit-log.prisma`.

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.0.0
  - @appspine/audit-log@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies
  - @appspine/common@0.1.1
  - @appspine/audit-log@0.1.1
  - @appspine/auth@0.1.3

## 0.1.2

### Patch Changes

- 8cd6c2a: `ApiKeysController`'s write operations (`create`/`update`/`remove`) now record an `AuditLog` entry via `@appspine/audit-log`'s `AuditLogService`, added as a peer dependency. Same fire-and-forget behavior and actor resolution as `@appspine/auth`'s `UsersController`. The raw API key (only shown once at creation) is never included in the audit payload — only the key's `id` is recorded as `entityId`.
- Updated dependencies [0399175]
  - @appspine/auth@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [382888e]
  - @appspine/auth@0.1.1

## 0.1.0

### Minor Changes

- b742d53: Each package now exports a copyable Prisma schema fragment (`@appspine/auth/prisma/user.prisma`, `@appspine/rbac/prisma/role.prisma`, `@appspine/m2m-api-key/prisma/api-key.prisma`), following the same `package.json#exports` pattern as `auranest/packages/@auranest/backend-core`. Consuming apps copy these into their own `prisma/schema/` folder at scaffold time (Prisma's multi-file schema resolves the cross-file relations between `User`, `Role`, `UserRole`, `RolePermission`, and `ApiKey`). The app must still declare its own `enum Permission` locally, since the permission catalog grows per app.

  Verified the three fragments assemble into a valid schema via `prisma validate` and `prisma generate`.

- 7fe9011: Add the `@appspine/m2m-api-key` package: `ApiKeyGuard` (hashed-key lookup, rate limiting, scope/role attachment to `request.user`), `JwtOrApiKeyGuard` (API key first, falls back to JWT), `ScopeGuard` (`resource:action` scope matching, JWT users unrestricted), `Scopes` decorator, and `ApiKeysService`/`ApiKeysController` (ADMIN-only key CRUD). Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`.

  Scope validation on create/update is format-only (`resource:read|write|*` or `*`) for now — cross-referencing against the app's real scope catalog is deferred until `@appspine/metadata-schema` exists, to avoid a forward dependency.

### Patch Changes

- Updated dependencies [ae73951]
- Updated dependencies [a3b22ec]
- Updated dependencies [b742d53]
  - @appspine/auth@0.1.0
  - @appspine/common@0.1.0
