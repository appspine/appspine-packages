# @appspine/rbac

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
