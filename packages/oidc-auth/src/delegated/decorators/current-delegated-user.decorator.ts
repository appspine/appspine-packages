import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { DelegationContext } from '../types';

/**
 * The minimal delegation metadata `DelegatedAuthGuard` attaches to the request (issuer,
 * externalSubject, sourceClientId, audience, scopes) — separate from `request.user` (a
 * normal `JwtUser`, still readable via the existing `@CurrentUser()`) so this stays purely
 * additive for audit/correlation purposes and never changes what `@CurrentUser()` returns.
 */
export const CurrentDelegatedUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DelegationContext | undefined => {
    const request = ctx.switchToHttp().getRequest<{ delegationContext?: DelegationContext }>();
    return request.delegationContext;
  },
);
