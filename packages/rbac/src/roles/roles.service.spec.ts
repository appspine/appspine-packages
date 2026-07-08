import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesService } from './roles.service';

vi.mock('@appspine/auth', () => ({
  SYSTEM_ADMIN_ROLE: 'SYSTEM_ADMIN',
}));

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
}));

const SYSTEM_ADMIN_ROLE = 'SYSTEM_ADMIN';
const PermissionPolicy = {
  DENY_ALL: 'DENY_ALL',
  ALLOW_ALL: 'ALLOW_ALL',
  READ_ALL: 'READ_ALL',
} as const;

describe('RolesService', () => {
  let service: RolesService;

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
    $transaction: vi.fn((promises) => Promise.all(promises)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RolesService(prismaMock as any);
  });

  describe('create', () => {
    it('should throw ConflictException if role name already exists', async () => {
      prismaMock.role.findUnique.mockResolvedValue({ id: '1', name: 'TEST_ROLE' });

      await expect(
        service.create({
          name: 'TEST_ROLE',
          displayName: 'Test Role',
          permissionPolicy: PermissionPolicy.DENY_ALL,
          permissions: [],
        }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.role.findUnique).toHaveBeenCalledWith({
        where: { name: 'TEST_ROLE' },
      });
    });

    it('should successfully create and map a new role', async () => {
      prismaMock.role.findUnique.mockResolvedValue(null);
      prismaMock.role.create.mockResolvedValue({
        id: '2',
        name: 'NEW_ROLE',
        displayName: 'New Role',
        isSystem: false,
        permissionPolicy: PermissionPolicy.DENY_ALL,
        permissions: [{ permission: 'POST_READ' }],
        _count: { userRoles: 0, apiKeys: 0 },
      });

      const result = await service.create({
        name: 'NEW_ROLE',
        displayName: 'New Role',
        permissionPolicy: PermissionPolicy.DENY_ALL,
        permissions: ['POST_READ'],
      });

      expect(result).toEqual({
        id: '2',
        name: 'NEW_ROLE',
        displayName: 'New Role',
        isSystem: false,
        permissionPolicy: PermissionPolicy.DENY_ALL,
        permissions: ['POST_READ'],
        userCount: 0,
        apiKeyCount: 0,
      });

      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: {
          name: 'NEW_ROLE',
          displayName: 'New Role',
          permissionPolicy: PermissionPolicy.DENY_ALL,
          isSystem: false,
          permissions: {
            create: [{ permission: 'POST_READ' }],
          },
        },
        include: {
          permissions: { select: { permission: true } },
          _count: { select: { userRoles: true, apiKeys: true } },
        },
      });
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if role is not found', async () => {
      prismaMock.role.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return mapped role if found', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '3',
        name: 'SOME_ROLE',
        displayName: 'Some Role',
        isSystem: true,
        permissionPolicy: PermissionPolicy.ALLOW_ALL,
        permissions: [],
        _count: { userRoles: 5, apiKeys: 2 },
      });

      const result = await service.findOne('3');
      expect(result).toEqual({
        id: '3',
        name: 'SOME_ROLE',
        displayName: 'Some Role',
        isSystem: true,
        permissionPolicy: PermissionPolicy.ALLOW_ALL,
        permissions: [],
        userCount: 5,
        apiKeyCount: 2,
      });
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if role to update is not found', async () => {
      prismaMock.role.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', { displayName: 'Updated' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when trying to update permissions of SYSTEM_ADMIN role', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'admin-id',
        name: SYSTEM_ADMIN_ROLE,
      });

      await expect(
        service.update('admin-id', { permissions: ['SOME_PERMISSION'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully update role display name without updating permissions', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '4',
        name: 'ROLE_4',
        displayName: 'Old Name',
      });
      // Mock findOne response
      prismaMock.role.findUnique
        .mockResolvedValueOnce({
          id: '4',
          name: 'ROLE_4',
          displayName: 'Old Name',
        })
        .mockResolvedValueOnce({
          id: '4',
          name: 'ROLE_4',
          displayName: 'New Name',
          isSystem: false,
          permissionPolicy: PermissionPolicy.DENY_ALL,
          permissions: [],
          _count: { userRoles: 0, apiKeys: 0 },
        });

      const result = await service.update('4', { displayName: 'New Name' });

      expect(prismaMock.role.update).toHaveBeenCalledWith({
        where: { id: '4' },
        data: { displayName: 'New Name' },
      });
      expect(result.displayName).toBe('New Name');
    });

    it('should successfully update role with permissions in transaction', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '5',
        name: 'ROLE_5',
        displayName: 'Role 5',
      });
      // Mock findOne response at the end of transaction
      prismaMock.role.findUnique
        .mockResolvedValueOnce({
          id: '5',
          name: 'ROLE_5',
          displayName: 'Role 5',
        })
        .mockResolvedValueOnce({
          id: '5',
          name: 'ROLE_5',
          displayName: 'Role 5',
          isSystem: false,
          permissionPolicy: PermissionPolicy.DENY_ALL,
          permissions: [{ permission: 'NEW_PERM' }],
          _count: { userRoles: 0, apiKeys: 0 },
        });

      const result = await service.update('5', {
        displayName: 'Role 5',
        permissions: ['NEW_PERM'],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result.permissions).toEqual(['NEW_PERM']);
    });
  });

  describe('replacePermissions', () => {
    it('should throw NotFoundException if role not found', async () => {
      prismaMock.role.findUnique.mockResolvedValue(null);

      await expect(service.replacePermissions('non-existent', { permissions: [] })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if role is SYSTEM_ADMIN', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'admin-id',
        name: SYSTEM_ADMIN_ROLE,
      });

      await expect(
        service.replacePermissions('admin-id', { permissions: ['PERM'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update permissions in transaction', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '6',
        name: 'ROLE_6',
      });
      // Mock findOne response
      prismaMock.role.findUnique
        .mockResolvedValueOnce({
          id: '6',
          name: 'ROLE_6',
        })
        .mockResolvedValueOnce({
          id: '6',
          name: 'ROLE_6',
          displayName: 'Role 6',
          isSystem: false,
          permissionPolicy: PermissionPolicy.DENY_ALL,
          permissions: [{ permission: 'PERM_1' }, { permission: 'PERM_2' }],
          _count: { userRoles: 1, apiKeys: 1 },
        });

      const result = await service.replacePermissions('6', {
        permissions: ['PERM_1', 'PERM_2'],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result.permissions).toEqual(['PERM_1', 'PERM_2']);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if role to delete not found', async () => {
      prismaMock.role.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if role is a system role', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '7',
        name: 'SYSTEM_ROLE',
        isSystem: true,
        _count: { userRoles: 0, apiKeys: 0 },
      });

      await expect(service.remove('7')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if role is assigned to users', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '8',
        name: 'USER_ROLE',
        isSystem: false,
        _count: { userRoles: 1, apiKeys: 0 },
      });

      await expect(service.remove('8')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if role is assigned to API keys', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '9',
        name: 'API_ROLE',
        isSystem: false,
        _count: { userRoles: 0, apiKeys: 1 },
      });

      await expect(service.remove('9')).rejects.toThrow(BadRequestException);
    });

    it('should delete role if it is not system role and not assigned to anything', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: '10',
        name: 'DELETE_ME',
        isSystem: false,
        _count: { userRoles: 0, apiKeys: 0 },
      });

      await service.remove('10');

      expect(prismaMock.role.delete).toHaveBeenCalledWith({
        where: { id: '10' },
      });
    });
  });
});
