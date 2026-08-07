/**
 * Structural drift check for the `DomainEvent`/`DomainEventDelivery` Prisma model pattern this
 * package documents in `docs/prisma-model.md`. The package intentionally does not ship or inject
 * a `.prisma` schema fragment (plan 026 §11.1 G6; Z20 §19-5) — each app owns its own migration
 * history — so this is the same "documented pattern + drift-check script" approach
 * `check:schema-docs` already uses for enum doc-comments (dev_docs/002 §Prisma conventions).
 *
 * `DomainEventDispatcherService.claimDueDeliveries()` hardcodes the physical table/column names
 * below in raw SQL (see its comment). A consuming app whose schema drifts from this pattern would
 * fail at runtime with an opaque Postgres error; this check catches that at migration/CI time
 * instead, against the app's own generated `Prisma.dmmf.datamodel` — never a hand-maintained
 * schema string.
 *
 * Usage from a consuming app (mirrors `check:schema-docs`'s own entrypoint pattern):
 *
 * ```ts
 * import { Prisma } from "@prisma/client";
 * import { checkDomainEventSchemaDrift } from "@appspine/domain-events";
 *
 * const issues = checkDomainEventSchemaDrift(Prisma.dmmf.datamodel);
 * for (const issue of issues) console.error(`[domain-events-schema-drift] ${issue}`);
 * if (issues.length > 0) process.exit(1);
 * ```
 */

import type { DmmfEnum, DmmfField, DmmfModel, PrismaDmmfDatamodel } from '@appspine/common';

export type { DmmfEnum, DmmfField, DmmfModel };

/**
 * Structurally compatible with `@prisma/client`'s `Prisma.dmmf.datamodel` (whose arrays are
 * `ReadonlyDeep`), so callers can pass it straight through without casting. An alias of
 * `@appspine/common`'s `PrismaDmmfDatamodel`, kept under this package's own established name
 * since it's part of this package's public API (see the usage example above).
 */
export type DomainEventDatamodel = PrismaDmmfDatamodel;

type ExpectedField = {
  name: string;
  kind: 'scalar' | 'enum' | 'object';
  type: string;
  optional?: boolean;
  isList?: boolean;
  /** Physical column name. Omit when the field has no `@map` (physical name equals `name`). */
  column?: string;
  isId?: boolean;
  default?: ExpectedDefault;
  relationFromFields?: string[];
  relationToFields?: string[];
};

type ExpectedModel = {
  name: string;
  table: string;
  fields: ExpectedField[];
  uniqueFields?: string[][];
};

type ExpectedEnum = {
  name: string;
  values: string[];
};

type ExpectedDefault = string | number | { name: string };

