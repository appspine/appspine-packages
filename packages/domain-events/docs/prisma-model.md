# Prisma Model Pattern

`@appspine/domain-events` does not ship or inject a `.prisma` schema fragment. Each business app
owns its own migration history and database (dev_docs 001) — the same reason `@appspine/audit-log`
ships a schema fragment for a single, deliberately app-agnostic model does not apply here, since
`DomainEvent`/`DomainEventDelivery` sit next to the app's own aggregate models and the app decides
things like retention/partitioning on its own timeline. This is the documented-pattern approach
Z20 §19-5 recommends, mirroring `check:schema-docs`'s "docs + drift-check script, not injected
schema" precedent (dev_docs/002 §Prisma conventions).

Copy the block below into the consuming app's schema (e.g. `prisma/schema/domain-events.prisma`),
then run `prisma migrate dev` / `prisma generate` as usual. After copying, run the app's own
drift-check script (see below) so future edits to this model don't silently break the package's
dispatcher, which depends on the exact table/column names here in raw SQL.

```prisma
/// Immutable business fact log for transaction-bound domain events.
/// INSERT-only; all processing state lives on DomainEventDelivery.
model DomainEvent {
  id            String               @id @default(cuid())
  /// Monotonic dispatch order; cuid is unsortable and createdAt can collide.
  seq           BigInt               @unique @default(autoincrement())
  /// Business object type, e.g. "ApprovalInstance".
  aggregateType String               @map("aggregate_type")
  aggregateId   String               @map("aggregate_id")
  /// Semantic event type, e.g. "submitted" or "rejected".
  eventType     String               @map("event_type")
  operation     DomainEventOperation
  /// Payload shape version for before/after snapshots.
  schemaVersion Int                  @default(1) @map("schema_version")
  actorUserId   String?              @map("actor_user_id")
  /// Request-level correlation id.
  correlationId String?              @map("correlation_id")
  /// Workflow-level correlation id using the X-Appspine-Workflow-Id convention.
  workflowId    String?              @map("workflow_id")
  before        Json?
  after         Json?
  changedFields String[]             @map("changed_fields")
  /// Free-form handler context, including audit metadata.
  metadata      Json?
  createdAt     DateTime             @default(now()) @map("created_at")

  deliveries DomainEventDelivery[]

  @@index([aggregateType, aggregateId])
  @@index([eventType])
  @@index([workflowId])
  @@map("domain_events")
}

/// Technical operation kind for a DomainEvent.
enum DomainEventOperation {
  CREATE
  UPDATE
  DELETE
}

/// Per-handler processing state for one DomainEvent.
model DomainEventDelivery {
  id            String                    @id @default(cuid())
  eventId       String                    @map("event_id")
  event         DomainEvent               @relation(fields: [eventId], references: [id])
  /// Stable handler identity, e.g. "audit-record" or "webhook.post:<id>".
  handlerKey    String                    @map("handler_key")
  status        DomainEventDeliveryStatus @default(PENDING)
  attempts      Int                       @default(0)
  nextAttemptAt DateTime?                 @map("next_attempt_at")
  lockedAt      DateTime?                 @map("locked_at")
  lockedBy      String?                   @map("locked_by")
  lastError     String?                   @map("last_error")
  processedAt   DateTime?                 @map("processed_at")
  createdAt     DateTime                  @default(now()) @map("created_at")

  @@unique([eventId, handlerKey])
  @@index([status, nextAttemptAt])
  /// Supports the admin catalog's per-subscriber delivery stats query (dev_docs 028 §3.3),
  /// which filters by handlerKey and windows by createdAt.
  @@index([handlerKey, createdAt])
  @@map("domain_event_deliveries")
}

/// Processing state of one domain event delivery.
enum DomainEventDeliveryStatus {
  PENDING
  PROCESSING
  PROCESSED
  DEAD_LETTER
  IGNORED
}
```

Nothing else is part of this package's contract. In particular, an outbound-webhook subscription
model (if the app wants one) is app-local — it is data-driven routing wired through
`DomainEventRegistry.registerHandlerKeyContributor()`, not something this package's `record()`/
fan-out path ever queries (plan 026 §11.1 G3/G6).

## Drift Check

`checkDomainEventSchemaDrift()` (exported from the package root) takes the app's own generated
`Prisma.dmmf.datamodel` and returns a list of human-readable issues — empty means the schema still
matches the pattern above closely enough for `DomainEventsService`/`DomainEventDispatcherService`
to operate correctly. It never parses a `.prisma` file; it only inspects DMMF, so it can't drift
out of sync with what Prisma actually generated.

Wire it into the app the same way `check:schema-docs` is wired into `backend/package.json` and
`.husky/pre-commit` (dev_docs/002 §Prisma conventions):

```ts
// backend/scripts/check-domain-events-schema-drift.ts
import { Prisma } from "@prisma/client";
import { checkDomainEventSchemaDrift } from "@appspine/domain-events";

const issues = checkDomainEventSchemaDrift(Prisma.dmmf.datamodel);
for (const issue of issues) {
  console.error(`[domain-events-schema-drift] ${issue}`);
}
if (issues.length > 0) process.exit(1);
```

```json
// backend/package.json scripts
"check:domain-events-schema-drift": "ts-node scripts/check-domain-events-schema-drift.ts"
```
