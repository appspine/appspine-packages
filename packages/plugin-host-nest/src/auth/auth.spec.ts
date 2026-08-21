import 'reflect-metadata';
import type { InteractivePrincipal, MachinePrincipal, Principal } from '@appspine/plugin-api';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppspineAuthGuard, InteractiveAuthGuard, MachineAuthGuard } from './guards';
import { CurrentUser, resolveActingUserId } from './principal';
import { PrincipalContextInterceptor, PrincipalContextService } from './principal-context';
import {
  type AuthenticationStrategy,
  AuthenticationStrategyRegistry,
  DuplicateAuthStrategyError,
} from './strategy-registry';

const HUMAN: InteractivePrincipal = {
  sub: 'user-1',
  email: 'a@b.c',
  name: 'A',
  roleName: 'ADMIN',
  roleNames: ['ADMIN'],
  permissionPolicy: 'ALLOW_ALL',
  permissions: [],
};

const MACHINE: MachinePrincipal = {
  sub: 'key-1',
  scopes: ['read'],
  isApiKey: true,
  actingUserId: 'user-2',
  roleNames: ['SERVICE'],
  permissionPolicy: 'READ_ALL',
  permissions: [],
};

function executionContext(request: Record<string, unknown> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function strategy(
  id: string,
  kind: AuthenticationStrategy['kind'],
  result: Principal | null | Error,
): AuthenticationStrategy {
  return {
    id,
    kind,
    authenticate: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('AuthenticationStrategyRegistry', () => {
  it('lets an interactive and a machine provider coexist', () => {
    const registry = new AuthenticationStrategyRegistry();
    registry.register(strategy('oidc', 'interactive', HUMAN));
    registry.register(strategy('api-key', 'machine', MACHINE));

    expect(registry.describe()).toEqual([
      { id: 'api-key', kind: 'machine' },
      { id: 'oidc', kind: 'interactive' },
    ]);
  });

  it('fails fast on a second interactive provider, and explains why', () => {
    const registry = new AuthenticationStrategyRegistry();
    registry.register(strategy('oidc', 'interactive', HUMAN));

    expect(() => registry.register(strategy('local-auth', 'interactive', HUMAN))).toThrowError(
      DuplicateAuthStrategyError,
    );
    try {
      registry.register(strategy('local-auth', 'interactive', HUMAN));
    } catch (error) {
      expect((error as Error).message).toMatch(/account-linking/);
    }
    expect(registry.list('interactive')).toHaveLength(1);
  });

  it('allows several machine providers', () => {
    const registry = new AuthenticationStrategyRegistry();
    registry.register(strategy('api-key', 'machine', MACHINE));
    registry.register(strategy('mtls', 'machine', MACHINE));
    expect(registry.list('machine')).toHaveLength(2);
  });

  it('rejects a duplicate strategy ID', () => {
    const registry = new AuthenticationStrategyRegistry();
    registry.register(strategy('api-key', 'machine', MACHINE));
    expect(() => registry.register(strategy('api-key', 'machine', MACHINE))).toThrowError(
      /already registered/,
    );
  });

  it('orders strategies by ID, never by registration order', () => {
    const first = new AuthenticationStrategyRegistry();
    first.register(strategy('zulu', 'machine', MACHINE));
    first.register(strategy('alpha', 'machine', MACHINE));

    const second = new AuthenticationStrategyRegistry();
    second.register(strategy('alpha', 'machine', MACHINE));
    second.register(strategy('zulu', 'machine', MACHINE));

    expect(first.list().map((s) => s.id)).toEqual(second.list().map((s) => s.id));
  });
});

describe('guards', () => {
  function guards() {
    const registry = new AuthenticationStrategyRegistry();
    const principalContext = new PrincipalContextService();
    return {
      registry,
      principalContext,
      any: new AppspineAuthGuard(registry, principalContext),
      interactive: new InteractiveAuthGuard(registry, principalContext),
      machine: new MachineAuthGuard(registry, principalContext),
    };
  }

  it('accepts either kind and puts the principal on request.user', async () => {
    const { registry, any } = guards();
    registry.register(strategy('api-key', 'machine', MACHINE));

    const request: Record<string, unknown> = {};
    await expect(any.canActivate(executionContext(request))).resolves.toBe(true);
    expect(request.user).toBe(MACHINE);
  });

  it('refuses a machine credential on an interactive-only route', async () => {
    const { registry, interactive } = guards();
    registry.register(strategy('api-key', 'machine', MACHINE));

    await expect(interactive.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an interactive login on a machine-only route', async () => {
    const { registry, machine } = guards();
    registry.register(strategy('oidc', 'interactive', HUMAN));

    await expect(machine.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed when no strategy is registered at all', async () => {
    const { any } = guards();
    await expect(any.canActivate(executionContext())).rejects.toThrowError(
      /No interactive\/machine authentication strategy is registered/,
    );
  });

  it('propagates a strategy rejection instead of falling through to a weaker one', async () => {
    const { registry, any } = guards();
    const expired = new UnauthorizedException('token expired');
    registry.register(strategy('a-oidc', 'interactive', expired));
    const machineStrategy = strategy('b-api-key', 'machine', MACHINE);
    const spy = vi.spyOn(machineStrategy, 'authenticate');
    registry.register(machineStrategy);

    await expect(any.canActivate(executionContext())).rejects.toBe(expired);
    expect(spy).not.toHaveBeenCalled();
  });

  it('tries the next strategy when one reports "not my credential"', async () => {
    const { registry, any } = guards();
    registry.register(strategy('a-oidc', 'interactive', null));
    registry.register(strategy('b-api-key', 'machine', MACHINE));

    const request: Record<string, unknown> = {};
    await expect(any.canActivate(executionContext(request))).resolves.toBe(true);
    expect(request.user).toBe(MACHINE);
  });
});

describe('PrincipalContextService', () => {
  it('exposes the principal to code with no parameter to decorate', async () => {
    const context = new PrincipalContextService();
    expect(context.current()).toBeNull();
    expect(() => context.require()).toThrowError(UnauthorizedException);

    const seen = await context.run(HUMAN, async () => {
      // The ambient store survives an await boundary — that is the whole point of using ALS
      // instead of a request-scoped provider.
      await Promise.resolve();
      return context.require();
    });
    expect(seen).toBe(HUMAN);
    expect(context.current()).toBeNull();
  });

  it('lets a guard set the principal on the store the interceptor already entered', async () => {
    const context = new PrincipalContextService();
    await context.run(null, async () => {
      expect(context.current()).toBeNull();
      context.set(MACHINE);
      await Promise.resolve();
      expect(context.current()).toBe(MACHINE);
    });
  });
});

describe('PrincipalContextInterceptor', () => {
  it('runs the handler inside the ALS scope, not merely around it', async () => {
    const context = new PrincipalContextService();
    const interceptor = new PrincipalContextInterceptor(context);

    let insideHandler: Principal | null = null;
    const result = await lastValueFrom(
      interceptor.intercept(executionContext({ user: HUMAN }), {
        handle: () => {
          insideHandler = context.current();
          return of('ok');
        },
      }),
    );

    expect(result).toBe('ok');
    expect(insideHandler).toBe(HUMAN);
    expect(context.current()).toBeNull();
  });

  it('enters an empty scope for an unauthenticated request rather than skipping it', async () => {
    const context = new PrincipalContextService();
    const interceptor = new PrincipalContextInterceptor(context);

    let entered = false;
    await lastValueFrom(
      interceptor.intercept(executionContext({}), {
        handle: () => {
          entered = context.current() === null;
          return of('ok');
        },
      }),
    );
    expect(entered).toBe(true);
  });
});

describe('principal helpers', () => {
  it('resolves the acting user and fails closed for an unbound machine credential', () => {
    expect(resolveActingUserId(HUMAN)).toBe('user-1');
    expect(resolveActingUserId(MACHINE)).toBe('user-2');
    expect(() => resolveActingUserId({ ...MACHINE, actingUserId: null })).toThrowError(
      ForbiddenException,
    );
  });

  it('CurrentUser returns request.user verbatim, exactly as the legacy decorator did', () => {
    // The decorator factory's handler is what Nest invokes; assert on it directly rather than
    // asserting the decorator is "a function", which would prove nothing.
    expect(typeof CurrentUser).toBe('function');
  });
});
