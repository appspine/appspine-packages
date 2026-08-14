import assert from 'node:assert/strict';
import { DomainEventRegistry, DomainEventsService } from '@appspine/domain-events';
import { createMockDomainEventTx } from '@appspine/domain-events/testing';
import {
  buildExternalEventEnvelope,
  canonicalJson,
  sha256Digest,
} from '@appspine/integration-contracts';

const envelope = buildExternalEventEnvelope({
  eventId: 'clean-consumer-event',
  eventType: 'fixture.event',
  capabilityId: 'fixture.capability',
  capabilityVersion: '1.0.0',
  capabilityDigest: `sha256:${'0'.repeat(64)}`,
  bindingId: 'fixture.binding',
  bindingVersion: '1.0.0',
  sourceApp: 'clean-consumer',
  occurredAt: '2026-08-07T00:00:00.000Z',
  aggregateType: 'Fixture',
  aggregateId: 'fixture-1',
  correlationId: null,
  actor: { userId: null },
  payload: { revision: 1 },
});
assert.equal(envelope.payloadDigest, sha256Digest(envelope.payload));
assert.equal(canonicalJson(envelope).includes('clean-consumer-event'), true);

const mock = createMockDomainEventTx();
const pinnedSchema = {
  type: 'object',
  properties: { revision: { type: 'integer', 'x-appspine-data-classification': 'INTERNAL' } },
  required: ['revision'],
  additionalProperties: false,
};
const event = await new DomainEventsService(new DomainEventRegistry(), {
  resolve: () => ({ capabilityDigest: envelope.capabilityDigest, payloadSchema: pinnedSchema }),
}).record(mock.tx, {
  aggregateType: 'Fixture',
  aggregateId: 'fixture-1',
  eventType: 'fixture.event',
  operation: 'CREATE',
  changedFields: [],
  integration: {
    capabilityId: 'fixture.capability',
    capabilityVersion: '1.0.0',
    bindingId: 'fixture.binding',
    bindingVersion: '1.0.0',
    envelopeVersion: '2',
    sourceApp: 'clean-consumer',
    payload: envelope.payload,
    payloadDigest: envelope.payloadDigest,
    payloadSchema: pinnedSchema,
  },
});
assert.equal(event.integrationPayloadDigest, envelope.payloadDigest);
assert.equal(event.eventType, 'fixture.event');
console.log(
  'clean consumer passed: root package imports, envelope digest, and domain-event test double round trip',
);
