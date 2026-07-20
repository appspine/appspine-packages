import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  ZodValidationPipe: class {},
}));

import { AuthController } from './auth.controller';

const originalAuthMode = process.env.AUTH_MODE;

function restoreAuthMode() {
  if (originalAuthMode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = originalAuthMode;
  }
}

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    password: '$2b$12$baTZEt1.bmaN0asQlOJVIeerB9TsDwCmSvcMBqt.JVWj.20YvxNT.',
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
    ...overrides,
  };
}

function createController(user = createUser()) {
  const usersService = {
    create: vi.fn().mockResolvedValue(undefined),
    findByEmail: vi.fn().mockResolvedValue(user),
  };
  const jwtService = {
    sign: vi.fn().mockReturnValue('signed-token'),
  };

  return {
    controller: new AuthController(usersService as never, jwtService as never),
    usersService,
    jwtService,
  };
}

describe('AuthController', () => {
  afterEach(() => {
    restoreAuthMode();
  });

  it('registers local users with a hashed password and returns a signed token', async () => {
    process.env.AUTH_MODE = 'local';
    const { controller, usersService, jwtService } = createController();

    await expect(
      controller.register({
        email: 'user@example.com',
        name: 'User',
        password: 'plain-password',
      }),
    ).resolves.toEqual({
      token: 'signed-token',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        roleNames: ['USER'],
      },
    });
    expect(usersService.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      name: 'User',
      password: expect.stringMatching(/^\$2[ab]\$/),
    });
    expect(usersService.create.mock.calls[0]?.[0].password).not.toBe('plain-password');
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'user@example.com',
      name: 'User',
      roleName: 'USER',
      roleNames: ['USER'],
      permissionPolicy: 'READ_ALL',
      permissions: ['pages:read'],
    });
  });

  it('rejects register and login when AUTH_MODE=oidc', async () => {
    process.env.AUTH_MODE = 'oidc';
    const { controller } = createController();

    await expect(
      controller.register({
        email: 'user@example.com',
        name: 'User',
        password: 'plain-password',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.login({ email: 'user@example.com', password: 'plain-password' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('logs in active users with a matching password', async () => {
    process.env.AUTH_MODE = 'local';
    const { controller } = createController();

    await expect(
      controller.login({ email: 'user@example.com', password: 'plain-password' }),
    ).resolves.toMatchObject({
      token: 'signed-token',
      user: { id: 'user-1', email: 'user@example.com', roleNames: ['USER'] },
    });
  });

  it('rejects login when the password does not match', async () => {
    process.env.AUTH_MODE = 'local';
    const { controller } = createController();

    await expect(
      controller.login({ email: 'user@example.com', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login for disabled users', async () => {
    process.env.AUTH_MODE = 'local';
    const { controller } = createController(createUser({ isActive: false }));

    await expect(
      controller.login({ email: 'user@example.com', password: 'plain-password' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns the authenticated request user from me', () => {
    const user = { sub: 'user-1', email: 'user@example.com', roleName: 'USER' };

    expect(new AuthController({} as never, {} as never).me({ user })).toBe(user);
  });
});
