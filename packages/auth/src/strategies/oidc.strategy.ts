import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtVerifierService } from '../jwt-verifier.service';

/**
 * Validates RS256 tokens issued by an external OIDC provider (Keycloak) — AUTH_MODE=oidc.
 * Keycloak tokens carry identity (email) but not this app's RBAC grants, so on every
 * request we look the user up locally by email and attach permissionPolicy/permissions
 * from this app's own Role/Permission tables (same shape as AUTH_MODE=local).
 */
@Injectable()
export class OidcStrategy extends PassportStrategy(Strategy, 'jwt-oidc') {
  constructor(private readonly jwtVerifierService: JwtVerifierService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: process.env.OIDC_JWKS_URL ?? '',
      }),
      issuer: process.env.OIDC_ISSUER,
      audience: process.env.OIDC_AUDIENCE,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: Record<string, unknown>) {
    return this.jwtVerifierService.buildOidcJwtUser(payload);
  }
}
