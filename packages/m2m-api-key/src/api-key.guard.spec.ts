import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyGuard } from './api-key.guard';
import { KEY_PREFIX } from './api-keys.service';

vi.mock('@appspine/auth', () => ({
  buildUserContext: () => ({
    roleNames: ['ADMIN'],
    permissionPolicy: 'ALLOW_ALL',
    permissions: ['USERS_READ'],
  }),
}));

vi.mock('@appspine/common', () => ({
  PrismaService: class {},
}));

const rawKey = `${KEY_PREFIX}1234567890abcdef1234567890abcdef`;
const hashedKey = createHash('sha256').update(rawKey).digest('hex');
const role = {
  name: 'ADMIN',
  permissionPolicy: 'ALLOW_ALL',
  permissions: [{ permission: 'USERS_READ' }],
};

function createContext(request: { headers: Record<string, string>; user?: unknown }) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: vi.fn() }),
    }),
  } as unknown as ExecutionContext;
}

function createGuard(actingUser: { id: string; isActive: boolean } | null) {
  const prisma = {
    apiKey: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'api-key-1',
        hashedKey,
        role,
        scopes: ['users:read'],
        rateLimit: null,
        actingUser,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const rateLimiter = { check: vi.fn().mockReturnValue({ allowed: true }) };

  return {
    guard: new ApiKeyGuard(prisma as never, rateLimiter as never),
    prisma,
  };
}

describe('ApiKeyGuard acting user binding', () => {
  it('sets actingUserId when the bound service account is active', async () => {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { 'x-api-key': rawKey },
    };
    const { guard } = createGuard({ id: 'service-user-1', isActive: true });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.user).toMatchObject({ actingUserId: 'service-user-1' });
  });

  it('sets actingUserId to null when the bound user is inactive', async () => {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { 'x-api-key': rawKey },
    };
    const { guard } = createGuard({ id: 'service-user-1', isActive: false });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.user).toMatchObject({ actingUserId: null });
  });

  it('sets actingUserId to null when the key has no bound user', async () => {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { 'x-api-key': rawKey },
    };
    const { guard } = createGuard(null);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.user).toMatchObject({ actingUserId: null });
  });

  it('loads the acting user while looking up the key', async () => {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { 'x-api-key': rawKey },
    };
    const { guard, prisma } = createGuard({ id: 'service-user-1', isActive: true });

    await guard.canActivate(createContext(request));

    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hashedKey }),
        include: expect.objectContaining({
          actingUser: { select: { id: true, isActive: true } },
        }),
      }),
    );
  });
});
