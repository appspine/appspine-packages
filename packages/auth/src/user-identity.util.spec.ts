import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { JwtUser } from './decorators/current-user.decorator';
import type { ApiKeyUser } from './user-context.util';
import { resolveActingUserId } from './user-identity.util';

const baseContext = {
  roleNames: ['ADMIN'],
  permissionPolicy: 'ALLOW_ALL',
  permissions: [],
};

describe('resolveActingUserId', () => {
  it('returns the JWT subject for human callers', () => {
    const user: JwtUser = {
      sub: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      roleName: 'ADMIN',
      ...baseContext,
    };

    expect(resolveActingUserId(user)).toBe('user-1');
  });

  it('returns the bound acting user id for API-key callers', () => {
    const user: ApiKeyUser = {
      sub: 'api-key-1',
      scopes: [],
      isApiKey: true,
      actingUserId: 'service-user-1',
      ...baseContext,
    };

    expect(resolveActingUserId(user)).toBe('service-user-1');
  });

  it('throws when an API key has no bound acting user', () => {
    const user: ApiKeyUser = {
      sub: 'api-key-1',
      scopes: [],
      isApiKey: true,
      actingUserId: null,
      ...baseContext,
    };

    expect(() => resolveActingUserId(user)).toThrow(ForbiddenException);
  });
});
