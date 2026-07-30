import { Prisma } from '@appspine/common';
import { ConflictException } from '@nestjs/common';
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
  userRoles: [],
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

function createUsersService(deleteMock: ReturnType<typeof vi.fn>) {
  const prisma = createPrismaMock(deleteMock);
  const service = new UsersService(
    prisma as unknown as ConstructorParameters<typeof UsersService>[0],
  );
  return { prisma, service };
}

function createUsersServiceForCreate(options: {
  findUniqueUser?: ReturnType<typeof vi.fn>;
  createUser?: ReturnType<typeof vi.fn>;
}) {
  const prisma = {
    user: {
      findUnique: options.findUniqueUser ?? vi.fn().mockResolvedValue(null),
      create: options.createUser ?? vi.fn().mockResolvedValue(mockUser),
    },
    role: {
      findUnique: vi.fn().mockResolvedValue({ id: 'role-user' }),
    },
  };
  const service = new UsersService(
    prisma as unknown as ConstructorParameters<typeof UsersService>[0],
  );
  return { prisma, service };
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
  it('creates a user with the default role when no roleIds are given', async () => {
    const { prisma, service } = createUsersServiceForCreate({});

    await service.create({ email: 'newcomer@example.com', name: 'Newcomer' });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'newcomer@example.com',
          userRoles: { create: [{ roleId: 'role-user' }] },
        }),
      }),
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
