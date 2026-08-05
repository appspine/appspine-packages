import { describe, expect, it } from 'vitest';

import {
  checkNotificationSchemaDrift,
  type NotificationDatamodel,
  parseNotificationSchemaMetadata,
} from './schema-drift-check';

function fixture(): NotificationDatamodel {
  const scalar = (name: string, type: string, options: Record<string, unknown> = {}) => ({
    name,
    kind: 'scalar' as const,
    type,
    isRequired: !options.optional,
    isList: false,
    ...options,
  });
  return {
    models: [
      {
        name: 'Notification',
        dbName: 'notifications',
        uniqueFields: [['recipientUserId', 'idempotencyKey']],
        uniqueIndexes: [{ fields: ['recipientUserId', 'idempotencyKey'] }],
        indexes: [
          {
            name: 'notifications_recipient_idx',
            fields: ['recipientUserId', 'archivedAt', 'readAt', 'createdAt'],
          },
          {
            name: 'notifications_source_idx',
            fields: ['sourceApp', 'sourceEntityType', 'sourceEntityId'],
          },
        ],
        fields: [
          {
            ...scalar('id', 'String', {
              isId: true,
              hasDefaultValue: true,
              default: { name: 'cuid' },
            }),
          },
          scalar('recipientUserId', 'String', { dbName: 'recipient_user_id' }),
          {
            name: 'recipient',
            kind: 'object' as const,
            type: 'User',
            isRequired: true,
            isList: false,
            relationFromFields: ['recipientUserId'],
            relationToFields: ['id'],
          },
          scalar('idempotencyKey', 'String', { dbName: 'idempotency_key' }),
          scalar('type', 'String'),
          scalar('category', 'String', { optional: true }),
          scalar('severity', 'String', { default: 'info', hasDefaultValue: true }),
          scalar('title', 'String'),
          scalar('body', 'String', { optional: true }),
          scalar('sourceApp', 'String', { dbName: 'source_app' }),
          scalar('sourceEventId', 'String', { optional: true, dbName: 'source_event_id' }),
          scalar('sourceEntityType', 'String', { optional: true, dbName: 'source_entity_type' }),
          scalar('sourceEntityId', 'String', { optional: true, dbName: 'source_entity_id' }),
          scalar('targetPath', 'String', { optional: true, dbName: 'target_path' }),
          scalar('readAt', 'DateTime', { optional: true, dbName: 'read_at' }),
          scalar('archivedAt', 'DateTime', { optional: true, dbName: 'archived_at' }),
          scalar('createdAt', 'DateTime', {
            dbName: 'created_at',
            default: { name: 'now' },
            hasDefaultValue: true,
          }),
          scalar('updatedAt', 'DateTime', {
            dbName: 'updated_at',
            default: { name: 'now' },
            hasDefaultValue: true,
            isUpdatedAt: true,
          }),
        ],
      },
    ],
    enums: [],
  };
}

