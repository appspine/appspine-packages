---
type: topic
scope: cross-repo
status: superseded
supersedes: null
superseded_by: 026-domain-events-approve-plan
created: 2026-07-16
updated: 2026-08-05
---

# Z20 - Domain Events and Transaction-bound Outbox
> 註：本檔編號與已封存的 `_archive/future-plans-Z20-20260722/Z20-master-data-client-package-plan.md`（app-master-data 舊構想）衝突，本檔為 domain-events 的 Z20，兩者無關。

> Status: Promoted to formal plan `_archive/dev_docs-20260803/domain-events/026-domain-events-approve-plan.md` (2026-07-17) — the approve vertical slice (Z20 Phases 1–3) is planned there; this document remains the design reference for the overall mechanism, package extraction (Phase 4), and cross-app relay (Phase 5).
> This plan defines a data-driven, subscribable event mechanism for appspine apps. The core design is explicit domain events written inside the same database transaction as the business change, then dispatched asynchronously through an outbox worker.
>
> Revised 2026-07-17 after reviewing the plan against the shipped `apps/approve` code: added the synchronous-core boundary rule (§2), event ordering via `seq` and payload versioning (§5), dispatcher runtime/claiming/lock-reclaim decisions (§9), delivery-row tracking as the default (§9), the notification responsibility boundary (§10), a scope note on workflow integration (§12), reworked approve triggers around derived effects only (§18), and recommendations for each open question (§19). The notification boundary was aligned to formal plan 041 on 2026-08-05.
>
> Second revision, same day: v1 subscriptions are code-registered, with a narrow webhook table as the only data-driven routing (§8); the event table is now an immutable fact log and all queue state moved to delivery rows (§5, §9, §11); added a build-vs-adopt evaluation of graphile-worker / pg-boss for dispatch mechanics (§9).

---

## 1. Problem

Many appspine workflows need to react to data changes:

- an approval request is submitted
- a project task status changes
- a document is uploaded or replaced
- a calendar event is rescheduled
- a wiki page is published
- a master-data record changes and downstream apps need to refresh snapshots

The important requirement is not only "something was updated". The system often needs to know:

- which aggregate changed
- which fields changed
- what the old and new values were
- who caused the change
- whether the change happened inside a larger workflow
- which subscribers should react
- whether follow-up actions succeeded, failed, or need retry

Prisma middleware or Prisma Client extensions can help observe writes, but they are not sufficient as the core event system. They do not reliably capture business intent, they are weak for `updateMany` / nested writes, and they only observe writes made through Prisma Client.

The event mechanism should therefore be explicit at the service/domain layer, with a transaction-bound outbox as the reliability boundary.

---

## 2. Design Principle

Core rule:

```text
Business data change and domain event insert must commit or roll back together.
```

The application should not publish directly to a queue or workflow engine during the request transaction. Instead:

1. The service updates business data.
2. The service records one or more explicit domain events in the same Prisma transaction.
3. A dispatcher worker reads pending events from the outbox table.
4. Subscribers handle events asynchronously.
5. Delivery state, retries, and failures are persisted.

This avoids the common failure mode:

```text
Database row updated successfully.
Event publish failed.
Workflow never starts.
```

It also avoids the opposite failure mode:

```text
Event was published.
Database transaction rolled back.
Subscriber reacts to a change that never committed.
```

The first failure mode is not hypothetical in appspine. In `apps/approve`, every action's audit record is written by `recordAudit()` **after** the `$transaction` commits. A crash between the commit and the audit write silently drops the audit record — exactly the failure mode above, with the audit log playing the role of the "event". A transaction-bound outbox closes this gap.

### Second boundary rule: synchronous core, asynchronous derived effects

```text
Core state machine transitions stay synchronous inside the business transaction.
Domain events carry derived side effects only.
```

