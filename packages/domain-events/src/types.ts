export const DomainEventOperation = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;
export type DomainEventOperation = (typeof DomainEventOperation)[keyof typeof DomainEventOperation];

export const DomainEventDeliveryStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  DEAD_LETTER: 'DEAD_LETTER',
  IGNORED: 'IGNORED',
} as const;
export type DomainEventDeliveryStatus =
  (typeof DomainEventDeliveryStatus)[keyof typeof DomainEventDeliveryStatus];

// JSON payload fields (before/after/metadata) are opaque application data — every real
// producer/consumer is Prisma's own Json input/output type, whose null-vs-undefined and
// input-vs-output shapes differ in ways not worth re-deriving by hand here. `any` keeps this
// package's declared shape structurally compatible with whatever concrete Json type the host
// app's generated client uses, in both the write (create-input) and read (record) directions.
// biome-ignore lint/suspicious/noExplicitAny: see comment above.
export type DomainEventJson = any;
export type DomainEventSnapshot = Record<string, DomainEventJson>;

/** Structural mirror of the `DomainEvent` Prisma model, kept free of generated client imports. */
export type DomainEventRecord = {
  id: string;
  seq: bigint;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  operation: DomainEventOperation;
  schemaVersion: number;
  actorUserId: string | null;
  correlationId: string | null;
  workflowId: string | null;
  before: DomainEventJson | null;
  after: DomainEventJson | null;
  changedFields: string[];
  metadata: DomainEventJson | null;
  integrationCapabilityId: string | null;
  integrationCapabilityVersion: string | null;
  integrationCapabilityDigest: string | null;
  integrationBindingId: string | null;
  integrationBindingVersion: string | null;
  integrationEnvelopeVersion: string | null;
  integrationSourceApp: string | null;
  integrationPayload: DomainEventJson | null;
  integrationPayloadDigest: string | null;
  createdAt: Date;
};

/** Structural mirror of the `DomainEventDelivery` Prisma model, kept free of generated client imports. */
export type DomainEventDeliveryRecord = {
  id: string;
  eventId: string;
  handlerKey: string;
  status: DomainEventDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  processedAt: Date | null;
  createdAt: Date;
};

export type RecordDomainEventInput = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  operation: DomainEventOperation;
  schemaVersion?: number;
  actorUserId?: string | null;
  correlationId?: string | null;
  workflowId?: string | null;
  before?: DomainEventSnapshot | null;
  after?: DomainEventSnapshot | null;
  changedFields?: string[];
  metadata?: DomainEventJson | null;
  integration?: IntegrationEventMetadata;
  integrationPayloadSchema?: JsonSchema;
};

/**
 * Minimal transaction-client shape `DomainEventsService.record()` needs. A real
 * `Prisma.TransactionClient` satisfies this structurally, but core files never import
 * `@prisma/client` so this package can be extracted without the host app's generated types.
 */
export type DomainEventTxClient = {
  domainEvent: {
    create(args: {
      data: {
        aggregateType: string;
        aggregateId: string;
        eventType: string;
        operation: DomainEventOperation;
        schemaVersion: number;
        actorUserId: string | null;
        correlationId: string | null;
        workflowId: string | null;
        before: DomainEventSnapshot | undefined;
        after: DomainEventSnapshot | undefined;
        changedFields: string[];
        metadata: DomainEventJson | undefined;
        integrationCapabilityId?: string | null;
        integrationCapabilityVersion?: string | null;
        integrationCapabilityDigest?: string | null;
        integrationBindingId?: string | null;
        integrationBindingVersion?: string | null;
        integrationEnvelopeVersion?: string | null;
        integrationSourceApp?: string | null;
        integrationPayload?: DomainEventJson | null;
        integrationPayloadDigest?: string | null;
      };
    }): Promise<DomainEventRecord>;
  };
  domainEventDelivery: {
    createMany(args: {
      data: { eventId: string; handlerKey: string }[];
      skipDuplicates?: boolean;
    }): Promise<{ count: number }>;
  };
};

export type DomainEventDispatcherOptions = {
  /** Poll interval between dispatch ticks. */
  intervalMs?: number;
  /** Max deliveries claimed per tick. */
  batchSize?: number;
  /** Attempts (including the one that reclaimed a stale lock) before a delivery is dead-lettered. */
  maxAttempts?: number;
  /** How long a `PROCESSING` lock may sit before it's considered abandoned and reclaimed. */
  staleLockMs?: number;
  /** Base of the exponential retry backoff, in ms. */
  baseBackoffMs?: number;
  /** Cap on the exponential retry backoff, in ms. */
  maxBackoffMs?: number;
  /** Optional app-local binding state lookup used by the integration kill switch. */
  bindingEnabled?: (bindingId: string) => boolean | Promise<boolean>;
  /** Whether the dispatcher starts its interval timer on module init. Default true. */
  autoStart?: boolean;
};

export const DEFAULT_DISPATCHER_OPTIONS: Required<DomainEventDispatcherOptions> = {
  intervalMs: 5000,
  batchSize: 20,
  maxAttempts: 8,
  staleLockMs: 300000,
  baseBackoffMs: 30000,
  maxBackoffMs: 3600000,
  // Integration delivery is fail-closed until the consuming app supplies its binding state
  // lookup. Legacy non-integration events never consult this callback.
  bindingEnabled: async () => false,
  autoStart: true,
};

export const DOMAIN_EVENT_DISPATCHER_OPTIONS = 'DOMAIN_EVENT_DISPATCHER_OPTIONS';

/** Metadata carried by `@DomainEventSubscriber(...)`, validated against the handler instance at registration time. */
export type DomainEventSubscriberOptions = {
  /** One or more event types this handler subscribes to (e.g. audit-record subscribes to 7). */
  eventType: string | string[];
  /** Must equal the decorated handler's own `handler.key` — checked by `registerDomainEventSubscribers()`, not the decorator itself. */
  key: string;
  /** Non-empty rationale for why this subscription exists. Shown in the admin catalog view. */
  description: string;
};

/** Introspection-facing shape returned by `DomainEventRegistry.describe()` — `eventType` normalized to an always-array `eventTypes`, unlike the decorator's `string | string[]` input convenience. */
export type DomainEventSubscriberDescriptor = {
  eventTypes: string[];
  key: string;
  description: string;
};

export type DomainEventRegistryDescription = {
  subscribers: DomainEventSubscriberDescriptor[];
  /** Prefixes registered via `registerPrefix()` — existence-only, since prefix resolvers have no per-key description. */
  dataDrivenPrefixes: string[];
  /** Whether any `registerHandlerKeyContributor()` is registered — existence-only, for the same reason. */
  hasHandlerKeyContributors: boolean;
};

import type { IntegrationEventMetadata, JsonSchema } from '@appspine/integration-contracts';
