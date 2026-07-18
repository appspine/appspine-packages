import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

// @appspine/common's PrismaService resolves @prisma/client from the consuming app's cwd at
// import time (see its prisma-client.ts) — this package has no generated client of its own, so
// importing the real module (even via importOriginal, which still evaluates it) fails under
// test. Re-implement the two symbols this service actually uses instead — same class of fix
// domain-event-dispatcher.service.spec.ts already applies for PrismaService alone.
vi.mock('@appspine/common', () => ({
  PrismaService: class {},
  toPrismaPage: (query: { page: number; limit: number }) => ({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
}));

import { DomainEventRegistry } from '../domain-event-registry';
import { DomainEventsAdminService } from './domain-events-admin.service';

// biome-ignore lint/suspicious/noExplicitAny: PrismaService is itself untyped by design (see the service's own comment)
function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    domainEvent: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    domainEventDelivery: {
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('DomainEventsAdminService.getCatalog', () => {
  it('LEFT JOINs describe() subscribers with stats, zero-fills subscribers with no deliveries, and buckets data-driven keys separately', async () => {
    const registry = new DomainEventRegistry();
    registry.describeSubscriber({
      key: 'audit-record',
      eventTypes: ['submitted'],
      description: 'x',
    });
    registry.describeSubscriber({ key: 'never-fired', eventTypes: ['approved'], description: 'y' });

    const prisma = makePrismaMock({
      domainEventDelivery: {
        groupBy: vi.fn().mockResolvedValue([
          { handlerKey: 'audit-record', status: 'PROCESSED', _count: { _all: 5 } },
          { handlerKey: 'audit-record', status: 'DEAD_LETTER', _count: { _all: 1 } },
          { handlerKey: 'webhook.post:sub-1', status: 'PROCESSED', _count: { _all: 2 } },
        ]),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          handlerKey: 'audit-record',
          status: 'PROCESSED',
          lastError: null,
          processedAt: new Date('2026-01-01'),
          nextAttemptAt: null,
          createdAt: new Date('2026-01-01'),
        },
        {
          handlerKey: 'webhook.post:sub-1',
          status: 'PROCESSED',
          lastError: null,
          processedAt: new Date('2026-01-02'),
          nextAttemptAt: null,
          createdAt: new Date('2026-01-02'),
        },
      ]),
    });

    const service = new DomainEventsAdminService(prisma as never, registry);
    const catalog = await service.getCatalog();

    expect(catalog.subscribers).toEqual([
      {
        key: 'audit-record',
        eventTypes: ['submitted'],
        description: 'x',
        stats: {
          total: 6,
          processed: 5,
          deadLetter: 1,
          lastStatus: 'PROCESSED',
          lastError: null,
          lastAttemptAt: new Date('2026-01-01'),
        },
      },
      {
        key: 'never-fired',
        eventTypes: ['approved'],
        description: 'y',
        stats: {
          total: 0,
          processed: 0,
          deadLetter: 0,
          lastStatus: null,
          lastError: null,
          lastAttemptAt: null,
        },
      },
    ]);
    expect(catalog.dataDrivenDeliveries).toEqual([
      {
        handlerKey: 'webhook.post:sub-1',
        total: 2,
        processed: 2,
        deadLetter: 0,
        lastStatus: 'PROCESSED',
        lastError: null,
        lastAttemptAt: new Date('2026-01-02'),
      },
    ]);
    expect(catalog.statsWindowDays).toBe(30);
    expect(catalog.dataDrivenPrefixes).toEqual([]);
    expect(catalog.hasHandlerKeyContributors).toBe(false);
  });
});

describe('DomainEventsAdminService retry/ignore', () => {
  it('guards the update to non-PROCESSING rows and resets retry fields', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'd1', status: 'PENDING' });
    const prisma = makePrismaMock({
      domainEventDelivery: { groupBy: vi.fn(), update, findUnique: vi.fn() },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());

    await service.retryDelivery('d1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'd1', status: { not: 'PROCESSING' } },
      data: expect.objectContaining({
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
      }),
    });
  });

  it('throws ConflictException when the delivery is currently PROCESSING', async () => {
    const update = vi.fn().mockRejectedValue({ code: 'P2025' });
    const findUnique = vi.fn().mockResolvedValue({ id: 'd1' });
    const prisma = makePrismaMock({
      domainEventDelivery: { groupBy: vi.fn(), update, findUnique },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());

    await expect(service.retryDelivery('d1')).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when the delivery does not exist at all', async () => {
    const update = vi.fn().mockRejectedValue({ code: 'P2025' });
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = makePrismaMock({
      domainEventDelivery: { groupBy: vi.fn(), update, findUnique },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());

    await expect(service.ignoreDelivery('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('DomainEventsAdminService findOne/findAll', () => {
  it('throws NotFoundException for a missing event', async () => {
    const prisma = makePrismaMock({
      domainEvent: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('serializes seq to a string (002 BigInt discipline)', async () => {
    const event = { id: 'e1', seq: 42n, deliveries: [] };
    const prisma = makePrismaMock({
      domainEvent: {
        findMany: vi.fn().mockResolvedValue([event]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(event),
      },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());

    const found = await service.findOne('e1');
    expect(found.seq).toBe('42');

    const list = await service.findAll({ page: 1, limit: 20 } as never);
    expect(list.data[0].seq).toBe('42');
  });
});