This rule comes from how `apps/approve` already works. `submit()` creates the approval instance, activates the first step, and updates the business entity status in one transaction; `tryAdvanceStep` advances steps synchronously under an atomic version lock (Z15); in-app notifications are already written inside the same transaction. That synchronous core is correct, race-protected, and gives the user immediate read-your-writes behavior. Moving it behind an async dispatcher would be a regression: the submitter could not see the instance right after submitting, the approver could not see the next step activate, and the Z15 concurrency protection would have to be re-invented in the dispatcher.

Domain events are for effects where the source does not need the result in the same request: notifications, webhooks, cross-app relay, audit enrichment, read-model refresh, and starting workflows in a *future standalone* workflow engine (§12).

---

## 3. Non-goals

This plan is not:

- a distributed event streaming platform
- a Kafka replacement
- a cross-app global message bus as the first step
- a transparent Prisma hook that magically understands every business rule
- a workflow engine by itself

The initial target is app-local, reliable domain events. Cross-app relay can be added later through MCP gateway, webhook delivery, or a dedicated integration package.

---

## 4. App-local First

Each business app keeps its own database and deployment lifecycle. The domain event table should live inside each app database:

```text
apps/approve DB -> domain_events
apps/project DB -> domain_events
apps/wiki DB -> domain_events
apps/drive DB -> domain_events
```

This preserves appspine's existing architecture:

- no shared central transaction database
- no cross-database foreign keys
- no required central admin service
- each app owns its own business records and event history

Shared behavior should be packaged as:

```text
@appspine/domain-events
```

The package provides model fragments, helpers, dispatcher contracts, matching utilities, and optional NestJS modules. The app still owns the tables and operational behavior.

Important sequencing decision:

```text
Do not create @appspine/domain-events first.
Prove the pattern inside one real app, then extract the stable pieces.
```

Reasoning:

- the event schema boundary is not stable until a real domain validates it
- dispatcher responsibility is easy to over-abstract too early
- workflow triggers are business semantics, not generic Prisma write hooks
- shared package API churn would force unnecessary downstream package releases
- appspine already has non-trivial shared package version cascade costs

Extraction should happen only after an app-local vertical slice has proven:

- business update and event insert commit atomically
- `before`, `after`, and `changedFields` are sufficient for subscribers
- at least a few real event types are represented without awkward special cases
- retry, dead-letter, and idempotency behavior are implemented
- a second app could adopt the core API without changing it immediately

---

## 5. Data Model

Suggested MVP model:

```prisma
model DomainEvent {
  id             String    @id @default(cuid())
  seq            BigInt    @unique @default(autoincrement())
  aggregateType  String    @map("aggregate_type")
  aggregateId    String    @map("aggregate_id")
  eventType      String    @map("event_type")
  operation      String
  schemaVersion  Int       @default(1) @map("schema_version")

  actorUserId    String?   @map("actor_user_id")
  actorApiKeyId  String?   @map("actor_api_key_id")
  correlationId  String?   @map("correlation_id")
  workflowId     String?   @map("workflow_id")

  before         Json?
  after          Json?
  changedFields  String[]  @map("changed_fields")
  metadata       Json?

  createdAt      DateTime  @default(now()) @map("created_at")

  deliveries     DomainEventDelivery[]

  @@index([aggregateType, aggregateId])
  @@index([eventType])
  @@index([workflowId])
  @@map("domain_events")
}
```

`domain_events` rows are **immutable**: INSERT only, never UPDATE. The table carries no processing state — all queue fields (`status`, `attempts`, `lockedAt`, ...) live on the delivery rows defined in §9. Keeping queue state on the event row *and* on delivery rows would be double bookkeeping: the same processing state recorded in two places, kept consistent only by hand-written synchronization logic of exactly the concurrency-sensitive kind Z15 warned about. An immutable event table also means admin/report queries never contend with dispatcher locks, replay is safe by construction, and the table doubles as a trustworthy audit source.

Convention note: `operation` above (and the delivery `status` in §9) are shown as `String` only for brevity. The real implementation should use Prisma enums with `///` doc comments, per the Z13 lesson and the `check:schema-docs` guard.

