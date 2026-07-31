import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ApiKeyUser } from '../user-context.util';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string | null;
  roleName: string;
  roleNames: string[];
  permissionPolicy: string;
  permissions: string[];
}

export type JwtUser = JwtPayload;

// A route guarded by JwtOrApiKeyGuard (rather than plain JwtAuthGuard) can populate
// request.user from either path — TypeScript never checks a param decorator's return
// type against its declared annotation, so declaring only JwtPayload here let every
// consumer silently disagree about the real shape (api-keys.controller.ts hand-declares
// `{ sub: string; email?: string; isApiKey?: boolean }`, others use ad hoc unions).
// Declaring the true union at the one place it originates makes the shape explicit
// instead of implicit tribal knowledge.
export type CurrentUserPayload = JwtUser | ApiKeyUser;

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: CurrentUserPayload }>();
    return request.user;
  },
);
