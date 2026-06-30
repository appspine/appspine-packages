import { PrismaService } from '@appspine/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { buildUserContext } from '../user-context.util';

/**
 * Validates RS256 tokens issued by an external OIDC provider (Keycloak) — AUTH_MODE=oidc.
 * Keycloak tokens carry identity (email) but not this app's RBAC grants, so on every
 * request we look the user up locally by email and attach permissionPolicy/permissions
 * from this app's own Role/Permission tables (same shape as AUTH_MODE=local).
 */
@Injectable()
export class OidcStrategy extends PassportStrategy(Strategy, 'jwt-oidc') {
  constructor(private readonly prisma: PrismaService) {
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
    const email = payload.email as string | undefined;
    if (!email) throw new UnauthorizedException('OIDC token is missing an email claim');

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: { include: { permissions: true } } } } },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('No active local account for this OIDC identity');
    }

    const roles = user.userRoles.map((ur: { role: unknown }) => ur.role);
    const { roleNames, permissionPolicy, permissions } = buildUserContext(
      roles as Parameters<typeof buildUserContext>[0],
    );
    const roleName = roleNames.includes('ADMIN') ? 'ADMIN' : (roleNames[0] ?? '');

    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      roleName,
      roleNames,
      permissionPolicy,
      permissions,
    };
  }
}
