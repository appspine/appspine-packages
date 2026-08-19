import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyMachineStrategy } from './api-key-machine.strategy';
import { KEY_PREFIX } from './api-keys.service';
import { matchScope } from './guards/scope.guard';
import { ScopeMatcherService } from './scope-matcher.service';

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

function createContext(request: { headers: Record<string, string>; user?: unknown }) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: vi.fn() }),
    }),
  } as unknown as ExecutionContext;
}

describe('Legacy vs Strategy / Service Parity', () => {
  describe('ApiKeyGuard vs ApiKeyMachineStrategy', () => {
    function setup(actingUser: { id: string; isActive: boolean } | null = null) {
      const prisma = {
        apiKey: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'api-key-1',
            hashedKey,
            role,
            scopes: ['users:read', 'events:*'],
            rateLimit: null,
            actingUser,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      const rateLimiter = { check: vi.fn().mockReturnValue({ allowed: true }) };

      const legacyGuard = new ApiKeyGuard(
        prisma as never,
        rateLimiter as never,
        rbacPolicy as never,
      );
      const strategy = new ApiKeyMachineStrategy(
        prisma as never,
        rateLimiter as never,
        rbacPolicy as never,
      );

      return { legacyGuard, strategy, prisma };
    }

    it('produces structurally identical principal for valid API key', async () => {
      const { legacyGuard, strategy } = setup({ id: 'service-1', isActive: true });

      const reqLegacy = { headers: { 'x-api-key': rawKey }, user: undefined };
      const reqStrategy = { headers: { 'x-api-key': rawKey }, user: undefined };

      const legacyPassed = await legacyGuard.canActivate(createContext(reqLegacy));
      const strategyPrincipal = await strategy.authenticate(createContext(reqStrategy));

      expect(legacyPassed).toBe(true);
      expect(strategyPrincipal).toEqual(reqLegacy.user);
    });

    it('both handle inactive acting user by setting actingUserId to null', async () => {
      const { legacyGuard, strategy } = setup({ id: 'service-1', isActive: false });

      const reqLegacy = { headers: { 'x-api-key': rawKey }, user: undefined };
      const reqStrategy = { headers: { 'x-api-key': rawKey }, user: undefined };

      await legacyGuard.canActivate(createContext(reqLegacy));
      const strategyPrincipal = await strategy.authenticate(createContext(reqStrategy));

      expect(reqLegacy.user).toMatchObject({ actingUserId: null });
      expect(strategyPrincipal).toMatchObject({ actingUserId: null });
    });
  });

  describe('ScopeGuard matchScope vs ScopeMatcherService.matches', () => {
    const matcherService = new ScopeMatcherService();
    const testCases: [string[], string, boolean][] = [
      [['*'], 'users:read', true],
      [['users:*'], 'users:write', true],
      [['users:*'], 'roles:write', false],
      [['users:read'], 'users:read', true],
      [['users:read'], 'users:write', false],
      [[], 'users:read', false],
    ];

    it.each(
      testCases,
    )('evaluates scopes %j against %s identically', (granted, required, expected) => {
      expect(matchScope(granted, required)).toBe(expected);
      expect(matcherService.matches(granted, required)).toBe(expected);
    });
  });
});
