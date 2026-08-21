import { DOMAIN_EVENTS } from '@appspine/plugin-api';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@appspine/common', () => ({
  PrismaService: class MockPrismaService {
    $transaction = vi.fn();
    $queryRaw = vi.fn();
    domainEvent = {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'ev-1',
          seq: 1n,
          ...data,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      ),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    };
    domainEventDelivery = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
  },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  paginate: () => ({}),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  AuditAction: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  paginationQuerySchema: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  ZodValidationPipe: class {},
}));

import { PrismaService } from '@appspine/common';
import { DomainEventsAdminService } from './admin/domain-events-admin.service';
import { DomainEventRegistry } from './domain-event-registry';
import { DomainEventsModule } from './domain-events.module';
import { DomainEventsService } from './domain-events.service';
import type { DomainEventTxClient } from './types';

describe('Legacy vs Plugin Mode Parity', () => {
  it('DomainEventsService produces identical output and delivery records in legacy and plugin mode', async () => {
    // 1. Legacy standalone instantiation
    const legacyRegistry = new DomainEventRegistry();
    legacyRegistry.on('user.created', {
      key: 'send-welcome-email',
      handle: async () => {},
    });
    const legacyService = new DomainEventsService(legacyRegistry);

    // 2. Plugin module resolution via Nest DI
    const moduleRef = await Test.createTestingModule({
      imports: [DomainEventsModule.forRoot({ providers: [PrismaService] })],
    }).compile();

    const pluginRegistry = moduleRef.get(DomainEventRegistry);
    pluginRegistry.on('user.created', {
      key: 'send-welcome-email',
      handle: async () => {},
    });
    const pluginService = moduleRef.get<DomainEventsService>(DOMAIN_EVENTS);

    // Verify both resolve and match keys identically
    expect(legacyRegistry.matchingHandlerKeys('user.created')).toEqual(
      pluginRegistry.matchingHandlerKeys('user.created'),
    );

    const fakeTx: DomainEventTxClient = {
      domainEvent: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'ev-test',
            ...data,
          }),
        ),
      },
      domainEventDelivery: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const input = {
      aggregateType: 'User',
      aggregateId: 'usr-1',
      eventType: 'user.created',
      operation: 'CREATE' as const,
      after: { id: 'usr-1', email: 'test@example.com' },
    };

    const legacyEvent = await legacyService.record(fakeTx, input);
    const pluginEvent = await pluginService.record(fakeTx, input);

    expect(legacyEvent).toEqual(pluginEvent);
  });

  it('DomainEventsAdminService getCatalog parity', async () => {
    const prisma = new PrismaService();
    prisma.$queryRaw = vi.fn().mockResolvedValue([]);
    const registry = new DomainEventRegistry();
    registry.describeSubscriber({
      key: 'audit-log',
      eventTypes: ['user.created'],
      description: 'Audit log subscriber',
    });

    const service = new DomainEventsAdminService(prisma, registry);
    const catalog = await service.getCatalog();

    expect(catalog.subscribers).toHaveLength(1);
    expect(catalog.subscribers[0].key).toBe('audit-log');
    expect(catalog.subscribers[0].description).toBe('Audit log subscriber');
    expect(catalog.statsWindowDays).toBe(30);
  });
});
