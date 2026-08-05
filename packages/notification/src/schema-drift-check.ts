import type { DmmfField, DmmfModel, PrismaDmmfDatamodel } from '@appspine/common';

export type NotificationDatamodel = PrismaDmmfDatamodel;
export type { DmmfField, DmmfModel };

export type NotificationIndexMetadata = {
  fields: readonly string[];
};

export type NotificationSchemaMetadata = {
  indexes?: readonly NotificationIndexMetadata[];
  migrationIndexes?: readonly NotificationIndexMetadata[];
  updatedAtFields?: readonly string[];
};

type ExpectedField = {
  name: string;
  kind: 'scalar' | 'object';
  type: string;
  optional?: boolean;
  column?: string;
  isId?: boolean;
  default?: string | number | { name: string };
  relationFromFields?: string[];
  relationToFields?: string[];
};

const EXPECTED_FIELDS: ExpectedField[] = [
  { name: 'id', kind: 'scalar', type: 'String', isId: true, default: { name: 'cuid' } },
  { name: 'recipientUserId', kind: 'scalar', type: 'String', column: 'recipient_user_id' },
  {
    name: 'recipient',
    kind: 'object',
    type: 'User',
    relationFromFields: ['recipientUserId'],
    relationToFields: ['id'],
  },
  { name: 'idempotencyKey', kind: 'scalar', type: 'String', column: 'idempotency_key' },
  { name: 'type', kind: 'scalar', type: 'String' },
  { name: 'category', kind: 'scalar', type: 'String', optional: true },
  { name: 'severity', kind: 'scalar', type: 'String', default: 'info' },
  { name: 'title', kind: 'scalar', type: 'String' },
  { name: 'body', kind: 'scalar', type: 'String', optional: true },
  { name: 'sourceApp', kind: 'scalar', type: 'String', column: 'source_app' },
  {
    name: 'sourceEventId',
    kind: 'scalar',
    type: 'String',
    optional: true,
    column: 'source_event_id',
  },
  {
    name: 'sourceEntityType',
    kind: 'scalar',
    type: 'String',
    optional: true,
    column: 'source_entity_type',
  },
  {
    name: 'sourceEntityId',
    kind: 'scalar',
    type: 'String',
    optional: true,
    column: 'source_entity_id',
  },
  { name: 'targetPath', kind: 'scalar', type: 'String', optional: true, column: 'target_path' },
  { name: 'readAt', kind: 'scalar', type: 'DateTime', optional: true, column: 'read_at' },
  { name: 'archivedAt', kind: 'scalar', type: 'DateTime', optional: true, column: 'archived_at' },
  {
    name: 'createdAt',
    kind: 'scalar',
    type: 'DateTime',
    column: 'created_at',
    default: { name: 'now' },
  },
  {
    name: 'updatedAt',
    kind: 'scalar',
    type: 'DateTime',
    column: 'updated_at',
    default: { name: 'now' },
  },
];

/**
 * Checks the consumer's generated DMMF against the documented Notification model.
 * Physical table name and User back-relation field name are intentionally app-owned.
 */
