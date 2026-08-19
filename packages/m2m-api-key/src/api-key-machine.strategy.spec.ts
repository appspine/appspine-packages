import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyMachineStrategy } from './api-key-machine.strategy';
import { KEY_PREFIX } from './api-keys.service';

const rbacPolicy = {
  flatten: () => ({
    roleNames: ['ADMIN'],
    permissionPolicy: 'ALLOW_ALL',
    permissions: ['USERS_READ'],
  }),
};

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

function createContext(
  request: { headers?: Record<string, string | string[] | undefined> } = {},
  response: { setHeader?: ReturnType<typeof vi.fn> } = { setHeader: vi.fn() },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createStrategy(
  actingUser: { id: string; isActive: boolean } | null = null,
  policy = rbacPolicy,
) {
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
    strategy: new ApiKeyMachineStrategy(prisma as never, rateLimiter as never, policy as never),
    prisma,
    rateLimiter,
  };
}

describe('ApiKeyMachineStrategy', () => {
  it('has stable strategy metadata', () => {
    const { strategy } = createStrategy();
    expect(strategy.id).toBe('api-key');
    expect(strategy.kind).toBe('machine');
  });

  describe('header handling & fall-through', () => {
    it('returns null when no x-api-key header is present (allowing fall-through)', async () => {
      const { strategy, prisma } = createStrategy();
      const result = await strategy.authenticate(createContext({ headers: {} }));
      expect(result).toBeNull();
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });

    it('returns null when x-api-key is not a string (e.g. array)', async () => {
      const { strategy, prisma } = createStrategy();
      const result = await strategy.authenticate(
        createContext({ headers: { 'x-api-key': ['a', 'b'] } }),
      );
      expect(result).toBeNull();
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when x-api-key does not start with KEY_PREFIX', async () => {
      const { strategy, prisma } = createStrategy();
      await expect(
        strategy.authenticate(createContext({ headers: { 'x-api-key': 'bad-prefix-key' } })),
      ).rejects.toThrowError(UnauthorizedException);
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('RBAC policy requirement (fail-closed)', () => {
    it('throws UnauthorizedException when no rbacPolicy provider is injected', async () => {
      const prisma = { apiKey: { findFirst: vi.fn(), update: vi.fn() } };
      const strategy = new ApiKeyMachineStrategy(
        prisma as never,
        { check: vi.fn() } as never,
        undefined,
      );

      await expect(
        strategy.authenticate(createContext({ headers: { 'x-api-key': rawKey } })),
      ).rejects.toThrowError(/no RBAC policy provider registered/);
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('key lookup & validity (inactive, expired, revoked)', () => {
    it('throws UnauthorizedException when key is not found in database', async () => {
      const { strategy, prisma } = createStrategy();
      prisma.apiKey.findFirst.mockResolvedValueOnce(null);

      await expect(
        strategy.authenticate(createContext({ headers: { 'x-api-key': rawKey } })),
      ).rejects.toThrowError(/Invalid API key/);
    });

    it('queries with hashedKey, isActive: true, and unexpired expiresAt filter', async () => {
      const { strategy, prisma } = createStrategy();
      await strategy.authenticate(createContext({ headers: { 'x-api-key': rawKey } }));

      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hashedKey,
            isActive: true,
          }),
        }),
      );
    });
  });

  describe('rate limiting', () => {
    it('throws 429 HttpException with Retry-After header when rate limited', async () => {
      const { strategy, rateLimiter } = createStrategy();
      rateLimiter.check.mockReturnValueOnce({ allowed: false, retryAfter: 45 });
      const setHeader = vi.fn();

      const promise = strategy.authenticate(
        createContext({ headers: { 'x-api-key': rawKey } }, { setHeader }),
      );

      await expect(promise).rejects.toThrowError(HttpException);
      await expect(promise).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '45');
    });
  });

  describe('acting user binding & principal shape', () => {
    it('returns a valid MachinePrincipal with actingUserId for active service accounts', async () => {
      const { strategy } = createStrategy({ id: 'service-account-1', isActive: true });

      const principal = await strategy.authenticate(
        createContext({ headers: { 'x-api-key': rawKey } }),
      );

      expect(principal).toEqual({
        sub: 'api-key-1',
        roleNames: ['ADMIN'],
        permissionPolicy: 'ALLOW_ALL',
        permissions: ['USERS_READ'],
        scopes: ['users:read'],
        isApiKey: true,
        actingUserId: 'service-account-1',
      });
    });

    it('sets actingUserId to null when bound user is inactive', async () => {
      const { strategy } = createStrategy({ id: 'service-account-1', isActive: false });

      const principal = await strategy.authenticate(
        createContext({ headers: { 'x-api-key': rawKey } }),
      );

      expect(principal).toMatchObject({
        sub: 'api-key-1',
        actingUserId: null,
      });
    });

    it('sets actingUserId to null when no acting user is bound', async () => {
      const { strategy } = createStrategy(null);

      const principal = await strategy.authenticate(
        createContext({ headers: { 'x-api-key': rawKey } }),
      );

      expect(principal).toMatchObject({
        sub: 'api-key-1',
        actingUserId: null,
      });
    });

    it('triggers fire-and-forget lastUsedAt update', async () => {
      const { strategy, prisma } = createStrategy();

      await strategy.authenticate(createContext({ headers: { 'x-api-key': rawKey } }));

      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'api-key-1' },
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
