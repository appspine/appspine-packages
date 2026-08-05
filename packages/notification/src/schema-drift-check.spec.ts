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
});
