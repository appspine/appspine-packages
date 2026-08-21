import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', async () => {
  const { z } = await import('zod');
  return {
    PrismaService: class {},
    paginationQuerySchema: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
    ZodValidationPipe: class {
      transform(value: unknown) {
        return value;
      }
    },
  };
});

import { DomainEventsAdminGuard } from '../guards/domain-events-admin.guard';
import { DomainEventsAdminController } from './domain-events-admin.controller';
import { DomainEventsAdminModule } from './domain-events-admin.module';
import { DomainEventsAdminService } from './domain-events-admin.service';

describe('DomainEventsAdminModule.forRoot', () => {
  it('forwards the given registry module and AppspineAuthInfrastructureModule into imports, and wires the controller/service', () => {
    class FakeRegistryModule {}
    const dynamic = DomainEventsAdminModule.forRoot(FakeRegistryModule);

    expect(dynamic.module).toBe(DomainEventsAdminModule);
    expect(dynamic.imports).toEqual([AppspineAuthInfrastructureModule, FakeRegistryModule]);
    expect(dynamic.controllers).toEqual([DomainEventsAdminController]);
    expect(dynamic.providers).toEqual([DomainEventsAdminService, DomainEventsAdminGuard]);
    expect(dynamic.exports).toEqual([DomainEventsAdminService]);
  });
});
