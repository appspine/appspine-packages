import { Injectable } from '@nestjs/common';

import { diffChangedFields } from './diff-changed-fields';
import { DomainEventRegistry } from './domain-event-registry';
import type { DomainEventTxClient, RecordDomainEventInput } from './types';

@Injectable()
export class DomainEventsService {
  constructor(private readonly registry: DomainEventRegistry) {}

  async record(tx: DomainEventTxClient, input: RecordDomainEventInput) {
    const changedFields = input.changedFields ?? diffChangedFields(input.before, input.after);
    const event = await tx.domainEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        operation: input.operation,
        schemaVersion: input.schemaVersion ?? 1,
        actorUserId: input.actorUserId ?? null,
        correlationId: input.correlationId ?? null,
        workflowId: input.workflowId ?? null,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
        changedFields,
        metadata: input.metadata ?? undefined,
      },
    });

    const contributedKeys = await this.registry.contributeHandlerKeys(tx, {
      eventType: input.eventType,
    });
    const handlerKeys = [...this.registry.matchingHandlerKeys(input.eventType), ...contributedKeys];

    await tx.domainEventDelivery.createMany({
      data: handlerKeys.map((handlerKey) => ({
        eventId: event.id,
        handlerKey,
      })),
      skipDuplicates: true,
    });

    return event;
  }
}
