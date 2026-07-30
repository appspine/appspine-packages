import { afterEach, describe, expect, it, vi } from 'vitest';
import { OidcStrategy } from './oidc.strategy';

const ENV_KEYS = ['OIDC_JWKS_URL', 'OIDC_ISSUER', 'OIDC_AUDIENCE'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

function setValidEnv() {
  process.env.OIDC_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';
  process.env.OIDC_ISSUER = 'https://issuer.example';
  process.env.OIDC_AUDIENCE = 'test-client';
}

describe('OidcStrategy', () => {
  afterEach(() => {
    restoreEnv();
  });

  it.each(ENV_KEYS)('throws at construction when %s is not set', (missingKey) => {
    setValidEnv();
    delete process.env[missingKey];

    expect(() => new OidcStrategy({} as never)).toThrow(
      /OIDC_JWKS_URL, OIDC_ISSUER and OIDC_AUDIENCE must all be set/,
    );
  });

  it('delegates validated OIDC payloads to JwtVerifierService for local RBAC context', async () => {
    setValidEnv();
    const jwtUser = {
      sub: 'user-1',
      email: 'user@example.com',
      name: 'User',
      roleName: 'USER',
      roleNames: ['USER'],
      permissionPolicy: 'READ_ALL',
      permissions: ['pages:read'],
    };
    const jwtVerifierService = {
      buildOidcJwtUser: vi.fn().mockResolvedValue(jwtUser),
    };
    const payload = { email: 'user@example.com' };

    await expect(new OidcStrategy(jwtVerifierService as never).validate(payload)).resolves.toBe(
      jwtUser,
    );
    expect(jwtVerifierService.buildOidcJwtUser).toHaveBeenCalledWith(payload);
  });
});
