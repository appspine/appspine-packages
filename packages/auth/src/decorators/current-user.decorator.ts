import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

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

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
