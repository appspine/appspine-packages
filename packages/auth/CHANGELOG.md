# @appspine/auth

## 7.0.0

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

### Patch Changes

- Updated dependencies [4c0ce5f]
- Updated dependencies [4c0ce5f]
- Updated dependencies [96f92e8]
- Updated dependencies [af030d3]
- Updated dependencies [0f24ff4]
  - @appspine/identity-core@2.0.0
  - @appspine/oidc-auth@2.0.0
  - @appspine/rbac@5.0.0
  - @appspine/plugin-host-nest@2.0.0

## 6.2.2

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.
- Updated dependencies [147d374]
  - @appspine/audit-log@1.0.1
  - @appspine/common@0.3.3

## 6.2.1

### Patch Changes

- Await successful OIDC JIT-provisioning audit writes so the request cannot report success before
  its audit record has been durably attempted.

## 6.2.0

### Minor Changes

- 85ef582: Harden OIDC delegation configuration and token validation. Delegation now requires secure
  issuer, JWKS, and token endpoint URLs unless HTTP is explicitly enabled for isolated
  development; validates policy/profile bounds and immutable configuration; enforces provider
  access-token type and policy TTL; isolates circuit breakers per policy; and bounds inbound
  security rejection logs.

  Treat missing `email_verified` as unverified, reject future-issued delegated tokens, accept the
  RFC 9068 `at+jwt` JOSE type, default delegated provisioning to `never`, and audit successful JIT
  user creation without making authentication depend on audit availability.

## 6.1.0

### Minor Changes

