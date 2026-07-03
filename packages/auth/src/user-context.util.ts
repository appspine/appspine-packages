/// Shape of a role with its permission policy and granted permissions,
/// as loaded from Prisma (User.userRoles[].role or ApiKey.role).
export interface RoleWithPermissions {
  name: string;
  permissionPolicy: string;
  permissions: { permission: string }[];
}

/// Flattened user context derived from one or more roles.
export interface UserContext {
  roleNames: string[];
  permissionPolicy: string;
  permissions: string[];
}

/// Authenticated user context injected onto `request.user` by an API key.
/// Mirrors the JWT payload shape so downstream guards treat both uniformly.
export interface ApiKeyUser extends UserContext {
  sub: string;
  scopes: string[];
  isApiKey: true;
  actingUserId: string | null; // User this key acts as; null = no bound identity.
}

const POLICY_ORDER: Record<string, number> = { ALLOW_ALL: 2, READ_ALL: 1, DENY_ALL: 0 };

/// Flatten a set of roles into a single effective user context:
/// - roleNames: each role's machine name
/// - permissionPolicy: the most permissive policy across all roles
/// - permissions: the deduped union of every role's explicit permissions
export function buildUserContext(roles: RoleWithPermissions[]): UserContext {
  const roleNames = roles.map((r) => r.name);

  const permissionPolicy = roles.reduce(
    (best, r) =>
      POLICY_ORDER[r.permissionPolicy] > POLICY_ORDER[best] ? r.permissionPolicy : best,
    'DENY_ALL',
  );

  const permissions = [...new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission)))];

  return { roleNames, permissionPolicy, permissions };
}
