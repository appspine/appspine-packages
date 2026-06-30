# @appspine/auth

## 0.1.0

### Minor Changes

- ae73951: Add the `@appspine/auth` package: `LocalStrategy`/`OidcStrategy` passport strategies, an `AUTH_MODE`-aware `JwtAuthGuard`, `AdminGuard`, `AuthController` (register/login/me), and `UsersService`/`UsersController`. Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`, with the OIDC permission gap resolved (looks up local RBAC grants by email) and the `/auth/me` guard fixed to match the active `AUTH_MODE`.
- b742d53: Each package now exports a copyable Prisma schema fragment (`@appspine/auth/prisma/user.prisma`, `@appspine/rbac/prisma/role.prisma`, `@appspine/m2m-api-key/prisma/api-key.prisma`), following the same `package.json#exports` pattern as `auranest/packages/@auranest/backend-core`. Consuming apps copy these into their own `prisma/schema/` folder at scaffold time (Prisma's multi-file schema resolves the cross-file relations between `User`, `Role`, `UserRole`, `RolePermission`, and `ApiKey`). The app must still declare its own `enum Permission` locally, since the permission catalog grows per app.

  Verified the three fragments assemble into a valid schema via `prisma validate` and `prisma generate`.

### Patch Changes

- Updated dependencies [a3b22ec]
  - @appspine/common@0.1.0
