import {
  buildExternalEventEnvelope,
  canonicalJson,
  sha256Digest,
  validateJsonSchema,
} from '../dist/index';

const payload = { id: 'consumer-fixture', revision: 1 } as const;
const schema = { type: 'object', required: ['id', 'revision'], additionalProperties: false };

const issues = validateJsonSchema(payload, schema, { enforceClassification: false });
const envelope = buildExternalEventEnvelope({
  eventId: 'consumer-event',
  eventType: 'consumer.fixture',
  capabilityId: 'fixture.capability',
  capabilityVersion: '1.0.0',
  capabilityDigest: `sha256:${'0'.repeat(64)}`,
  bindingId: 'fixture.binding',
  bindingVersion: '1.0.0',
  sourceApp: 'consumer',
  occurredAt: '2026-08-07T00:00:00.000Z',
  aggregateType: 'Fixture',
  aggregateId: 'consumer-fixture',
  correlationId: null,
  actor: { userId: null },
  payload,
});

export const consumerCompileFixture = {
  issues,
  digest: sha256Digest(canonicalJson(envelope)),
};
