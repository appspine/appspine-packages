import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
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
  constructor(private readonly jwtVerifierService: JwtVerifierService) {
    const jwksUri = process.env.OIDC_JWKS_URL;
    const issuer = process.env.OIDC_ISSUER;
    const audience = process.env.OIDC_AUDIENCE;
    if (!jwksUri || !issuer || !audience) {
      // jsonwebtoken/passport-jwt silently skip the issuer/audience check when either
      // option is undefined. With JIT provisioning removing the "a local User must
      // already exist" safety net (plan 035 §4.2), an unset OIDC_AUDIENCE would let a
      // token minted for ANY client in the same Keycloak realm auto-provision into this
      // app. Fail fast at boot instead of accepting requests with the check silently off.
      throw new Error(
        'OIDC_JWKS_URL, OIDC_ISSUER and OIDC_AUDIENCE must all be set to start under AUTH_MODE=oidc.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
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
