import {
  type PaginationQuery,
  PermissionPolicy,
  PrismaService,
  paginate,
  toPrismaOrderBy,
  toPrismaPage,
  toPrismaSortDirection,
} from '@appspine/common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SYSTEM_ADMIN_ROLE } from '../constants';
import { CreateRoleDto, ReplacePermissionsDto, UpdateRoleDto } from './dto/role.dto';

// Non-relation fields go through the shared toPrismaOrderBy() helper; userCount/apiKeyCount
// sort by relation _count, which toPrismaOrderBy can't express, so they're handled separately below.
const SORTABLE_FIELDS = ['displayName'] as const;
const SORTABLE_COUNT_FIELDS = ['userCount', 'apiKeyCount'] as const;
type PrismaRoleOrderBy = Record<string, 'asc' | 'desc' | { _count: 'asc' | 'desc' }>;
/** `name` is @unique, so appending it as a secondary key gives every ordering a stable, deterministic tiebreaker across pages. */
const TIEBREAKER: PrismaRoleOrderBy = { name: 'asc' };
const DEFAULT_ORDER_BY: PrismaRoleOrderBy[] = [{ isSystem: 'desc' }, TIEBREAKER];

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

  /** Every branch returns an array with `TIEBREAKER` appended last, so ties on the primary key
   *  (e.g. two roles sharing a displayName) still resolve to a stable order across pages. */
  private resolveOrderBy(query: PaginationQuery): PrismaRoleOrderBy[] {
    if (query.sortField && (SORTABLE_COUNT_FIELDS as readonly string[]).includes(query.sortField)) {
      const direction = toPrismaSortDirection(query.sortOrder);
      const primary: PrismaRoleOrderBy =
        query.sortField === 'userCount'
          ? { userRoles: { _count: direction } }
          : { apiKeys: { _count: direction } };
      return [primary, TIEBREAKER];
    }
    if (query.sortField && (SORTABLE_FIELDS as readonly string[]).includes(query.sortField)) {
      return [toPrismaOrderBy(query, SORTABLE_FIELDS), TIEBREAKER];
    }
    return DEFAULT_ORDER_BY;
  }

  async findAll(query: PaginationQuery) {
    const { skip, take } = toPrismaPage(query);
    const orderBy = this.resolveOrderBy(query);
    const where = query.search
      ? {
          OR: [
            { displayName: { contains: query.search, mode: 'insensitive' as const } },
            { name: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          permissions: { select: { permission: true } },
          _count: { select: { userRoles: true, apiKeys: true } },
        },
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginate(
      roles.map((r: RoleWithRelations) => this.mapRole(r)),
      total,
    );
  }

  /** Unpaginated — for role pickers (create-user/create-api-key dialogs) that need every role, not a page of them. */
  async findOptions() {
    return this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, displayName: true, isSystem: true },
    });
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

  // Shared by update() and replacePermissions() so a fix to the guard (which permissions
  // editing means for ADMIN) or the delete+recreate statements only needs to happen once —
  // these two methods used to duplicate both wholesale.
  private assertPermissionsEditable(role: { name: string }): void {
    if (role.name === SYSTEM_ADMIN_ROLE) {
      throw new BadRequestException(
        'ADMIN permissions are managed via guard bypass and cannot be set here',
      );
    }
  }

  private buildReplacePermissionsStatements(id: string, permissions: string[]) {
    return [
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: id, permission: p })),
      }),
    ] as const;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    if (dto.permissions !== undefined) {
      this.assertPermissionsEditable(role);
      // Atomic update: metadata + permission replacement in one transaction.
      await this.prisma.$transaction([
        this.prisma.role.update({
          where: { id },
          data: {
            ...(dto.displayName !== undefined && { displayName: dto.displayName }),
            ...(dto.permissionPolicy !== undefined && { permissionPolicy: dto.permissionPolicy }),
          },
        }),
        ...this.buildReplacePermissionsStatements(id, dto.permissions),
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
    this.assertPermissionsEditable(role);

    await this.prisma.$transaction(this.buildReplacePermissionsStatements(id, dto.permissions));
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
