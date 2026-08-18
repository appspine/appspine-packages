/**
 * The neutral request-identity contract behind `appspine.principal-context`.
 *
 * PL0-04 assigns ownership of these types to the host, because they are the one place that has
 * to understand both an interactive login and a machine identity at once. They live in
 * `@appspine/plugin-api` rather than in `@appspine/plugin-host-nest` so that a plugin can type
 * against them without taking a dependency on NestJS; the host owns the *capability* (it
 * populates and exposes the context), this package owns the *shape*.
 *
 * The shapes are deliberately structurally identical to the legacy `JwtPayload` / `ApiKeyUser`
 * that `@appspine/auth` exported, so migrating a consumer is a rename and never a behaviour
 * change. `isApiKey` stays the discriminant, exactly as the runtime objects already set it.
 */

/**
 * The two role names the platform itself reacts to.
 *
 * They lived in three places at once after the 051 split — `identity-core/constants`,
 * `rbac/constants`, and a bare `'ADMIN'` literal inside `m2m-api-key`'s guard — so an
 * authorization decision had three independent copies and nothing to compare them against
 * (Gate G1 review S9). They belong here because `plugin-api` is the one package all three already
 * depend on, and because a role name is part of the principal contract, not of any one plugin.
 *
 * Seeding these roles is still RBAC's job; naming them is not.
 */
export const SYSTEM_ADMIN_ROLE = 'ADMIN';
export const SYSTEM_USER_ROLE = 'USER';

/** Effective authorization after RBAC flattening. Legacy name: `UserContext`. */
export interface PrincipalAuthorization {
  roleNames: string[];
  permissionPolicy: string;
  permissions: string[];
}

/** A human who logged in through an interactive auth provider. Legacy name: `JwtPayload`. */
export interface InteractivePrincipal extends PrincipalAuthorization {
  sub: string;
  email: string;
  name: string | null;
  /** Primary role for display; `roleNames` is the authoritative list. */
  roleName: string;
}

/** A machine identity resolved from a credential. Legacy name: `ApiKeyUser`. */
export interface MachinePrincipal extends PrincipalAuthorization {
  sub: string;
  scopes: string[];
  isApiKey: true;
  /** The user this credential acts as; `null` means no bound identity. */
  actingUserId: string | null;
}

export type Principal = InteractivePrincipal | MachinePrincipal;

export function isMachinePrincipal(principal: Principal): principal is MachinePrincipal {
  return 'isApiKey' in principal && principal.isApiKey === true;
}

export function isInteractivePrincipal(principal: Principal): principal is InteractivePrincipal {
  return !isMachinePrincipal(principal);
}

/**
 * Effective acting user for an identity-bound write: an interactive caller acts as itself, a
 * machine caller acts as its bound user. Returns `null` — never a fallback identity — when a
 * machine credential has no bound user, so callers fail closed (the Nest host turns that `null`
 * into a `ForbiddenException`; see `resolveActingUserId` in `@appspine/plugin-host-nest`).
 */
export function actingUserIdOf(principal: Principal): string | null {
  return isMachinePrincipal(principal) ? principal.actingUserId : principal.sub;
}
