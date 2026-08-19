import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  PrismaService: class MockPrismaService {
    $transaction = vi.fn();
    $queryRaw = vi.fn();
    domainEventDelivery = {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    };
  },
}));

import { PrismaService } from '@appspine/common';
import { DomainEventDispatcherService } from './domain-event-dispatcher.service';
import { DomainEventRegistry } from './domain-event-registry';

describe('DomainEventDispatcherService shutdown and lifecycle cleanup', () => {
  it('starts timer on onModuleInit (when autoStart is true) and stops timer on onModuleDestroy', () => {
    vi.useFakeTimers();
    const prisma = new PrismaService();
    const registry = new DomainEventRegistry();

    const service = new DomainEventDispatcherService(prisma, registry, {
      autoStart: true,
      intervalMs: 1000,
    });

    service.onModuleInit();

    // Verify timer is running (tick called)
    expect((service as unknown as { timer: unknown }).timer).not.toBeNull();

    // Trigger shutdown hook
    service.onModuleDestroy();

    // Verify timer is cleared
    expect((service as unknown as { timer: unknown }).timer).toBeNull();

    vi.useRealTimers();
  });

  it('stop() is idempotent and handles multiple calls safely', () => {
    const prisma = new PrismaService();
    const registry = new DomainEventRegistry();

    const service = new DomainEventDispatcherService(prisma, registry, {
      autoStart: false,
    });

    service.start();
    expect((service as unknown as { timer: unknown }).timer).not.toBeNull();

    service.stop();
    expect((service as unknown as { timer: unknown }).timer).toBeNull();

    // Calling stop again should not throw
    expect(() => service.stop()).not.toThrow();
  });
});
