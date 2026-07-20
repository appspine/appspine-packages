import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../decorators/current-user.decorator';
import { resolveJwtSecret } from '../jwt-secret.util';

/** Validates the HS256 token this app itself signs at login/register (AUTH_MODE=local). */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'jwt-local') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: resolveJwtSecret(),
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload) {
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      roleName: payload.roleName,
      roleNames: payload.roleNames ?? [],
      permissionPolicy: payload.permissionPolicy ?? 'DENY_ALL',
      permissions: payload.permissions ?? [],
    };
  }
}
