import { sha256Digest } from '@appspine/integration-contracts';
import { describe, expect, it } from 'vitest';

import { DomainEventTerminalError } from './domain-event-errors';
import {
  type IntegrationEventReceiptRecord,
  type IntegrationReceiptDatabaseClient,
  withIntegrationEventReceipt,
} from './receipt';

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

function createReceiptDatabase(
  initial: IntegrationEventReceiptRecord[] = [],
): IntegrationReceiptDatabaseClient {
  const receipts = new Map(
    initial.map((receipt) => [`${receipt.sourceApp}:${receipt.eventId}`, receipt]),
  );
  const model = (store: Map<string, IntegrationEventReceiptRecord>) => ({
    integrationEventReceipt: {
      findUnique: async ({
        where,
      }: {
        where: { sourceApp_eventId: { sourceApp: string; eventId: string } };
      }) =>
        store.get(`${where.sourceApp_eventId.sourceApp}:${where.sourceApp_eventId.eventId}`) ??
        null,
      create: async ({
        data,
      }: {
        data: Omit<IntegrationEventReceiptRecord, 'id' | 'processedAt' | 'createdAt'>;
      }) => {
        const key = `${data.sourceApp}:${data.eventId}`;
        if (store.has(key)) throw { code: 'P2002' };
        const value = {
          id: `receipt-${store.size + 1}`,
          ...data,
          processedAt: new Date(),
          createdAt: new Date(),
        };
        store.set(key, value);
        return value;
      },
    },
  });
  return {
    ...model(receipts),
    $transaction: async (callback) => {
      const working = new Map(receipts);
      const result = await callback(model(working));
      receipts.clear();
      for (const [key, value] of working) receipts.set(key, value);
      return result;
    },
  };
}

describe('withIntegrationEventReceipt', () => {
  it('processes a new receipt and treats a same-digest replay as duplicate', async () => {
    const db = createReceiptDatabase();
    const first = await withIntegrationEventReceipt(db, envelope, async () => 'processed');
    const replay = await withIntegrationEventReceipt(db, envelope, async () => 'must-not-run');
    expect(first).toMatchObject({ duplicate: false, result: 'processed' });
    expect(replay).toMatchObject({ duplicate: true });
  });

  it('rolls the receipt back when the business callback fails', async () => {
    const db = createReceiptDatabase();
    await expect(
      withIntegrationEventReceipt(db, envelope, async () => {
        throw new Error('business write failed');
      }),
    ).rejects.toThrow('business write failed');
    const retry = await withIntegrationEventReceipt(db, envelope, async () => 'retried');
    expect(retry).toMatchObject({ duplicate: false, result: 'retried' });
  });

  it('does not swallow a business unique conflict as a receipt replay', async () => {
    const db = createReceiptDatabase();
    await expect(
      withIntegrationEventReceipt(db, envelope, async () => {
        throw { code: 'P2002' };
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('converts a concurrent unique conflict into a verified duplicate', async () => {
    const existing = {
      id: 'receipt-1',
      sourceApp: envelope.sourceApp,
      eventId: envelope.eventId,
      capabilityId: envelope.capabilityId,
      capabilityVersion: envelope.capabilityVersion,
      capabilityDigest: envelope.capabilityDigest,
      bindingId: envelope.bindingId,
      bindingVersion: envelope.bindingVersion,
      payloadDigest: envelope.payloadDigest,
      processedAt: new Date(),
      createdAt: new Date(),
    } satisfies IntegrationEventReceiptRecord;
    const db = createReceiptDatabase([existing]);
    const result = await withIntegrationEventReceipt(db, envelope, async () => 'must-not-run');
    expect(result).toMatchObject({ duplicate: true, receipt: existing });
  });

  it('handles a unique conflict raised by a concurrent transaction', async () => {
    const receipts = new Map<string, IntegrationEventReceiptRecord>();
    const existing = {
      id: 'receipt-race-winner',
      sourceApp: envelope.sourceApp,
      eventId: envelope.eventId,
      capabilityId: envelope.capabilityId,
      capabilityVersion: envelope.capabilityVersion,
      capabilityDigest: envelope.capabilityDigest,
      bindingId: envelope.bindingId,
      bindingVersion: envelope.bindingVersion,
      payloadDigest: envelope.payloadDigest,
      processedAt: new Date(),
      createdAt: new Date(),
    } satisfies IntegrationEventReceiptRecord;
    const model = (store: Map<string, IntegrationEventReceiptRecord>) => ({
      integrationEventReceipt: {
        findUnique: async () => store.get(`${envelope.sourceApp}:${envelope.eventId}`) ?? null,
        create: async () => {
          receipts.set(`${envelope.sourceApp}:${envelope.eventId}`, existing);
          throw { code: 'P2002' };
        },
      },
    });
    const db: IntegrationReceiptDatabaseClient = {
      ...model(receipts),
      $transaction: async (callback) => callback(model(new Map())),
    };

    const result = await withIntegrationEventReceipt(db, envelope, async () => 'must-not-run');
    expect(result).toMatchObject({ duplicate: true, receipt: existing });
  });

  it('fails closed when an event id is reused with another digest', async () => {
    const db = createReceiptDatabase([
      {
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
      },
    ]);
    await expect(
      withIntegrationEventReceipt(db, envelope, async () => undefined),
    ).rejects.toBeInstanceOf(DomainEventTerminalError);
  });

  it('fails closed when an event id is reused for another pinned contract', async () => {
    const db = createReceiptDatabase([
      {
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
      },
    ]);
    await expect(withIntegrationEventReceipt(db, envelope, async () => undefined)).rejects.toThrow(
      'contract mismatch',
    );
  });

  it('recomputes the payload digest before looking up a receipt', async () => {
    const db = createReceiptDatabase();
    await expect(
      withIntegrationEventReceipt(
        db,
        { ...envelope, payloadDigest: `sha256:${'0'.repeat(64)}` },
        async () => undefined,
      ),
    ).rejects.toThrow('payload digest mismatch');
  });
});
