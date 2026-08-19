# @appspine/m2m-api-key

## 6.0.0

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

- 0d61e29: Migrate Machine-to-Machine API Keys capability package to full plugin model (051 PL4-03).

  - `@appspine/m2m-api-key`: implement `ApiKeyMachineStrategy` satisfying host `AuthenticationStrategy` and register with `AuthenticationStrategyRegistry` on module init; implement `ScopeMatcherService` and export `SCOPE_MATCHER` token; declare backend (with `@Global()` compatibility bridge for Phase 4 transition), frontend, prisma, and permissions facets in `appspine.plugin.json` and `./plugin`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`); mark `JwtOrApiKeyGuard` as deprecated in favor of host neutral `AppspineAuthGuard`.

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
- Updated dependencies [af030d3]
- Updated dependencies [0f24ff4]
- Updated dependencies [6a0e839]
  - @appspine/rbac@5.0.0
  - @appspine/audit-log@1.1.0
  - @appspine/plugin-api@1.1.0
  - @appspine/plugin-host-nest@2.0.0
  - @appspine/frontend-shell@0.16.4

## 5.0.0

### Major Changes

- 3282f18: Security audit fixes across the shared framework packages.

  **BREAKING (`@appspine/m2m-api-key`)** — `ScopeGuard` now fails **closed** for API-key
  principals. Previously, a route with no `@Scopes()` metadata reachable on either the handler
  or the controller class returned `true`, so adding a handler to a `ScopeGuard`-protected
  controller without a `@Scopes()` decorator silently granted every API key full access to it.
  API-key callers are now rejected with 403 when no scope requirement is declared at all; JWT
  callers are unaffected (scopes have never applied to them). Every M2M-reachable route must
  now carry an explicit `@Scopes(...)` on the handler or the controller class. Note that
  `@Scopes('*')` is not an "any key" escape hatch — `matchScope` requires the key to actually
  hold the `*` wildcard scope for that to pass.

  - `@appspine/common`: `LoggingModule` now redacts `req.headers.cookie` and
    `res.headers["set-cookie"]` (consuming apps run CORS with `credentials: true`, so session
    cookies were reaching plaintext logs), plus `proxy-authorization`,
    `x-appspine-signature`, and the common token-bearing body fields.
  - `@appspine/common`: `GlobalExceptionFilter` now validates `X-Request-Id` against
    `/^[A-Za-z0-9._-]{1,64}$/` before using it as the trace id, falling back to a generated
    UUID. An embedded newline previously let a caller forge whole log lines and reflect
    arbitrary content into the JSON error body.
  - `@appspine/integration-contracts`: `resolveSafeDestination()` now expands IPv6 literals
    before classifying them. Loopback and unique-local addresses written in a non-canonical
    form (`0:0:0:0:0:0:0:1`, `fc00:0:0:0:0:0:0:1`) bypassed the string-prefix blocklist
    entirely. Also blocks NAT64 (`64:ff9b::/96`), 6to4 (`2002::/16`), Teredo, and the
    `192.88.99.0/24` 6to4 relay anycast range.
  - `@appspine/domain-events`: `postDomainEventWebhook` (v1) now applies the same
    `resolveSafeDestination()` guard `postDomainEventWebhookV2` uses and pins the connection to
    the validated address, closing an SSRF primitive against an admin-supplied destination URL.
    It takes an optional `destinationPolicy` and is marked `@deprecated` in favour of v2.
  - `@appspine/frontend-shell`: admin request helpers now `encodeURIComponent()` ids
    interpolated into fetch paths, so an id containing `../` or `?` can no longer retarget the
    request at a different API route.

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

### Minor Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).

### Patch Changes

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

## 2.1.3

### Patch Changes

- Updated dependencies [6545ac2]
  - @appspine/auth@2.0.2

## 2.1.2

### Patch Changes

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1
  - @appspine/audit-log@0.4.1
  - @appspine/auth@2.0.1

## 2.1.1

### Patch Changes

- Republish of 2.1.0 -- that version was published with plain `npm publish` instead of
  `pnpm publish`, so its `workspace:*` internal dependency ranges (`@appspine/auth`,
  `@appspine/common`) were never rewritten to real semver and are unusable by external
  consumers. No functional code changes from 2.1.0.

## 2.1.0

### Minor Changes

- 0907ff6: Allow `call` as a scope action word (`resource:call`) alongside the existing `read`/`write`/`*`.
  Added for dev_docs 025's `apps/mcp-gateway` aggregator, whose `call_tool` meta-tool declares
  `requiredScopes: ["gateway:call"]` -- a forwarded tool invocation isn't itself a read or a write
  on the gateway's own resources, so neither existing action word fit. Purely additive: every
  previously-valid scope string is still valid.

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
