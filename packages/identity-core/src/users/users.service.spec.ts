import { Prisma } from '@appspine/common';
import type { RbacPolicyPort } from '@appspine/plugin-api';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';

vi.mock('@appspine/common', () => ({
  PrismaService: class {},
  paginate: (data: unknown, total: number) => ({ data, meta: { total } }),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  Prisma: {
    PrismaClientKnownRequestError: class MockPrismaClientKnownRequestError extends Error {
      code: string;
      clientVersion: string;
      constructor(
        message: string,
        { code, clientVersion }: { code: string; clientVersion: string },
      ) {
        super(message);
        this.code = code;
        this.clientVersion = clientVersion;
        this.name = 'PrismaClientKnownRequestError';
      }
    },
  },
}));

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  isActive: true,
  isServiceAccount: false,
  createdAt: new Date(),
};

function createPrismaMock(deleteMock: ReturnType<typeof vi.fn>) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(mockUser),
      delete: deleteMock,
    },
  };
}

/**
 * The default-role lookup and role assignment moved to `appspine.rbac-policy` in the 051 split
 * (PL0-04 §2): identity no longer touches RBAC's `Role` or `UserRole` tables. This fake is the
 * seam, and its `defaults` are what the pre-split `resolveDefaultRoleId()` used to return.
 */
function createRbacPolicyMock(overrides: Partial<RbacPolicyPort> = {}) {
  return {
    flatten: vi.fn().mockReturnValue({
      roleNames: [],
      permissionPolicy: 'DENY_ALL',
      permissions: [],
    }),
    rolesForUser: vi.fn().mockResolvedValue([]),
    defaultRoleIds: vi.fn().mockResolvedValue(['role-user']),
    replaceUserRoles: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies RbacPolicyPort as RbacPolicyPort & {
    defaultRoleIds: ReturnType<typeof vi.fn>;
    replaceUserRoles: ReturnType<typeof vi.fn>;
  };
}

function createUsersService(deleteMock: ReturnType<typeof vi.fn>) {
  const prisma = createPrismaMock(deleteMock);
  const service = new UsersService(
    prisma as unknown as ConstructorParameters<typeof UsersService>[0],
    createRbacPolicyMock(),
  );
  return { prisma, service };
}

function createUsersServiceForCreate(options: {
  findUniqueUser?: ReturnType<typeof vi.fn>;
  createUser?: ReturnType<typeof vi.fn>;
}) {
  const prisma: {
    user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    $transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
  } = {
    user: {
      findUnique: options.findUniqueUser ?? vi.fn().mockResolvedValue(null),
      create: options.createUser ?? vi.fn().mockResolvedValue(mockUser),
    },
    $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(prisma),
  };
  const rbacPolicy = createRbacPolicyMock();
  const service = new UsersService(
    prisma as unknown as ConstructorParameters<typeof UsersService>[0],
    rbacPolicy,
  );
  return { prisma, rbacPolicy, service };
}

describe('UsersService.remove', () => {
  it('should successfully delete a user when no foreign key restriction exists', async () => {
    const deleteMock = vi.fn().mockResolvedValue(mockUser);
    const { prisma, service } = createUsersService(deleteMock);

    await expect(service.remove('user-1')).resolves.not.toThrow();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: expect.any(Object),
    });
    expect(deleteMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });

  it('should throw ConflictException when Prisma throws P2003 foreign key constraint error', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: `ChatMessage_senderId_fkey (index)`',
      {
        code: 'P2003',
        clientVersion: '6.2.0',
      },
    );
    const deleteMock = vi.fn().mockRejectedValue(prismaError);
    const { service } = createUsersService(deleteMock);

    await expect(service.remove('user-1')).rejects.toThrow(ConflictException);
    await expect(service.remove('user-1')).rejects.toThrow(
      'This user still has records referencing them elsewhere in the system and cannot be permanently deleted. Deactivate the account instead.',
    );
  });

  it('should rethrow other Prisma errors (e.g. P2025)', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found.',
      {
        code: 'P2025',
        clientVersion: '6.2.0',
      },
    );
    const deleteMock = vi.fn().mockRejectedValue(prismaError);
    const { service } = createUsersService(deleteMock);

    await expect(service.remove('user-1')).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    await expect(service.remove('user-1')).rejects.toThrow(/depends on one or more records/);
  });

  it('should rethrow generic errors', async () => {
    const genericError = new Error('Database connection failed');
    const deleteMock = vi.fn().mockRejectedValue(genericError);
    const { service } = createUsersService(deleteMock);

    await expect(service.remove('user-1')).rejects.toThrow('Database connection failed');
  });
});

