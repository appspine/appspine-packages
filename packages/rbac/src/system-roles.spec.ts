import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_ADMIN_ROLE, SYSTEM_USER_ROLE } from './constants';
import { PermissionGuard } from './guards/permission.guard';
import { RbacPolicyService } from './rbac-policy.service';
import { RolesService } from './roles/roles.service';

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

describe('system roles', () => {
  let rolesService: RolesService;
  let rbacPolicyService: RbacPolicyService;

  const prismaMock = {
    role: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (arg) => {
      if (typeof arg === 'function') {
        return arg(prismaMock);
      }
      return Promise.all(arg);
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    rolesService = new RolesService(
      prismaMock as unknown as ConstructorParameters<typeof RolesService>[0],
    );
    rbacPolicyService = new RbacPolicyService(
      prismaMock as unknown as ConstructorParameters<typeof RbacPolicyService>[0],
    );
  });

  describe('system role definitions', () => {
    it('defines standard system role names', () => {
      expect(SYSTEM_ADMIN_ROLE).toBe('ADMIN');
      expect(SYSTEM_USER_ROLE).toBe('USER');
    });
  });

  describe('ADMIN role immutability and protections', () => {
    it('blocks modifying permissions of the ADMIN system role in update()', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'admin-1',
        name: SYSTEM_ADMIN_ROLE,
        displayName: 'Administrator',
        isSystem: true,
        permissionPolicy: 'ALLOW_ALL',
        permissions: [],
        _count: { userRoles: 1, apiKeys: 0 },
      });

      await expect(
        rolesService.update('admin-1', {
          permissions: ['SOME_PERMISSION'],
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        rolesService.update('admin-1', {
          permissions: ['SOME_PERMISSION'],
        }),
      ).rejects.toThrow(/ADMIN permissions are managed via guard bypass/);
    });

    it('blocks replacing permissions of the ADMIN system role in replacePermissions()', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'admin-1',
        name: SYSTEM_ADMIN_ROLE,
        displayName: 'Administrator',
        isSystem: true,
        permissionPolicy: 'ALLOW_ALL',
        permissions: [],
        _count: { userRoles: 1, apiKeys: 0 },
      });

      await expect(
        rolesService.replacePermissions('admin-1', {
          permissions: ['SOME_PERMISSION'],
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        rolesService.replacePermissions('admin-1', {
          permissions: ['SOME_PERMISSION'],
        }),
      ).rejects.toThrow(/ADMIN permissions are managed via guard bypass/);
    });

    it('blocks deleting the ADMIN system role', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'admin-1',
        name: SYSTEM_ADMIN_ROLE,
        isSystem: true,
        _count: { userRoles: 1, apiKeys: 0 },
      });

      await expect(rolesService.remove('admin-1')).rejects.toThrow(BadRequestException);
      await expect(rolesService.remove('admin-1')).rejects.toThrow(
        /System roles cannot be deleted/,
      );
    });

    it('blocks deleting the USER system role', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'user-1',
        name: SYSTEM_USER_ROLE,
        isSystem: true,
        _count: { userRoles: 5, apiKeys: 0 },
      });

      await expect(rolesService.remove('user-1')).rejects.toThrow(BadRequestException);
      await expect(rolesService.remove('user-1')).rejects.toThrow(/System roles cannot be deleted/);
    });
  });

  describe('USER default role resolution', () => {
    it('resolves the default role ID when USER role is seeded', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'user-role-id',
        name: SYSTEM_USER_ROLE,
      });

      const result = await rbacPolicyService.defaultRoleIds();
      expect(result).toEqual(['user-role-id']);
      expect(prismaMock.role.findUnique).toHaveBeenCalledWith({
        where: { name: SYSTEM_USER_ROLE },
      });
    });

    it('throws NotFoundException when USER system role is missing (half-seeded DB)', async () => {
      prismaMock.role.findUnique.mockResolvedValue(null);

      await expect(rbacPolicyService.defaultRoleIds()).rejects.toThrow(NotFoundException);
      await expect(rbacPolicyService.defaultRoleIds()).rejects.toThrow(
        /USER system role not found — run the seed first/,
      );
    });
  });

  describe('ADMIN bypass in PermissionGuard', () => {
    it('bypasses any permission requirement if user has SYSTEM_ADMIN_ROLE', () => {
      const guard = new PermissionGuard();
      const mockExecutionContext = {
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              roleNames: [SYSTEM_ADMIN_ROLE],
              permissionPolicy: 'DENY_ALL',
              permissions: [],
            },
          }),
        }),
      } as unknown as import('@nestjs/common').ExecutionContext;

      Reflect.defineMetadata(
        'permissions',
        ['CRITICAL_SYSTEM_DELETE', 'RESTRICTED_OPERATION'],
        mockExecutionContext.getHandler(),
      );

      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });
  });
});
