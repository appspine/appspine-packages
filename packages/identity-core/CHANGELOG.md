# @appspine/identity-core

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

- 96f92e8: Migrate notification capability package to full plugin model (051 PL4-01).

  - `@appspine/notification`: declare backend, prisma, operations, frontend, and permissions facets in `appspine.plugin.json` and `./plugin`; export `NotificationModule` binding `NotificationService` to `NOTIFICATION_INBOX`; ship `prisma/notification.prisma` with schema digest and User model augmentation; implement full 4-stage lifecycle (`validate` -> `register` -> `ready` -> `shutdown`) and resource cleanup registry.
  - `@appspine/plugin-api`: define `NotificationInboxPort` and related types in `ports.ts`.
  - `@appspine/identity-core`: declare `notification` plugin as authorized augmenter of `User.notifications` relation in `augmentedBy`.

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
