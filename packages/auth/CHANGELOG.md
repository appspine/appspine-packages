# @appspine/auth

## 2.0.0

### Patch Changes

- Updated dependencies [81bd3a5]
  - @appspine/audit-log@0.4.0

## 1.1.1

### Patch Changes

- catch Prisma P2003 FK violation on user delete and return a 409 ConflictException instead of an unhandled 500

## 1.1.0

### Minor Changes

- Add `JwtVerifierService.verifyJwtToken()` for non-HTTP JWT verification so WebSocket
  gateways can reuse the same JWT validation flow without changing existing HTTP auth behavior.

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

## 1.0.0

### Minor Changes

- Add acting-user identity binding for M2M API keys (`actingUserId` / `isServiceAccount` / `actingApiKeyId`).

  Consuming apps must coordinate this package upgrade with local Prisma fragment and migration updates in the same deployment window. Copy/sync these schema changes before running the upgraded code:

  - `User.isServiceAccount` plus `User.actingApiKeys` relation from `@appspine/auth/prisma/user.prisma`.
  - `ApiKey.actingUserId` plus `ApiKey.actingUser` relation from `@appspine/m2m-api-key/prisma/api-key.prisma`.
  - `AuditLog.actingApiKeyId` snapshot field from `@appspine/audit-log/prisma/audit-log.prisma`.

### Patch Changes

- Updated dependencies
  - @appspine/audit-log@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies
  - @appspine/common@0.1.1
  - @appspine/audit-log@0.1.1

## 0.1.2

### Patch Changes

- 0399175: `UsersController`'s write operations (`create`/`update`/`updateRoles`/`remove`) now record an `AuditLog` entry via `@appspine/audit-log`'s `AuditLogService`, added as a peer dependency. Recording is fire-and-forget — an audit write failure is logged as a warning but never blocks the business response. Actor resolution handles both JWT users (`actor.email`) and M2M API key callers (`actor.email` is absent, falls back to `api-key:${actor.sub}`).

## 0.1.1

### Patch Changes

- 382888e: Fix `AuthModule` crashing on boot under `AUTH_MODE=local`: both `LocalStrategy` and `OidcStrategy` were unconditionally registered as providers, but `OidcStrategy`'s constructor eagerly validates `OIDC_JWKS_URL` via `jwks-rsa`, which throws synchronously if it's unset — the common case when running in local mode. Only the strategy matching `AUTH_MODE` is now registered.

  Caught by actually booting `appspine-app-template`'s backend against a real Postgres instance after wiring in the `@appspine/*` packages, not just typecheck/lint.

## 0.1.0

### Minor Changes

- ae73951: Add the `@appspine/auth` package: `LocalStrategy`/`OidcStrategy` passport strategies, an `AUTH_MODE`-aware `JwtAuthGuard`, `AdminGuard`, `AuthController` (register/login/me), and `UsersService`/`UsersController`. Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`, with the OIDC permission gap resolved (looks up local RBAC grants by email) and the `/auth/me` guard fixed to match the active `AUTH_MODE`.
- b742d53: Each package now exports a copyable Prisma schema fragment (`@appspine/auth/prisma/user.prisma`, `@appspine/rbac/prisma/role.prisma`, `@appspine/m2m-api-key/prisma/api-key.prisma`), following the same `package.json#exports` pattern as `auranest/packages/@auranest/backend-core`. Consuming apps copy these into their own `prisma/schema/` folder at scaffold time (Prisma's multi-file schema resolves the cross-file relations between `User`, `Role`, `UserRole`, `RolePermission`, and `ApiKey`). The app must still declare its own `enum Permission` locally, since the permission catalog grows per app.

  Verified the three fragments assemble into a valid schema via `prisma validate` and `prisma generate`.

### Patch Changes

- Updated dependencies [a3b22ec]
  - @appspine/common@0.1.0
