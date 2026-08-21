import {
  type PaginationQuery,
  Prisma,
  PrismaService,
  paginate,
  toPrismaOrderBy,
  toPrismaPage,
} from '@appspine/common';
import { RBAC_POLICY, type RbacPolicyPort, type RoleGrant } from '@appspine/plugin-api';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { UpdateUserDto } from './dto/user.dto';

const SORTABLE = ['name', 'email', 'createdAt'] as const;

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  isServiceAccount: true,
  createdAt: true,
} as const;

type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  isServiceAccount: boolean;
  createdAt: Date;
};

function publicRole(role: RoleGrant) {
  return {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    permissionPolicy: role.permissionPolicy,
  };
}

/**
 * Users CRUD, owned by `identity-core` (PL0-04 section 2).
 *
 * What changed in the split, and why:
 *
 * - `resolveDefaultRoleId()` used to run `prisma.role.findUnique(...)` — identity querying RBAC's
 *   own table. Default-role policy is RBAC's decision, so it now comes through the
 *   `appspine.rbac-policy` capability. Behaviour is unchanged for an App that has RBAC installed:
 *   a create with no `roleIds` still lands on the same default role.
 * - Role reads and writes both go through the same capability, because `UserRole` and its relation
 *   shape belong to RBAC. This also lets identity-core operate against a schema with no RBAC
 *   augmentation at all.
 *
 * `RBAC_POLICY` is optional so an App can run identity without RBAC at all; the two paths that
 * genuinely need role administration say so instead of silently doing nothing.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(RBAC_POLICY) private readonly rbacPolicy?: RbacPolicyPort,
  ) {}

  private requireRbac(operation: string): RbacPolicyPort {
    if (!this.rbacPolicy) {
      throw new ServiceUnavailableException(
        `${operation} needs the appspine.rbac-policy capability, which no installed plugin provides.`,
      );
    }
    return this.rbacPolicy;
  }

  private async withRoles(user: PublicUser) {
    const roles = this.rbacPolicy ? await this.rbacPolicy.rolesForUser(user.id) : [];
    return { ...user, roles: roles.map(publicRole) };
  }

  /**
   * `transaction` lets a caller make this write part of a larger atomic unit — `oidc-auth`
   * provisions an account and records the external identity that caused it together, so a failed
   * mapping cannot leave an orphan account behind (Gate G1 review S6). When it is supplied this
   * method must not open a transaction of its own: Prisma's interactive transaction client has no
   * `$transaction` to nest.
   */
  async create(
    data: {
      email: string;
      name?: string;
      isServiceAccount?: boolean;
      roleIds?: string[];
    },
    transaction?: PrismaService,
  ) {
    const client = transaction ?? this.prisma;
    const existing = await client.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email already registered');

    const roleIds =
      data.roleIds && data.roleIds.length > 0
        ? data.roleIds
        : await (this.rbacPolicy?.defaultRoleIds() ?? Promise.resolve([]));

    const { email, name, isServiceAccount } = data;
    try {
      const createUser = (client: PrismaService) =>
        client.user.create({ data: { email, name, isServiceAccount }, select: PUBLIC_FIELDS });

      let user: PublicUser;
      if (roleIds.length > 0) {
        const rbac = this.requireRbac('Assigning default roles');
        const withRoleAssignment = async (client: PrismaService) => {
          const created = await createUser(client);
          await rbac.replaceUserRoles(created.id, roleIds, client);
          return created;
        };
        user = transaction
          ? await withRoleAssignment(transaction)
          : await this.prisma.$transaction(withRoleAssignment);
      } else {
        user = await createUser(client);
      }
      // Inside a caller's transaction the role rows are not visible to a separate connection yet,
      // so `roles` comes back empty. Callers that pass a transaction (JIT provisioning) use only
      // the id; anyone who needs the roles should read the user again after the commit.
      return transaction ? { ...user, roles: [] } : this.withRoles(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error as { code?: string }).code === 'P2002'
      ) {
        // Two concurrent callers (e.g. JIT provisioning racing on the same OIDC
        // identity's first login) both pass the findUnique pre-check above and reach
        // this create() — the loser hits the DB's unique constraint on email instead of
        // the pre-check. Normalize both paths to the same exception so callers only need
        // to handle one case.
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
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

    return paginate(await Promise.all(data.map((user: PublicUser) => this.withRoles(user))), total);
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!user) throw new NotFoundException('User not found');
    return this.withRoles(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_FIELDS });
    return this.withRoles(user);
  }

  async updateRoles(id: string, roleIds: string[]) {
    await this.findById(id);
    await this.requireRbac('Assigning roles').replaceUserRoles(id, roleIds);
    return this.findById(id);
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
