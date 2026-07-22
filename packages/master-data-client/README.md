# @appspine/master-data-client

Reusable master-data Sync/Cache helpers for appspine consuming apps.

```mermaid
sequenceDiagram
    participant OrgSvc as apps/master-data Service
    participant OrgDB as apps/master-data DB
    participant Outbox as Domain Events Outbox
    participant Dispatcher
    participant MDClient as @appspine/master-data-client
    participant MirrorDB as consuming app MirrorDB

    OrgSvc->>OrgDB: Update source row
    OrgSvc->>Outbox: Record OrgUnitChanged
    Outbox->>Dispatcher: Dispatch pending event
    Dispatcher->>MDClient: Deliver webhook
    MDClient->>MDClient: Check seq ordering
    MDClient->>MirrorDB: Upsert mirror row

    loop Reconciliation interval
        MDClient->>OrgSvc: Fetch list/export API
        OrgSvc-->>MDClient: Current source rows
        MDClient->>MirrorDB: Add, update, or hard delete rows
    end
```

## Consuming App Setup

1. Declare mirror tables in the consuming app Prisma schema. Use `docs/mirror-schema.md` as the
   convention source.
2. Register a `@DomainEventSubscriber` handler and call `createMasterDataSyncHandler()` from that
   handler.
3. Import `MasterDataClientModule.forRoot({ intervalMs, entities })` to enable package-owned
   reconciliation.

The package does not manage consuming-app migrations, does not do cross-app aggregation, and does
not support soft deletes. Snapshot fields remain the source for historical transaction evidence;
mirror tables are for browsing, filtering, and current-state cache reads.
