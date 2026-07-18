import { describe, expect, it, vi } from 'vitest';

// See domain-events-admin.service.spec.ts — @appspine/common's PrismaService eagerly resolves
// @prisma/client from cwd at import time. Mocking @appspine/common alone isn't enough here:
// @appspine/m2m-api-key/@appspine/rbac ship pre-compiled CommonJS dist output that `require()`s
// @appspine/common natively, bypassing vitest's mock interception (which only intercepts imports
// vitest itself transforms, i.e. this package's own TS source) — so those two packages must be
// mocked at their own boundary too, or their compiled code still reaches the real, crashing module.
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
  JwtOrApiKeyGuard: class {},
  ScopeGuard: class {},
  Scopes:
    (..._scopes: string[]) =>
    () => {},
}));
vi.mock('@appspine/rbac', () => ({
  PermissionGuard: class {},
  RequirePermissions:
    (..._perms: string[]) =>
    () => {},
}));

import { DomainEventsAdminController } from './domain-events-admin.controller';

describe('DomainEventsAdminController route order', () => {
  it('declares the catalog route before the :id route (T-10920-class regression guard)', () => {
    // Express/Nest resolve routes on the same verb+prefix in class-body declaration order —
    // `GET /domain-events/catalog` would be swallowed by `GET /domain-events/:id` (id="catalog")
    // if getCatalog() were ever moved below findOne().
    const methodNames = Object.getOwnPropertyNames(DomainEventsAdminController.prototype).filter(
      (name) => name !== 'constructor',
    );
    const catalogIndex = methodNames.indexOf('getCatalog');
    const findOneIndex = methodNames.indexOf('findOne');

    expect(catalogIndex).toBeGreaterThanOrEqual(0);
    expect(findOneIndex).toBeGreaterThanOrEqual(0);
    expect(catalogIndex).toBeLessThan(findOneIndex);
  });
});

describe('DomainEventsAdminController delegation', () => {
  it('forwards each endpoint straight to the service', async () => {
    const service = {
      getCatalog: vi.fn().mockResolvedValue('catalog'),
      findAll: vi.fn().mockResolvedValue('all'),
      findOne: vi.fn().mockResolvedValue('one'),
      retryDelivery: vi.fn().mockResolvedValue('retried'),
      ignoreDelivery: vi.fn().mockResolvedValue('ignored'),
    };
    const controller = new DomainEventsAdminController(service as never);

    await expect(controller.getCatalog()).resolves.toBe('catalog');

    const query = { page: 1, limit: 20 } as never;
    await expect(controller.findAll(query)).resolves.toBe('all');
    expect(service.findAll).toHaveBeenCalledWith(query);

    await expect(controller.findOne('id1')).resolves.toBe('one');
    expect(service.findOne).toHaveBeenCalledWith('id1');

    await expect(controller.retryDelivery('d1')).resolves.toBe('retried');
    expect(service.retryDelivery).toHaveBeenCalledWith('d1');

    await expect(controller.ignoreDelivery('d1')).resolves.toBe('ignored');
    expect(service.ignoreDelivery).toHaveBeenCalledWith('d1');
  });
});
