import type { PrincipalAuthorization, RoleGrant } from '@appspine/plugin-api';

/**
 * Role flattening — moved here from `@appspine/auth` by 051 PL0-04 §2.
 *
 * It sat in the auth package only because that is where the OIDC login path needed it, but both
 * its input and its output are RBAC shapes: this is the algorithm that turns role rows into an
 * effective policy. `oidc-auth` and `m2m-api-key` now reach it through the `appspine.rbac-policy`
 * capability instead of importing the function (see `RbacPolicyService`).
 *
 * The two type aliases point at `@appspine/plugin-api`'s contract types rather than redeclaring
 * the same fields. Structural identity is not a nicety here — the host builds principals from this
 * output, and a drifted copy would typecheck right up until a field went missing at runtime.
 *
 * `ApiKeyUser` deliberately no longer lives here: PL0-04 assigns it to the host as
 * `MachinePrincipal` (`@appspine/plugin-host-nest`), because it describes a request identity, not
 * an RBAC concept.
 */

/** Shape of a role with its permission policy and granted permissions, as loaded from Prisma. */
export type RoleWithPermissions = RoleGrant;

/** Flattened user context derived from one or more roles. */
export type UserContext = PrincipalAuthorization;

const POLICY_ORDER: Record<string, number> = { ALLOW_ALL: 2, READ_ALL: 1, DENY_ALL: 0 };

/**
 * Flatten a set of roles into a single effective user context:
 * - roleNames: each role's machine name
 * - permissionPolicy: the most permissive policy across all roles
 * - permissions: the deduped union of every role's explicit permissions
 */
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
