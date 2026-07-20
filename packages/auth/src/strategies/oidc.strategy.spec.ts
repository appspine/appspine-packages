import { afterEach, describe, expect, it, vi } from 'vitest';
import { OidcStrategy } from './oidc.strategy';

const originalJwksUrl = process.env.OIDC_JWKS_URL;

function restoreJwksUrl() {
  if (originalJwksUrl === undefined) {
    delete process.env.OIDC_JWKS_URL;
  } else {
    process.env.OIDC_JWKS_URL = originalJwksUrl;
  }
}

describe('OidcStrategy', () => {
  afterEach(() => {
    restoreJwksUrl();
  });

  it('delegates validated OIDC payloads to JwtVerifierService for local RBAC context', async () => {
    process.env.OIDC_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';
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
