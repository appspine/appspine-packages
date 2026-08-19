import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rbacManifest } from './plugin';
import { RbacPolicyService } from './rbac-policy.service';

vi.mock('@appspine/common', () => ({
  PermissionPolicy: {
    DENY_ALL: 'DENY_ALL',
    ALLOW_ALL: 'ALLOW_ALL',
    READ_ALL: 'READ_ALL',
  },
  PrismaService: class {},
  paginate: (data: unknown, total: number) => ({ data, total }),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  toPrismaSortDirection: (sortOrder: string) => (sortOrder === 'ASC' ? 'asc' : 'desc'),
  paginationQuerySchema: {},
  ZodValidationPipe: class {},
}));

describe('identity augmentation & user role persistence', () => {
  let service: RbacPolicyService;

  const prismaMock = {
    userRole: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      if (typeof cb === 'function') {
        return cb(prismaMock);
      }
      return Promise.all(cb);
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RbacPolicyService(
      prismaMock as unknown as ConstructorParameters<typeof RbacPolicyService>[0],
    );
  });

  describe('Prisma schema augmentation contract', () => {
    it('declares User augmentation in manifest prisma facet', () => {
      const prismaFacet = rbacManifest.facets?.prisma;
      expect(prismaFacet).toBeDefined();
      expect(prismaFacet?.owns).toEqual(['Role', 'RolePermission', 'UserRole']);
      expect(prismaFacet?.augments).toEqual([
        {
          targetModel: 'User',
          field: 'userRoles',
          owner: 'identity-core',
          type: 'UserRole[]',
        },
      ]);
    });
  });

  describe('rolesForUser', () => {
    it('queries userRole join table and maps to RoleGrant structure', async () => {
      prismaMock.userRole.findMany.mockResolvedValue([
        {
          role: {
            id: 'role-admin',
            name: 'ADMIN',
            displayName: 'Admin Role',
            permissionPolicy: 'ALLOW_ALL',
            permissions: [],
          },
        },
        {
          role: {
            id: 'role-editor',
            name: 'EDITOR',
            displayName: 'Editor Role',
            permissionPolicy: 'DENY_ALL',
            permissions: [{ permission: 'DOC_EDIT' }],
          },
        },
      ]);

      const grants = await service.rolesForUser('user-123');

      expect(prismaMock.userRole.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        select: {
          role: {
            select: {
              id: true,
              name: true,
              displayName: true,
              permissionPolicy: true,
              permissions: { select: { permission: true } },
            },
          },
        },
      });

      expect(grants).toEqual([
        {
          id: 'role-admin',
          name: 'ADMIN',
          displayName: 'Admin Role',
          permissionPolicy: 'ALLOW_ALL',
          permissions: [],
        },
        {
          id: 'role-editor',
          name: 'EDITOR',
          displayName: 'Editor Role',
          permissionPolicy: 'DENY_ALL',
          permissions: [{ permission: 'DOC_EDIT' }],
        },
      ]);
    });

    it('returns empty array when user has no roles assigned', async () => {
      prismaMock.userRole.findMany.mockResolvedValue([]);
      const grants = await service.rolesForUser('user-new');
      expect(grants).toEqual([]);
    });
  });

  describe('replaceUserRoles', () => {
    it('executes deleteMany and createMany atomically inside $transaction', async () => {
      await service.replaceUserRoles('user-123', ['role-1', 'role-2']);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
      expect(prismaMock.userRole.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-123', roleId: 'role-1' },
          { userId: 'user-123', roleId: 'role-2' },
        ],
      });
    });

    it('clears all user roles without createMany when roleIds array is empty', async () => {
      await service.replaceUserRoles('user-123', []);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
      expect(prismaMock.userRole.createMany).not.toHaveBeenCalled();
    });

    it('writes through a passed transaction client when supplied', async () => {
      const txMock = {
        userRole: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
      };

      await service.replaceUserRoles('user-123', ['role-1'], txMock);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(txMock.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
      expect(txMock.userRole.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-123', roleId: 'role-1' }],
      });
    });
  });
});
