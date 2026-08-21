import { createHash } from 'node:crypto';
import type { InteractivePrincipal } from '@appspine/plugin-api';
import {
  AppspineAuthGuard,
  AuthenticationStrategyRegistry,
  InteractiveAuthGuard,
  MachineAuthGuard,
  PrincipalContextService,
} from '@appspine/plugin-host-nest';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyMachineStrategy } from './api-key-machine.strategy';
import { KEY_PREFIX } from './api-keys.service';

const HUMAN: InteractivePrincipal = {
  sub: 'user-oidc-1',
  email: 'alice@example.com',
  name: 'Alice',
  roleName: 'USER',
  roleNames: ['USER'],
  permissionPolicy: 'READ_ALL',
  permissions: ['DOCS_READ'],
};

const rawKey = `${KEY_PREFIX}11112222333344445555666677778888`;
const hashedKey = createHash('sha256').update(rawKey).digest('hex');

function createOidcStrategy() {
  return {
    id: 'oidc',
    kind: 'interactive' as const,
    authenticate: async (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest<{ headers?: Record<string, string> }>();
      const auth = req?.headers?.authorization;
      if (!auth) return null;
      if (auth === 'Bearer valid-jwt') return HUMAN;
      throw new UnauthorizedException('Invalid JWT');
    },
  };
}

function createMachineStrategy() {
  const prisma = {
    apiKey: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.hashedKey === hashedKey) {
          return Promise.resolve({
            id: 'api-key-1',
            hashedKey,
            role: { name: 'SERVICE', permissionPolicy: 'ALLOW_ALL', permissions: [] },
            scopes: ['events:read'],
            rateLimit: null,
            actingUser: null,
          });
        }
        return Promise.resolve(null);
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const rateLimiter = { check: vi.fn().mockReturnValue({ allowed: true }) };
  const rbacPolicy = {
    flatten: () => ({ roleNames: ['SERVICE'], permissionPolicy: 'ALLOW_ALL', permissions: [] }),
  };

  return new ApiKeyMachineStrategy(prisma as never, rateLimiter as never, rbacPolicy as never);
}

function createContext(headers: Record<string, string> = {}): ExecutionContext {
  const request: { headers: Record<string, string>; user?: unknown } = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: vi.fn() }),
    }),
  } as unknown as ExecutionContext;
}

describe('OIDC + Machine Authentication Coexistence', () => {
  it('registers both OIDC and API Key strategies in AuthenticationStrategyRegistry', () => {
    const registry = new AuthenticationStrategyRegistry();
    const oidc = createOidcStrategy();
    const machine = createMachineStrategy();

    registry.register(oidc);
    registry.register(machine);

    expect(registry.describe()).toEqual([
      { id: 'api-key', kind: 'machine' },
      { id: 'oidc', kind: 'interactive' },
    ]);
  });

  describe('AppspineAuthGuard (accepts either interactive or machine)', () => {
    function setup() {
      const registry = new AuthenticationStrategyRegistry();
      registry.register(createOidcStrategy());
      registry.register(createMachineStrategy());
      const principalContext = new PrincipalContextService();
      const guard = new AppspineAuthGuard(registry, principalContext);
      return { guard, principalContext };
    }

    it('authenticates interactive callers presenting a valid Bearer JWT', async () => {
      const { guard, principalContext } = setup();
      const ctx = createContext({ authorization: 'Bearer valid-jwt' });

      await principalContext.run(null, async () => {
        await expect(guard.canActivate(ctx)).resolves.toBe(true);

        const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
        expect(req.user).toEqual(HUMAN);
        expect(principalContext.current()).toEqual(HUMAN);
      });
    });

    it('authenticates machine callers presenting a valid X-Api-Key', async () => {
      const { guard, principalContext } = setup();
      const ctx = createContext({ 'x-api-key': rawKey });

      await principalContext.run(null, async () => {
        await expect(guard.canActivate(ctx)).resolves.toBe(true);

        const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
        expect(req.user).toMatchObject({
          sub: 'api-key-1',
          isApiKey: true,
          scopes: ['events:read'],
        });
        expect(principalContext.current()).toMatchObject({
          sub: 'api-key-1',
          isApiKey: true,
        });
      });
    });

    it('rejects when no credentials are provided', async () => {
      const { guard } = setup();
      const ctx = createContext({});

      await expect(guard.canActivate(ctx)).rejects.toThrowError(UnauthorizedException);
    });

    it('rejects when an invalid Bearer JWT is presented', async () => {
      const { guard } = setup();
      const ctx = createContext({ authorization: 'Bearer bad-jwt' });

      await expect(guard.canActivate(ctx)).rejects.toThrowError(UnauthorizedException);
    });

    it('rejects when an invalid API key is presented', async () => {
      const { guard } = setup();
      const ctx = createContext({ 'x-api-key': `${KEY_PREFIX}invalidkey000000000000000000000` });

      await expect(guard.canActivate(ctx)).rejects.toThrowError(UnauthorizedException);
    });
  });

  describe('Specialized Guards', () => {
    function setup() {
      const registry = new AuthenticationStrategyRegistry();
      registry.register(createOidcStrategy());
      registry.register(createMachineStrategy());
      const principalContext = new PrincipalContextService();
      return {
        interactiveGuard: new InteractiveAuthGuard(registry, principalContext),
        machineGuard: new MachineAuthGuard(registry, principalContext),
      };
    }

    it('InteractiveAuthGuard accepts JWT and rejects API Key', async () => {
      const { interactiveGuard } = setup();

      // JWT passes
      await expect(
        interactiveGuard.canActivate(createContext({ authorization: 'Bearer valid-jwt' })),
      ).resolves.toBe(true);

      // API Key is rejected
      await expect(
        interactiveGuard.canActivate(createContext({ 'x-api-key': rawKey })),
      ).rejects.toThrowError(UnauthorizedException);
    });

    it('MachineAuthGuard accepts API Key and rejects JWT', async () => {
      const { machineGuard } = setup();

      // API Key passes
      await expect(machineGuard.canActivate(createContext({ 'x-api-key': rawKey }))).resolves.toBe(
        true,
      );

      // JWT is rejected
      await expect(
        machineGuard.canActivate(createContext({ authorization: 'Bearer valid-jwt' })),
      ).rejects.toThrowError(UnauthorizedException);
    });
  });
});
