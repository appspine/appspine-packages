import type { ScopeMatcherPort } from '@appspine/plugin-api';
import { SYSTEM_ADMIN_ROLE } from '@appspine/plugin-api';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  DOMAIN_EVENTS_SCOPES_KEY,
  DomainEventsAdminGuard,
  Scopes,
} from './domain-events-admin.guard';

function createMockContext(user?: unknown, requiredScopes?: string[]): ExecutionContext {
  const handler = () => {};
  if (requiredScopes) {
    Reflect.defineMetadata(DOMAIN_EVENTS_SCOPES_KEY, requiredScopes, handler);
  }

  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const mockScopeMatcher: ScopeMatcherPort = {
  matches: (granted: string[], required: string) => {
    if (granted.includes('*')) return true;
    const [reqModule, reqAction] = required.split(':');
    return granted.some((g) => {
      if (g === '*') return true;
      const [gModule, gAction] = g.split(':');
      if (gModule !== reqModule) return false;
      return gAction === '*' || gAction === reqAction;
    });
  },
};

describe('DomainEventsAdminGuard', () => {
  it('rejects unauthenticated requests by returning false', () => {
    const guard = new DomainEventsAdminGuard(mockScopeMatcher);
    const ctx = createMockContext(undefined, ['domain-events:read']);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  describe('interactive users', () => {
    it('allows an interactive user with SYSTEM_ADMIN_ROLE', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'u1', roleNames: [SYSTEM_ADMIN_ROLE], kind: 'interactive' };
      const ctx = createMockContext(user, ['domain-events:read']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows an interactive user with ADMIN in roleNames', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'u1', roleNames: ['ADMIN'] };
      const ctx = createMockContext(user, ['domain-events:read']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows an interactive user with ADMIN in roles array of objects', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'u1', roles: [{ name: 'ADMIN' }] };
      const ctx = createMockContext(user, ['domain-events:read']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('rejects an interactive user without admin role with 403 ForbiddenException', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'u1', roleNames: ['MEMBER'], kind: 'interactive' };
      const ctx = createMockContext(user, ['domain-events:read']);
      expect(() => guard.canActivate(ctx)).toThrowError(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrowError('Admin access required');
    });
  });

  describe('machine API key callers', () => {
    it('allows an API key with matching scope', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'k1', isApiKey: true, scopes: ['domain-events:read'] };
      const ctx = createMockContext(user, ['domain-events:read']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows an API key with wildcard * scope', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'k1', kind: 'machine', scopes: ['*'] };
      const ctx = createMockContext(user, ['domain-events:read']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows an API key with module wildcard domain-events:* scope', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'k1', isApiKey: true, scopes: ['domain-events:*'] };
      const ctx = createMockContext(user, ['domain-events:write']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('rejects an API key with insufficient scope with 403 ForbiddenException', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'k1', isApiKey: true, scopes: ['domain-events:read'] };
      const ctx = createMockContext(user, ['domain-events:write']);
      expect(() => guard.canActivate(ctx)).toThrowError(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrowError('Insufficient API key scopes');
    });

    it('fails closed with 403 when scopeMatcher capability is missing', () => {
      const guard = new DomainEventsAdminGuard(undefined);
      const user = { sub: 'k1', isApiKey: true, scopes: ['domain-events:read'] };
      const ctx = createMockContext(user, ['domain-events:read']);
      expect(() => guard.canActivate(ctx)).toThrowError(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrowError(
        'No scope matcher provider is available to validate API key scopes',
      );
    });

    it('fails closed when a route has no @Scopes() declared', () => {
      const guard = new DomainEventsAdminGuard(mockScopeMatcher);
      const user = { sub: 'k1', isApiKey: true, scopes: ['domain-events:read'] };
      const ctx = createMockContext(user, undefined);
      expect(() => guard.canActivate(ctx)).toThrowError(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrowError(
        'This route declares no API key scopes; API key access is denied by default',
      );
    });
  });

  describe('Scopes decorator', () => {
    it('sets DOMAIN_EVENTS_SCOPES_KEY metadata on target function', () => {
      class Target {
        @Scopes('domain-events:read', 'domain-events:write')
        method() {}
      }
      const target = new Target();
      const metadata = Reflect.getMetadata(DOMAIN_EVENTS_SCOPES_KEY, target.method);
      expect(metadata).toEqual(['domain-events:read', 'domain-events:write']);
    });
  });
});