export function checkNotificationSchemaDrift(
  datamodel: NotificationDatamodel,
  metadata?: NotificationSchemaMetadata,
): string[] {
  const issues: string[] = [];
  const model = datamodel.models.find((candidate) => candidate.name === 'Notification');
  if (!model) return ['model Notification not found'];

  for (const unique of [['recipientUserId', 'idempotencyKey']]) {
    if (!hasUniqueFields(model, unique)) {
      issues.push(`model Notification is missing @@unique([${unique.join(', ')}])`);
    }
  }

  for (const expected of EXPECTED_FIELDS) {
    const field = model.fields.find((candidate) => candidate.name === expected.name);
    if (!field) {
      issues.push(`model Notification is missing field ${expected.name}`);
      continue;
    }
    if (field.kind !== expected.kind || field.type !== expected.type) {
      issues.push(
        `model Notification.${expected.name} has type ${field.kind}:${field.type}, expected ${expected.kind}:${expected.type}`,
      );
    }
    const required = !(expected.optional ?? false);
    if (field.isRequired !== required) {
      issues.push(
        `model Notification.${expected.name} is ${field.isRequired ? 'required' : 'optional'}, expected ${required ? 'required' : 'optional'}`,
      );
    }
    const expectedColumn = expected.column ?? expected.name;
    const actualColumn = field.dbName ?? field.name;
    if (actualColumn !== expectedColumn) {
      issues.push(
        `model Notification.${expected.name} maps to column "${actualColumn}", expected "${expectedColumn}"`,
      );
    }
    if ((field.isId ?? false) !== (expected.isId ?? false)) {
      issues.push(
        `model Notification.${expected.name} isId=${field.isId ?? false}, expected ${expected.isId ?? false}`,
      );
    }
    if (!defaultMatches(field.default, expected.default)) {
      issues.push(
        `model Notification.${expected.name} default is ${formatDefault(field.default)}, expected ${formatDefault(expected.default)}`,
      );
    }
    if (!sameStringArray(field.relationFromFields, expected.relationFromFields)) {
      issues.push(
        `model Notification.${expected.name} relationFromFields is ${formatStringArray(field.relationFromFields)}, expected ${formatStringArray(expected.relationFromFields)}`,
      );
    }
    if (!sameStringArray(field.relationToFields, expected.relationToFields)) {
      issues.push(
        `model Notification.${expected.name} relationToFields is ${formatStringArray(field.relationToFields)}, expected ${formatStringArray(expected.relationToFields)}`,
      );
    }
  }

  // Prisma 6's public DMMF omits non-unique indexes. Consumers therefore pass schema and
  // migration metadata parsed from their checked-in Prisma files so this gate runs in CI too.
  const indexes = metadata?.indexes ?? model.indexes;
  if (indexes) {
    for (const expectedIndex of [
      ['recipientUserId', 'archivedAt', 'readAt', 'createdAt'],
      ['sourceApp', 'sourceEntityType', 'sourceEntityId'],
    ]) {
      if (!indexes.some((index) => sameStringArray(index.fields, expectedIndex))) {
        issues.push(`model Notification is missing @@index([${expectedIndex.join(', ')}])`);
      }
    }
  }
  if (metadata?.migrationIndexes) {
    for (const expectedIndex of [
      ['recipientUserId', 'archivedAt', 'readAt', 'createdAt'],
      ['sourceApp', 'sourceEntityType', 'sourceEntityId'],
    ]) {
      if (
        !metadata.migrationIndexes.some((index) => sameStringArray(index.fields, expectedIndex))
      ) {
        issues.push(`notification migration is missing index ([${expectedIndex.join(', ')}])`);
      }
    }
  }
  if (metadata?.updatedAtFields && !metadata.updatedAtFields.includes('updatedAt')) {
    issues.push('model Notification.updatedAt must use @updatedAt');
  }
  return issues;
}

/** Parses the contract-relevant pieces of a consumer-owned Prisma schema and migration. */
export function parseNotificationSchemaMetadata(
  schemaText: string,
  migrationText = '',
): NotificationSchemaMetadata {
  const indexes = [...schemaText.matchAll(/@@index\s*\(\s*\[([^\]]+)\]/g)].map((match) => ({
    fields: parseSchemaFields(match[1]),
  }));
  const migrationIndexes = [
    ...migrationText.matchAll(/CREATE\s+INDEX\s+"[^"]+"\s+ON\s+"[^"]+"\s*\(([^)]+)\)/gi),
  ].map((match) => ({
    fields: parseMigrationFields(match[1]),
  }));
  const updatedAtFields = [...schemaText.matchAll(/^\s*(\w+)\s+[^\n]*@updatedAt\b/gm)].map(
    (match) => match[1],
  );
  return { indexes, migrationIndexes, updatedAtFields };
}

function parseSchemaFields(value: string): string[] {
  return value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function parseMigrationFields(value: string): string[] {
  return value
    .split(',')
    .map((field) => field.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
    .map(snakeToCamel);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function hasUniqueFields(model: DmmfModel, expected: string[]): boolean {
  return (
    model.uniqueFields?.some((fields) => sameStringArray(fields, expected)) === true ||
    model.uniqueIndexes?.some((index) => sameStringArray(index.fields, expected)) === true
  );
}

function defaultMatches(actual: unknown, expected: ExpectedField['default']): boolean {
  if (expected === undefined) return actual === undefined;
  if (typeof expected !== 'object') return actual === expected;
  return (
    typeof actual === 'object' &&
    actual !== null &&
    (actual as { name?: unknown }).name === expected.name
  );
}

function sameStringArray(
  actual: readonly string[] | undefined,
  expected: readonly string[] | undefined,
): boolean {
  const left = actual ?? [];
  const right = expected ?? [];
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatDefault(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'object' && value !== null && 'name' in value)
    return String((value as { name: unknown }).name);
  return JSON.stringify(value);
}

function formatStringArray(value: readonly string[] | undefined): string {
  return `[${(value ?? []).join(', ')}]`;
}
