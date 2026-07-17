/**
 * Reusable test doubles for `@appspine/domain-events` consumers. None of these touch a real
 * database — they satisfy the structural shapes `DomainEventsService`/`DomainEventDispatcherService`
 * depend on (see types.ts), so app-local tests can exercise record()/fan-out and dispatcher tick
 * behavior without spinning up Postgres or generating a real Prisma client.
 */
import { DomainEventDeliveryStatus, type DomainEventOperation } from './types';

export type MockDomainEventRow = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  operation: DomainEventOperation;
  changedFields: string[];
};

export type MockDomainEventTxState = {
  events: MockDomainEventRow[];
  deliveries: { eventId: string; handlerKey: string }[];
};

/**
 * Builds a `DomainEventTxClient`-shaped mock for exercising `DomainEventsService.record()`.
 * Pass `failDelivery: true` to simulate the delivery insert failing after the event row commits,
 * for asserting the caller's own transaction rolls the event back too.
 */
export function createMockDomainEventTx(options?: { failDelivery?: boolean }): {
  state: MockDomainEventTxState;
  tx: {
    domainEvent: {
      create: (args: { data: Omit<MockDomainEventRow, 'id'> }) => Promise<MockDomainEventRow>;
    };
    domainEventDelivery: {
      createMany: (args: {
        data: { eventId: string; handlerKey: string }[];
      }) => Promise<{ count: number }>;
    };
  };
} {
  const state: MockDomainEventTxState = { events: [], deliveries: [] };

  const tx = {
    domainEvent: {
      create: async ({ data }: { data: Omit<MockDomainEventRow, 'id'> }) => {
        const event = { id: `event-${state.events.length + 1}`, ...data };
        state.events.push(event);
        return event;
      },
    },
    domainEventDelivery: {
      createMany: async ({ data }: { data: { eventId: string; handlerKey: string }[] }) => {
        if (options?.failDelivery) throw new Error('delivery insert failed');
        for (const row of data) {
          if (
            !state.deliveries.some(
              (existing) =>
                existing.eventId === row.eventId && existing.handlerKey === row.handlerKey,
            )
          ) {
            state.deliveries.push(row);
          }
        }
        return { count: data.length };
      },
    },
  };

  return { state, tx };
}

export type MockDeliveryRow = {
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
  event: { id: string; seq: bigint; eventType: string };
};

/** Builds one `DomainEventDelivery` + joined `event` row for dispatcher tests. */
export function createMockDeliveryRow(
  id: string,
  seq: bigint,
  handlerKey: string,
  overrides?: Partial<Pick<MockDeliveryRow, 'attempts' | 'status' | 'lockedAt'>> & {
    eventType?: string;
  },
): MockDeliveryRow {
  return {
    id,
    eventId: `event-${id}`,
    handlerKey,
    status: overrides?.status ?? DomainEventDeliveryStatus.PENDING,
    attempts: overrides?.attempts ?? 0,
    nextAttemptAt: null,
    lockedAt: overrides?.lockedAt ?? null,
    lockedBy: null,
    lastError: null,
    processedAt: null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    event: { id: `event-${id}`, seq, eventType: overrides?.eventType ?? 'test.event' },
  };
}

type MockDeliveryWhere = {
  id?: string | { in: string[] };
  status?: DomainEventDeliveryStatus;
  attempts?: { gte?: number; lt?: number };
  lockedAt?: { lt: Date };
};

type MockDeliveryUpdateData = Omit<Partial<MockDeliveryRow>, 'attempts'> & {
  attempts?: number | { increment: number };
};

type MockDispatcherCounters = {
  transactions: number;
  updateManyCalls?: number;
};

// Every condition present in `where` must match — this used to short-circuit true on `id.in`
// alone, silently ignoring any `status` (or other) condition passed alongside it in the same
// where clause, which would have made a combined `{ id, status: PROCESSING }` guard (used to
// close the completion-vs-admin-action race) untestable against this mock.
function matchesWhere(row: MockDeliveryRow, where: MockDeliveryWhere): boolean {
  if (where.id !== undefined) {
    const matchesId =
      typeof where.id === 'string' ? row.id === where.id : where.id.in.includes(row.id);
    if (!matchesId) return false;
  }
  if (where.status !== undefined) {
    if (row.status !== where.status) return false;
    if (where.lockedAt?.lt && !(row.lockedAt !== null && row.lockedAt < where.lockedAt.lt)) {
      return false;
    }
  }
  if (where.attempts?.gte !== undefined && row.attempts < where.attempts.gte) return false;
  if (where.attempts?.lt !== undefined && row.attempts >= where.attempts.lt) return false;
  return true;
}

function applyDeliveryUpdate(row: MockDeliveryRow, data: MockDeliveryUpdateData): void {
  const { attempts, ...fields } = data;
  Object.assign(row, fields);
  if (typeof attempts === 'number') row.attempts = attempts;
  if (typeof attempts === 'object') row.attempts += attempts.increment;
}

/**
 * Builds a `PrismaService`-shaped mock (findMany/update/$transaction/$queryRaw) that
 * `DomainEventDispatcherService` can run its `tick()` against. `rows` is mutated in place so
 * assertions can inspect delivery state after `tick()` resolves.
 */
export function createMockDispatcherPrisma(
  rows: MockDeliveryRow[],
  counters?: MockDispatcherCounters,
) {
  const stats = counters ?? { transactions: 0 };

  const findMany = async ({ where }: { where: MockDeliveryWhere }) =>
    rows
      .filter((row) => matchesWhere(row, where))
      .sort((left, right) => Number(left.event.seq - right.event.seq));

  return {
    domainEventDelivery: {
      findMany,
      update: async ({ where, data }: { where: { id: string }; data: MockDeliveryUpdateData }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error(`Missing row ${where.id}`);
        applyDeliveryUpdate(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: MockDeliveryWhere;
        data: MockDeliveryUpdateData;
      }) => {
        stats.updateManyCalls = (stats.updateManyCalls ?? 0) + 1;
        const matchingRows = rows.filter((row) => matchesWhere(row, where));
        for (const row of matchingRows) applyDeliveryUpdate(row, data);
        return { count: matchingRows.length };
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      stats.transactions++;
      return callback({
        $queryRaw: async () => {
          const claimed = rows
            .filter(
              (row) =>
                row.status === DomainEventDeliveryStatus.PENDING &&
                (!row.nextAttemptAt || row.nextAttemptAt <= new Date()),
            )
            .sort((left, right) => Number(left.event.seq - right.event.seq))
            .slice(0, 20);
          for (const row of claimed) {
            row.status = DomainEventDeliveryStatus.PROCESSING;
            row.lockedAt = new Date();
            row.lockedBy = 'test';
          }
          return claimed.map((row) => ({ id: row.id }));
        },
        domainEventDelivery: { findMany },
      });
    },
  };
}
