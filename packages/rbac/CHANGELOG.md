# @appspine/rbac

## 6.0.0

### Major Changes

- 057c121: Complete the v3 legacy-removal milestone: remove the `@appspine/auth` facade workspace,
  capability-specific UI transition exports from `@appspine/frontend-shell`, the provider-specific
  `JwtOrApiKeyGuard`, and the deprecated domain-event webhook helper. RBAC, MCP server, M2M API key,
  and audit-log capability modules are no longer global; feature modules must import the composed
  platform bridge explicitly.

### Patch Changes

- Updated dependencies [057c121]
  - @appspine/frontend-shell@1.0.0
  - @appspine/audit-log@2.0.0

## 6.0.0-canary.0

### Major Changes

- Complete the v3 legacy-removal milestone: remove the `@appspine/auth` facade workspace,
  capability-specific UI transition exports from `@appspine/frontend-shell`, the provider-specific
  `JwtOrApiKeyGuard`, and the deprecated domain-event webhook helper. RBAC, MCP server, M2M API key,
  and audit-log capability modules are no longer global; feature modules must import the composed
  platform bridge explicitly.

### Patch Changes

- Updated dependencies
  - @appspine/frontend-shell@1.0.0-canary.0
  - @appspine/audit-log@2.0.0-canary.0

## 5.0.0

### Major Changes

- 4c0ce5f: Split `@appspine/auth` into provider-neutral identity and OIDC authentication (051 PL1-10, PL1-12,
  PL1-13).

  `@appspine/identity-core` (new) owns the `User` model, Users CRUD, `AdminGuard`, the system role
  constants and the `appspine.identity-store` capability. It no longer queries RBAC's tables: default
  roles and role assignment go through the new `appspine.rbac-policy` capability, and its Prisma
  fragment no longer declares the `userRoles` / `actingApiKeys` relations that RBAC and API keys
  contribute as augmentations. The `password` column is carried but never read.

  `@appspine/oidc-auth` (new) owns JWKS/RS256 verification, the `azp` authorized-party check, the
  delegated (RFC 8693) inbound trust profile, and a new `OidcIdentity` model that keys external
  identity on `(issuer, subject)` instead of the email claim. A login with no mapping links exactly
  one active account with a verified matching email, JIT-provisions when there is none, and refuses an
  inactive account — all through `appspine.identity-store`, never a direct `User` query. It registers
  as the App's single interactive authentication strategy.

  `@appspine/auth` becomes a transition-only compatibility facade: every pre-split export is
  re-exported from its new owner, and `AuthModule` composes the two new modules and stays global.
  New work belongs in the two new packages.

  **This release requires a migration, despite `./prisma/user.prisma` being byte-identical.**
  `AuthModule` now composes `OidcAuthModule`, and every OIDC login reads `OidcIdentity` — so an App
  that upgrades `@appspine/auth` without first creating the `oidc_identities` table loses all
  interactive login. The migration is purely additive (one new table, no change to `users`); see
  `packages/oidc-auth/prisma/migrations/README.md` for the statement and the rollout order.

  The four packages below are `major` because each gained a **required** peer it did not have before:
  `@appspine/plugin-host-nest` for all four, plus `@appspine/identity-core`, `@appspine/oidc-auth` and
  `@appspine/rbac` for `@appspine/auth`. `@appspine/m2m-api-key`'s new `@appspine/rbac` peer is
  declared optional: without an `appspine.rbac-policy` provider the App still boots and `ApiKeyGuard`
  fails closed rather than authorising a permission-less principal.

  `@appspine/rbac` gains `RbacPolicyService` behind the `appspine.rbac-policy` token, takes ownership
  of `buildUserContext` (moved from `@appspine/auth`), and no longer imports the auth package.
  `@appspine/m2m-api-key` validates an acting user through `appspine.identity-store` rather than
  reading the `User` table directly, and `@appspine/mcp-server` takes its request-identity type from
  the host. All packages now export `./package.json`.

### Minor Changes

