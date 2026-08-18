import { describe, expect, it } from 'vitest';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('returns the authenticated request user from me', () => {
    const user = { sub: 'user-1', email: 'user@example.com', roleName: 'USER' };

    expect(new AuthController().me({ user })).toBe(user);
  });
});
