import { Inject, Injectable, Optional } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { OIDC_AUTH_CONFIG, type OidcAuthConfig, oidcAuthConfigFromEnvironment } from '../config';
import { JwtVerifierService } from '../jwt-verifier.service';

/**
 * Validates RS256 tokens issued by the external OIDC provider (Keycloak) — the sole
 * identity source under dev_docs/framework/035. Keycloak tokens carry identity (email)
 * but not this app's RBAC grants, so on every request we look the user up locally by
 * email and attach permissionPolicy/permissions from this app's own Role/Permission
 * tables.
 */
@Injectable()
export class OidcStrategy extends PassportStrategy(Strategy, 'jwt-oidc') {
  constructor(
    private readonly jwtVerifierService: JwtVerifierService,
    @Optional() @Inject(OIDC_AUTH_CONFIG) configured?: OidcAuthConfig,
  ) {
    const { jwksUrl, issuer, audience } = configured ?? oidcAuthConfigFromEnvironment();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: jwksUrl,
      }),
      issuer,
      audience,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: Record<string, unknown>) {
    return this.jwtVerifierService.buildOidcJwtUser(payload);
  }
}
