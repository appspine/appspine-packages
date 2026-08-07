import { describe, expect, it } from 'vitest';

import { sha256Digest } from '@appspine/integration-contracts';

import { DomainEventTerminalError } from './domain-event-errors';
import { type IntegrationEventReceiptRecord, withIntegrationEventReceipt } from './receipt';

const envelope = {
  eventId: 'event-1',
  eventType: 'document.approved',
  capabilityId: 'approve.document.approved',
  capabilityVersion: '1.0.0',
  capabilityDigest: 'sha256:capability',
  bindingId: 'approve-to-wiki.document.approved',
  bindingVersion: '1.0.0',
  envelopeVersion: '2',
  sourceApp: 'approve',
  occurredAt: '2026-08-07T00:00:00.000Z',
  aggregateType: 'WikiPage',
  aggregateId: 'doc-1',
  correlationId: null,
  actor: { userId: 'user-1' },
  payload: { revision: 2 },
  payloadDigest: sha256Digest({ revision: 2 }),
} as const;

describe('withIntegrationEventReceipt', () => {
  it('processes a new receipt and treats a same-digest replay as duplicate', async () => {
    const receipts: Record<string, IntegrationEventReceiptRecord> = {};
    const tx = {
      integrationEventReceipt: {
        findUnique: async ({
          where,
        }: {
          where: { sourceApp_eventId: { sourceApp: string; eventId: string } };
        }) =>
          receipts[`${where.sourceApp_eventId.sourceApp}:${where.sourceApp_eventId.eventId}`] ??
          null,
        create: async ({
          data,
        }: {
          data: Omit<IntegrationEventReceiptRecord, 'id' | 'processedAt' | 'createdAt'>;
        }) => {
          const value = {
            id: 'receipt-1',
            ...data,
            processedAt: new Date(),
            createdAt: new Date(),
          };
          receipts[`${data.sourceApp}:${data.eventId}`] = value;
          return value;
        },
      },
    };
    const first = await withIntegrationEventReceipt(tx, envelope, async () => 'processed');
    const replay = await withIntegrationEventReceipt(tx, envelope, async () => 'must-not-run');
    expect(first).toMatchObject({ duplicate: false, result: 'processed' });
    expect(replay).toMatchObject({ duplicate: true });
  });

  it('fails closed when an event id is reused with another digest', async () => {
    const tx = {
      integrationEventReceipt: {
        findUnique: async () => ({
          id: 'receipt-1',
          sourceApp: envelope.sourceApp,
          eventId: envelope.eventId,
          capabilityId: envelope.capabilityId,
          capabilityVersion: envelope.capabilityVersion,
          capabilityDigest: envelope.capabilityDigest,
          bindingId: envelope.bindingId,
          bindingVersion: envelope.bindingVersion,
          payloadDigest: 'sha256:other',
          processedAt: new Date(),
          createdAt: new Date(),
        }),
        create: async () => {
          throw new Error('not called');
        },
      },
    };
    await expect(
      withIntegrationEventReceipt(tx, envelope, async () => undefined),
    ).rejects.toBeInstanceOf(DomainEventTerminalError);
  });

  it('fails closed when an event id is reused for another pinned contract', async () => {
    const tx = {
      integrationEventReceipt: {
        findUnique: async () => ({
          id: 'receipt-1',
          sourceApp: envelope.sourceApp,
          eventId: envelope.eventId,
          capabilityId: 'different.capability',
          capabilityVersion: envelope.capabilityVersion,
          capabilityDigest: envelope.capabilityDigest,
          bindingId: envelope.bindingId,
          bindingVersion: envelope.bindingVersion,
          payloadDigest: envelope.payloadDigest,
          processedAt: new Date(),
          createdAt: new Date(),
        }),
        create: async () => {
          throw new Error('not called');
        },
      },
    };
    await expect(
      withIntegrationEventReceipt(tx, envelope, async () => undefined),
    ).rejects.toThrow('contract mismatch');
  });

  it('recomputes the payload digest before looking up a receipt', async () => {
    const findUnique = async () => null;
    const tx = {
      integrationEventReceipt: { findUnique, create: async () => { throw new Error('not called'); } },
    };
    await expect(
      withIntegrationEventReceipt(
        tx,
        { ...envelope, payloadDigest: 'sha256:' + '0'.repeat(64) },
        async () => undefined,
      ),
    ).rejects.toThrow('payload digest mismatch');
  });
});