const EXPECTED_MODELS: ExpectedModel[] = [
  {
    name: 'DomainEvent',
    table: 'domain_events',
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isId: true, default: { name: 'cuid' } },
      { name: 'seq', kind: 'scalar', type: 'BigInt', default: { name: 'autoincrement' } },
      { name: 'aggregateType', kind: 'scalar', type: 'String', column: 'aggregate_type' },
      { name: 'aggregateId', kind: 'scalar', type: 'String', column: 'aggregate_id' },
      { name: 'eventType', kind: 'scalar', type: 'String', column: 'event_type' },
      { name: 'operation', kind: 'enum', type: 'DomainEventOperation' },
      { name: 'schemaVersion', kind: 'scalar', type: 'Int', column: 'schema_version', default: 1 },
      {
        name: 'actorUserId',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'actor_user_id',
      },
      {
        name: 'correlationId',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'correlation_id',
      },
      { name: 'workflowId', kind: 'scalar', type: 'String', optional: true, column: 'workflow_id' },
      { name: 'before', kind: 'scalar', type: 'Json', optional: true },
      { name: 'after', kind: 'scalar', type: 'Json', optional: true },
      {
        name: 'changedFields',
        kind: 'scalar',
        type: 'String',
        isList: true,
        column: 'changed_fields',
      },
      { name: 'metadata', kind: 'scalar', type: 'Json', optional: true },
      {
        name: 'integrationCapabilityId',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_capability_id',
      },
      {
        name: 'integrationCapabilityVersion',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_capability_version',
      },
      {
        name: 'integrationCapabilityDigest',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_capability_digest',
      },
      {
        name: 'integrationBindingId',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_binding_id',
      },
      {
        name: 'integrationBindingVersion',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_binding_version',
      },
      {
        name: 'integrationEnvelopeVersion',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_envelope_version',
      },
      {
        name: 'integrationSourceApp',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_source_app',
      },
      {
        name: 'integrationPayload',
        kind: 'scalar',
        type: 'Json',
        optional: true,
        column: 'integration_payload',
      },
      {
        name: 'integrationPayloadDigest',
        kind: 'scalar',
        type: 'String',
        optional: true,
        column: 'integration_payload_digest',
      },
      {
        name: 'createdAt',
        kind: 'scalar',
        type: 'DateTime',
        column: 'created_at',
        default: { name: 'now' },
      },
      { name: 'deliveries', kind: 'object', type: 'DomainEventDelivery', isList: true },
    ],
  },
  {
    name: 'DomainEventDelivery',
    table: 'domain_event_deliveries',
    uniqueFields: [['eventId', 'handlerKey']],
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isId: true, default: { name: 'cuid' } },
      { name: 'eventId', kind: 'scalar', type: 'String', column: 'event_id' },
      {
        name: 'event',
        kind: 'object',
        type: 'DomainEvent',
        relationFromFields: ['eventId'],
        relationToFields: ['id'],
      },
      { name: 'handlerKey', kind: 'scalar', type: 'String', column: 'handler_key' },
      { name: 'status', kind: 'enum', type: 'DomainEventDeliveryStatus', default: 'PENDING' },
      { name: 'attempts', kind: 'scalar', type: 'Int', default: 0 },
      {
        name: 'nextAttemptAt',
        kind: 'scalar',
        type: 'DateTime',
        optional: true,
        column: 'next_attempt_at',
      },
      { name: 'lockedAt', kind: 'scalar', type: 'DateTime', optional: true, column: 'locked_at' },
      { name: 'lockedBy', kind: 'scalar', type: 'String', optional: true, column: 'locked_by' },
      { name: 'lastError', kind: 'scalar', type: 'String', optional: true, column: 'last_error' },
      {
        name: 'processedAt',
        kind: 'scalar',
        type: 'DateTime',
        optional: true,
        column: 'processed_at',
      },
      {
        name: 'createdAt',
        kind: 'scalar',
        type: 'DateTime',
        column: 'created_at',
        default: { name: 'now' },
      },
    ],
  },
  {
    name: 'IntegrationEventReceipt',
    table: 'integration_event_receipts',
    uniqueFields: [['sourceApp', 'eventId']],
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isId: true, default: { name: 'cuid' } },
      { name: 'sourceApp', kind: 'scalar', type: 'String', column: 'source_app' },
      { name: 'eventId', kind: 'scalar', type: 'String', column: 'event_id' },
      { name: 'capabilityId', kind: 'scalar', type: 'String', column: 'capability_id' },
      { name: 'capabilityVersion', kind: 'scalar', type: 'String', column: 'capability_version' },
      { name: 'capabilityDigest', kind: 'scalar', type: 'String', column: 'capability_digest' },
      { name: 'bindingId', kind: 'scalar', type: 'String', column: 'binding_id' },
      { name: 'bindingVersion', kind: 'scalar', type: 'String', column: 'binding_version' },
      { name: 'payloadDigest', kind: 'scalar', type: 'String', column: 'payload_digest' },
      {
        name: 'processedAt',
        kind: 'scalar',
        type: 'DateTime',
        column: 'processed_at',
        default: { name: 'now' },
      },
      {
        name: 'createdAt',
        kind: 'scalar',
        type: 'DateTime',
        column: 'created_at',
        default: { name: 'now' },
      },
    ],
  },
];

