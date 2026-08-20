# @appspine/domain-events

## 10.0.0-canary.0

### Major Changes

- Complete the v3 legacy-removal milestone: remove the `@appspine/auth` facade workspace,
  capability-specific UI transition exports from `@appspine/frontend-shell`, the provider-specific
  `JwtOrApiKeyGuard`, and the deprecated domain-event webhook helper. RBAC, MCP server, M2M API key,
  and audit-log capability modules are no longer global; feature modules must import the composed
  platform bridge explicitly.

### Patch Changes

- Updated dependencies
  - @appspine/frontend-shell@1.0.0-canary.0

## 9.0.0

### Minor Changes

- 0eaf69d: Migrate Domain Events capability package to full plugin model (051 PL4-05).

  - `@appspine/domain-events`: declare all 5 facets (backend, frontend, prisma, permissions, operations) in `appspine.plugin.json` and `./plugin`; create `prisma/domain-events.prisma` schema fragment and compute LF-normalized sha256 digest; implement `DomainEventsAdminGuard` injecting `@appspine/plugin-api`'s `SCOPE_MATCHER` port; refactor `DomainEventsAdminController` to use neutral `AppspineAuthGuard` and `DomainEventsAdminGuard` with strict fail-closed authorization; introduce `DomainEventsModule` standard capability module providing `DomainEventRegistry`, `DomainEventsService`, `DOMAIN_EVENTS` token, and `DomainEventDispatcherService`; decouple `DomainEventsAdminModule` and dependencies/tsconfig references from concrete `@appspine/auth` and `@appspine/m2m-api-key`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `DomainEventsPort` and `RecordDomainEventPortInput` interfaces to `./ports`.

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

## 8.0.0

### Minor Changes

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
  - @appspine/m2m-api-key@5.0.0
  - @appspine/integration-contracts@0.4.0
  - @appspine/common@0.3.4
  - @appspine/auth@6.2.2

## 7.1.5

### Patch Changes

- Mark admin-only auth and API-key peers as optional so consumers of the core domain-events entrypoint do not need to install admin dependencies.

## 7.1.4

### Patch Changes

- Limit concurrent-receipt recovery to unique conflicts raised by the receipt insert, so business
  transaction errors are never mistaken for a duplicate delivery.

## 7.1.3

### Patch Changes

- Harden pinned contract enforcement, Webhook v2 raw-body and capability-digest verification,
  production destination policy, absolute request deadlines, receipt transactions, and dispatcher
  lease ownership.
- Updated dependencies
  - @appspine/integration-contracts@0.3.1

## 7.1.2

### Patch Changes

- Include the pinned capability digest in the Prisma receipt model, migration, documentation, and
  schema-drift gate.

## 7.1.1

### Patch Changes

- Publish the runtime dependency on `@appspine/integration-contracts` as a concrete registry
  version so clean consumers never receive an unresolved `workspace:*` dependency.

## 7.1.0

### Minor Changes

- Resolve and validate integration payloads against a pinned capability contract, persist its digest,
  bind webhook envelope fields to signed headers, and add transactional receipt contract checks.
- Make production webhook delivery HTTPS/allowlist-only with DNS-rebinding protection, and keep
  disabled bindings pending without consuming retry attempts.
- Add the cross-app integration receipt migration and keep generated Prisma/schema drift checks in
  sync.

## 7.0.0

### Breaking Changes

- Add frozen integration metadata and payload digest fields to `DomainEventRecord`.
- Add Webhook v2 sender/receiver helpers, retry taxonomy, binding kill-switch callback and consumer receipt transaction helper.
- Consumers must regenerate the Prisma DomainEvent model with the nullable integration columns before upgrading.

## 6.0.0

### Patch Changes

- Updated dependencies [fa55e75]
  - @appspine/auth@6.1.0
  - @appspine/m2m-api-key@4.0.5

## 5.0.0

### Patch Changes

- Updated dependencies [11fac40]
  - @appspine/auth@6.0.0
  - @appspine/m2m-api-key@4.0.2

## 4.0.0

### Patch Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).
- Updated dependencies
  - @appspine/common@0.3.0
  - @appspine/auth@5.0.0
  - @appspine/m2m-api-key@4.0.0

## 3.0.0

### Patch Changes

- Updated dependencies
  - @appspine/auth@4.0.0
  - @appspine/m2m-api-key@3.0.2

## 2.0.0

### Patch Changes

- Updated dependencies [70c7586]
  - @appspine/auth@3.1.0
  - @appspine/m2m-api-key@3.0.1

## 1.0.0

### Minor Changes

- cc3b30a: Add shared domain-event webhook payload, redaction, signature, and posting helpers.

### Patch Changes

- cc3b30a: Standardize internal Appspine package references on peer dependencies with workspace dev dependencies.
- Updated dependencies [cc3b30a]
- Updated dependencies [cc3b30a]
  - @appspine/m2m-api-key@3.0.0
  - @appspine/auth@3.0.0

## 0.2.4

### Patch Changes

- Updated dependencies [6545ac2]
  - @appspine/auth@2.0.2
  - @appspine/m2m-api-key@2.1.3

## 0.2.3

### Patch Changes

