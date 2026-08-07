import {
  assertJsonSchema,
  canonicalJson,
  freezeIntegrationMetadata,
  type JsonSchema,
} from '@appspine/integration-contracts';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { diffChangedFields } from './diff-changed-fields';
import { DomainEventRegistry } from './domain-event-registry';
import type { DomainEventTxClient, RecordDomainEventInput } from './types';

export type DomainEventContractResolver = {
  resolve(reference: {
    capabilityId: string;
    capabilityVersion: string;
    bindingId: string;
    bindingVersion: string;
  }): { capabilityDigest: string; payloadSchema: JsonSchema } | undefined;
};
export const DOMAIN_EVENT_CONTRACT_RESOLVER = 'DOMAIN_EVENT_CONTRACT_RESOLVER';

@Injectable()
export class DomainEventsService {
  constructor(
    private readonly registry: DomainEventRegistry,
    @Optional()
    @Inject(DOMAIN_EVENT_CONTRACT_RESOLVER)
    private readonly contractResolver?: DomainEventContractResolver,
  ) {}

  async record(tx: DomainEventTxClient, input: RecordDomainEventInput) {
    const changedFields = input.changedFields ?? diffChangedFields(input.before, input.after);
    let integration = input.integration;
    if (integration) {
      const contract = this.contractResolver?.resolve({
        capabilityId: integration.capabilityId,
        capabilityVersion: integration.capabilityVersion,
        bindingId: integration.bindingId,
        bindingVersion: integration.bindingVersion,
      });
      if (!contract) throw new Error('Integration event contract is not registered in the runtime snapshot');
      const payloadSchema = contract.payloadSchema;
      if (!payloadSchema) throw new Error('Integration event contract has no payload schema');
      if (
        (input.integrationPayloadSchema &&
          canonicalJson(input.integrationPayloadSchema) !== canonicalJson(payloadSchema)) ||
        (integration.payloadSchema && canonicalJson(integration.payloadSchema) !== canonicalJson(payloadSchema))
      )
        throw new Error('Integration event payload schema does not match the pinned runtime contract');
      assertJsonSchema(integration.payload, payloadSchema, { mode: 'strict' });
      integration = freezeIntegrationMetadata({
        ...integration,
        capabilityDigest: contract.capabilityDigest,
        payloadSchema,
      });
    }
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
        integrationCapabilityId: integration?.capabilityId ?? null,
        integrationCapabilityVersion: integration?.capabilityVersion ?? null,
        integrationCapabilityDigest: integration?.capabilityDigest ?? null,
        integrationBindingId: integration?.bindingId ?? null,
        integrationBindingVersion: integration?.bindingVersion ?? null,
        integrationEnvelopeVersion: integration?.envelopeVersion ?? null,
        integrationSourceApp: integration?.sourceApp ?? null,
        integrationPayload: integration?.payload ?? null,
        integrationPayloadDigest: integration?.payloadDigest ?? null,
      },
    });

    const contributedKeys = await this.registry.contributeHandlerKeys(tx, {
      eventType: input.eventType,
    });
    const handlerKeys = new Set([
      ...this.registry.matchingHandlerKeys(input.eventType),
      ...contributedKeys,
    ]);

    if (handlerKeys.size > 0) {
      await tx.domainEventDelivery.createMany({
        data: [...handlerKeys].map((handlerKey) => ({
          eventId: event.id,
          handlerKey,
        })),
        skipDuplicates: true,
      });
    }

    return event;
  }
}