- fa55e75: Add an independent, endpoint-scoped delegated (Token Exchange) inbound trust profile for
  042-oidc-delegation-package-plan.md — a target app (e.g. Approve) can now accept a short-lived
  delegated access token minted by `@appspine/oidc-delegation` on behalf of the original
  end user, in addition to that user's own tokens.

  - **Purely additive.** `AuthModule` and `OidcStrategy` are unchanged; a consumer that never
    imports `DelegatedAuthModule` sees no behavior or startup change. Requires Keycloak 26.2+
    (Standard Token Exchange V2) on the source app's side; this package only verifies tokens,
    it doesn't require any Keycloak version itself.
  - **Endpoint-scoped, not global.** A delegated token is only accepted on a handler explicitly
    decorated with `@DelegatedProfile('profile-name')`; there is no app-wide switch. The same
    token is rejected by every other endpoint, including general login's own `/auth/me`.
  - **No caller-controlled trust parameters.** Which source clients, audiences, and scopes are
    accepted comes entirely from the `DelegatedOidcTrustProfile` you configure server-side —
    never from the request.
  - **`provisioning: 'never'` by default.** A delegated caller with no matching local `User` is
    rejected with a generic 401 and no row is created — delegated auth bypasses the per-client
    IdP access check general login relies on, so it must not silently provision an account for
    someone never granted access to this app.
  - **No refresh tokens, no token cache** on the inbound side (nothing to cache — every request
    is verified fresh). Residual bearer-token risk (replay within the token's short TTL if
    intercepted) is unchanged from general OIDC bearer tokens and is documented in
    `@appspine/oidc-delegation`'s README, which mints these tokens.

  See `packages/auth/README.md` ("Delegated (Token Exchange) inbound trust profile") for
  configuration, the `provisioning: 'never'` vs `'jit'` tradeoff, Guard composition guidance
  (do not fold into `@appspine/m2m-api-key`'s `JwtOrApiKeyGuard`), and the emergency-disable
  procedure.

## 6.0.1

### Patch Changes

- 15fc8c4: Harden the `azp` authorized-party check added in 6.0.0: read the claim via
  `hasOwnProperty` instead of plain property access (defense against prototype
  pollution), and include the expected and received `azp` values in the
  rejection log so a real cross-app token replay is distinguishable from a
  local `OIDC_AUDIENCE` misconfiguration. No behavior change for valid or
  already-rejected tokens — this only affects what gets logged and closes a
  theoretical (currently unreachable) bypass path.

## 6.0.0

### Major Changes

- 11fac40: Reject OIDC tokens whose authorized party (`azp`) claim is missing, invalid, or does not match the configured application audience.

## 5.0.0

### Patch Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).
- Updated dependencies
  - @appspine/common@0.3.0
  - @appspine/audit-log@1.0.0

## 4.0.2

### Patch Changes

- Fix three issues surfaced by a post-completion security review of the 035 OIDC-only auth migration:

  - `OidcStrategy` and `JwtVerifierService` now throw at construction (fail fast at boot) if `OIDC_ISSUER`/`OIDC_AUDIENCE` (and `OIDC_JWKS_URL` for `OidcStrategy`) are unset. Previously `jsonwebtoken`/`passport-jwt` silently skip the issuer/audience check when either option is `undefined` — combined with JIT provisioning removing the "a local User must already exist" safety net, an unset `OIDC_AUDIENCE` would have let a token minted for any client in the same Keycloak realm auto-provision into the app.
  - `buildOidcJwtUser` now rejects a token whose `email_verified` claim is explicitly `false`, since identity is keyed purely on the email claim.
  - `UsersService.create()` now converts a Prisma `P2002` unique-constraint violation (the DB-level race two truly concurrent JIT-provisioning calls for the same new email can hit) into the same `ConflictException` the pre-check `findUnique` path already throws — previously only the pre-check path was normalized, so a genuine concurrent race surfaced as an unhandled 500 instead of the intended "re-fetch and continue" recovery in `JwtVerifierService.provisionOidcUser`.

## 4.0.1

### Patch Changes

- Remove `JwtModule`/`JWT_SECRET` local-auth infra (dev_docs/framework/035 T-12645). OIDC is
  now the sole auth strategy across all apps, and nothing in the package read the registered
  `JwtModule`/`resolveJwtSecret()` outside the local login/register flow removed in T-12510 —
  deleted both, and dropped the now-unused `@nestjs/jwt` peer dependency. `bcrypt` stays: it's
  still used by `POST /users`'s optional break-glass account password.

## 4.0.0

### Major Changes

- Local auth is retired — OIDC is now the sole identity source (dev_docs/framework/035).

  Breaking changes:

  - Removed `/auth/register` and `/auth/login` endpoints, `LocalStrategy`, and the
    `registerSchema`/`loginSchema`/`RegisterDto`/`LoginDto` exports. `AuthController` now
    only exposes `GET /auth/me`.
  - `JwtAuthGuard` always uses the OIDC passport strategy (`jwt-oidc`); `AUTH_MODE` no
    longer changes which strategy is registered.
  - `JwtVerifierService.verifyJwtToken` always verifies against the configured OIDC JWKS.
    `OIDC_JWKS_URL`/`OIDC_ISSUER`/`OIDC_AUDIENCE` must be set for the app to boot.

  Non-breaking additions:

  - `JwtVerifierService.buildOidcJwtUser` now does JIT (just-in-time) provisioning: the
    first OIDC login for an email with no local `User` auto-creates one with the default
    `USER` role, instead of rejecting with 401.
  - `UsersService.create()` and `POST /users` (`createUserSchema`) no longer require a
    `password` — nullable in the schema, optional in the API.

## 3.1.0

### Minor Changes

- 70c7586: Add a nullable, unique `employeeNumber` field to the `User` model — the
  cross-app link key consuming apps use to look up their canonical person
  record in `apps/org` (Enterprise Master Data). Backward compatible: existing
  rows default to `null`, and apps that don't need org context can ignore the
  field entirely.

## 3.0.0

### Patch Changes

- cc3b30a: Standardize internal Appspine package references on peer dependencies with workspace dev dependencies.
- Updated dependencies [cc3b30a]
- Updated dependencies [cc3b30a]
  - @appspine/audit-log@0.5.0

## 2.0.2

### Patch Changes

- 6545ac2: Fail loud instead of silently falling back to a hardcoded `'dev-secret'` when `JWT_SECRET` is unset. Under `AUTH_MODE=local` (the default) this now throws at startup; `AUTH_MODE=oidc` deployments are unaffected.

## 2.0.1

### Patch Changes

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1
  - @appspine/audit-log@0.4.1

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
