/**
 * Host-owned request identity (PL1-11, PL0-04 section 2).
 *
 * PL0-04 moved `CurrentUser` / `JwtPayload` / `CurrentUserPayload` here from `@appspine/auth`,
 * because they are the one place that has to understand both an interactive login and a machine
 * credential — a fact that made every capability package import the auth package just for a type.
 * The shapes live in `@appspine/plugin-api` (no NestJS there); this file adds the Nest-specific
 * decorator and the fail-closed helper, and re-exports the aliases the legacy API used so a
 * migrating consumer can change the import path without touching a single type annotation.
 */

import type { InteractivePrincipal, MachinePrincipal, Principal } from '@appspine/plugin-api';
import { actingUserIdOf, isMachinePrincipal } from '@appspine/plugin-api';
import { createParamDecorator, type ExecutionContext, ForbiddenException } from '@nestjs/common';

export type {
  InteractivePrincipal,
  MachinePrincipal,
  Principal,
  PrincipalAuthorization,
} from '@appspine/plugin-api';
export { actingUserIdOf, isInteractivePrincipal, isMachinePrincipal } from '@appspine/plugin-api';

/** Legacy alias kept for `@appspine/auth` consumers. Same shape, host-owned. */
export type JwtPayload = InteractivePrincipal;
export type JwtUser = InteractivePrincipal;
export type ApiKeyUser = MachinePrincipal;
export type CurrentUserPayload = Principal;

/**
 * Reads the principal an authentication strategy put on the request.
 *
 * Identical behaviour to the decorator `@appspine/auth` exported: it returns `request.user`
 * verbatim. Strategies keep writing `request.user` precisely so that migrating a controller to
 * this decorator cannot change what it observes.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: CurrentUserPayload }>();
    return request.user;
  },
);

/**
 * Effective acting user for an identity-bound write. An interactive caller acts as itself; a
 * machine caller acts as its bound user, and one with no bound user is refused rather than
 * silently attributed to the credential itself.
 */
export function resolveActingUserId(principal: Principal): string {
  const actingUserId = actingUserIdOf(principal);
  if (actingUserId === null) {
    throw new ForbiddenException(
      'This API key has no acting user bound; cannot perform this write.',
    );
  }
  return actingUserId;
}

/** True when the principal holds the system admin role. */
export function hasRole(principal: Principal | undefined, roleName: string): boolean {
  return principal?.roleNames?.includes(roleName) ?? false;
}

export function isApiKeyPrincipal(principal: Principal): principal is MachinePrincipal {
  return isMachinePrincipal(principal);
}
