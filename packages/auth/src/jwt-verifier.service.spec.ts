import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterEach, describe, expect, it } from 'vitest';
import { JwtVerifierService } from './jwt-verifier.service';

const originalAuthMode = process.env.AUTH_MODE;
const originalJwtSecret = process.env.JWT_SECRET;

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
    process.env.AUTH_MODE = originalAuthMode;
    process.env.JWT_SECRET = originalJwtSecret;
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
});