Field intent:

- `seq`: monotonic dispatch ordering. `cuid()` is not sortable and `createdAt` collides within the same millisecond; the dispatcher claims and processes by `seq`
- `aggregateType`: business object type, e.g. `ApprovalRequest`, `ProjectTask`, `WikiPage`
- `aggregateId`: app-local id of the changed object
- `eventType`: semantic event, e.g. `submitted`, `status_changed`, `published`
- `operation`: technical operation, e.g. `create`, `update`, `delete`
- `schemaVersion`: payload shape version. Bumped when a schema migration changes the shape of `before` / `after`, so old events remain interpretable by subscribers and replay tools
- `before` / `after`: snapshots needed by subscribers
- `changedFields`: normalized field list used by subscription matching
- `correlationId`: request-level correlation id
- `workflowId`: workflow-level correlation id, compatible with `X-Appspine-Workflow-Id`

For high-volume tables, storing full `before` / `after` for every change may be too expensive. The package should allow event policies:

```text
full snapshot
selected fields only
changed fields only
metadata only
```

---

## 6. Explicit Domain Event API

The target developer experience:

```ts
await prisma.$transaction(async (tx) => {
  const before = await tx.approvalRequest.findUniqueOrThrow({
    where: { id },
  });

  const after = await tx.approvalRequest.update({
    where: { id },
    data,
  });

  await domainEvents.record(tx, {
    aggregateType: "ApprovalRequest",
    aggregateId: after.id,
    eventType: before.status !== after.status ? "status_changed" : "updated",
    operation: "update",
    before,
    after,
    actor,
    correlationId,
    workflowId,
    metadata: {
      source: "approve.request.update",
    },
  });

  return after;
});
```

The helper should compute `changedFields` by default:

```ts
diffChangedFields(before, after);
```

It should also allow explicit override when the business service knows the event better than a generic diff:

```ts
await domainEvents.record(tx, {
  eventType: "submitted",
  changedFields: ["status", "submittedAt"],
  before,
  after,
});
```

---

## 7. Why Not Prisma Middleware as the Core

Prisma middleware / query extensions can still be useful for low-risk audit support, but they should not own workflow-triggering semantics.

Limitations:

- `updateMany` only returns counts, not per-row before / after data
- `deleteMany` does not return deleted rows
- nested writes are hard to map into clear business events
- middleware sees technical operations, not business intent
- service-layer validation and workflow meaning are lost
- non-Prisma writes are invisible
- hidden hooks make critical workflow behavior harder to review

Recommended split:

```text
Service/domain layer:
  explicit business events that can drive workflow

Prisma extension:
  optional generic audit or safety checks

Database trigger:
  last-resort capture for external/non-Prisma writes
```

---

## 8. Subscription Model

Decision (2026-07-17): v1 subscriptions are **code-registered**, not database rows. "Data-driven" in this plan applies to the event log — events are queryable, replayable data — not to routing.

```ts
// apps/approve/backend/src/domain-events/subscriptions.ts
export function registerSubscriptions(events: DomainEventRegistry) {
  events.on(ApprovalEvents.InstanceCompleted, notifyRequesterHandler);
  events.on(ApprovalEvents.InstanceRejected, notifyRequesterHandler);
  events.on(ApprovalEvents.StepAssigned, notifyAssigneesHandler);
}
```

Why code instead of a generic `DomainEventSubscription` table with JSON conditions:

- versioned and reviewed with the app — `git log` explains every routing change
- type-checked — a typo fails `tsc`; a typo in a stored JSON condition silently never matches, the worst kind of bug to hunt
- no deploy drift — the subscription and its handler always ship in the same version; a table row can outlive the handler it points at
- no JSON condition evaluation engine to build, secure, test, and explain
- the deciding test: is this a **development-time decision by a developer** or an **operations-time decision by an admin**? "Notify the requester when the instance completes" is business logic — no admin will ever want to toggle it in a UI. Business logic belongs in code.