- edc32a1: Fix domain event admin review findings: restrict retry/ignore mutations to dead-letter deliveries, add an optional admin audit hook, split unresolved delivery keys from data-driven catalog entries, make date upper bounds inclusive by day, strengthen schema/subscriber drift checks, and surface unresolved catalog rows in the shared frontend table.

## 0.2.2

### Patch Changes

- Fix `DomainEventsAdminModule.forRoot()` again: `JwtOrApiKeyGuard` (referenced by class in
  `@UseGuards()`) is itself a provider owned by `@appspine/m2m-api-key`'s `ApiKeysModule`, and
  Nest resolves an enhancer referenced by class through the module that declares it — so
  `JwtOrApiKeyGuard`'s own constructor deps must be visible to `ApiKeysModule`'s resolution
  scope, not just to the consuming `DomainEventsAdminModule`. `ApiKeyGuard` (also owned by
  `ApiKeysModule`) resolved fine after the previous patch, but `JwtAuthGuard` (owned by
  `@appspine/auth`'s `AuthModule`) still failed, because `ApiKeysModule` itself never imports
  `AuthModule` — `@Global()` makes a module's exports available to other modules' own
  constructor injection, it does not make one global module see another's exports on its own.
  `forRoot()` now imports `AuthModule` too, and the package gains `@appspine/auth` as a direct
  dependency (already a transitive dependency of `@appspine/m2m-api-key`/`@appspine/rbac`).

## 0.2.1

### Patch Changes

- Fix `DomainEventsAdminModule.forRoot()`: `JwtOrApiKeyGuard` (used in the controller's
  `@UseGuards()`) needs `ApiKeyGuard` resolvable within the dynamic module's own scope even
  though `@appspine/m2m-api-key`'s `ApiKeysModule` is `@Global()` — a globally-registered
  module's exports aren't automatically visible to a dynamically-constructed module's own
  guard instantiation. Discovered via a real NestJS bootstrap failure
  (`UnknownDependenciesException`) while wiring this into `apps/approve` (dev_docs 028
  T-11230), not caught by the unit tests added in T-11210 since those never actually
  bootstrap a Nest application.

## 0.2.0

### Minor Changes

- Add declarative domain-event subscriptions (`@DomainEventSubscriber` decorator,
  `registerDomainEventSubscribers()`, `DomainEventRegistry.describe()`), a shared
  `@appspine/domain-events/admin` NestJS module (catalog + list/detail + retry/ignore
  endpoints, shipped as a second package entry point so lightweight consumers never pull
  in the auth guard chain), and matching `@appspine/frontend-shell` admin components
  (`DomainEventsTable`, `DomainEventDetailPanel`, `DomainEventDeliveriesPanel`,
  `DomainEventCatalogTable`).

## 0.1.2

### Patch Changes

- 33aa41f: Reduce domain-event dispatcher database work with bulk stale-lock reclamation and skip empty or duplicate delivery fan-out writes. Improve shared admin-table rendering by indexing service accounts once, tighten sortable-link component types, and align the pagination helper type with its existing default behavior.
- 66e6990: Guard `DomainEventDispatcherService`'s completion writes (PROCESSED/IGNORED/DEAD_LETTER/PENDING) on the delivery still being `PROCESSING`, using `updateMany` instead of an unconditional `update` by id. Closes a race where an admin action (retry/ignore) that reassigns a delivery mid-flight could get silently clobbered by the worker's own completion write once its handler settled — the same defense apps/approve's admin service already applies on its side of this race.

  Fixes `@appspine/domain-events/testing` failing to resolve for consumers whose `tsconfig.json` uses classic (`node`/`node10`) `moduleResolution`, which never consults `package.json`'s `exports` map. Adds root-level `testing.js`/`testing.d.ts` shim files (re-exporting `./dist/testing`) so that resolution strategy finds the subpath directly, alongside the existing `exports` entry that already serves modern resolvers.

- Updated dependencies [33aa41f]
  - @appspine/common@0.2.1

## 0.1.1

### Patch Changes

- Fix `checkDomainEventSchemaDrift()`'s `DomainEventDatamodel`/`DmmfModel`/`DmmfEnum` types to accept readonly arrays, matching `@prisma/client`'s actual `Prisma.dmmf.datamodel` shape (`ReadonlyDeep`). Without this, passing the real DMMF failed to typecheck in a consuming app (found while wiring apps/approve's drift-check script in T-11010).

## 0.1.0

### Minor Changes

- 2585bb8: Add `@appspine/domain-events`: transaction-bound domain event recording (`DomainEventsService.record()`), a handler registry with code-registered and data-driven (contributor) routing, a poll-based dispatcher with retry/backoff/dead-letter/stale-lock reclaim, `diffChangedFields()`, reusable test doubles under `@appspine/domain-events/testing`, and a documented `DomainEvent`/`DomainEventDelivery` Prisma model pattern (`docs/prisma-model.md`) with a DMMF-based drift-check (`checkDomainEventSchemaDrift()`) instead of an injected schema fragment.

  Extracted from `apps/approve` per plan 026 §11.1's extraction gate (all seven gates passed, see `dev_docs/appendixes/026-t-10970-gate-review.md`). App-specific pieces (event constants, handlers, webhook subscriptions, admin API/UI, Prisma schema file) stay app-local.
