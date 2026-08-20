# @appspine/oidc-auth

## 2.0.2-canary.0

### Patch Changes

- Accept the v3 frontend-shell major while retaining compatibility with the final v2 transition
  release. This lets the canary fleet consume the new shell without peer-dependency conflicts.

## 2.0.0

### Minor Changes

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
