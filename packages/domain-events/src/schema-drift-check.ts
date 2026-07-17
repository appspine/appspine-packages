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

export type DmmfField = {
  name: string;
  kind: string;
  type: string;
  isRequired: boolean;
  isList: boolean;
  dbName?: string | null;
};

export type DmmfModel = {
  name: string;
  dbName?: string | null;
  fields: readonly DmmfField[];
};

export type DmmfEnum = {
  name: string;
  values: readonly { name: string }[];
};

/**
 * Structurally compatible with `@prisma/client`'s `Prisma.dmmf.datamodel` (whose arrays are
 * `ReadonlyDeep`), so callers can pass it straight through without casting.
 */
export type DomainEventDatamodel = {
  models: readonly DmmfModel[];
  enums: readonly DmmfEnum[];
};

type ExpectedField = {
  name: string;
  kind: 'scalar' | 'enum';
  type: string;
  optional?: boolean;
  isList?: boolean;
  /** Physical column name. Omit when the field has no `@map` (physical name equals `name`). */
  column?: string;
};

type ExpectedModel = {
  name: string;
  table: string;
  fields: ExpectedField[];
};

type ExpectedEnum = {
  name: string;
  values: string[];
};

const EXPECTED_MODELS: ExpectedModel[] = [
  {
    name: 'DomainEvent',
    table: 'domain_events',
    fields: [
      { name: 'id', kind: 'scalar', type: 'String' },
      { name: 'seq', kind: 'scalar', type: 'BigInt' },
      { name: 'aggregateType', kind: 'scalar', type: 'String', column: 'aggregate_type' },
      { name: 'aggregateId', kind: 'scalar', type: 'String', column: 'aggregate_id' },
      { name: 'eventType', kind: 'scalar', type: 'String', column: 'event_type' },
      { name: 'operation', kind: 'enum', type: 'DomainEventOperation' },
      { name: 'schemaVersion', kind: 'scalar', type: 'Int', column: 'schema_version' },
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
      { name: 'createdAt', kind: 'scalar', type: 'DateTime', column: 'created_at' },
    ],
  },
  {
    name: 'DomainEventDelivery',
    table: 'domain_event_deliveries',
    fields: [
      { name: 'id', kind: 'scalar', type: 'String' },
      { name: 'eventId', kind: 'scalar', type: 'String', column: 'event_id' },
      { name: 'handlerKey', kind: 'scalar', type: 'String', column: 'handler_key' },
      { name: 'status', kind: 'enum', type: 'DomainEventDeliveryStatus' },
      { name: 'attempts', kind: 'scalar', type: 'Int' },
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
      { name: 'createdAt', kind: 'scalar', type: 'DateTime', column: 'created_at' },
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
