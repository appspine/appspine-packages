# @appspine/rbac

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