The one legitimately data-driven routing case is **admin-configured webhooks** — a genuine operations-time decision. That gets a narrow, purpose-specific table instead of a rules engine:

```prisma
model WebhookSubscription {
  id          String   @id @default(cuid())
  name        String
  url         String
  secret      String
  eventTypes  String[] @map("event_types")
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("webhook_subscriptions")
}
```

It is consumed by a single code-registered `webhook.post` handler that fans out to enabled rows — a specific handler reading its own config, not a routing engine.

Migration path if runtime-configurable routing is ever truly needed: the registry checks code-registered subscriptions first, then a table — code-to-table is an additive change. The reverse direction (pulling live table-defined subscriptions back into code) is the hard one, which is why v1 starts on the reversible side.

The earlier draft of this section (generic `DomainEventSubscription` with `requiredFields` and JSON `condition` matching) is superseded; it lives in git history if a future need resurrects it.

---

## 9. Dispatcher

Decision (2026-07-17): the event table is an immutable fact log (§5); **all queue state lives on delivery rows** — one row per event × registered handler. The earlier draft's Option A (event-level status) / Option B (delivery rows) choice is superseded by this single design.

```prisma
model DomainEventDelivery {
  id             String    @id @default(cuid())
  eventId        String    @map("event_id")
  handlerKey     String    @map("handler_key")
  status         String    @default("pending")
  attempts       Int       @default(0)
  nextAttemptAt  DateTime? @map("next_attempt_at")
  lockedAt       DateTime? @map("locked_at")
  lockedBy       String?   @map("locked_by")
  lastError      String?   @map("last_error")
  processedAt    DateTime? @map("processed_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  event DomainEvent @relation(fields: [eventId], references: [id])

  @@unique([eventId, handlerKey])
  @@index([status, nextAttemptAt])
  @@map("domain_event_deliveries")
}
```

The dispatcher worker should:

1. fan out: for each new event, insert one delivery row per matching registered handler — idempotent, because the unique constraint makes a repeated fan-out a no-op
2. claim due pending deliveries (`nextAttemptAt` passed) with row-level locking
3. invoke each delivery's handler
4. mark the delivery processed, or schedule a retry with backoff
5. move deliveries past max attempts to dead-letter
6. expose dead-letter inspection

"Is this event fully processed" is a query — have all of its deliveries reached a terminal state — not a stored column that needs to be kept in sync.

Suggested delivery states:

```text
pending
processing
processed
failed
dead_letter
ignored
```

### Runtime and claiming decisions

Decisions the implementation must make explicit (previously unstated):

- **Worker runtime**: v1 runs the dispatcher in-process as a NestJS interval worker. A separate deployable process is not justified before event volume proves otherwise. Multi-replica deployments must still assume competing workers.
- **Claiming**: use `FOR UPDATE SKIP LOCKED`. Prisma has no native support for it, so the claim query is `$queryRaw` — same precedent as `nextSerialNo()` in `apps/approve`.
- **Stale lock reclaim**: a `processing` delivery whose `lockedAt` is older than a configurable timeout (e.g. 5 minutes) is considered abandoned and becomes claimable again. Reclaim can cause duplicate invocation, which is another reason handlers must be idempotent (§11).
- **Ordering**: claim deliveries ordered by their event's `seq` ascending. v1 should serialize per aggregate (`aggregateType` + `aggregateId`): a delivery is not claimable while a delivery of an earlier event for the same aggregate is still pending or processing. Otherwise a subscriber can observe `status_changed` before `submitted` for the same aggregate. Cross-aggregate ordering is not guaranteed.

### Build vs adopt: consider a Postgres job queue for the dispatch mechanics

The claiming, backoff, stale-lock-reclaim, and dead-letter mechanics above are exactly where subtle concurrency bugs live — the Z15 class of "looks correct, breaks under concurrency". Before hand-rolling them, evaluate delegating dispatch mechanics to a mature Postgres-based job queue:

