# Master Data Mirror Schema

Mirror tables are owned by each consuming app. `@appspine/master-data-client` provides sync
logic and reconciliation only; it does not generate Prisma schema and it does not manage
migrations.

## Required Conventions

| Field | Purpose |
|---|---|
| `sourceId` | Stable id from `apps/master-data`; unique per mirrored entity. |
| `seq` | Domain-event sequence used for ordering. Older events must not overwrite newer rows. |
| `syncedAt` | Local timestamp for the last successful mirror update. |

Mirror models use `<Entity>Mirror` names, such as `OrgUnitMirror`, `OrgUserProfileMirror`, and
`OrgDelegationMirror`. Consuming app business code must treat these rows as read-only. The sync
handler and reconciliation service are the only writers.

Deletes are hard deletes. When the source row is deleted, the local mirror row is deleted too.
There is no `deletedAt` or `isDeleted`; historical transaction evidence belongs in Snapshot
fields, not in mirror tables.

## Example Prisma Fragments

```prisma
/// Read-only mirror of an org unit owned by apps/master-data.
model OrgUnitMirror {
  id        String   @id @default(uuid())
  sourceId  String   @unique @map("source_id")
  code      String
  name      String
  level     String
  status    String
  parentId  String?  @map("parent_id")
  headUserProfileId String? @map("head_user_profile_id")
  seq       BigInt
  syncedAt  DateTime @map("synced_at")

  @@map("org_unit_mirrors")
}

/// Read-only mirror of a user profile owned by apps/master-data.
model OrgUserProfileMirror {
  id             String   @id @default(uuid())
  sourceId       String   @unique @map("source_id")
  employeeNumber String   @map("employee_number")
  displayName    String   @map("display_name")
  email          String?
  orgUnitId      String?  @map("org_unit_id")
  employmentType String   @map("employment_type")
  employmentStatus String @map("employment_status")
  seq            BigInt
  syncedAt       DateTime @map("synced_at")

  @@map("org_user_profile_mirrors")
}

/// Read-only mirror of a delegation owned by apps/master-data.
model OrgDelegationMirror {
  id             String   @id @default(uuid())
  sourceId       String   @unique @map("source_id")
  ownerUserProfileId String @map("owner_user_profile_id")
  delegateUserProfileId String @map("delegate_user_profile_id")
  startDate      DateTime @map("start_date")
  endDate        DateTime @map("end_date")
  reason         String?
  seq            BigInt
  syncedAt       DateTime @map("synced_at")

  @@map("org_delegation_mirrors")
}
```
