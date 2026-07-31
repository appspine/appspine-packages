import { hostname } from 'node:os';
import { PrismaService } from '@appspine/common';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';

import { DomainEventIgnoredError } from './domain-event-errors';
import { DomainEventRegistry } from './domain-event-registry';
import {
  DEFAULT_DISPATCHER_OPTIONS,
  DOMAIN_EVENT_DISPATCHER_OPTIONS,
  type DomainEventDeliveryRecord,
  DomainEventDeliveryStatus,
  type DomainEventDispatcherOptions,
  type DomainEventRecord,
} from './types';

type ClaimedDelivery = DomainEventDeliveryRecord & { event: DomainEventRecord };

export type DeliveryCompletionData = Partial<
  Pick<
    DomainEventDeliveryRecord,
    'status' | 'attempts' | 'nextAttemptAt' | 'lockedAt' | 'lockedBy' | 'lastError' | 'processedAt'
  >
>;

type DispatcherTransactionClient = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  domainEventDelivery: {
    findMany(args: {
      where: { id: { in: string[] } };
      include: { event: true };
      orderBy: { event: { seq: 'asc' } };
    }): Promise<ClaimedDelivery[]>;
  };
};

const STALE_LOCK_RECLAIMED_ERROR = 'Reclaimed after stale lock timeout';
const STALE_LOCK_RECLAIMED_TERMINAL_ERROR =
  'Reclaimed after stale lock timeout: max attempts exceeded';

@Injectable()
export class DomainEventDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventDispatcherService.name);
  private readonly workerId = `${hostname()}:${process.pid}`;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly staleLockMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly autoStart: boolean;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DomainEventRegistry,
    @Optional() @Inject(DOMAIN_EVENT_DISPATCHER_OPTIONS) options?: DomainEventDispatcherOptions,
  ) {
    const resolved = { ...DEFAULT_DISPATCHER_OPTIONS, ...options };
    this.intervalMs = resolved.intervalMs;
    this.batchSize = resolved.batchSize;
    this.maxAttempts = resolved.maxAttempts;
    this.staleLockMs = resolved.staleLockMs;
    this.baseBackoffMs = resolved.baseBackoffMs;
    this.maxBackoffMs = resolved.maxBackoffMs;
    this.autoStart = resolved.autoStart;
  }

  onModuleInit() {
    if (this.autoStart) this.start();
  }

  onModuleDestroy() {
    this.stop();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reclaimStaleLocks();
      const deliveries = await this.claimDueDeliveries();
      for (const delivery of deliveries) {
        await this.processDelivery(delivery);
      }
    } catch (error) {
      this.logger.error(`Domain event dispatcher tick failed: ${errorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async reclaimStaleLocks(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.staleLockMs);
    const terminalAttempt = this.maxAttempts - 1;

    await Promise.all([
      this.prisma.domainEventDelivery.updateMany({
        where: {
          status: DomainEventDeliveryStatus.PROCESSING,
          lockedAt: { lt: staleBefore },
          attempts: { gte: terminalAttempt },
        },
        data: {
          status: DomainEventDeliveryStatus.DEAD_LETTER,
          attempts: { increment: 1 },
          lockedAt: null,
          lockedBy: null,
          lastError: STALE_LOCK_RECLAIMED_TERMINAL_ERROR,
        },
      }),
      this.prisma.domainEventDelivery.updateMany({
        where: {
          status: DomainEventDeliveryStatus.PROCESSING,
          lockedAt: { lt: staleBefore },
          attempts: { lt: terminalAttempt },
        },
        data: {
          status: DomainEventDeliveryStatus.PENDING,
          attempts: { increment: 1 },
          lockedAt: null,
          lockedBy: null,
          lastError: STALE_LOCK_RECLAIMED_ERROR,
        },
      }),
    ]);
  }

  private async claimDueDeliveries(): Promise<ClaimedDelivery[]> {
    return this.prisma.$transaction(async (tx: DispatcherTransactionClient) => {
      // Physical table/column names below (domain_event_deliveries, domain_events, seq,
      // next_attempt_at, locked_at, locked_by) mirror the documented model pattern's @@map/@map
      // directives (see docs/prisma-model.md and schema-drift-check.ts). They are a
      // load-bearing contract with the consuming app's schema, not incidental detail.
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        WITH due AS (
          SELECT ded.id
          FROM domain_event_deliveries ded
          JOIN domain_events de ON de.id = ded.event_id
          WHERE ded.status = 'PENDING'
            AND (ded.next_attempt_at IS NULL OR ded.next_attempt_at <= now())
          ORDER BY de.seq ASC
          LIMIT ${this.batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE domain_event_deliveries ded
        SET status = 'PROCESSING',
            locked_at = now(),
            locked_by = ${this.workerId}
        FROM due
        WHERE ded.id = due.id
        RETURNING ded.id
      `;

      if (claimed.length === 0) return [];

      return tx.domainEventDelivery.findMany({
        where: { id: { in: claimed.map((row: { id: string }) => row.id) } },
        include: { event: true },
        orderBy: { event: { seq: 'asc' } },
      });
    });
  }

  private async processDelivery(delivery: ClaimedDelivery): Promise<void> {
    const handler = this.registry.resolve(delivery.handlerKey);
    if (!handler) {
      await this.completeDelivery(delivery.id, {
        status: DomainEventDeliveryStatus.IGNORED,
        processedAt: new Date(),
        lastError: `No handler registered for ${delivery.handlerKey}`,
        lockedAt: null,
        lockedBy: null,
      });
      return;
    }

    try {
      await handler.handle({ event: delivery.event, delivery });
      await this.completeDelivery(delivery.id, {
        status: DomainEventDeliveryStatus.PROCESSED,
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      });
    } catch (error) {
      if (error instanceof DomainEventIgnoredError) {
        await this.completeDelivery(delivery.id, {
          status: DomainEventDeliveryStatus.IGNORED,
          processedAt: new Date(),
          lastError: error.message,
          lockedAt: null,
          lockedBy: null,
        });
        return;
      }
      await this.markFailed(delivery, error);
    }
  }

  private async markFailed(delivery: DomainEventDeliveryRecord, error: unknown): Promise<void> {
    const nextAttempts = delivery.attempts + 1;
    const terminal = nextAttempts >= this.maxAttempts;
    await this.completeDelivery(delivery.id, {
      status: terminal ? DomainEventDeliveryStatus.DEAD_LETTER : DomainEventDeliveryStatus.PENDING,
      attempts: nextAttempts,
      nextAttemptAt: terminal ? null : new Date(Date.now() + this.retryDelayMs(delivery.attempts)),
      lastError: errorMessage(error),
      lockedAt: null,
      lockedBy: null,
    });
  }

  /**
   * Completes a delivery this worker claimed, guarded on it still being PROCESSING. If an
   * admin action (retry/ignore) or another actor already moved it elsewhere while the handler
   * was running, the guard makes this a no-op instead of clobbering that decision — the same
   * atomic-update defense apps/approve's admin service uses for the other side of this race.
   */
  private async completeDelivery(id: string, data: DeliveryCompletionData): Promise<void> {
    await this.prisma.domainEventDelivery.updateMany({
      where: { id, status: DomainEventDeliveryStatus.PROCESSING },
      data,
    });
  }

  private retryDelayMs(attempts: number): number {
    return Math.min(this.baseBackoffMs * 2 ** attempts, this.maxBackoffMs);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