- **graphile-worker**: jobs are enqueued with `SELECT graphile_worker.add_job(...)` — callable via `tx.$executeRaw` inside the business transaction, so the transaction-bound guarantee holds with zero hand-rolled claiming code
- **pg-boss**: same idea with a TypeScript-native API; transaction-bound insert requires sharing the connection

Shape with a job queue: the business transaction writes `domain_events` (the fact) and enqueues one dispatch job; the job handler fans out delivery rows and invokes handlers. **Delivery rows remain ours either way** — they are the per-handler idempotency and observability ledger, which a generic job queue does not model.

Trade-off: one more dependency and one more externally-managed schema in every app's database, versus not owning retry/lock code. appspine's culture favors small owned packages, so this is a genuine Phase 2 decision point, not a default in either direction. A practical heuristic: prototype the hand-rolled claim loop first; if it stays small and its concurrency tests pass cleanly, own it — if it keeps growing edge cases, adopt the queue.

---

## 10. Handler Types

Initial handler types:

```text
workflow.start
workflow.signal
notification.create
webhook.post
audit.enrich
read-model.refresh
```

The handler contract should be explicit:

```ts
interface DomainEventHandler {
  key: string; // stable handlerKey, e.g. "notify-requester", "webhook.post"
  handle(input: {
    event: DomainEventRecord;
    delivery: DomainEventDeliveryRecord;
    tx?: never;
  }): Promise<void>;
}
```

`key` is the `handlerKey` stored on delivery rows (§9) — renaming a handler's key orphans its pending deliveries, so keys must be treated as stable identifiers.

Handlers should run outside the original business transaction. If a handler needs to write data, it owns its own transaction and idempotency.

### Boundary with 041 (Shared Notification Capability)

041 and Z20 touch adjacent reliability boundaries. They must chain, not duplicate:

```text
Z20 guarantees: business event -> notification row created
               (retried until it exists, exactly once per eventId + handlerKey)
041 Phase 1 guarantees: notification row -> app-local inbox/read state
Future delivery plan: notification row -> external channel delivered
                      (email / Teams / Slack retry, per-channel dead-letter)
```

The `notification.create` handler ends at "the notification row exists". App-local inbox/read behavior is 041's
responsibility. External channel delivery is deliberately outside both Z20 and 041 and requires a later formal plan.

---

## 11. Idempotency

Every subscriber must be idempotent.

The dispatcher may retry after partial failure. Therefore handlers must tolerate duplicate delivery.

Recommended pattern:

```text
idempotency key = eventId + handlerKey
```

This key is enforced structurally by the `@@unique([eventId, handlerKey])` constraint on delivery rows (§9): a handler cannot be fanned out twice for the same event. Handler-internal idempotency is still required for two cases the constraint cannot cover — effects outside our database (a webhook POST that succeeded but whose response was lost), and duplicate invocation after a stale-lock reclaim (§9).

Workflow engine example:

```text
WorkflowInstance.externalEventKey = DomainEvent.id
```

Notification example:

```text
Notification.sourceEventId = DomainEvent.id
```

This prevents duplicate workflow instances or duplicate notifications after retry.

---

## 12. Workflow Engine Integration

This plan is a foundation for the workflow state machine plan.

Scope note: this section is about a **future standalone workflow engine** consuming events. It does not apply to the approval state machine already built into `apps/approve` — that engine's step advancement stays synchronous inside the business transaction (§2). Do not reinterpret "step approved -> advance workflow" as an async subscription; that would be a regression against working, race-protected code.

Domain event:

```text
ApprovalRequest submitted
```

Subscription:

```text
when ApprovalRequest.submitted -> workflow.start approval-request-v1
```

Workflow action:

```text
create WorkflowInstance
create first WorkflowStep
notify approver
```

The workflow engine should not need to know how every business service works. It should consume stable domain events.

The business service should not directly instantiate all downstream workflow steps. It should record the business event and let the subscriber layer decide what to do.

---

