# Notification Prisma model

Each business application owns its notification table and migration history. The backend package
does not ship a Prisma schema fragment or assume a physical table name. Consumers must keep this
logical model and run `checkNotificationSchemaDrift` against their generated `Prisma.dmmf.datamodel`.

Prisma 6's public DMMF omits non-unique indexes, so calling `checkNotificationSchemaDrift(Prisma.dmmf.datamodel)`
with no second argument cannot verify `@@index` or `@updatedAt` against the checked-in schema text and
will report an explicit "could not be verified" issue rather than silently passing. Always pass the
`metadata` argument built by `parseNotificationSchemaMetadata(schemaText, migrationText, notificationTableName)`,
scoped to your notification model's physical table name, e.g.:

```ts
import { checkNotificationSchemaDrift, parseNotificationSchemaMetadata } from "@appspine/notification";
import { Prisma } from "@prisma/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const NOTIFICATION_TABLE = "notifications"; // your @@map value
const migrationDir = join(__dirname, "../prisma/schema/migrations");
const tablePattern = new RegExp(`"${NOTIFICATION_TABLE}"`, "i");
const migrationText = readdirSync(migrationDir)
  .filter((name) => statSync(join(migrationDir, name)).isDirectory())
  .sort()
  .map((name) => readFileSync(join(migrationDir, name, "migration.sql"), "utf8"))
  .filter((text) => tablePattern.test(text))
  .join("\n");

const metadata = parseNotificationSchemaMetadata(
  readFileSync(join(__dirname, "../prisma/schema/your-app.prisma"), "utf8"),
  migrationText,
  NOTIFICATION_TABLE,
);
const issues = checkNotificationSchemaDrift(Prisma.dmmf.datamodel, metadata);
```

Select migration files by scanning their *content* for the notification table name, not by a
filename convention — a later migration that alters the table without repeating a magic substring
in its directory name must still be picked up and still fail the gate on real drift.

```prisma
model Notification {
  id               String    @id @default(cuid())
  recipientUserId  String    @map("recipient_user_id")
  recipient        User      @relation("NotificationRecipient", fields: [recipientUserId], references: [id], onDelete: Cascade)
  idempotencyKey   String    @map("idempotency_key")
  type             String
  category         String?
  severity         String    @default("info")
  title            String
  body             String?
  sourceApp        String    @map("source_app")
  sourceEventId    String?   @map("source_event_id")
  sourceEntityType String?   @map("source_entity_type")
  sourceEntityId   String?   @map("source_entity_id")
  targetPath       String?   @map("target_path")
  readAt           DateTime? @map("read_at")
  archivedAt       DateTime? @map("archived_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @default(now()) @updatedAt @map("updated_at")

  @@unique([recipientUserId, idempotencyKey])
  @@index([recipientUserId, archivedAt, readAt, createdAt])
  @@index([sourceApp, sourceEntityType, sourceEntityId])
  @@map("notifications")
}
```

The model, logical field names, scalar types, nullable/default behavior, relation from-fields,
unique constraint, and indexes are contract. Consumers may choose a different physical table name
with `@@map` and a different User back-relation field name. Notification content is a rendered
snapshot owned by the producer; this package does not provide templates or delivery channels.