- 0f24ff4: Migrate RBAC capability package to full plugin model (051 PL4-02).

  - `@appspine/rbac`: declare backend (with `@Global()` compatibility bridge for Phase 4 transition), frontend, prisma, and permissions facets in `appspine.plugin.json` and `./plugin`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`); expand `./plugin` re-exports with stable authorization tokens (`RBAC_POLICY`, `SYSTEM_ADMIN_ROLE`, `SYSTEM_USER_ROLE`), ports (`RbacPolicyPort`, `RoleGrant`, `PrincipalAuthorization`), guards, and services.

### Patch Changes

- af030d3: Complete `@appspine/preset-standard` graph and perform full rollback rehearsal (051 PL4-10).

  - Expand `@appspine/preset-standard` from the Phase 2 pilot (2 plugins) to the full standard capabilities graph (10 plugins: `health-check`, `audit-log`, `identity-core`, `oidc-auth`, `notification`, `rbac`, `m2m-api-key`, `metadata-schema`, `domain-events`, `mcp-server`).
  - Resolve graph dependency cycle between `identity-core` and `rbac`: `identity-core` no longer reverse-depends on `appspine.rbac-policy` in its manifest, adhering to 051 §13 foundation decoupling while retaining optional runtime DI consumption.
  - Augment `facets.prisma.augments` across `rbac` and `m2m-api-key` with explicit relation types (`UserRole[]`, `ApiKey[]`) for clean schema composition.
  - Complete 5-stage automated rehearsal and verification:
    1. Real tarball packaging and clean install on `appspine-app-template` with zero codegen drift and passing dual-mode tests.
    2. Baseline verification of legacy representative app (`wiki`).
    3. Multi-instance connector composition (`@appspine/master-data-client` with `crm` and `erp` instances).
    4. Lifecycle safety verification: plugin disabling / removal produces clean disabled catalogs while guaranteeing Zero Data Drop on database migrations.
    5. Dual-mode legacy switch-back validation (`APPSPINE_PLUGIN_MODE=1` <-> `0`) ensuring zero-migration rollback safety.

- Updated dependencies [4c0ce5f]
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
  - @appspine/audit-log@1.1.0
  - @appspine/plugin-api@1.1.0
  - @appspine/plugin-host-nest@2.0.0
  - @appspine/frontend-shell@0.16.4

## 4.0.8

### Patch Changes

- Updated dependencies [3282f18]
  - @appspine/common@0.3.4
  - @appspine/audit-log@1.0.1
  - @appspine/auth@6.2.2

## 4.0.7

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.
- Updated dependencies [147d374]
  - @appspine/audit-log@1.0.1
  - @appspine/auth@6.2.2
  - @appspine/common@0.3.3

## 4.0.6

### Patch Changes

- Updated dependencies [85ef582]
  - @appspine/auth@6.2.0

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

### Patch Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).
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

## 2.0.2

### Patch Changes

- Updated dependencies [6545ac2]
  - @appspine/auth@2.0.2

## 2.0.1

### Patch Changes

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1
  - @appspine/audit-log@0.4.1
  - @appspine/auth@2.0.1

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

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.0.0
  - @appspine/audit-log@0.2.0

## 0.3.0

### Minor Changes

- `@appspine/common`: extract `toPrismaSortDirection()` from `toPrismaOrderBy()` so callers that need a custom orderBy shape (e.g. a relation `_count` sort) can reuse the same ASC/DESC-to-asc/desc mapping instead of re-implementing it.

  `@appspine/rbac`:

  - `RolesService.findAll()`'s search now also matches the internal `name` field (previously `displayName` only), matching the visible `role.name` text in the admin UI and the search behavior of `UsersService.findAll()`.
  - Every `resolveOrderBy()` branch now appends `name` (which is `@unique`) as a secondary tiebreaker, so paginating a sorted role list no longer risks duplicate/skipped rows when two roles share a `displayName`.
  - Added `RolesService.findOptions()` / `GET /roles/options`: an unpaginated list of all roles (`id`, `name`, `displayName`, `isSystem`), for role-picker UIs that need every role rather than a page of them — `GET /roles` remains paginated and is no longer a suitable source for "all roles" dropdowns now that it enforces `paginationQuerySchema`'s 100-item `limit` cap.

### Patch Changes

- Updated dependencies
  - @appspine/common@0.1.1
  - @appspine/audit-log@0.1.1
  - @appspine/auth@0.1.3

## 0.2.0

### Minor Changes

- `RolesService.findAll()`/`RolesController`'s `GET /roles` now accepts the shared `PaginationQuery` (`page`, `limit`, `search`, `sortField`, `sortOrder`) and returns a `PaginatedResult<Role>` instead of a bare array, matching the pagination contract already used by `@appspine/auth`'s `UsersService` and `@appspine/m2m-api-key`'s `ApiKeysService`. Sortable fields are `displayName`, `userCount`, and `apiKeyCount` (the latter two sort by relation `_count`, which the shared `toPrismaOrderBy()` helper can't express, so they're resolved separately). When no sort is requested, ordering defaults to the previous `isSystem desc, name asc` behavior.

  This changes the `GET /roles` response shape from `Role[]` to `{ data: Role[], total: number }` — a breaking change for any consumer reading the array directly.

## 0.1.2

### Patch Changes

- d6fba5d: `RolesController`'s write operations (`create`/`update`/`replacePermissions`/`remove`) now record an `AuditLog` entry via `@appspine/audit-log`'s `AuditLogService`, added as a peer dependency. Same fire-and-forget behavior and actor resolution as `@appspine/auth`'s `UsersController` (see that package's changelog).
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

- 138717e: Add the `@appspine/rbac` package: `PermissionGuard` (ADMIN bypass → ALLOW_ALL → READ_ALL+`*_READ` → explicit grant), `RequirePermissions` decorator, and `RolesService`/`RolesController` (ADMIN-only Role/Permission CRUD, system roles protected from deletion/self-escalation). Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`.

### Patch Changes

- Updated dependencies [ae73951]
- Updated dependencies [a3b22ec]
- Updated dependencies [b742d53]
  - @appspine/auth@0.1.0
  - @appspine/common@0.1.0
