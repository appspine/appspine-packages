import { PrismaService, toPrismaPage } from '@appspine/common';
import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { DeliveryCompletionData } from '../domain-event-dispatcher.service';
import { DomainEventRegistry } from '../domain-event-registry';
import { type DomainEventDeliveryRecord, DomainEventDeliveryStatus } from '../types';
import type { DomainEventAdminListQuery } from './dto/domain-event-admin.dto';
import {
  DOMAIN_EVENTS_ADMIN_AUDIT_HOOK,
  type DomainEventCatalogResponse,
  type DomainEventDeliveryStats,
  type DomainEventsAdminActor,
  type DomainEventsAdminAuditAction,
  type DomainEventsAdminAuditHook,
} from './types';

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

@Injectable()
export class DomainEventsAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainEventRegistry) private readonly registry: DomainEventRegistry,
    @Optional()
    @Inject(DOMAIN_EVENTS_ADMIN_AUDIT_HOOK)
    private readonly auditHook?: DomainEventsAdminAuditHook,
  ) {}

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
    const isDataDrivenKey = (handlerKey: string) =>
      description.dataDrivenPrefixes.some((prefix) => handlerKey.startsWith(prefix));
    const subscribers = description.subscribers.map((subscriber) => ({
      ...subscriber,
      stats: statsByKey.get(subscriber.key) ?? emptyStats(),
    }));
    const undescribedDeliveries = [...statsByKey.entries()].filter(
      ([handlerKey]) => !subscriberKeys.has(handlerKey),
    );
    const dataDrivenDeliveries = undescribedDeliveries
      .filter(([handlerKey]) => isDataDrivenKey(handlerKey))
      .map(([handlerKey, stats]) => ({ handlerKey, ...stats }));
    const unresolvedDeliveries = undescribedDeliveries
      .filter(([handlerKey]) => !isDataDrivenKey(handlerKey))
      .map(([handlerKey, stats]) => ({ handlerKey, ...stats }));

    return {
      subscribers,
      dataDrivenPrefixes: description.dataDrivenPrefixes,
      hasHandlerKeyContributors: description.hasHandlerKeyContributors,
      dataDrivenDeliveries,
      unresolvedDeliveries,
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

  async retryDelivery(id: string, actor: DomainEventsAdminActor) {
    return this.updateDeadLetterDelivery(id, actor, 'RETRY_DELIVERY', {
      status: DomainEventDeliveryStatus.PENDING,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
    });
  }

  async ignoreDelivery(id: string, actor: DomainEventsAdminActor) {
    return this.updateDeadLetterDelivery(id, actor, 'IGNORE_DELIVERY', {
      status: DomainEventDeliveryStatus.IGNORED,
      lockedAt: null,
      lockedBy: null,
      processedAt: new Date(),
    });
  }

  private async updateDeadLetterDelivery(
    id: string,
    actor: DomainEventsAdminActor,
    action: DomainEventsAdminAuditAction,
    data: DeliveryCompletionData,
  ) {
    const before = await this.prisma.domainEventDelivery.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Domain event delivery not found');

    try {
      const after = await this.prisma.domainEventDelivery.update({
        where: { id, status: DomainEventDeliveryStatus.DEAD_LETTER },
        data,
      });
      await this.auditHook?.record({
        action,
        actor,
        deliveryBefore: before as DomainEventDeliveryRecord,
        deliveryAfter: after as DomainEventDeliveryRecord,
      });
      return after;
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new ConflictException('Only dead-lettered deliveries can be retried or ignored.');
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
          ? { gte: query.createdFrom, lt: endExclusive(query.createdTo) }
          : undefined,
    };
  }
}

/**
 * `createdTo` is schema-typed as a full datetime (`z.coerce.date()`, domain-event-admin.dto.ts),
 * but this filter is meant to be day-inclusive (an admin picking "up to 2026-07-31" expects the
 * whole day of the 31st included). Truncating to the start of the given day before advancing to
 * the next day makes that true regardless of what time-of-day component the caller passed —
 * naively adding 24h to the raw timestamp would instead silently exclude the rest of that day
 * whenever a non-midnight time was given.
 */
function endExclusive(date: Date | undefined): Date | undefined {
  if (!date) return undefined;
  const startOfNextDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  return startOfNextDay;
}

/** Deliveries pass through unchanged; only the bigint seq needs a JSON-safe form. */
function serializeDomainEvent<T extends { seq: bigint }>(event: T) {
  return { ...event, seq: event.seq.toString() };
}