## 13. Cross-app Relay

V1 should be app-local. Cross-app relay can come later.

Possible relay paths:

1. **MCP gateway relay**
   - app records local domain event
   - dispatcher calls `mcp-gateway` or another app tool
   - useful for controlled app-to-app operations

2. **Webhook outbox**
   - dispatcher posts to external URL
   - good for integration with non-appspine systems

3. **Event export API**
   - external worker polls app-local events
   - simpler operational model

4. **Central integration app**
   - optional future app that aggregates selected events
   - should not be required for normal app operation

Cross-app event payloads should never depend on cross-database foreign keys. They should use stable ids and snapshots.

---

## 14. Package Scope

`@appspine/domain-events` should provide:

- Prisma schema fragment or documented model pattern
- NestJS module
- `DomainEventsService.record()`
- `diffChangedFields()`
- event snapshot policy helpers
- typed subscription registry (`events.on(...)`)
- dispatcher service (or the job-queue integration, per the §9 build-vs-adopt decision)
- handler registry
- `webhook.post` handler + `WebhookSubscription` table pattern
- retry/backoff utilities
- dead-letter query helpers
- testing helpers

It should not provide app-specific business events. Each app defines its own aggregate names and event types.

Example app-local event naming:

```text
ApprovalRequest.submitted
ApprovalRequest.approved
ProjectTask.status_changed
WikiPage.published
DriveFile.replaced
CalendarEvent.rescheduled
```

---

## 15. Admin UI

Eventually each app should expose an admin page for:

- recent domain events
- event detail with before / after / changed fields
- per-handler deliveries with status and attempts
- retry failed delivery
- mark as ignored
- dead-letter inspection
- webhook subscription management (create / enable / disable)

This can live in `@appspine/frontend-shell` patterns once the backend model stabilizes.

---

## 16. Operational Concerns

Retention:

- keep full event payloads for a configurable period
- optionally compact old events to metadata-only records
- avoid storing secrets or large binary payloads

Privacy:

- redaction policy for sensitive fields
- avoid recording password hashes, tokens, or secret values
- allow model-level field denylist
- for `apps/approve` specifically: `before` / `after` snapshots contain leave and expense data, so redaction and retention are **MVP requirements** there, not follow-ups

Performance:

- avoid full snapshots for large records
- queue indexes (`status`, `nextAttemptAt`) live on the delivery table; the event table carries lookup indexes only (`aggregateType`+`aggregateId`, `eventType`, `workflowId`)
- batch dispatcher reads
- set max attempts and dead-letter threshold

Transactions:

- record events inside the same Prisma transaction as the business write
- avoid handler execution inside the business transaction
- avoid remote calls inside the business transaction

Testing:

- assert event creation in service tests
- assert changed field calculation
- assert subscription matching
- assert idempotent handler behavior
- assert retry and dead-letter behavior

---

## 17. MVP Sequence

### Phase 1: Core Event Recording

- add `DomainEvent` model pattern
- implement `record()`
- implement `diffChangedFields()`
- add service-layer usage in one app, preferably `apps/approve`
- verify event and business write commit atomically

### Phase 2: Dispatcher and Handler Registry

- add the delivery model and fan-out
- implement the typed subscription registry (`events.on(...)`)
- decide build-vs-adopt for dispatch mechanics (§9: hand-rolled claim loop vs graphile-worker / pg-boss)
- implement or wire the dispatcher accordingly
- support basic retry and dead-letter
- add one handler type: `notification.create` or `webhook.post`

### Phase 3: Workflow Foundation Integration

- connect approval status changes to workflow start/signal
- propagate `workflowId`
- make workflow actions idempotent by `eventId + handlerKey`

### Phase 4: Shared Package Extraction

- move stable helpers to `@appspine/domain-events`
- document app integration pattern
- add template wiring only after the pattern has proven stable in one real app

### Phase 5: Cross-app Event Relay

- add webhook or MCP gateway relay
- define event export contract
- avoid global event bus until operational need is proven

