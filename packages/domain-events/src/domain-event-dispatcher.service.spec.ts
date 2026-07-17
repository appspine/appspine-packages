import { describe, expect, it, vi } from 'vitest';

// @appspine/common's PrismaService resolves @prisma/client from the consuming app's cwd at
// import time (see its prisma-client.ts) — this package has no generated client of its own (it
// ships no .prisma schema at all, see docs/prisma-model.md), so importing the real module would
// fail under test. Mock it the same way @appspine/audit-log's spec does for the same reason.
// vi.mock calls are hoisted above imports by vitest, so this runs before the import below.
vi.mock('@appspine/common', () => ({
  PrismaService: class {},
}));

import { DomainEventDispatcherService } from './domain-event-dispatcher.service';
import { DomainEventIgnoredError } from './domain-event-errors';
import { DomainEventRegistry } from './domain-event-registry';
import { createMockDeliveryRow, createMockDispatcherPrisma } from './testing';
import { DomainEventDeliveryStatus } from './types';

describe('DomainEventDispatcherService.tick', () => {
  it('reclaims stale locks, claims due deliveries in seq order, and routes success/failure/ignore/missing-handler outcomes', async () => {
    const calls: string[] = [];
    const registry = new DomainEventRegistry();
    registry.on('submitted', {
      key: 'ok',
      handle: async ({ delivery }) => {
        calls.push(delivery.id);
      },
    });
    registry.on('submitted', {
      key: 'fail',
      handle: async () => {
        throw new Error('boom');
      },
    });
    registry.on('submitted', {
      key: 'ignore-me',
      handle: async () => {
        throw new DomainEventIgnoredError('subscription disabled');
      },
    });

    // maxAttempts=2: one retry keeps a failing delivery PENDING, the next attempt dead-letters it.
    const stale = createMockDeliveryRow('stale', 0n, 'ok', {
      status: DomainEventDeliveryStatus.PROCESSING,
      lockedAt: new Date('2026-07-16T00:00:00.000Z'),
    });
    const staleExhausted = createMockDeliveryRow('stale-exhausted', 5n, 'ok', {
      attempts: 1,
      status: DomainEventDeliveryStatus.PROCESSING,
      lockedAt: new Date('2026-07-16T00:00:00.000Z'),
    });
    const missingHandler = createMockDeliveryRow('missing', 6n, 'no-such-handler');
    const ignored = createMockDeliveryRow('ignored', 7n, 'ignore-me');
    const rows = [
      createMockDeliveryRow('later', 2n, 'ok'),
      createMockDeliveryRow('first', 1n, 'ok'),
      createMockDeliveryRow('retry', 3n, 'fail'),
      createMockDeliveryRow('dead', 4n, 'fail', { attempts: 1 }),
      stale,
      staleExhausted,
      missingHandler,
      ignored,
    ];
    const counters = { transactions: 0, updateManyCalls: 0 };
    const dispatcher = new DomainEventDispatcherService(
      createMockDispatcherPrisma(rows, counters) as never,
      registry,
      {
        maxAttempts: 2,
        staleLockMs: 1,
        baseBackoffMs: 100,
        maxBackoffMs: 100000,
        autoStart: false,
      },
    );

    const before = Date.now();
    await dispatcher.tick();

    // 2 batched reclaimStaleLocks calls (terminal + non-terminal groups) + one
    // completeDelivery() updateMany per claimed delivery (stale, first, later, retry, dead,
    // missing, ignored — 7), now that completions are guarded updateMany calls too.
    expect(counters.updateManyCalls).toBe(9);
    expect(calls).toEqual(['stale', 'first', 'later']);
    expect(rows.find((row) => row.id === 'first')?.status).toBe(
      DomainEventDeliveryStatus.PROCESSED,
    );

    // Stale-lock reclaim now counts as an attempt: "stale" went PROCESSING(0) -> PENDING(1) ->
    // claimed -> PROCESSED, keeping the incremented attempts count.
    expect(rows.find((row) => row.id === 'stale')?.status).toBe(
      DomainEventDeliveryStatus.PROCESSED,
    );
    expect(rows.find((row) => row.id === 'stale')?.attempts).toBe(1);

    // A stale lock that would exceed maxAttempts on reclaim dead-letters immediately instead of
    // retrying forever, and is never re-queued as PENDING/claimed this tick.
    expect(rows.find((row) => row.id === 'stale-exhausted')?.status).toBe(
      DomainEventDeliveryStatus.DEAD_LETTER,
    );
    expect(rows.find((row) => row.id === 'stale-exhausted')?.attempts).toBe(2);
    expect(calls).not.toContain('stale-exhausted');

    expect(rows.find((row) => row.id === 'retry')?.status).toBe(DomainEventDeliveryStatus.PENDING);
    expect(rows.find((row) => row.id === 'retry')?.attempts).toBe(1);
    const retryNextAttemptAt = rows.find((row) => row.id === 'retry')?.nextAttemptAt;
    expect(retryNextAttemptAt).toBeTruthy();
    const backoffMs = (retryNextAttemptAt as Date).getTime() - before;
    expect(backoffMs).toBeGreaterThanOrEqual(100);
    expect(backoffMs).toBeLessThanOrEqual(5000);

    expect(rows.find((row) => row.id === 'dead')?.status).toBe(
      DomainEventDeliveryStatus.DEAD_LETTER,
    );
    expect(rows.find((row) => row.id === 'dead')?.attempts).toBe(2);

    // No handler registered for the key: IGNORED with a descriptive lastError, not a crash.
    expect(rows.find((row) => row.id === 'missing')?.status).toBe(
      DomainEventDeliveryStatus.IGNORED,
    );
    expect(rows.find((row) => row.id === 'missing')?.lastError).toContain('no-such-handler');

    // Handler throws DomainEventIgnoredError: IGNORED with the handler's message, not a retry.
    expect(rows.find((row) => row.id === 'ignored')?.status).toBe(
      DomainEventDeliveryStatus.IGNORED,
    );
    expect(rows.find((row) => row.id === 'ignored')?.lastError).toBe('subscription disabled');
  });

  it('does not overwrite a delivery whose status changed while its handler was in flight', async () => {
    // Simulates a concurrent admin action (retry/ignore) racing an in-flight handler: by the
    // time the handler resolves and the dispatcher tries to write its own completion status,
    // the row is no longer PROCESSING, so the completeDelivery() guard must make that write a
    // no-op instead of clobbering whatever the concurrent actor decided.
    const rows = [createMockDeliveryRow('racing', 1n, 'ok')];
    const registry = new DomainEventRegistry();
    registry.on('submitted', {
      key: 'ok',
      handle: async () => {
        const row = rows.find((candidate) => candidate.id === 'racing');
        if (row) {
          row.status = DomainEventDeliveryStatus.IGNORED;
          row.lastError = 'ignored by admin';
        }
      },
    });
    const dispatcher = new DomainEventDispatcherService(
      createMockDispatcherPrisma(rows) as never,
      registry,
      { autoStart: false },
    );

    await dispatcher.tick();

    const row = rows.find((candidate) => candidate.id === 'racing');
    expect(row?.status).toBe(DomainEventDeliveryStatus.IGNORED);
    expect(row?.lastError).toBe('ignored by admin');
  });

  it('makes an overlapping tick a no-op while one is already in flight', async () => {
    const registry = new DomainEventRegistry();
    const counters = { transactions: 0 };
    const dispatcher = new DomainEventDispatcherService(
      createMockDispatcherPrisma([], counters) as never,
      registry,
      {
        autoStart: false,
      },
    );

    const first = dispatcher.tick();
    const second = dispatcher.tick();
    await Promise.all([first, second]);

    expect(counters.transactions).toBe(1);
  });
});
