# @appspine/domain-events

## 7.0.0

### Patch Changes

- Updated dependencies [85ef582]
  - @appspine/auth@6.2.0
  - @appspine/m2m-api-key@4.0.6

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
