import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { matchScope, ScopeGuard } from './scope.guard';

function context(options: {
  handlerScopes?: string[];
  classScopes?: string[];
  user?: { isApiKey?: boolean; scopes?: string[] };
}): ExecutionContext {
  const handler = () => undefined;
  const controller = class {};
  if (options.handlerScopes) Reflect.defineMetadata(SCOPES_KEY, options.handlerScopes, handler);
  if (options.classScopes) Reflect.defineMetadata(SCOPES_KEY, options.classScopes, controller);
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: options.user }) }),
  } as unknown as ExecutionContext;
}

describe('ScopeGuard', () => {
  const guard = new ScopeGuard();

  it('denies an API key principal when no @Scopes() is declared anywhere', () => {
    expect(() => guard.canActivate(context({ user: { isApiKey: true, scopes: ['*'] } }))).toThrow(
      ForbiddenException,
    );
  });

  it('still allows JWT principals on an undecorated route', () => {
    expect(guard.canActivate(context({ user: { isApiKey: false } }))).toBe(true);
    expect(guard.canActivate(context({ user: undefined }))).toBe(true);
  });

  it('allows an API key holding the declared scope, on the handler or the class', () => {
    expect(
      guard.canActivate(
        context({
          handlerScopes: ['users:read'],
          user: { isApiKey: true, scopes: ['users:read'] },
        }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        context({ classScopes: ['users:read'], user: { isApiKey: true, scopes: ['users:*'] } }),
      ),
    ).toBe(true);
  });

  it('rejects an API key missing the declared scope', () => {
    expect(() =>
      guard.canActivate(
        context({
          handlerScopes: ['users:write'],
          user: { isApiKey: true, scopes: ['users:read'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets an explicitly scope-free M2M route opt out with @Scopes("*")', () => {
    expect(
      guard.canActivate(context({ handlerScopes: ['*'], user: { isApiKey: true, scopes: ['*'] } })),
    ).toBe(true);
  });

  it('matchScope honours wildcards and rejects cross-module grants', () => {
    expect(matchScope(['*'], 'users:read')).toBe(true);
    expect(matchScope(['users:*'], 'users:write')).toBe(true);
    expect(matchScope(['roles:read'], 'users:read')).toBe(false);
  });
});
