import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeysService } from './api-keys.service';

vi.mock('@appspine/common', () => ({
  PrismaService: class {},
  paginate: (data: unknown, total: number) => ({ data, meta: { total } }),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
}));

const role = { id: 'role-1', name: 'ADMIN', displayName: 'Admin' };

function createPrismaMock(user: { id: string; isServiceAccount: boolean } | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
    apiKey: {
      create: vi.fn().mockResolvedValue({
        id: 'key-1',
        prefix: 'an_live_prefix',
        name: 'integration',
        roleId: role.id,
        actingUserId: user?.id ?? null,
        role,
        scopes: ['users:read'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'key-1',
        prefix: 'an_live_prefix',
        name: 'integration',
        roleId: role.id,
        actingUserId: null,
        role,
        scopes: ['users:read'],
        rateLimit: null,
        isActive: true,
        expiresAt: null,
        createdBy: null,
        lastUsedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      update: vi.fn().mockResolvedValue({
        id: 'key-1',
        prefix: 'an_live_prefix',
        name: 'integration',
        roleId: role.id,
        actingUserId: user?.id ?? null,
        role,
        scopes: ['users:read'],
        rateLimit: null,
        isActive: true,
        expiresAt: null,
        createdBy: null,
        lastUsedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const identityStore = {
    findById: vi.fn().mockImplementation(async () => prisma.user.findUnique()),
  };
  return new ApiKeysService(prisma as never, identityStore as never);
}

describe('ApiKeysService acting user binding', () => {
  it('rejects a non-service-account acting user', async () => {
    const prisma = createPrismaMock({ id: 'user-1', isServiceAccount: false });
    const service = createService(prisma);

    await expect(
      service.create({
        name: 'integration',
        roleId: role.id,
        actingUserId: 'user-1',
        scopes: ['users:read'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('writes a service-account acting user on create', async () => {
    const prisma = createPrismaMock({ id: 'service-user-1', isServiceAccount: true });
    const service = createService(prisma);

    await service.create({
      name: 'integration',
      roleId: role.id,
      actingUserId: 'service-user-1',
      scopes: ['users:read'],
    });

    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actingUserId: 'service-user-1' }),
      }),
    );
  });

  it('validates and writes a service-account acting user on update', async () => {
    const prisma = createPrismaMock({ id: 'service-user-1', isServiceAccount: true });
    const service = createService(prisma);

    await service.update('key-1', { actingUserId: 'service-user-1' });

    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actingUserId: 'service-user-1' }),
      }),
    );
  });
});

describe('ApiKeysService scope validation', () => {
  it('accepts a "call" scope (dev_docs 025 gateway:call for the mcp-gateway aggregator)', async () => {
    const prisma = createPrismaMock(null);
    const service = createService(prisma);

    await expect(
      service.create({
        name: 'gateway',
        roleId: role.id,
        scopes: ['gateway:call'],
      }),
    ).resolves.toBeDefined();
  });

  it('still rejects an action word outside read/write/call/*', async () => {
    const prisma = createPrismaMock(null);
    const service = createService(prisma);

    await expect(
      service.create({
        name: 'integration',
        roleId: role.id,
        scopes: ['users:delete'],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
