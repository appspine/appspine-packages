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
  isUpdatedAt?: boolean;
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
    isUpdatedAt: true,
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
    if ((field.isUpdatedAt ?? false) !== (expected.isUpdatedAt ?? false)) {
      issues.push(
        `model Notification.${expected.name} isUpdatedAt=${field.isUpdatedAt ?? false}, expected ${expected.isUpdatedAt ?? false}`,
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
  // `undefined` here means "could not verify" and must fail loud, not be treated as "no drift".
  const indexes = metadata?.indexes ?? model.indexes;
  if (indexes === undefined) {
    issues.push(
      'model Notification indexes could not be verified: pass schema metadata from ' +
        'parseNotificationSchemaMetadata() (Prisma 6 omits non-unique indexes from the runtime DMMF)',
    );
  } else {
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

/**
 * Parses the contract-relevant pieces of a consumer-owned Prisma schema and migration.
 *
 * Schema-side matches (`@@index`, `@updatedAt`) are scoped to the `model Notification { ... }`
 * block only — matching against the whole schema file would let an unrelated model's index or
 * `@updatedAt` field satisfy the check even when `Notification` itself is missing one. Both the
 * schema and migration text are comment-stripped first, so a commented-out `@@index`/model
 * definition can't produce a false "present" reading.
 *
 * If the `Notification` model block can't be found in `schemaText` at all, `indexes` and
 * `updatedAtFields` come back `undefined` (not `[]`) — an empty array means "the block was found
 * and genuinely has none," which is real drift; `undefined` means "couldn't check," which
 * `checkNotificationSchemaDrift` reports as an explicit could-not-verify issue instead of
 * misreporting drift that may not exist. `migrationIndexes` gets the same `undefined` treatment
 * when no migration text is supplied.
 *
 * Migration indexes are computed by replaying `CREATE INDEX`/`DROP INDEX` statements in the order
 * they appear (matching Postgres's own execution order for a concatenated, chronologically sorted
 * migration history) and keeping only indexes still live at the end — a later migration that drops
 * an index the contract requires is therefore still caught, not masked by an earlier CREATE.
 *
 * `notificationTableName`, when provided, scopes `CREATE INDEX ... ON "<table>"` matches (including
 * schema-qualified forms like `"public"."<table>"`) to that physical table so an index created for
 * a different table in the same migration text can't satisfy the contract. Omit it only when the
 * caller has already isolated migration text to statements that touch the notification table.
 */
export function parseNotificationSchemaMetadata(
  schemaText: string,
  migrationText = '',
  notificationTableName?: string,
): NotificationSchemaMetadata {
  const strippedSchema = stripLineComments(schemaText, ['//'], '"');
  const modelBlock = extractModelBlock(strippedSchema, 'Notification');
  const indexes =
    modelBlock === null
      ? undefined
      : [...modelBlock.matchAll(/@@index\s*\(\s*\[([^\]]+)\]/g)].map((match) => ({
          fields: parseSchemaFields(match[1]),
        }));
  const updatedAtFields =
    modelBlock === null
      ? undefined
      : [...modelBlock.matchAll(/^\s*(\w+)\s+[^\n]*@updatedAt\b/gm)].map((match) => match[1]);

  const strippedMigration = stripSqlComments(migrationText);
  const migrationIndexes =
    strippedMigration.trim() === ''
      ? undefined
      : computeLiveMigrationIndexes(strippedMigration, notificationTableName);

  return { indexes, migrationIndexes, updatedAtFields };
}

/** Extracts a `model <name> { ... }` block via balanced-brace matching, or null if not found. */
function extractModelBlock(schemaText: string, modelName: string): string | null {
  const startPattern = new RegExp(`\\bmodel\\s+${modelName}\\s*\\{`);
  const startMatch = startPattern.exec(schemaText);
  if (!startMatch) return null;
  const openBraceIndex = startMatch.index + startMatch[0].length - 1;
  let depth = 0;
  for (let i = openBraceIndex; i < schemaText.length; i++) {
    if (schemaText[i] === '{') depth++;
    else if (schemaText[i] === '}') {
      depth--;
      if (depth === 0) return schemaText.slice(openBraceIndex, i + 1);
    }
  }
  return null;
}

/**
 * Replays `CREATE INDEX`/`DROP INDEX` statements in textual order and returns only indexes still
 * live afterward. Index names are unique per Postgres schema regardless of table, so a `DROP
 * INDEX "name"` unambiguously removes whichever `CREATE INDEX "name"` this scan already recorded
 * — including one recorded before table-scoping was known to matter — without needing the table
 * name itself (Postgres's `DROP INDEX` syntax doesn't carry one).
 */
function computeLiveMigrationIndexes(
  migrationText: string,
  notificationTableName?: string,
): NotificationIndexMetadata[] {
  const tableRef = '(?:"[^"]+"\\s*\\.\\s*)?"([^"]+)"';
  const statementPattern = new RegExp(
    `CREATE\\s+INDEX\\s+"([^"]+)"\\s+ON\\s+${tableRef}\\s*\\(([^)]+)\\)` +
      `|DROP\\s+INDEX\\s+(?:IF\\s+EXISTS\\s+)?${tableRef}`,
    'gi',
  );
  const live = new Map<string, string[]>();
  for (const match of migrationText.matchAll(statementPattern)) {
    const [, createName, createTable, createFields, dropName] = match;
    if (createName !== undefined) {
      if (
        notificationTableName &&
        createTable.toLowerCase() !== notificationTableName.toLowerCase()
      ) {
        continue;
      }
      live.set(createName, parseMigrationFields(createFields));
    } else if (dropName !== undefined) {
      live.delete(dropName);
    }
  }
  return [...live.values()].map((fields) => ({ fields }));
}

/**
 * Strips `//`/`///` line comments outside of double-quoted strings — good enough for Prisma
 * schema text, which has no block-comment syntax and no `//` inside its `@map("...")`-style
 * string literals in practice.
 */
function stripLineComments(text: string, prefixes: string[], stringQuote: string): string {
  return text
    .split('\n')
    .map((line) => stripLineCommentFromLine(line, prefixes, stringQuote))
    .join('\n');
}

function stripLineCommentFromLine(line: string, prefixes: string[], stringQuote: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === stringQuote) inString = !inString;
    if (!inString) {
      for (const prefix of prefixes) {
        if (line.startsWith(prefix, i)) return line.slice(0, i);
      }
    }
  }
  return line;
}

/** Strips SQL block comments and `--` line comments outside of single-quoted strings. */
function stripSqlComments(sql: string): string {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return stripLineComments(withoutBlockComments, ['--'], "'");
}

function parseSchemaFields(value: string): string[] {
  return value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

/** Extracts the quoted column name, ignoring trailing sort modifiers like `DESC`/`NULLS LAST`. */
function parseMigrationFields(value: string): string[] {
  return value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => {
      const match = /^"([^"]+)"/.exec(field);
      return match ? match[1] : field;
    })
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
