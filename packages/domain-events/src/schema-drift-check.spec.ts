import { describe, expect, it } from 'vitest';

import { checkDomainEventSchemaDrift, type DomainEventDatamodel } from './schema-drift-check';

function conformingDatamodel(): DomainEventDatamodel {
  return {
    models: [
      {
        name: 'DomainEvent',
        dbName: 'domain_events',
        fields: [
          { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false },
          { name: 'seq', kind: 'scalar', type: 'BigInt', isRequired: true, isList: false },
          {
            name: 'aggregateType',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'aggregate_type',
          },
          {
            name: 'aggregateId',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'aggregate_id',
          },
          {
            name: 'eventType',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'event_type',
          },
          {
            name: 'operation',
            kind: 'enum',
            type: 'DomainEventOperation',
            isRequired: true,
            isList: false,
          },
          {
            name: 'schemaVersion',
            kind: 'scalar',
            type: 'Int',
            isRequired: true,
            isList: false,
            dbName: 'schema_version',
          },
          {
            name: 'actorUserId',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'actor_user_id',
          },
          {
            name: 'correlationId',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'correlation_id',
          },
          {
            name: 'workflowId',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'workflow_id',
          },
          { name: 'before', kind: 'scalar', type: 'Json', isRequired: false, isList: false },
          { name: 'after', kind: 'scalar', type: 'Json', isRequired: false, isList: false },
          {
            name: 'changedFields',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: true,
            dbName: 'changed_fields',
          },
          { name: 'metadata', kind: 'scalar', type: 'Json', isRequired: false, isList: false },
          {
            name: 'createdAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: true,
            isList: false,
            dbName: 'created_at',
          },
        ],
      },
      {
        name: 'DomainEventDelivery',
        dbName: 'domain_event_deliveries',
        fields: [
          { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false },
          {
            name: 'eventId',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'event_id',
          },
          {
            name: 'handlerKey',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'handler_key',
          },
          {
            name: 'status',
            kind: 'enum',
            type: 'DomainEventDeliveryStatus',
            isRequired: true,
            isList: false,
          },
          { name: 'attempts', kind: 'scalar', type: 'Int', isRequired: true, isList: false },
          {
            name: 'nextAttemptAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: false,
            isList: false,
            dbName: 'next_attempt_at',
          },
          {
            name: 'lockedAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: false,
            isList: false,
            dbName: 'locked_at',
          },
          {
            name: 'lockedBy',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'locked_by',
          },
          {
            name: 'lastError',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'last_error',
          },
          {
            name: 'processedAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: false,
            isList: false,
            dbName: 'processed_at',
          },
          {
            name: 'createdAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: true,
            isList: false,
            dbName: 'created_at',
          },
        ],
      },
    ],
    enums: [
      {
        name: 'DomainEventOperation',
        values: [{ name: 'CREATE' }, { name: 'UPDATE' }, { name: 'DELETE' }],
      },
      {
        name: 'DomainEventDeliveryStatus',
        values: [
          { name: 'PENDING' },
          { name: 'PROCESSING' },
          { name: 'PROCESSED' },
          { name: 'DEAD_LETTER' },
          { name: 'IGNORED' },
        ],
      },
    ],
  };
}

describe('checkDomainEventSchemaDrift', () => {
  it('reports no issues for a datamodel matching the documented pattern exactly', () => {
    expect(checkDomainEventSchemaDrift(conformingDatamodel())).toEqual([]);
  });

  it('reports a missing model', () => {
    const datamodel = conformingDatamodel();
    datamodel.models = datamodel.models.filter((model) => model.name !== 'DomainEventDelivery');

    expect(checkDomainEventSchemaDrift(datamodel)).toContain('model DomainEventDelivery not found');
  });

  it('reports a table name that no longer matches @@map', () => {
    const datamodel = conformingDatamodel();
    const model = datamodel.models.find((candidate) => candidate.name === 'DomainEvent');
    if (!model) throw new Error('fixture missing DomainEvent');
    model.dbName = 'events';

    expect(checkDomainEventSchemaDrift(datamodel)).toContain(
      'model DomainEvent maps to table "events", expected "domain_events"',
    );
  });

  it('reports a missing field', () => {
    const datamodel = conformingDatamodel();
    const model = datamodel.models.find((candidate) => candidate.name === 'DomainEvent');
    if (!model) throw new Error('fixture missing DomainEvent');
    model.fields = model.fields.filter((field) => field.name !== 'workflowId');

    expect(checkDomainEventSchemaDrift(datamodel)).toContain(
      'model DomainEvent is missing field workflowId',
    );
  });

  it('reports a column mapping that no longer matches @map', () => {
    const datamodel = conformingDatamodel();
    const model = datamodel.models.find((candidate) => candidate.name === 'DomainEventDelivery');
    const field = model?.fields.find((candidate) => candidate.name === 'handlerKey');
    if (!field) throw new Error('fixture missing handlerKey');
    field.dbName = 'handler_id';

    expect(checkDomainEventSchemaDrift(datamodel)).toContain(
      'model DomainEventDelivery.handlerKey maps to column "handler_id", expected "handler_key"',
    );
  });

  it('reports a field that became optional when the pattern requires it', () => {
    const datamodel = conformingDatamodel();
    const model = datamodel.models.find((candidate) => candidate.name === 'DomainEvent');
    const field = model?.fields.find((candidate) => candidate.name === 'eventType');
    if (!field) throw new Error('fixture missing eventType');
    field.isRequired = false;

    expect(checkDomainEventSchemaDrift(datamodel)).toContain(
      'model DomainEvent.eventType is optional, expected required',
    );
  });

  it('reports an enum missing a required value', () => {
    const datamodel = conformingDatamodel();
    const domainEventEnum = datamodel.enums.find(
      (candidate) => candidate.name === 'DomainEventDeliveryStatus',
    );
    if (!domainEventEnum) throw new Error('fixture missing DomainEventDeliveryStatus');
    domainEventEnum.values = domainEventEnum.values.filter((value) => value.name !== 'DEAD_LETTER');

    expect(checkDomainEventSchemaDrift(datamodel)).toContain(
      'enum DomainEventDeliveryStatus is missing value(s): DEAD_LETTER',
    );
  });
});
