import { describe, expect, it } from 'vitest';

import { checkDomainEventSchemaDrift, type DomainEventDatamodel } from './schema-drift-check';

function conformingDatamodel(): DomainEventDatamodel {
  return {
    models: [
      {
        name: 'DomainEvent',
        dbName: 'domain_events',
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            isId: true,
            hasDefaultValue: true,
            default: { name: 'cuid', args: [1] },
          },
          {
            name: 'seq',
            kind: 'scalar',
            type: 'BigInt',
            isRequired: true,
            isList: false,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          },
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
            hasDefaultValue: true,
            default: 1,
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
            name: 'integrationCapabilityId',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_capability_id',
          },
          {
            name: 'integrationCapabilityVersion',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_capability_version',
          },
          {
            name: 'integrationCapabilityDigest',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_capability_digest',
          },
          {
            name: 'integrationBindingId',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_binding_id',
          },
          {
            name: 'integrationBindingVersion',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_binding_version',
          },
          {
            name: 'integrationEnvelopeVersion',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_envelope_version',
          },
          {
            name: 'integrationSourceApp',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_source_app',
          },
          {
            name: 'integrationPayload',
            kind: 'scalar',
            type: 'Json',
            isRequired: false,
            isList: false,
            dbName: 'integration_payload',
          },
          {
            name: 'integrationPayloadDigest',
            kind: 'scalar',
            type: 'String',
            isRequired: false,
            isList: false,
            dbName: 'integration_payload_digest',
          },
          {
            name: 'createdAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: true,
            isList: false,
            dbName: 'created_at',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          },
          {
            name: 'deliveries',
            kind: 'object',
            type: 'DomainEventDelivery',
            isRequired: true,
            isList: true,
          },
        ],
      },
      {
        name: 'IntegrationEventReceipt',
        dbName: 'integration_event_receipts',
        uniqueFields: [['sourceApp', 'eventId']],
        uniqueIndexes: [{ fields: ['sourceApp', 'eventId'] }],
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            isId: true,
            hasDefaultValue: true,
            default: { name: 'cuid', args: [1] },
          },
          {
            name: 'sourceApp',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'source_app',
          },
          {
            name: 'eventId',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'event_id',
          },
          {
            name: 'capabilityId',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'capability_id',
          },
          {
            name: 'capabilityVersion',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'capability_version',
          },
          {
            name: 'bindingId',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'binding_id',
          },
          {
            name: 'bindingVersion',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'binding_version',
          },
          {
            name: 'payloadDigest',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'payload_digest',
          },
          {
            name: 'processedAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: true,
            isList: false,
            dbName: 'processed_at',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          },
          {
            name: 'createdAt',
            kind: 'scalar',
            type: 'DateTime',
            isRequired: true,
            isList: false,
            dbName: 'created_at',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          },
        ],
      },
      {
        name: 'DomainEventDelivery',
        dbName: 'domain_event_deliveries',
        uniqueFields: [['eventId', 'handlerKey']],
        uniqueIndexes: [{ fields: ['eventId', 'handlerKey'] }],
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            isId: true,
            hasDefaultValue: true,
            default: { name: 'cuid', args: [1] },
          },
          {
            name: 'eventId',
            kind: 'scalar',
            type: 'String',
            isRequired: true,
            isList: false,
            dbName: 'event_id',
          },
          {
            name: 'event',
            kind: 'object',
            type: 'DomainEvent',
            isRequired: true,
            isList: false,
            relationName: 'DomainEventToDomainEventDelivery',
            relationFromFields: ['eventId'],
            relationToFields: ['id'],
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
            hasDefaultValue: true,
            default: 'PENDING',
          },
          {
            name: 'attempts',
            kind: 'scalar',
            type: 'Int',
            isRequired: true,
            isList: false,
            hasDefaultValue: true,
            default: 0,
          },
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
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
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

  it('reports a missing id/default contract', () => {
    const datamodel = conformingDatamodel();
    const model = datamodel.models.find((candidate) => candidate.name === 'DomainEvent');
    const field = model?.fields.find((candidate) => candidate.name === 'id');
    if (!field) throw new Error('fixture missing id');
    field.isId = false;
    field.default = undefined;

    expect(checkDomainEventSchemaDrift(datamodel)).toEqual(
      expect.arrayContaining([
        'model DomainEvent.id isId=false, expected true',
        'model DomainEvent.id default is undefined, expected cuid',
      ]),
    );
  });

  it('reports a missing delivery uniqueness contract', () => {
    const datamodel = conformingDatamodel();
    const model = datamodel.models.find((candidate) => candidate.name === 'DomainEventDelivery');
    if (!model) throw new Error('fixture missing DomainEventDelivery');
    model.uniqueFields = [];
    model.uniqueIndexes = [];

    expect(checkDomainEventSchemaDrift(datamodel)).toContain(
      'model DomainEventDelivery is missing @@unique([eventId, handlerKey])',
    );
  });

  it('reports a missing delivery relation contract', () => {
    const datamodel = conformingDatamodel();
    const model = datamodel.models.find((candidate) => candidate.name === 'DomainEventDelivery');
    const field = model?.fields.find((candidate) => candidate.name === 'event');
    if (!field) throw new Error('fixture missing event relation');
    field.relationFromFields = [];

    expect(checkDomainEventSchemaDrift(datamodel)).toContain(
      'model DomainEventDelivery.event relationFromFields is [], expected [eventId]',
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
