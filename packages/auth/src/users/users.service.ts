import {
  type PaginationQuery,
  Prisma,
  PrismaService,
  paginate,
  toPrismaOrderBy,
  toPrismaPage,
} from '@appspine/common';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SYSTEM_USER_ROLE } from '../constants';
import type { UpdateUserDto } from './dto/user.dto';

const SORTABLE = ['name', 'email', 'createdAt'] as const;

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  userRoles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          displayName: true,
          permissionPolicy: true,
        },
      },
    },
  },
  isActive: true,
  isServiceAccount: true,
  createdAt: true,
} as const;

type UserWithRoles = {
  id: string;
  email: string;
  name: string | null;
  userRoles: {
    role: { id: string; name: string; displayName: string; permissionPolicy: string };
  }[];
  isActive: boolean;
  isServiceAccount: boolean;
  createdAt: Date;
};

function mapUser(u: UserWithRoles) {
  const { userRoles, ...rest } = u;
  return { ...rest, roles: userRoles.map((ur) => ur.role) };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveDefaultRoleId(): Promise<string> {
    const userRole = await this.prisma.role.findUnique({ where: { name: SYSTEM_USER_ROLE } });
    if (!userRole)
      throw new Error(`${SYSTEM_USER_ROLE} system role not found — run the seed first`);
    return userRole.id;
  }

  async create(data: {
    email: string;
    password: string;
    name?: string;
    isServiceAccount?: boolean;
    roleIds?: string[];
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email already registered');

    const roleIds =
      data.roleIds && data.roleIds.length > 0 ? data.roleIds : [await this.resolveDefaultRoleId()];

    const { email, password, name, isServiceAccount } = data;
    const user = await this.prisma.user.create({
      data: {
        email,
        password,
        name,
        isServiceAccount,
        userRoles: {
          create: roleIds.map((roleId) => ({ roleId })),
        },
      },
      select: PUBLIC_FIELDS,
    });
    return mapUser(user);
  }

  /** Includes role + permissions — needed to sign the JWT at login. */
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });
  }

  async findAll(query: PaginationQuery) {
    const { skip, take } = toPrismaPage(query);
    const orderBy = toPrismaOrderBy(query, SORTABLE, { createdAt: 'asc' });
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take, orderBy, select: PUBLIC_FIELDS }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data.map(mapUser), total);
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!user) throw new NotFoundException('User not found');
    return mapUser(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_FIELDS });
    return mapUser(user);
  }

  async updateRoles(id: string, roleIds: string[]) {
    await this.findById(id);
    const user = await this.prisma.$transaction(async (tx: typeof this.prisma) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
      });
      const updated = await tx.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
      if (!updated) throw new NotFoundException('User not found');
      return updated;
    });
    return mapUser(user);
  }

  async remove(id: string) {
    await this.findById(id);

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error as { code?: string }).code === 'P2003'
      ) {
        throw new ConflictException(
          'This user still has records referencing them elsewhere in the system and cannot be permanently deleted. Deactivate the account instead.',
        );
      }
      throw error;
    }
  }
}
