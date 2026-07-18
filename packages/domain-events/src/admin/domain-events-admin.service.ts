import { PrismaService, toPrismaPage } from '@appspine/common';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DomainEventRegistry } from '../domain-event-registry';
import { DomainEventDeliveryStatus } from '../types';
import type { DomainEventAdminListQuery } from './dto/domain-event-admin.dto';
import type { DomainEventCatalogResponse, DomainEventDeliveryStats } from './types';

const STATS_WINDOW_DAYS = 30;

function emptyStats(): DomainEventDeliveryStats {
  return {
    total: 0,
    processed: 0,
    deadLetter: 0,
    lastStatus: null,
    lastError: null,
    lastAttemptAt: null,
  };
}

/** Duck-types Prisma's "record not found on update/delete" error without importing @prisma/client. */
function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
  );
}

/**
 * Generalized from `apps/approve`'s bespoke `domain-events-admin.service.ts` (dev_docs 028 §3.3).
 * Only operates on the generic `DomainEvent`/`DomainEventDelivery` fields and `DomainEventRegistry`
 * introspection — no app-specific event semantics. Injects `PrismaService` directly (not a
 * hand-rolled structural client type) because `PrismaService` (`@appspine/common`) already resolves
 * the consuming app's own generated `@prisma/client` at runtime and is untyped by design for
 * exactly this reason (see `packages/common/src/prisma/prisma-client.ts`).
 */
@Injectable()
export class DomainEventsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DomainEventRegistry,
  ) {}

  /**
   * `registry.describe()`'s code-registered subscribers, LEFT JOINed with each handler key's
   * delivery stats (zero-filled when a subscriber has no deliveries yet — "defined but never
   * fired" must still show, not disappear). Handler keys with deliveries but no `describe()`
   * entry are data-driven (e.g. `webhook.post:<id>`) and reported separately in
   * `dataDrivenDeliveries` so they aren't invisible on the one screen meant for human oversight.
   * Stats are windowed to the last `STATS_WINDOW_DAYS` days — an unbounded groupBy over the full
   * table would degrade as `domain_event_deliveries` grows; the `(handlerKey, createdAt)` index
   * (docs/prisma-model.md) serves both the windowed aggregate and the latest-row lookup below.
   */
  async getCatalog(): Promise<DomainEventCatalogResponse> {
    const description = this.registry.describe();
    const windowStart = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [grouped, latestRows] = await Promise.all([
      this.prisma.domainEventDelivery.groupBy({
        by: ['handlerKey', 'status'],
        where: { createdAt: { gte: windowStart } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw`
        SELECT DISTINCT ON (handler_key)
          handler_key     AS "handlerKey",
          status::text    AS "status",
          last_error      AS "lastError",
          processed_at    AS "processedAt",
          next_attempt_at AS "nextAttemptAt",
          created_at      AS "createdAt"
        FROM domain_event_deliveries
        WHERE created_at >= ${windowStart}
        ORDER BY handler_key, created_at DESC
      `,
    ]);

    const statsByKey = new Map<string, DomainEventDeliveryStats>();
    const statsFor = (handlerKey: string): DomainEventDeliveryStats => {
      let stats = statsByKey.get(handlerKey);
      if (!stats) {
        stats = emptyStats();
        statsByKey.set(handlerKey, stats);
      }
      return stats;
    };

    for (const group of grouped as {
      handlerKey: string;
      status: string;
      _count: { _all: number };
    }[]) {
      const stats = statsFor(group.handlerKey);
      stats.total += group._count._all;
      if (group.status === DomainEventDeliveryStatus.PROCESSED)
        stats.processed += group._count._all;
      if (group.status === DomainEventDeliveryStatus.DEAD_LETTER)
        stats.deadLetter += group._count._all;
    }
    for (const row of latestRows as {
      handlerKey: string;
      status: string;
      lastError: string | null;
      processedAt: Date | null;
      nextAttemptAt: Date | null;
      createdAt: Date;
    }[]) {
      const stats = statsFor(row.handlerKey);
      stats.lastStatus = row.status as DomainEventDeliveryStatus;
      stats.lastError = row.lastError;
      stats.lastAttemptAt = row.processedAt ?? row.nextAttemptAt ?? row.createdAt;
    }

    const subscriberKeys = new Set(description.subscribers.map((subscriber) => subscriber.key));
    const subscribers = description.subscribers.map((subscriber) => ({
      ...subscriber,
      stats: statsByKey.get(subscriber.key) ?? emptyStats(),
    }));
    const dataDrivenDeliveries = [...statsByKey.entries()]
      .filter(([handlerKey]) => !subscriberKeys.has(handlerKey))
      .map(([handlerKey, stats]) => ({ handlerKey, ...stats }));

    return {
      subscribers,
      dataDrivenPrefixes: description.dataDrivenPrefixes,
      hasHandlerKeyContributors: description.hasHandlerKeyContributors,
      dataDrivenDeliveries,
      statsWindowDays: STATS_WINDOW_DAYS,
    };
  }

  async findAll(query: DomainEventAdminListQuery) {
    const where = this.toWhere(query);
    const { skip, take } = toPrismaPage(query);
    const [data, total] = await Promise.all([
      this.prisma.domainEvent.findMany({
        where,
        skip,
        take,
        orderBy: { seq: 'desc' },
        include: { deliveries: { orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.domainEvent.count({ where }),
    ]);
    return { data: data.map(serializeDomainEvent), total, page: query.page, limit: query.limit };
  }

  async findOne(id: string) {
    const event = await this.prisma.domainEvent.findUnique({
      where: { id },
      include: { deliveries: { orderBy: { createdAt: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Domain event not found');
    return serializeDomainEvent(event);
  }

  async retryDelivery(id: string) {
    return this.updateDeliveryIfNotInFlight(id, {
      status: DomainEventDeliveryStatus.PENDING,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
    });
  }

  async ignoreDelivery(id: string) {
    return this.updateDeliveryIfNotInFlight(id, {
      status: DomainEventDeliveryStatus.IGNORED,
      lockedAt: null,
      lockedBy: null,
      processedAt: new Date(),
    });
  }

  /**
   * Atomic guarded update: the status filter in the WHERE clause (not a separate read-then-write)
   * excludes PROCESSING rows, so an admin action can never unlock a delivery the dispatcher is
   * handling right now — the same defense `DomainEventDispatcherService.completeDelivery()` uses
   * from the other side of this race.
   */
  private async updateDeliveryIfNotInFlight(id: string, data: Record<string, unknown>) {
    try {
      return await this.prisma.domainEventDelivery.update({
        where: { id, status: { not: DomainEventDeliveryStatus.PROCESSING } },
        data,
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        const exists = await this.prisma.domainEventDelivery.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!exists) throw new NotFoundException('Domain event delivery not found');
        throw new ConflictException('Delivery is being processed right now — try again shortly.');
      }
      throw error;
    }
  }

  private toWhere(query: DomainEventAdminListQuery) {
    return {
      eventType: query.eventType,
      aggregateId: query.aggregateId,
      createdAt:
        query.createdFrom || query.createdTo
          ? { gte: query.createdFrom, lte: query.createdTo }
          : undefined,
    };
  }
}

/** Deliveries pass through unchanged; only the bigint seq needs a JSON-safe form (002 BigInt discipline). */
function serializeDomainEvent<T extends { seq: bigint }>(event: T) {
  return { ...event, seq: event.seq.toString() };
}
