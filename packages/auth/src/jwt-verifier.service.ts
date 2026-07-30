import { PrismaService } from '@appspine/common';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt, { type JwtHeader } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import type { JwtUser } from './decorators/current-user.decorator';
import { buildUserContext } from './user-context.util';
import { UsersService } from './users/users.service';

@Injectable()
export class JwtVerifierService {
  private oidcClient: JwksClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  // OIDC is the sole identity source (dev_docs/framework/035) — kept as its own public
  // method since consumers outside Passport's guard flow (e.g. WebSocket handshakes)
  // call this directly to verify a bearer token.
  verifyJwtToken(token: string): Promise<JwtUser> {
    return this.verifyOidcJwtToken(token);
  }

  async buildOidcJwtUser(payload: Record<string, unknown>): Promise<JwtUser> {
    const email = payload.email as string | undefined;
    if (!email) {
      throw new UnauthorizedException('OIDC token is missing an email claim');
    }

    const user =
      (await this.findOidcUser(email)) ??
      (await this.provisionOidcUser(email, payload.name as string | undefined));
    if (!user.isActive) {
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

  private findOidcUser(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: { include: { permissions: true } } } } },
    });
  }

  // First OIDC login for an email with no local User: create one on the fly (plan 035 §2.3,
  // §4.2). No domain whitelist here — a validated OIDC token means the IdP already vouched
  // for this identity; access is gated per-client on the IdP side instead.
  private async provisionOidcUser(email: string, name: string | undefined) {
    try {
      await this.usersService.create({ email, name });
    } catch (error) {
      // Concurrent first logins for the same email race on UsersService.create()'s
      // findUnique-then-create check (not a DB unique constraint) — the loser sees
      // ConflictException, not a Prisma P2002. Re-fetch the row the winner just created
      // instead of treating this as a real failure.
      if (!(error instanceof ConflictException)) {
        throw error;
      }
    }

    const user = await this.findOidcUser(email);
    if (!user) {
      throw new UnauthorizedException('Failed to provision OIDC account');
    }
    return user;
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