describe('UsersService.create', () => {
  it('asks RBAC for the default role instead of querying the Role table itself', async () => {
    const { prisma, rbacPolicy, service } = createUsersServiceForCreate({});

    await service.create({ email: 'newcomer@example.com', name: 'Newcomer' });

    expect(rbacPolicy.defaultRoleIds).toHaveBeenCalledOnce();
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'newcomer@example.com' }),
      }),
    );
    expect(rbacPolicy.replaceUserRoles).toHaveBeenCalledWith('user-1', ['role-user'], prisma);
  });

  it('does not consult RBAC when the caller already resolved the roles', async () => {
    const { rbacPolicy, service } = createUsersServiceForCreate({});

    await service.create({ email: 'explicit@example.com', roleIds: ['role-admin'] });

    expect(rbacPolicy.defaultRoleIds).not.toHaveBeenCalled();
  });

  it('creates a role-less user when no RBAC plugin is installed', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(mockUser),
      },
    };
    const service = new UsersService(
      prisma as unknown as ConstructorParameters<typeof UsersService>[0],
    );

    await service.create({ email: 'no-rbac@example.com' });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'no-rbac@example.com' }) }),
    );
  });

  it('throws ConflictException without hitting the DB when the pre-check finds an existing email', async () => {
    const createUser = vi.fn();
    const { service } = createUsersServiceForCreate({
      findUniqueUser: vi.fn().mockResolvedValue(mockUser),
      createUser,
    });

    await expect(service.create({ email: 'test@example.com' })).rejects.toThrow(ConflictException);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('converts a Prisma P2002 unique-constraint error from a concurrent create into ConflictException', async () => {
    // The pre-check (findUnique) passes for both racing callers; only the DB's own
    // unique constraint on email catches the loser, as a P2002 rather than the
    // pre-check's ConflictException. Callers (e.g. JIT provisioning) must see the same
    // exception type either way.
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '6.2.0' },
    );
    const { service } = createUsersServiceForCreate({
      createUser: vi.fn().mockRejectedValue(prismaError),
    });

    await expect(service.create({ email: 'racer@example.com' })).rejects.toThrow(ConflictException);
  });

  it('rethrows other Prisma errors from create (e.g. a role FK failure)', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: `UserRole_roleId_fkey (index)`',
      { code: 'P2003', clientVersion: '6.2.0' },
    );
    const { service } = createUsersServiceForCreate({
      createUser: vi.fn().mockRejectedValue(prismaError),
    });

    await expect(service.create({ email: 'newcomer@example.com' })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});

describe('UsersService.updateRoles', () => {
  it('delegates the write to RBAC rather than touching the UserRole join table', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
    };
    const rbacPolicy = createRbacPolicyMock();
    const service = new UsersService(
      prisma as unknown as ConstructorParameters<typeof UsersService>[0],
      rbacPolicy,
    );

    await service.updateRoles('user-1', ['role-admin', 'role-user']);

    expect(rbacPolicy.replaceUserRoles).toHaveBeenCalledWith('user-1', ['role-admin', 'role-user']);
  });

  it('refuses clearly when no RBAC plugin provides the capability', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
    };
    const service = new UsersService(
      prisma as unknown as ConstructorParameters<typeof UsersService>[0],
    );

    await expect(service.updateRoles('user-1', ['role-admin'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
