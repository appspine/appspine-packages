/**
 * Fake capability implementations.
 *
 * Each fake satisfies the corresponding port in `@appspine/plugin-api` structurally and records
 * what it was asked to do, so a test can assert on the *contract* rather than on a mock's call
 * shape. Recording rather than asserting is deliberate: a plugin that writes an audit entry it
 * should not have is a bug these fakes can catch, and a bare `vi.fn()` cannot.
 */

import type {
  AuditRecordInput,
  AuditSinkPort,
  CreateIdentityInput,
  IdentityRecord,
  IdentityStorePort,
  IdentityWithRoles,
  Principal,
  PrincipalAuthorization,
  PrincipalContextPort,
  RbacPolicyPort,
  RoleGrant,
  ScopeMatcherPort,
} from '@appspine/plugin-api';

export interface FakeAuditSink extends AuditSinkPort {
  readonly records: AuditRecordInput[];
  failNext(error?: Error): void;
}

export function createFakeAuditSink(): FakeAuditSink {
  const records: AuditRecordInput[] = [];
  let pendingError: Error | null = null;

  return {
    records,
    failNext(error = new Error('audit sink unavailable')) {
      pendingError = error;
    },
    async record(input) {
      if (pendingError) {
        const error = pendingError;
        pendingError = null;
        throw error;
      }
      records.push(input);
      return { id: `audit-${records.length}` };
    },
  };
}

export interface FakeIdentityStore extends IdentityStorePort {
  readonly created: CreateIdentityInput[];
  seed(user: Partial<IdentityWithRoles> & { id: string; email: string }): IdentityWithRoles;
  clear(): void;
}

/**
 * In-memory identity store. Enforces the same uniqueness rule the real `User.email` column does,
 * because "two users with one email" is precisely the failure the OIDC JIT path has to survive.
 */
export function createFakeIdentityStore(): FakeIdentityStore {
  const users = new Map<string, IdentityWithRoles>();
  const created: CreateIdentityInput[] = [];

  const strip = (user: IdentityWithRoles): IdentityRecord => {
    const { roles: _roles, ...rest } = user;
    return rest;
  };

  const findByEmail = (email: string): IdentityWithRoles | undefined =>
    [...users.values()].find((user) => user.email === email);

  return {
    created,
    seed(user) {
      const record: IdentityWithRoles = {
        name: null,
        isActive: true,
        isServiceAccount: false,
        roles: [],
        ...user,
      };
      users.set(record.id, record);
      return record;
    },
    clear() {
      users.clear();
      created.length = 0;
    },
    async findById(id) {
      const user = users.get(id);
      return user ? strip(user) : null;
    },
    async findByEmail(email) {
      const user = findByEmail(email);
      return user ? strip(user) : null;
    },
    async findWithRolesById(id) {
      return users.get(id) ?? null;
    },
    async findWithRolesByEmail(email) {
      return findByEmail(email) ?? null;
    },
    async create(input) {
      created.push(input);
      if (findByEmail(input.email)) {
        throw new Error(`Email already registered: ${input.email}`);
      }
      const record: IdentityWithRoles = {
        id: `user-${users.size + 1}`,
        email: input.email,
        name: input.name ?? null,
        isActive: true,
        isServiceAccount: input.isServiceAccount ?? false,
        roles: [],
      };
      users.set(record.id, record);
      return strip(record);
    },
  };
}

const POLICY_ORDER: Record<string, number> = { ALLOW_ALL: 2, READ_ALL: 1, DENY_ALL: 0 };

/**
 * Mirrors the real RBAC flattening (most permissive policy wins, permissions are the deduped
 * union) so a plugin test does not have to install `@appspine/rbac` to exercise a principal.
 */
export interface FakeRbacPolicy extends RbacPolicyPort {
  /** Role IDs handed out to a user created without an explicit list. */
  defaults: string[];
  /** userId -> assigned role IDs, so a test can assert what identity delegated here. */
  readonly assignments: Map<string, string[]>;
}

export function createFakeRbacPolicy(defaults: string[] = ['role-user']): FakeRbacPolicy {
  const assignments = new Map<string, string[]>();
  return {
    defaults,
    assignments,
    async rolesForUser() {
      return [];
    },
    async defaultRoleIds() {
      return [...this.defaults];
    },
    async replaceUserRoles(userId: string, roleIds: string[]) {
      assignments.set(userId, [...roleIds]);
    },
    flatten(roles: RoleGrant[]): PrincipalAuthorization {
      return {
        roleNames: roles.map((role) => role.name),
        permissionPolicy: roles.reduce(
          (best, role) =>
            (POLICY_ORDER[role.permissionPolicy] ?? -1) > (POLICY_ORDER[best] ?? -1)
              ? role.permissionPolicy
              : best,
          'DENY_ALL',
        ),
        permissions: [
          ...new Set(roles.flatMap((role) => role.permissions.map((entry) => entry.permission))),
        ],
      };
    },
  };
}

export function createFakeScopeMatcher(): ScopeMatcherPort {
  return {
    matches: (scopes, required) => scopes.includes(required) || scopes.includes('*'),
  };
}

export interface FakePrincipalContext extends PrincipalContextPort {
  set(principal: Principal | null): void;
}

export function createFakePrincipalContext(initial: Principal | null = null): FakePrincipalContext {
  let principal = initial;
  return {
    set(next) {
      principal = next;
    },
    current: () => principal,
    require: () => {
      if (!principal) throw new Error('No principal on this request');
      return principal;
    },
  };
}

/** Escape hatch for a capability the testkit does not model yet. */
export function createFakeCapability<T extends object>(implementation: T): T {
  return implementation;
}
