import { describe, expect, it, vi } from 'vitest';

// See domain-events-admin.controller.spec.ts for why both @appspine/common and
// @appspine/m2m-api-key/@appspine/rbac need mocking here.
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
vi.mock('@appspine/m2m-api-key', () => ({
  ApiKeysModule: class FakeApiKeysModule {},
  JwtOrApiKeyGuard: class {},
  ScopeGuard: class {},
  Scopes:
    (..._scopes: string[]) =>
    () => {},
}));
vi.mock('@appspine/auth', () => ({
  AuthModule: class FakeAuthModule {},
}));
vi.mock('@appspine/rbac', () => ({
  PermissionGuard: class {},
  RequirePermissions:
    (..._perms: string[]) =>
    () => {},
}));

import { AuthModule } from '@appspine/auth';
import { ApiKeysModule } from '@appspine/m2m-api-key';

import { DomainEventsAdminController } from './domain-events-admin.controller';
import { DomainEventsAdminModule } from './domain-events-admin.module';
import { DomainEventsAdminService } from './domain-events-admin.service';

describe('DomainEventsAdminModule.forRoot', () => {
  it("forwards the given registry module and ApiKeysModule (JwtOrApiKeyGuard's own deps) into imports, and wires the controller/service", () => {
    class FakeRegistryModule {}
    const dynamic = DomainEventsAdminModule.forRoot(FakeRegistryModule);

    expect(dynamic.module).toBe(DomainEventsAdminModule);
    expect(dynamic.imports).toEqual([FakeRegistryModule, ApiKeysModule, AuthModule]);
    expect(dynamic.controllers).toEqual([DomainEventsAdminController]);
    expect(dynamic.providers).toEqual([DomainEventsAdminService]);
  });
});
