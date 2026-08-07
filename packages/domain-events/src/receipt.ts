import { sha256Digest, type ExternalEventEnvelope } from '@appspine/integration-contracts';
import { DomainEventTerminalError } from './domain-event-errors';

export type IntegrationEventReceiptRecord = {
  id: string;
  sourceApp: string;
  eventId: string;
  capabilityId: string;
  capabilityVersion: string;
  capabilityDigest: string;
  bindingId: string;
  bindingVersion: string;
  payloadDigest: string;
  processedAt: Date;
  createdAt: Date;
};

export type IntegrationReceiptTxClient = {
  integrationEventReceipt: {
    findUnique(args: {
      where: { sourceApp_eventId: { sourceApp: string; eventId: string } };
    }): Promise<IntegrationEventReceiptRecord | null>;
    create(args: {
      data: Omit<IntegrationEventReceiptRecord, 'id' | 'processedAt' | 'createdAt'>;
    }): Promise<IntegrationEventReceiptRecord>;
  };
};

/** Root client shape. Receipt creation and the business callback must share this transaction. */
export type IntegrationReceiptDatabaseClient = IntegrationReceiptTxClient & {
  $transaction<T>(callback: (tx: IntegrationReceiptTxClient) => Promise<T>): Promise<T>;
};

export type IntegrationReceiptResult = {
  duplicate: boolean;
  receipt: IntegrationEventReceiptRecord;
};

export async function withIntegrationEventReceipt<T>(
  db: IntegrationReceiptDatabaseClient,
  envelope: ExternalEventEnvelope,
  process: (tx: IntegrationReceiptTxClient) => Promise<T>,
): Promise<IntegrationReceiptResult & { result?: T }> {
  if (sha256Digest(envelope.payload) !== envelope.payloadDigest)
    throw new DomainEventTerminalError(`Integration event payload digest mismatch for ${envelope.eventId}`);
  try {
    return await db.$transaction(async (tx) => {
      const existing = await findReceipt(tx, envelope);
      if (existing) return { duplicate: true, receipt: assertMatchingReceipt(existing, envelope) };

      let receipt: IntegrationEventReceiptRecord;
      try {
        receipt = await tx.integrationEventReceipt.create({
          data: {
            sourceApp: envelope.sourceApp,
            eventId: envelope.eventId,
            capabilityId: envelope.capabilityId,
            capabilityVersion: envelope.capabilityVersion,
            capabilityDigest: envelope.capabilityDigest,
            bindingId: envelope.bindingId,
            bindingVersion: envelope.bindingVersion,
            payloadDigest: envelope.payloadDigest,
          },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) throw new IntegrationReceiptUniqueConflict();
        throw error;
      }
      const result = await process(tx);
      return { duplicate: false, receipt, result };
    });
  } catch (error) {
    // A concurrent transaction may win the unique (sourceApp,eventId) insert. Resolve that
    // race outside the failed transaction; never run the business callback twice.
    if (!(error instanceof IntegrationReceiptUniqueConflict)) throw error;
    const existing = await findReceipt(db, envelope);
    if (!existing) throw error;
    return { duplicate: true, receipt: assertMatchingReceipt(existing, envelope) };
  }
}

async function findReceipt(
  db: IntegrationReceiptTxClient,
  envelope: ExternalEventEnvelope,
): Promise<IntegrationEventReceiptRecord | null> {
  return db.integrationEventReceipt.findUnique({
    where: { sourceApp_eventId: { sourceApp: envelope.sourceApp, eventId: envelope.eventId } },
  });
}

function assertMatchingReceipt(
  existing: IntegrationEventReceiptRecord,
  envelope: ExternalEventEnvelope,
): IntegrationEventReceiptRecord {
  if (existing.payloadDigest !== envelope.payloadDigest)
    throw new DomainEventTerminalError(
      `Integration event receipt digest mismatch for ${envelope.eventId}`,
    );
  if (
    existing.capabilityId !== envelope.capabilityId ||
    existing.capabilityVersion !== envelope.capabilityVersion ||
    existing.capabilityDigest !== envelope.capabilityDigest ||
    existing.bindingId !== envelope.bindingId ||
    existing.bindingVersion !== envelope.bindingVersion
  )
    throw new DomainEventTerminalError(
      `Integration event receipt contract mismatch for ${envelope.eventId}`,
    );
  return existing;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

class IntegrationReceiptUniqueConflict extends Error {
  constructor() {
    super('Integration receipt was created concurrently');
    this.name = 'IntegrationReceiptUniqueConflict';
  }
}
