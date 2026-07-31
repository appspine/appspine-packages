import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

// @appspine/common's PrismaService resolves @prisma/client from the consuming app's cwd at
// import time (see its prisma-client.ts). This package has no generated client of its own, so
// importing the real module (even via importOriginal, which still evaluates it) fails under
// test. Re-implement the two symbols this service actually uses instead.
vi.mock('@appspine/common', () => ({
  PrismaService: class {},
  toPrismaPage: (query: { page: number; limit: number }) => ({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
}));

import { DomainEventRegistry } from '../domain-event-registry';
import { DomainEventsAdminService } from './domain-events-admin.service';

// biome-ignore lint/suspicious/noExplicitAny: PrismaService is itself untyped by design.
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
    registry.registerPrefix('webhook.post:', () => null);

    const prisma = makePrismaMock({
      domainEventDelivery: {
        groupBy: vi.fn().mockResolvedValue([
          { handlerKey: 'audit-record', status: 'PROCESSED', _count: { _all: 5 } },
          { handlerKey: 'audit-record', status: 'DEAD_LETTER', _count: { _all: 1 } },
          { handlerKey: 'webhook.post:sub-1', status: 'PROCESSED', _count: { _all: 2 } },
          { handlerKey: 'orphan-handler', status: 'DEAD_LETTER', _count: { _all: 1 } },
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
        {
          handlerKey: 'orphan-handler',
          status: 'DEAD_LETTER',
          lastError: 'missing handler',
          processedAt: null,
          nextAttemptAt: null,
          createdAt: new Date('2026-01-03'),
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
    expect(catalog.unresolvedDeliveries).toEqual([
      {
        handlerKey: 'orphan-handler',
        total: 1,
        processed: 0,
        deadLetter: 1,
        lastStatus: 'DEAD_LETTER',
        lastError: 'missing handler',
        lastAttemptAt: new Date('2026-01-03'),
      },
    ]);
    expect(catalog.statsWindowDays).toBe(30);
    expect(catalog.dataDrivenPrefixes).toEqual(['webhook.post:']);
    expect(catalog.hasHandlerKeyContributors).toBe(false);
  });
});

describe('DomainEventsAdminService retry/ignore', () => {
  it('guards retry to DEAD_LETTER rows, resets retry fields, and calls the audit hook', async () => {
    const before = { id: 'd1', status: 'DEAD_LETTER' };
    const after = { id: 'd1', status: 'PENDING' };
    const update = vi.fn().mockResolvedValue({ id: 'd1', status: 'PENDING' });
    const findUnique = vi.fn().mockResolvedValue(before);
    const auditHook = { record: vi.fn().mockResolvedValue(undefined) };
    const prisma = makePrismaMock({
      domainEventDelivery: { groupBy: vi.fn(), update, findUnique },
    });
    const service = new DomainEventsAdminService(
      prisma as never,
      new DomainEventRegistry(),
      auditHook,
    );
    update.mockResolvedValue(after);

    await service.retryDelivery('d1', { sub: 'admin-1', email: 'admin@example.com' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'DEAD_LETTER' },
      data: expect.objectContaining({
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
      }),
    });
    expect(auditHook.record).toHaveBeenCalledWith({
      action: 'RETRY_DELIVERY',
      actor: { sub: 'admin-1', email: 'admin@example.com' },
      deliveryBefore: before,
      deliveryAfter: after,
    });
  });

  it('throws ConflictException when the delivery is not DEAD_LETTER', async () => {
    const update = vi.fn().mockRejectedValue({ code: 'P2025' });
    const findUnique = vi.fn().mockResolvedValue({ id: 'd1' });
    const prisma = makePrismaMock({
      domainEventDelivery: { groupBy: vi.fn(), update, findUnique },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());

    await expect(service.retryDelivery('d1', { sub: 'admin-1' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws NotFoundException when the delivery does not exist at all', async () => {
    const update = vi.fn().mockRejectedValue({ code: 'P2025' });
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = makePrismaMock({
      domainEventDelivery: { groupBy: vi.fn(), update, findUnique },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());

    await expect(service.ignoreDelivery('missing', { sub: 'admin-1' })).rejects.toThrow(
      NotFoundException,
    );
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

  it('makes createdTo day-inclusive regardless of its time-of-day component', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrismaMock({
      domainEvent: { findMany, count: vi.fn().mockResolvedValue(0), findUnique: vi.fn() },
    });
    const service = new DomainEventsAdminService(prisma as never, new DomainEventRegistry());

    await service.findAll({
      page: 1,
      limit: 20,
      createdTo: new Date('2026-07-31T15:30:00.000Z'),
    } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ lt: new Date('2026-08-01T00:00:00.000Z') }),
        }),
      }),
    );
  });
});
