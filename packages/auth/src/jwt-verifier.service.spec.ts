import { generateKeyPairSync } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { JwtVerifierService } from './jwt-verifier.service';

// The constructor now requires these to be set (fails closed if either is missing —
// see the OidcStrategy/JwtVerifierService boot-time checks) so every test in this file
// needs them present regardless of which describe block it lives in.
process.env.OIDC_ISSUER = 'https://issuer.example';
process.env.OIDC_AUDIENCE = 'test-client';

function createService(
  findUnique: (...args: never[]) => unknown = async () => null,
  create: (...args: never[]) => unknown = async () => {},
) {
  return new JwtVerifierService({ user: { findUnique } } as never, { create } as never);
}

describe('JwtVerifierService', () => {
  it('rejects an OIDC token without a kid header before resolving JWKS', async () => {
    process.env.OIDC_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = jwt.sign({ email: 'user@example.com' }, privateKey, { algorithm: 'RS256' });

    await expect(createService().verifyJwtToken(token)).rejects.toThrow(UnauthorizedException);
  });

  it('validates an OIDC token signature and attaches local RBAC context', async () => {
    process.env.OIDC_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = jwt.sign(
      { email: 'user@example.com', azp: process.env.OIDC_AUDIENCE },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: 'key-1',
        issuer: process.env.OIDC_ISSUER,
        audience: process.env.OIDC_AUDIENCE,
      },
    );
    const service = createService(async () => ({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      isActive: true,
      userRoles: [
        {
          role: {
            name: 'USER',
            permissionPolicy: 'READ_ALL',
            permissions: [{ permission: 'pages:read' }],
          },
        },
      ],
    }));
    (
      service as unknown as {
        oidcClient: { getSigningKey: (kid: string) => Promise<{ getPublicKey: () => string }> };
      }
    ).oidcClient = {
      getSigningKey: async (kid: string) => {
        expect(kid).toBe('key-1');
        return {
          getPublicKey: () => publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        };
      },
    };

    await expect(service.verifyJwtToken(token)).resolves.toEqual({
      sub: 'user-1',
      email: 'user@example.com',
      name: 'User',
      roleName: 'USER',
      roleNames: ['USER'],
      permissionPolicy: 'READ_ALL',
      permissions: ['pages:read'],
    });
  });
});

describe('JwtVerifierService.buildOidcJwtUser JIT provisioning', () => {
  const provisionedUser = {
    id: 'user-new',
    email: 'newcomer@example.com',
    name: 'Newcomer',
    isActive: true,
    userRoles: [{ role: { name: 'USER', permissionPolicy: 'DENY_ALL', permissions: [] } }],
  };

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['non-string', 123],
    ['mismatched', 'other-client'],
  ] as const)('rejects a token with an invalid azp claim (%s)', async (_case, azp) => {
    const service = createService();

    await expect(service.buildOidcJwtUser({ email: 'user@example.com', azp })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a token with an azp claim matching the configured audience', async () => {
    const service = createService(async () => ({
      id: 'user-existing',
      email: 'existing@example.com',
      name: 'Existing',
      isActive: true,
      userRoles: [],
    }));

    await expect(
      service.buildOidcJwtUser({
        email: 'existing@example.com',
        azp: process.env.OIDC_AUDIENCE,
      }),
    ).resolves.toMatchObject({ sub: 'user-existing' });
  });

  it('requires the existing audience check in addition to azp', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = jwt.sign(
      { email: 'user@example.com', azp: process.env.OIDC_AUDIENCE },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: 'key-1',
        issuer: process.env.OIDC_ISSUER,
        audience: 'other-audience',
      },
    );
    const service = createService();

    const verifyOidcSignature = (
      service as unknown as {
        verifyOidcSignature: (
          token: string,
          signingKey: string,
        ) => Promise<Record<string, unknown>>;
      }
    ).verifyOidcSignature.bind(service);

    await expect(
      verifyOidcSignature(token, publicKey.export({ type: 'spki', format: 'pem' }).toString()),
    ).rejects.toThrow();
  });

  it('auto-creates a local User with default role when none exists locally', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null) // first lookup: no local user
      .mockResolvedValueOnce(provisionedUser); // re-fetch after create() succeeds
    const create = vi.fn().mockResolvedValue({ id: 'user-new' });
    const service = createService(findUnique, create);

    const result = await service.buildOidcJwtUser({
      email: 'newcomer@example.com',
      name: 'Newcomer',
      azp: process.env.OIDC_AUDIENCE,
    });

    expect(create).toHaveBeenCalledWith({ email: 'newcomer@example.com', name: 'Newcomer' });
    expect(result.sub).toBe('user-new');
    expect(result.roleNames).toEqual(['USER']);
  });

  it('recovers from a concurrent first-login race by re-fetching instead of throwing', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null) // first lookup: no local user yet
      .mockResolvedValueOnce(provisionedUser); // re-fetch after losing the create race
    const create = vi.fn().mockRejectedValue(new ConflictException('Email already registered'));
    const service = createService(findUnique, create);

    await expect(
      service.buildOidcJwtUser({
        email: 'newcomer@example.com',
        name: 'Newcomer',
        azp: process.env.OIDC_AUDIENCE,
      }),
    ).resolves.toMatchObject({ sub: 'user-new' });
  });

  it('rejects a token whose email_verified claim is explicitly false', async () => {
    const service = createService();

    await expect(
      service.buildOidcJwtUser({ email: 'unverified@example.com', email_verified: false }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('does not call create when a local User already exists', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'user-existing',
      email: 'existing@example.com',
      name: 'Existing',
      isActive: true,
      userRoles: [],
    });
    const create = vi.fn();
    const service = createService(findUnique, create);

    await service.buildOidcJwtUser({
      email: 'existing@example.com',
      azp: process.env.OIDC_AUDIENCE,
    });

    expect(create).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
