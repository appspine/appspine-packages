import { SYSTEM_ADMIN_ROLE } from '@appspine/auth';
import { PermissionPolicy, PrismaService } from '@appspine/common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRoleDto, ReplacePermissionsDto, UpdateRoleDto } from './dto/role.dto';

type RoleWithRelations = {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  permissionPolicy: PermissionPolicy;
  permissions: { permission: string }[];
  _count: { userRoles: number; apiKeys: number };
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRole(role: RoleWithRelations) {
    return {
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      isSystem: role.isSystem,
      permissionPolicy: role.permissionPolicy,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count.userRoles,
      apiKeyCount: role._count.apiKeys,
    };
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { userRoles: true, apiKeys: true } },
      },
    });
    return roles.map((r: RoleWithRelations) => this.mapRole(r));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { userRoles: true, apiKeys: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return this.mapRole(role);
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Role "${dto.name}" already exists`);

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        permissionPolicy: dto.permissionPolicy,
        isSystem: false,
        permissions: {
          create: dto.permissions.map((p) => ({ permission: p })),
        },
      },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { userRoles: true, apiKeys: true } },
      },
    });
    return this.mapRole(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    if (dto.permissions !== undefined && role.name === SYSTEM_ADMIN_ROLE) {
      throw new BadRequestException(
        'ADMIN permissions are managed via guard bypass and cannot be set here',
      );
    }

    if (dto.permissions !== undefined) {
      // Atomic update: metadata + permission replacement in one transaction
      await this.prisma.$transaction([
        this.prisma.role.update({
          where: { id },
          data: {
            ...(dto.displayName !== undefined && { displayName: dto.displayName }),
            ...(dto.permissionPolicy !== undefined && { permissionPolicy: dto.permissionPolicy }),
          },
        }),
        this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        this.prisma.rolePermission.createMany({
          data: dto.permissions.map((p) => ({ roleId: id, permission: p })),
        }),
      ]);
      return this.findOne(id);
    }

    await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.permissionPolicy !== undefined && { permissionPolicy: dto.permissionPolicy }),
      },
    });
    return this.findOne(id);
  }

  async replacePermissions(id: string, dto: ReplacePermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.name === SYSTEM_ADMIN_ROLE) {
      throw new BadRequestException(
        'ADMIN permissions are managed via guard bypass and cannot be set here',
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: dto.permissions.map((p) => ({ roleId: id, permission: p })),
      }),
    ]);
    return this.findOne(id);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { userRoles: true, apiKeys: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role._count.userRoles > 0 || role._count.apiKeys > 0) {
      throw new BadRequestException('Cannot delete a role that is assigned to users or API keys');
    }
    await this.prisma.role.delete({ where: { id } });
  }
}
