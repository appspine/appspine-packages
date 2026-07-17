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
  autoStart: true,
};

export const DOMAIN_EVENT_DISPATCHER_OPTIONS = 'DOMAIN_EVENT_DISPATCHER_OPTIONS';
