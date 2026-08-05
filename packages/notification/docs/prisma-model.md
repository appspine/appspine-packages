# Notification Prisma model

Each business application owns its notification table and migration history. The backend package
does not ship a Prisma schema fragment or assume a physical table name. Consumers must keep this
logical model and run `checkNotificationSchemaDrift` against their generated `Prisma.dmmf.datamodel`.

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
  updatedAt        DateTime  @updatedAt @map("updated_at")

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
