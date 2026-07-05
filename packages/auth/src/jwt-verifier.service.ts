import { PrismaService } from '@appspine/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import jwt, { type JwtHeader } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import type { JwtPayload, JwtUser } from './decorators/current-user.decorator';
import { buildUserContext } from './user-context.util';

@Injectable()
export class JwtVerifierService {
  private oidcClient: JwksClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async verifyJwtToken(token: string): Promise<JwtUser> {
    return process.env.AUTH_MODE === 'oidc'
      ? this.verifyOidcJwtToken(token)
      : this.verifyLocalJwtToken(token);
  }

  async buildOidcJwtUser(payload: Record<string, unknown>): Promise<JwtUser> {
    const email = payload.email as string | undefined;
    if (!email) {
      throw new UnauthorizedException('OIDC token is missing an email claim');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: { include: { permissions: true } } } } },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('No active local account for this OIDC identity');
    }

    const roles = user.userRoles.map((userRole: { role: unknown }) => userRole.role);
    const { roleNames, permissionPolicy, permissions } = buildUserContext(
      roles as Parameters<typeof buildUserContext>[0],
    );

    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      roleName: roleNames.includes('ADMIN') ? 'ADMIN' : (roleNames[0] ?? ''),
      roleNames,
      permissionPolicy,
      permissions,
    };
  }

  private async verifyLocalJwtToken(token: string): Promise<JwtUser> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET ?? 'dev-secret',
        algorithms: ['HS256'],
      });

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        roleName: payload.roleName,
        roleNames: payload.roleNames ?? [],
        permissionPolicy: payload.permissionPolicy ?? 'DENY_ALL',
        permissions: payload.permissions ?? [],
      };
    } catch {
      throw new UnauthorizedException('Invalid JWT');
    }
  }

  private async verifyOidcJwtToken(token: string): Promise<JwtUser> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !this.hasKidHeader(decoded.header)) {
      throw new UnauthorizedException('OIDC token is missing a key id');
    }

    try {
      const signingKey = await this.getOidcSigningKey(decoded.header.kid);
      const payload = await this.verifyOidcSignature(token, signingKey);
      return this.buildOidcJwtUser(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid JWT');
    }
  }

  private hasKidHeader(header: JwtHeader): header is JwtHeader & { kid: string } {
    return typeof header.kid === 'string' && header.kid.length > 0;
  }

  private getOidcClient(): JwksClient {
    if (this.oidcClient) {
      return this.oidcClient;
    }

    const jwksUri = process.env.OIDC_JWKS_URL;
    if (!jwksUri) {
      throw new UnauthorizedException('OIDC JWKS URL is not configured');
    }

    this.oidcClient = jwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri,
    });

    return this.oidcClient;
  }

  private async getOidcSigningKey(kid: string): Promise<string> {
    const key = await this.getOidcClient().getSigningKey(kid);
    return key.getPublicKey();
  }

  private verifyOidcSignature(token: string, signingKey: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        signingKey,
        {
          algorithms: ['RS256'],
          issuer: process.env.OIDC_ISSUER,
          audience: process.env.OIDC_AUDIENCE,
        },
        (error, payload) => {
          if (error) {
            reject(error);
            return;
          }

          if (!payload || Array.isArray(payload) || typeof payload === 'string') {
            reject(new UnauthorizedException('OIDC token payload is invalid'));
            return;
          }

          resolve(payload);
        },
      );
    });
  }
}