describe('checkNotificationSchemaDrift', () => {
  it('accepts the documented logical model with app-owned table name', () => {
    expect(checkNotificationSchemaDrift(fixture())).toEqual([]);
  });

  it('detects missing unique/index contracts and field drift', () => {
    const model = fixture().models[0];
    model.uniqueFields = [];
    model.uniqueIndexes = [];
    model.indexes = [];
    model.fields = model.fields.filter((field) => field.name !== 'readAt');
    expect(checkNotificationSchemaDrift(fixture())).not.toContain('model Notification not found');
    const issues = checkNotificationSchemaDrift({ ...fixture(), models: [model] });
    expect(issues).toEqual(
      expect.arrayContaining([
        'model Notification is missing @@unique([recipientUserId, idempotencyKey])',
        'model Notification is missing @@index([recipientUserId, archivedAt, readAt, createdAt])',
        'model Notification is missing field readAt',
      ]),
    );
  });

  it('parses schema and migration metadata and detects their drift', () => {
    const metadata = parseNotificationSchemaMetadata(
      `model Notification {
        updatedAt DateTime @default(now()) @updatedAt
        @@index([recipientUserId, archivedAt, readAt, createdAt])
        @@index([sourceApp, sourceEntityType, sourceEntityId])
      }`,
      `CREATE INDEX "notifications_recipient_idx" ON "notifications"("recipient_user_id", "read_at", "archived_at", "created_at");`,
    );
    expect(metadata.updatedAtFields).toEqual(['updatedAt']);
    const issues = checkNotificationSchemaDrift(fixture(), metadata);
    expect(issues).toContain(
      'notification migration is missing index ([recipientUserId, archivedAt, readAt, createdAt])',
    );
  });

  it('requires updatedAt to remain managed by Prisma', () => {
    const issues = checkNotificationSchemaDrift(fixture(), { updatedAtFields: [] });
    expect(issues).toContain('model Notification.updatedAt must use @updatedAt');
  });

  it('detects a real DMMF field missing @updatedAt even with no metadata supplied', () => {
    const model = fixture().models[0];
    model.fields = model.fields.map((field) =>
      field.name === 'updatedAt' ? { ...field, isUpdatedAt: false } : field,
    );
    const issues = checkNotificationSchemaDrift({ ...fixture(), models: [model] });
    expect(issues).toContain('model Notification.updatedAt isUpdatedAt=false, expected true');
  });

  it('reports index verification as unavailable rather than silently passing when no metadata and no DMMF indexes are present', () => {
    const model = fixture().models[0];
    model.indexes = undefined;
    const issues = checkNotificationSchemaDrift({ ...fixture(), models: [model] });
    expect(issues).toEqual(
      expect.arrayContaining([expect.stringContaining('indexes could not be verified')]),
    );
  });

  it('does not let an unrelated model satisfy the @@index or @updatedAt checks', () => {
    const schemaText = `
      model AuditLog {
        updatedAt DateTime @updatedAt
        @@index([recipientUserId, archivedAt, readAt, createdAt])
        @@index([sourceApp, sourceEntityType, sourceEntityId])
      }

      model Notification {
        id String @id
      }
    `;
    const metadata = parseNotificationSchemaMetadata(schemaText);
    expect(metadata.indexes).toEqual([]);
    expect(metadata.updatedAtFields).toEqual([]);
    const model = fixture().models[0];
    model.indexes = undefined;
    const issues = checkNotificationSchemaDrift({ ...fixture(), models: [model] }, metadata);
    expect(issues).toEqual(
      expect.arrayContaining([
        'model Notification is missing @@index([recipientUserId, archivedAt, readAt, createdAt])',
        'model Notification is missing @@index([sourceApp, sourceEntityType, sourceEntityId])',
        'model Notification.updatedAt must use @updatedAt',
      ]),
    );
  });

  it('extracts only the Notification model block even when other models are present', () => {
    const schemaText = `
      model Other {
        @@index([recipientUserId, archivedAt, readAt, createdAt])
      }

      model Notification {
        updatedAt DateTime @updatedAt
        @@index([recipientUserId, archivedAt, readAt, createdAt])
        @@index([sourceApp, sourceEntityType, sourceEntityId])
      }

      model AfterNotification {
        @@index([sourceApp, sourceEntityType, sourceEntityId])
      }
    `;
    const metadata = parseNotificationSchemaMetadata(schemaText);
    expect(metadata.indexes).toEqual([
      { fields: ['recipientUserId', 'archivedAt', 'readAt', 'createdAt'] },
      { fields: ['sourceApp', 'sourceEntityType', 'sourceEntityId'] },
    ]);
    expect(metadata.updatedAtFields).toEqual(['updatedAt']);
  });

  it('scopes migration CREATE INDEX matches to the notification table name when provided', () => {
    const migrationText = `
      CREATE INDEX "other_table_idx" ON "other_table"("recipient_user_id", "archived_at", "read_at", "created_at");
      CREATE INDEX "notifications_source_idx" ON "notifications"("source_app", "source_entity_type", "source_entity_id");
    `;
    const scoped = parseNotificationSchemaMetadata(
      'model Notification {}',
      migrationText,
      'notifications',
    );
    expect(scoped.migrationIndexes).toEqual([
      { fields: ['sourceApp', 'sourceEntityType', 'sourceEntityId'] },
    ]);

    const unscoped = parseNotificationSchemaMetadata('model Notification {}', migrationText);
    expect(unscoped.migrationIndexes).toHaveLength(2);
  });

  it('detects wrong type, nullability, column map, and default drift', () => {
    const model = fixture().models[0];
    model.fields = model.fields.map((field) => {
      if (field.name === 'severity') return { ...field, type: 'Int' };
      if (field.name === 'category') return { ...field, isRequired: true };
      if (field.name === 'sourceApp') return { ...field, dbName: 'wrong_column' };
      if (field.name === 'createdAt') return { ...field, default: { name: 'uuid' } };
      return field;
    });
    const issues = checkNotificationSchemaDrift({ ...fixture(), models: [model] });
    expect(issues).toEqual(
      expect.arrayContaining([
        'model Notification.severity has type scalar:Int, expected scalar:String',
        'model Notification.category is required, expected optional',
        'model Notification.sourceApp maps to column "wrong_column", expected "source_app"',
        'model Notification.createdAt default is uuid, expected now',
      ]),
    );
  });
});
