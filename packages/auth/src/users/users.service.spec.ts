import { Prisma, type PrismaService } from '@appspine/common';
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

describe('UsersService.remove', () => {
  it('should successfully delete a user when no foreign key restriction exists', async () => {
    const deleteMock = vi.fn().mockResolvedValue(mockUser);
    const prisma = createPrismaMock(deleteMock);
    const service = new UsersService(prisma as unknown as PrismaService);

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
    const prisma = createPrismaMock(deleteMock);
    const service = new UsersService(prisma as unknown as PrismaService);

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
    const prisma = createPrismaMock(deleteMock);
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(service.remove('user-1')).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    await expect(service.remove('user-1')).rejects.toThrow(/depends on one or more records/);
  });

  it('should rethrow generic errors', async () => {
    const genericError = new Error('Database connection failed');
    const deleteMock = vi.fn().mockRejectedValue(genericError);
    const prisma = createPrismaMock(deleteMock);
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(service.remove('user-1')).rejects.toThrow('Database connection failed');
  });
});
