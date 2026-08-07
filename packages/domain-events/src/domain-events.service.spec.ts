import { describe, expect, it, vi } from 'vitest';

import { DomainEventRegistry } from './domain-event-registry';
import { DomainEventsService } from './domain-events.service';
import { createMockDomainEventTx } from './testing';
import { DomainEventOperation } from './types';

describe('DomainEventsService.record', () => {
  it('freezes an integration payload and persists its deterministic digest with the outbox row', async () => {
    const registry = new DomainEventRegistry();
    const service = new DomainEventsService(registry, {
      resolve: () => ({
        capabilityDigest: `sha256:${'0'.repeat(64)}`,
        payloadSchema: {
          type: 'object',
          required: ['documentId', 'revision'],
          properties: {
            documentId: { type: 'string', 'x-appspine-data-classification': 'INTERNAL' },
            revision: { type: 'integer', 'x-appspine-data-classification': 'INTERNAL' },
          },
          additionalProperties: false,
        },
      }),
    });
    const { state, tx } = createMockDomainEventTx();
    const payload = { documentId: 'doc-1', revision: 2 } as const;

    await service.record(tx as never, {
      aggregateType: 'WikiPage',
      aggregateId: 'doc-1',
      eventType: 'wiki.document.change-approved',
      operation: DomainEventOperation.UPDATE,
      integration: {
        capabilityId: 'approve.knowledge-document-change-approved',
        capabilityVersion: '1.0.0',
        bindingId: 'approve-to-wiki.knowledge-document-change-approved',
        bindingVersion: '1.0.0',
        sourceApp: 'approve',
        payload,
      },
      integrationPayloadSchema: {
        type: 'object',
        required: ['documentId', 'revision'],
        properties: {
          documentId: { type: 'string', 'x-appspine-data-classification': 'INTERNAL' },
          revision: { type: 'integer', 'x-appspine-data-classification': 'INTERNAL' },
        },
        additionalProperties: false,
      },
    });

    expect(state.events[0]).toMatchObject({
      integrationCapabilityId: 'approve.knowledge-document-change-approved',
      integrationBindingId: 'approve-to-wiki.knowledge-document-change-approved',
      integrationPayload: payload,
      integrationPayloadDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect(Object.isFrozen(state.events[0].integrationPayload)).toBe(true);
  });

  it('creates the event, computes changedFields, and fans out to code-registered plus contributed handler keys', async () => {
    // Simulates an app-local data-driven handler-key contributor (e.g. webhook subscriptions):
    // record()/fan-out never queries that model directly (plan 026 §11.1 G6/G3).
    const webhooks = [{ id: 'hook-1' }, { id: 'hook-2' }];
    const registry = new DomainEventRegistry();
    registry.on('submitted', { key: 'audit-record', async handle() {} });
    registry.registerHandlerKeyContributor(async (_tx, input) =>
      webhooks
        .map((webhook) => `webhook.post:${webhook.id}`)
        .filter(() => input.eventType === 'submitted'),
    );
    const service = new DomainEventsService(registry);
    const { state, tx } = createMockDomainEventTx();

    await service.record(tx as never, {
      aggregateType: 'ApprovalInstance',
      aggregateId: 'instance-1',
      eventType: 'submitted',
      operation: DomainEventOperation.CREATE,
      before: null,
      after: { id: 'instance-1', status: 'IN_PROGRESS' },
    });

    expect(state.events).toHaveLength(1);
    expect(state.events[0].changedFields).toEqual(['id', 'status']);
    expect(state.deliveries).toEqual([
      { eventId: 'event-1', handlerKey: 'audit-record' },
      { eventId: 'event-1', handlerKey: 'webhook.post:hook-1' },
      { eventId: 'event-1', handlerKey: 'webhook.post:hook-2' },
    ]);
  });

  it('propagates a delivery-insert failure without swallowing it', async () => {
    const registry = new DomainEventRegistry();
    registry.on('submitted', { key: 'audit-record', async handle() {} });
    const service = new DomainEventsService(registry);
    const { state, tx } = createMockDomainEventTx({ failDelivery: true });

    await expect(
      service.record(tx as never, {
        aggregateType: 'ApprovalInstance',
        aggregateId: 'instance-2',
        eventType: 'submitted',
        operation: DomainEventOperation.CREATE,
        changedFields: ['status'],
      }),
    ).rejects.toThrow('delivery insert failed');

    expect(state.events).toHaveLength(1);
    expect(state.deliveries).toHaveLength(0);
  });

  it('succeeds with zero deliveries for an event type with no registered handler or contributor match', async () => {
    const registry = new DomainEventRegistry();
    const service = new DomainEventsService(registry);
    const { state, tx } = createMockDomainEventTx();
    const createMany = vi.spyOn(tx.domainEventDelivery, 'createMany');

    await service.record(tx as never, {
      aggregateType: 'ApprovalInstance',
      aggregateId: 'instance-3',
      eventType: 'rejected',
      operation: DomainEventOperation.UPDATE,
      changedFields: ['status'],
    });

    expect(state.deliveries).toHaveLength(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('deduplicates handler keys before writing deliveries', async () => {
    const registry = new DomainEventRegistry();
    registry.on('submitted', { key: 'audit-record', async handle() {} });
    registry.registerHandlerKeyContributor(async () => ['audit-record', 'audit-record']);
    const service = new DomainEventsService(registry);
    const { tx } = createMockDomainEventTx();
    const createMany = vi.spyOn(tx.domainEventDelivery, 'createMany');

    await service.record(tx as never, {
      aggregateType: 'ApprovalInstance',
      aggregateId: 'instance-4',
      eventType: 'submitted',
      operation: DomainEventOperation.UPDATE,
      changedFields: ['status'],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'event-1', handlerKey: 'audit-record' }],
      skipDuplicates: true,
    });
  });
});
