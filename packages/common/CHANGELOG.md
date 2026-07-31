# @appspine/common

## 0.3.0

### Minor Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).

## 0.2.1

### Patch Changes

- 33aa41f: Reduce domain-event dispatcher database work with bulk stale-lock reclamation and skip empty or duplicate delivery fan-out writes. Improve shared admin-table rendering by indexing service accounts once, tighten sortable-link component types, and align the pagination helper type with its existing default behavior.

## 0.2.0

### Minor Changes

- Add MCP acting-user context and AuditAction RESTORE/MOVE for wiki app prerequisites.

  Consumers of `@appspine/audit-log` must also update their Prisma schema fragment: the `AuditAction` enum now includes `RESTORE` and `MOVE`. The fragment is not synchronized automatically through the npm package.

## 0.1.1

### Patch Changes

- `@appspine/common`: extract `toPrismaSortDirection()` from `toPrismaOrderBy()` so callers that need a custom orderBy shape (e.g. a relation `_count` sort) can reuse the same ASC/DESC-to-asc/desc mapping instead of re-implementing it.

  `@appspine/rbac`:

  - `RolesService.findAll()`'s search now also matches the internal `name` field (previously `displayName` only), matching the visible `role.name` text in the admin UI and the search behavior of `UsersService.findAll()`.
  - Every `resolveOrderBy()` branch now appends `name` (which is `@unique`) as a secondary tiebreaker, so paginating a sorted role list no longer risks duplicate/skipped rows when two roles share a `displayName`.
  - Added `RolesService.findOptions()` / `GET /roles/options`: an unpaginated list of all roles (`id`, `name`, `displayName`, `isSystem`), for role-picker UIs that need every role rather than a page of them — `GET /roles` remains paginated and is no longer a suitable source for "all roles" dropdowns now that it enforces `paginationQuerySchema`'s 100-item `limit` cap.

## 0.1.0

### Minor Changes

- a3b22ec: Add the `@appspine/common` package: `GlobalExceptionFilter`, `ZodValidationPipe`, pagination helpers, `PermissionPolicy`/`AuditAction` enums, `PrismaModule`/`PrismaService` (resolves `@prisma/client` from the consuming app), and `LoggingModule`. Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`.