const EXPECTED_ENUMS: ExpectedEnum[] = [
  { name: 'DomainEventOperation', values: ['CREATE', 'UPDATE', 'DELETE'] },
  {
    name: 'DomainEventDeliveryStatus',
    values: ['PENDING', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER', 'IGNORED'],
  },
];

/**
 * Compares an app's generated `Prisma.dmmf.datamodel` against the documented
 * `DomainEvent`/`DomainEventDelivery` model pattern. Returns a human-readable issue per drift;
 * an empty array means the schema matches closely enough for this package's dispatcher and
 * service code to operate correctly (field presence, type, optionality, list-ness, and the
 * physical table/column names the dispatcher's raw SQL depends on).
 */
export function checkDomainEventSchemaDrift(datamodel: DomainEventDatamodel): string[] {
  const issues: string[] = [];

  for (const expectedModel of EXPECTED_MODELS) {
    const model = datamodel.models.find((candidate) => candidate.name === expectedModel.name);
    if (!model) {
      issues.push(`model ${expectedModel.name} not found`);
      continue;
    }

    const actualTable = model.dbName ?? model.name;
    if (actualTable !== expectedModel.table) {
      issues.push(
        `model ${expectedModel.name} maps to table "${actualTable}", expected "${expectedModel.table}"`,
      );
    }

    for (const expectedUnique of expectedModel.uniqueFields ?? []) {
      if (!hasUniqueFields(model, expectedUnique)) {
        issues.push(
          `model ${expectedModel.name} is missing @@unique([${expectedUnique.join(', ')}])`,
        );
      }
    }

    for (const expectedField of expectedModel.fields) {
      const field = model.fields.find((candidate) => candidate.name === expectedField.name);
      if (!field) {
        issues.push(`model ${expectedModel.name} is missing field ${expectedField.name}`);
        continue;
      }

      if (field.kind !== expectedField.kind || field.type !== expectedField.type) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} has type ${field.kind}:${field.type}, expected ${expectedField.kind}:${expectedField.type}`,
        );
      }

      const expectedRequired = !expectedField.optional;
      if (field.isRequired !== expectedRequired) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} is ${field.isRequired ? 'required' : 'optional'}, expected ${expectedRequired ? 'required' : 'optional'}`,
        );
      }

      const expectedIsList = expectedField.isList ?? false;
      if (field.isList !== expectedIsList) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} isList=${field.isList}, expected ${expectedIsList}`,
        );
      }

      const expectedColumn = expectedField.column ?? expectedField.name;
      const actualColumn = field.dbName ?? field.name;
      if (actualColumn !== expectedColumn) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} maps to column "${actualColumn}", expected "${expectedColumn}"`,
        );
      }

      if ((field.isId ?? false) !== (expectedField.isId ?? false)) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} isId=${field.isId ?? false}, expected ${expectedField.isId ?? false}`,
        );
      }

      if (!defaultMatches(field.default, expectedField.default)) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} default is ${formatDefault(field.default)}, expected ${formatDefault(expectedField.default)}`,
        );
      }

      if (!sameStringArray(field.relationFromFields, expectedField.relationFromFields)) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} relationFromFields is ${formatStringArray(field.relationFromFields)}, expected ${formatStringArray(expectedField.relationFromFields)}`,
        );
      }

      if (!sameStringArray(field.relationToFields, expectedField.relationToFields)) {
        issues.push(
          `model ${expectedModel.name}.${expectedField.name} relationToFields is ${formatStringArray(field.relationToFields)}, expected ${formatStringArray(expectedField.relationToFields)}`,
        );
      }
    }
  }

  for (const expectedEnum of EXPECTED_ENUMS) {
    const found = datamodel.enums.find((candidate) => candidate.name === expectedEnum.name);
    if (!found) {
      issues.push(`enum ${expectedEnum.name} not found`);
      continue;
    }

    const actualValues = new Set(found.values.map((value) => value.name));
    const missing = expectedEnum.values.filter((value) => !actualValues.has(value));
    if (missing.length > 0) {
      issues.push(`enum ${expectedEnum.name} is missing value(s): ${missing.join(', ')}`);
    }
  }

  return issues;
}

function hasUniqueFields(model: DmmfModel, expectedFields: string[]): boolean {
  const matches = (fields: readonly string[]) => sameStringArray(fields, expectedFields);
  return (
    model.uniqueFields?.some(matches) === true ||
    model.uniqueIndexes?.some((index) => matches(index.fields)) === true
  );
}

function defaultMatches(actual: unknown, expected: ExpectedDefault | undefined): boolean {
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
  const normalizedActual = actual ?? [];
  const normalizedExpected = expected ?? [];
  return (
    normalizedActual.length === normalizedExpected.length &&
    normalizedActual.every((value, index) => value === normalizedExpected[index])
  );
}

function formatDefault(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'object' && value !== null && 'name' in value) {
    return String((value as { name: unknown }).name);
  }
  return JSON.stringify(value);
}

function formatStringArray(value: readonly string[] | undefined): string {
  return `[${(value ?? []).join(', ')}]`;
}
