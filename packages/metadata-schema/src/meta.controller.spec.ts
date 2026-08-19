import type { ScopeMatcherPort } from '@appspine/plugin-api';
import { AppspineAuthGuard } from '@appspine/plugin-host-nest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MetaController } from './meta.controller';
import type { MetaService, SchemaMeta } from './meta.service';
import { MetadataScopeGuard } from './meta-scope.guard';

function createMockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
  } as unknown as ExecutionContext;
}

describe('MetadataScopeGuard', () => {
  const fakeScopeMatcher: ScopeMatcherPort = {
    matches(scopes: string[], required: string): boolean {
      if (scopes.includes('*')) return true;
      const [reqModule, reqAction] = required.split(':');
      return scopes.some((g) => {
        if (g === '*') return true;
        const [gModule, gAction] = g.split(':');
        if (gModule !== reqModule) return false;
        return gAction === '*' || gAction === reqAction;
      });
    },
  };

  describe('Interactive (human / JWT) users', () => {
    it('allows authenticated human users regardless of scopeMatcher presence', () => {
      const guardWithoutMatcher = new MetadataScopeGuard();
      const guardWithMatcher = new MetadataScopeGuard(fakeScopeMatcher);

      const humanUser = {
        sub: 'user_abc',
        email: 'developer@example.com',
        isApiKey: false,
      };

      const ctx = createMockContext(humanUser);

      expect(guardWithoutMatcher.canActivate(ctx)).toBe(true);
      expect(guardWithMatcher.canActivate(ctx)).toBe(true);
    });

    it('allows human principal object without isApiKey field', () => {
      const guard = new MetadataScopeGuard(fakeScopeMatcher);
      const humanPrincipal = {
        sub: 'user_xyz',
        kind: 'interactive',
      };

      const ctx = createMockContext(humanPrincipal);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('Machine (API Key) users with scopeMatcher (positive tests)', () => {
    const guard = new MetadataScopeGuard(fakeScopeMatcher);

    it('allows API key with exact metadata:read scope', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
        scopes: ['metadata:read'],
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows API key with module wildcard metadata:* scope', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
        scopes: ['metadata:*'],
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows API key with global wildcard * scope', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
        scopes: ['*'],
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows machine principal with kind: machine and valid scope', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        kind: 'machine',
        scopes: ['metadata:read', 'other:read'],
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('Machine (API Key) users - Authorization negative tests', () => {
    const guard = new MetadataScopeGuard(fakeScopeMatcher);

    it('rejects API key with unrelated scope (e.g. users:read)', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
        scopes: ['users:read', 'wiki_pages:read'],
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient API key scopes');
    });

    it('rejects API key with write-only scope (metadata:write)', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
        scopes: ['metadata:write'],
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient API key scopes');
    });

    it('rejects API key with empty scopes', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
        scopes: [],
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient API key scopes');
    });

    it('rejects API key with undefined / non-array scopes', () => {
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient API key scopes');
    });
  });

  describe('Missing Optional Capability tests', () => {
    it('fails closed (403 Forbidden) for API key callers when scopeMatcher is missing', () => {
      const guardWithoutMatcher = new MetadataScopeGuard(undefined);
      const ctx = createMockContext({
        sub: 'key_123',
        isApiKey: true,
        scopes: ['metadata:read', '*'],
      });

      expect(() => guardWithoutMatcher.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guardWithoutMatcher.canActivate(ctx)).toThrow(
        'No scope matcher provider is available to validate API key scopes',
      );
    });
  });

  describe('Unauthenticated callers', () => {
    it('returns false when user is not present on request', () => {
      const guard = new MetadataScopeGuard(fakeScopeMatcher);
      const ctx = createMockContext(undefined);
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });
});

describe('MetaController', () => {
  it('delegates to MetaService.buildMeta() on GET /metadata/schema', () => {
    const mockSchema: SchemaMeta = {
      generatedAt: '2026-08-19T00:00:00.000Z',
      models: [
        {
          name: 'Item',
          dbTable: 'items',
          fields: [
            {
              name: 'id',
              type: 'String',
              kind: 'scalar',
              isRequired: true,
              isUnique: false,
              isId: true,
              isList: false,
              hasDefault: true,
            },
          ],
        },
      ],
      enums: [],
      availableScopes: ['items:read', 'items:write', 'items:*'],
    };

    const mockMetaService: MetaService = {
      buildMeta: vi.fn().mockReturnValue(mockSchema),
    } as unknown as MetaService;

    const controller = new MetaController(mockMetaService);
    const result = controller.schema();

    expect(result).toBe(mockSchema);
    expect(mockMetaService.buildMeta).toHaveBeenCalledTimes(1);
  });

  it('is decorated with AppspineAuthGuard and MetadataScopeGuard', () => {
    const guards = Reflect.getMetadata('__guards__', MetaController) as unknown[];
    expect(guards).toBeDefined();
    expect(guards).toContain(AppspineAuthGuard);
    expect(guards).toContain(MetadataScopeGuard);
  });
});
