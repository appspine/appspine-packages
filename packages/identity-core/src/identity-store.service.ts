import { PrismaService } from '@appspine/common';
import type {
  CreateIdentityInput,
  IdentityRecord,
  IdentityStorePort,
  IdentityWithRoles,
} from '@appspine/plugin-api';
import { RBAC_POLICY, type RbacPolicyPort } from '@appspine/plugin-api';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { UsersService } from './users/users.service';

const IDENTITY_FIELDS = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  isServiceAccount: true,
} as const;

/**
 * `appspine.identity-store` — the only sanctioned way another plugin reads or creates a user.
 *
 * Before the split, `oidc-auth`'s JIT path called `UsersService` directly and `m2m-api-key` ran its
 * own `prisma.user.findUnique` (PL0-04 section 1). Both now go through this port, so identity
 * ownership is enforced by the dependency graph rather than by convention.
 *
 * `findWithRoles*` returns role rows verbatim. `identity-core` deliberately does not interpret
 * them — flattening roles into an effective policy is `appspine.rbac-policy`'s job.
 *
 * `rbacPolicy` below can never actually resolve to a real instance: `rbac`'s manifest requires
 * `appspine.identity-store` (this package), so declaring the reverse edge in this package's own
 * manifest would be a genuine dependency cycle, not a wiring gap to close. `findWithRoles*` will
 * therefore always return `roles: []` here — callers that need real roles (see
 * `@appspine/oidc-auth`'s `JwtVerifierService`) inject `RBAC_POLICY` themselves instead of relying
 * on this method to have populated them.
 */
@Injectable()
export class IdentityStoreService implements IdentityStorePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Optional() @Inject(RBAC_POLICY) private readonly rbacPolicy?: RbacPolicyPort,
  ) {}

  findById(id: string): Promise<IdentityRecord | null> {
    return this.prisma.user.findUnique({ where: { id }, select: IDENTITY_FIELDS });
  }

  findByEmail(email: string): Promise<IdentityRecord | null> {
    return this.prisma.user.findUnique({ where: { email }, select: IDENTITY_FIELDS });
  }

  async findWithRolesById(id: string): Promise<IdentityWithRoles | null> {
    const user = await this.findById(id);
    return user ? this.withRoles(user) : null;
  }

  async findWithRolesByEmail(email: string): Promise<IdentityWithRoles | null> {
    const user = await this.findByEmail(email);
    return user ? this.withRoles(user) : null;
  }

  /**
   * Delegates to `UsersService` rather than writing directly: default-role resolution, the
   * duplicate-email race and the P2002 normalisation all live there, and a second write path
   * would be a second place for those rules to drift.
   */
  async create(input: CreateIdentityInput, transaction?: unknown): Promise<IdentityRecord> {
    const created = await this.users.create(
      {
        email: input.email,
        name: input.name ?? undefined,
        isServiceAccount: input.isServiceAccount,
        roleIds: input.roleIds,
      },
      transaction as PrismaService | undefined,
    );

    return {
      id: created.id,
      email: created.email,
      name: created.name,
      isActive: created.isActive,
      isServiceAccount: created.isServiceAccount,
    };
  }

  private async withRoles(identity: IdentityRecord): Promise<IdentityWithRoles> {
    return {
      ...identity,
      roles: this.rbacPolicy ? await this.rbacPolicy.rolesForUser(identity.id) : [],
    };
  }
}
