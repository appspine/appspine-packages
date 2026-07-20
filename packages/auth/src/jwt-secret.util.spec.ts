import { afterEach, describe, expect, it } from 'vitest';
import { resolveJwtSecret } from './jwt-secret.util';

const originalAuthMode = process.env.AUTH_MODE;
const originalJwtSecret = process.env.JWT_SECRET;

function restore(key: 'AUTH_MODE' | 'JWT_SECRET', value: string | undefined) {
  if (value === undefined) {
    // `process.env.X = undefined` stringifies to "undefined" instead of clearing the key —
    // delete is the only way to truly unset it.
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('resolveJwtSecret', () => {
  afterEach(() => {
    restore('AUTH_MODE', originalAuthMode);
    restore('JWT_SECRET', originalJwtSecret);
  });

  it('returns JWT_SECRET when set', () => {
    process.env.JWT_SECRET = 'a-real-secret';
    expect(resolveJwtSecret()).toBe('a-real-secret');
  });

  it('throws when JWT_SECRET is unset under AUTH_MODE=local (the default)', () => {
    process.env.AUTH_MODE = 'local';
    restore('JWT_SECRET', undefined);
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is not set/);
  });

  it('throws when JWT_SECRET is unset and AUTH_MODE is unset (defaults to local)', () => {
    restore('AUTH_MODE', undefined);
    restore('JWT_SECRET', undefined);
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is not set/);
  });

  it('does not throw when JWT_SECRET is unset under AUTH_MODE=oidc', () => {
    process.env.AUTH_MODE = 'oidc';
    restore('JWT_SECRET', undefined);
    expect(() => resolveJwtSecret()).not.toThrow();
  });
});
