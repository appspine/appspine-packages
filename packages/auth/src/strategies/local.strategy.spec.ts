import { afterEach, describe, expect, it } from 'vitest';
import { LocalStrategy } from './local.strategy';

const originalJwtSecret = process.env.JWT_SECRET;

function restoreJwtSecret() {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
}

describe('LocalStrategy', () => {
  afterEach(() => {
    restoreJwtSecret();
  });

  it('maps JWT payload claims into the request user shape', () => {
    process.env.JWT_SECRET = 'test-secret';

    const user = new LocalStrategy().validate({
      sub: 'user-1',
      email: 'user@example.com',
      name: 'User',
      roleName: 'USER',
      roleNames: ['USER'],
      permissionPolicy: 'READ_ALL',
      permissions: ['pages:read'],
    });

    expect(user).toEqual({
      sub: 'user-1',
      email: 'user@example.com',
      name: 'User',
      roleName: 'USER',
      roleNames: ['USER'],
      permissionPolicy: 'READ_ALL',
      permissions: ['pages:read'],
    });
  });

  it('defaults optional RBAC claims to a deny-all context', () => {
    process.env.JWT_SECRET = 'test-secret';

    expect(
      new LocalStrategy().validate({
        sub: 'user-1',
        email: 'user@example.com',
        roleName: 'USER',
      } as never),
    ).toEqual({
      sub: 'user-1',
      email: 'user@example.com',
      name: undefined,
      roleName: 'USER',
      roleNames: [],
      permissionPolicy: 'DENY_ALL',
      permissions: [],
    });
  });
});
