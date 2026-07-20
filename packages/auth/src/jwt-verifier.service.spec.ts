import { generateKeyPairSync } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it } from 'vitest';
import { JwtVerifierService } from './jwt-verifier.service';

const originalAuthMode = process.env.AUTH_MODE;
const originalJwtSecret = process.env.JWT_SECRET;
const originalJwksUrl = process.env.OIDC_JWKS_URL;

function restore(key: 'AUTH_MODE' | 'JWT_SECRET' | 'OIDC_JWKS_URL', value: string | undefined) {
  if (value === undefined) {
    // `process.env.X = undefined` stringifies to "undefined" instead of clearing the key —
    // delete is the only way to truly unset it.
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function createService() {
  return new JwtVerifierService(
    {
      user: {
        findUnique: async () => null,
      },
    } as never,
    new JwtService({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
    }),
  );
}

describe('JwtVerifierService', () => {
  afterEach(() => {
    restore('AUTH_MODE', originalAuthMode);
    restore('JWT_SECRET', originalJwtSecret);
    restore('OIDC_JWKS_URL', originalJwksUrl);
  });

  it('verifies a locally signed HS256 token', async () => {
    process.env.AUTH_MODE = 'local';
    process.env.JWT_SECRET = 'test-secret';

    const jwtService = new JwtService({ secret: 'test-secret' });
    const token = await jwtService.signAsync({
      sub: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      roleName: 'ADMIN',
      roleNames: ['ADMIN'],
      permissionPolicy: 'ALLOW_ALL',
      permissions: ['CHAT_CHANNEL_READ'],
    });

    const result = await createService().verifyJwtToken(token);

    expect(result).toEqual({
      sub: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      roleName: 'ADMIN',
      roleNames: ['ADMIN'],
      permissionPolicy: 'ALLOW_ALL',
      permissions: ['CHAT_CHANNEL_READ'],
    });
  });

  it('rejects a token with a tampered signature', async () => {
    process.env.AUTH_MODE = 'local';
    process.env.JWT_SECRET = 'test-secret';

    const jwtService = new JwtService({ secret: 'test-secret' });
    const token = await jwtService.signAsync({
      sub: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      roleName: 'ADMIN',
      roleNames: ['ADMIN'],
      permissionPolicy: 'ALLOW_ALL',
      permissions: [],
    });
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    await expect(createService().verifyJwtToken(tamperedToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a malformed token', async () => {
    process.env.AUTH_MODE = 'local';
    process.env.JWT_SECRET = 'test-secret';

    await expect(createService().verifyJwtToken('not-a-jwt')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('fails loud instead of falling back to a hardcoded secret when JWT_SECRET is unset', async () => {
    process.env.AUTH_MODE = 'local';
    // `process.env.X = undefined` stringifies to "undefined" instead of clearing the key.
    delete process.env.JWT_SECRET;

    const rejection = expect(createService().verifyJwtToken('irrelevant-token')).rejects;
    await rejection.toThrow(/JWT_SECRET is not set/);
    // Must NOT be normalized into the generic "Invalid JWT" 401 — a missing secret is a
    // config error, not a token-validity error, and must surface distinctly.
    await rejection.not.toThrow(UnauthorizedException);
  });

  it('rejects an OIDC token without a kid header before resolving JWKS', async () => {
    process.env.AUTH_MODE = 'oidc';
    process.env.OIDC_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = jwt.sign({ email: 'user@example.com' }, privateKey, { algorithm: 'RS256' });

    await expect(createService().verifyJwtToken(token)).rejects.toThrow(UnauthorizedException);
  });

  it('validates an OIDC token signature and attaches local RBAC context', async () => {
    process.env.AUTH_MODE = 'oidc';
    process.env.OIDC_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = jwt.sign({ email: 'user@example.com' }, privateKey, {
      algorithm: 'RS256',
      keyid: 'key-1',
    });
    const service = new JwtVerifierService(
      {
        user: {
          findUnique: async () => ({
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
          }),
        },
      } as never,
      new JwtService(),
    );
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
