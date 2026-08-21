import { PrismaService } from '@appspine/common';
import type { PrincipalAuthorization, RbacPolicyPort, RoleGrant } from '@appspine/plugin-api';
import { Injectable, NotFoundException } from '@nestjs/common';
import { SYSTEM_USER_ROLE } from './constants';
import { buildUserContext } from './user-context.util';

/**
 * `appspine.rbac-policy` — the capability other plugins reach RBAC through (PL0-04 section 2).
 *
 * Three things used to live outside this package and had no business being there: role flattening
 * (in `@appspine/auth`'s `user-context.util`), default-role lookup (a `prisma.role.findUnique` run
 * by identity's `UsersService`), and role assignment (a transaction on `UserRole` run by the same
 * service). All three are RBAC decisions about RBAC tables, so they are implemented here and
 * consumed through the token — `identity-core` and `oidc-auth` no longer import any of it.
 */
@Injectable()
export class RbacPolicyService implements RbacPolicyPort {
  constructor(private readonly prisma: PrismaService) {}

  /** Identical algorithm to the pre-split `buildUserContext()`; see that function for the rules. */
  flatten(roles: RoleGrant[]): PrincipalAuthorization {
    return buildUserContext(roles);
  }

  async rolesForUser(userId: string): Promise<RoleGrant[]> {
    const assignments = await this.prisma.userRole.findMany({
      where: { userId },
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
    return assignments.map(({ role }: { role: RoleGrant }) => role);
  }

  /**
   * The role a user gets when the caller names none. Throws the same seed-missing error the
   * pre-split `UsersService.resolveDefaultRoleId()` did, so a half-seeded database still fails
   * loudly rather than creating role-less users.
   */
  async defaultRoleIds(): Promise<string[]> {
    const userRole = await this.prisma.role.findUnique({ where: { name: SYSTEM_USER_ROLE } });
    if (!userRole) {
      throw new NotFoundException(`${SYSTEM_USER_ROLE} system role not found — run the seed first`);
    }
    return [userRole.id];
  }

  /**
   * Replaces a user's assignments in one transaction — same delete-then-createMany the pre-split
   * `UsersService.updateRoles()` ran, so a failure part-way cannot leave a user with no roles.
   */
  async replaceUserRoles(userId: string, roleIds: string[], transaction?: unknown): Promise<void> {
    const replace = async (tx: typeof this.prisma) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
      }
    };

    if (transaction) {
      await replace(transaction as typeof this.prisma);
      return;
    }
    await this.prisma.$transaction(replace);
  }
}