---

## 18. First Candidate: Approve App

`apps/approve` is the best first proving ground because its domain naturally has state transitions.

Candidate events:

```text
ApprovalRequest.created
ApprovalRequest.submitted
ApprovalInstance.started
ApprovalInstanceStep.assigned
ApprovalInstanceStep.approved
ApprovalInstanceStep.rejected
ApprovalInstance.completed
ApprovalInstance.cancelled
```

What Z20 does **not** change in approve: `submit()` keeps creating the instance and activating the first step synchronously, and `tryAdvanceStep` keeps advancing steps inside the transaction under the Z15 version lock. That is the core state machine (§2) and it stays where it is.

Useful derived-effect triggers:

- **close the audit gap**: today `recordAudit()` runs after the transaction commits, so a crash between commit and the audit write silently drops the record. Recording the domain event in-transaction and writing/enriching the audit entry from a handler makes the audit trail loss-proof — this is the most concrete day-one payoff
- when instance completed / rejected -> notify requester
- when step assigned -> create notification (optional migration: the existing in-transaction notification write is already reliable; moving it behind the event only adds per-subscriber retry observability, at the cost of delivery latency)
- webhook / external relay for n8n-style integrations, with retry and dead-letter

This validates event recording, changed field detection, dispatcher claiming and ordering, delivery tracking, idempotency, and retry behavior — without touching the proven synchronous approval engine.

---

## 19. Open Questions and Current Recommendations

Still open for final decision, but each now carries a recommendation (2026-07-17):

1. **Should event subscriptions be admin-editable in v1, or code-defined first?**
   Decided (2026-07-17): code-registered (§8). Routing is business logic and lives in code; the admin UI manages webhook subscriptions only.
2. **Event-level status only, or separate `DomainEventDelivery` rows from the start?**
   Decided (2026-07-17): delivery rows are the *only* queue ledger — the event table is immutable and carries no processing state at all (§5, §9). The `eventId + handlerKey` unique constraint *is* the §11 idempotency key.
3. **Which fields must be redacted globally?**
   Recommendation: global denylist for password hashes, tokens, API keys, and secret-like values; plus a per-model field policy for domain-sensitive data (approve's leave/expense fields).
4. **Free-form event type strings or generated constants?**
   Recommendation: `as const` constant objects defined per app. A typo in a free-form string makes a subscription silently never match — the worst kind of bug to hunt.
5. **Should `@appspine/domain-events` include Prisma fragments, or only docs and helpers?**
   Recommendation: documented model pattern plus a drift-check script (same approach as `check:schema-docs`). Do not try to inject schema from the package; each app owns its migration history.
6. **How much of the dispatcher belongs in the shared package versus app-local workers?**
   Recommendation: claiming, matching, retry/backoff computation, and dead-letter helpers live in the package; scheduling cadence, concurrency, and worker wiring stay app-local — the same split `@appspine/audit-log` already uses. If the §9 build-vs-adopt evaluation lands on graphile-worker / pg-boss, the package wraps the queue integration instead of owning a claim loop.
7. **Events-only, or also direct service calls for simple cases?**
   Recommendation: allow direct service calls. Events are for effects where the source should not know its listeners; forcing an event between two modules that already call each other synchronously only adds latency and debugging distance.

---

## 20. Recommendation

Start with explicit service-layer event recording and a transaction-bound `DomainEvent` table in one app.

Do not start with transparent Prisma middleware as the main mechanism. Use Prisma extensions only for supplementary audit or developer guardrails.

The first concrete implementation is **additive and observational** — it records events and drives derived effects, and does not modify the synchronous approval engine (§2, §18). It should prove:

```text
business update + event insert in one transaction
event contains before / after / changedFields
the post-commit audit gap in apps/approve is closed
one derived side effect (webhook or notification) runs with retry and dead-letter
failed subscriber retries without duplicating effects
```

Once this works in `apps/approve`, extract the stable parts into `@appspine/domain-events`.
