# @appspine/domain-events

## 0.1.1

### Patch Changes

- Fix `checkDomainEventSchemaDrift()`'s `DomainEventDatamodel`/`DmmfModel`/`DmmfEnum` types to accept readonly arrays, matching `@prisma/client`'s actual `Prisma.dmmf.datamodel` shape (`ReadonlyDeep`). Without this, passing the real DMMF failed to typecheck in a consuming app (found while wiring apps/approve's drift-check script in T-11010).

## 0.1.0

### Minor Changes

- 2585bb8: Add `@appspine/domain-events`: transaction-bound domain event recording (`DomainEventsService.record()`), a handler registry with code-registered and data-driven (contributor) routing, a poll-based dispatcher with retry/backoff/dead-letter/stale-lock reclaim, `diffChangedFields()`, reusable test doubles under `@appspine/domain-events/testing`, and a documented `DomainEvent`/`DomainEventDelivery` Prisma model pattern (`docs/prisma-model.md`) with a DMMF-based drift-check (`checkDomainEventSchemaDrift()`) instead of an injected schema fragment.

  Extracted from `apps/approve` per plan 026 §11.1's extraction gate (all seven gates passed, see `dev_docs/appendixes/026-t-10970-gate-review.md`). App-specific pieces (event constants, handlers, webhook subscriptions, admin API/UI, Prisma schema file) stay app-local.
