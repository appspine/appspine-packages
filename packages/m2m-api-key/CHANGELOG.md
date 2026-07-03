# @appspine/m2m-api-key

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
