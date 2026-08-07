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

export type IntegrationReceiptResult = {
  duplicate: boolean;
  receipt: IntegrationEventReceiptRecord;
};

export async function withIntegrationEventReceipt<T>(
  tx: IntegrationReceiptTxClient,
  envelope: ExternalEventEnvelope,
  process: () => Promise<T>,
): Promise<IntegrationReceiptResult & { result?: T }> {
  if (sha256Digest(envelope.payload) !== envelope.payloadDigest)
    throw new DomainEventTerminalError(`Integration event payload digest mismatch for ${envelope.eventId}`);
  const existing = await tx.integrationEventReceipt.findUnique({
    where: { sourceApp_eventId: { sourceApp: envelope.sourceApp, eventId: envelope.eventId } },
  });
  if (existing) {
    if (existing.payloadDigest !== envelope.payloadDigest) {
      throw new DomainEventTerminalError(
        `Integration event receipt digest mismatch for ${envelope.eventId}`,
      );
    }
    if (
      existing.capabilityId !== envelope.capabilityId ||
      existing.capabilityVersion !== envelope.capabilityVersion ||
      existing.capabilityDigest !== envelope.capabilityDigest ||
      existing.bindingId !== envelope.bindingId ||
      existing.bindingVersion !== envelope.bindingVersion
    ) {
      throw new DomainEventTerminalError(
        `Integration event receipt contract mismatch for ${envelope.eventId}`,
      );
    }
    return { duplicate: true, receipt: existing };
  }

  const receipt = await tx.integrationEventReceipt.create({
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
  const result = await process();
  return { duplicate: false, receipt, result };
}
