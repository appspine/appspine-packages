import { DOMAIN_EVENTS } from '@appspine/plugin-api';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock @appspine/common PrismaService to prevent attempting to connect to a real database
vi.mock('@appspine/common', () => ({
  PrismaService: class MockPrismaService {
    $transaction = vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => {
      if (typeof cb === 'function') {
        return cb(this);
      }
      return Promise.resolve([]);
    });
    $queryRaw = vi.fn().mockResolvedValue([]);
    domainEvent = { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() };
    domainEventDelivery = {
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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
import { DomainEventsAdminController } from './admin/domain-events-admin.controller';
import { DomainEventsAdminModule } from './admin/domain-events-admin.module';
import { DomainEventsAdminService } from './admin/domain-events-admin.service';
import { DomainEventRegistry } from './domain-event-registry';
import { DomainEventsModule } from './domain-events.module';
import { DomainEventsService } from './domain-events.service';
import { DomainEventsAdminGuard } from './guards/domain-events-admin.guard';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
class HostPrismaModule {}

describe('DomainEventsModule and DomainEventsAdminModule real boot DI verification', () => {
  it('successfully boots a real Nest application with DomainEventsModule in a host providing Prisma', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HostPrismaModule, DomainEventsModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const eventsService = app.get(DomainEventsService);
    const domainEventsToken = app.get(DOMAIN_EVENTS);
    const registry = app.get(DomainEventRegistry);
    const adminService = app.get(DomainEventsAdminService);
    const adminController = app.get(DomainEventsAdminController);
    const adminGuard = app.get(DomainEventsAdminGuard);

    expect(eventsService).toBeDefined();
    expect(domainEventsToken).toBe(eventsService);
    expect(registry).toBeDefined();
    expect(adminService).toBeDefined();
    expect(adminController).toBeDefined();
    expect(adminGuard).toBeDefined();

    await app.close();
  });

  it('successfully boots a real Nest application with DomainEventsModule.forRoot({ providers: [PrismaService] })', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DomainEventsModule.forRoot({
          providers: [PrismaService],
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const eventsService = app.get(DomainEventsService);
    const adminService = app.get(DomainEventsAdminService);
    const adminController = app.get(DomainEventsAdminController);

    expect(eventsService).toBeDefined();
    expect(adminService).toBeDefined();
    expect(adminController).toBeDefined();

    await app.close();
  });

  it('successfully boots a real Nest application with DomainEventsAdminModule.forRoot()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HostPrismaModule,
        DomainEventsModule,
        DomainEventsAdminModule.forRoot(DomainEventsModule),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const adminService = app.get(DomainEventsAdminService);
    const adminController = app.get(DomainEventsAdminController);

    expect(adminService).toBeDefined();
    expect(adminController).toBeDefined();

    await app.close();
  });
});
