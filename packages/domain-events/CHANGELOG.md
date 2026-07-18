# @appspine/domain-events

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
