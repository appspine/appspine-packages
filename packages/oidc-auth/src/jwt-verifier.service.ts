import {
  AUDIT_SINK,
  type AuditSinkPort,
  IDENTITY_STORE,
  type IdentityStorePort,
  type InteractivePrincipal,
  RBAC_POLICY,
  type RbacPolicyPort,
  type RoleGrant,
  SYSTEM_ADMIN_ROLE,
} from '@appspine/plugin-api';
import { Inject, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import jwt, { type JwtHeader } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import { OIDC_AUTH_CONFIG, type OidcAuthConfig, oidcAuthConfigFromEnvironment } from './config';
import { OidcIdentityService } from './oidc-identity.service';

/** Legacy alias. The host owns this shape now; kept so migrating consumers keep compiling. */
export type JwtUser = InteractivePrincipal;

/**
 * OIDC token verification and principal construction (PL1-12).
 *
 * The verification logic — JWKS lookup, RS256, issuer/audience, the `azp` authorized-party check —
 * is carried over unchanged from `@appspine/auth`; this is a split, not a rewrite, and changing
 * security behaviour in the same change that moves it would make a regression indistinguishable
 * from a migration artefact.
 *
 * What did change is every *dependency*: users come from `appspine.identity-store`, role
 * flattening from `appspine.rbac-policy`, and the external identity key from
 * `OidcIdentityService` rather than the email claim (PL0-04 section 4).
 */
@Injectable()
export class JwtVerifierService {
  private readonly logger = new Logger(JwtVerifierService.name);
  private oidcClient: JwksClient | null = null;
  private readonly config: OidcAuthConfig;

  constructor(
    @Inject(IDENTITY_STORE) private readonly identityStore: IdentityStorePort,
    private readonly oidcIdentity: OidcIdentityService,
    // Optional so the pre-existing `JwtVerifierService` unit tests, and any consumer that
    // constructs it directly, keep working; the manifest still lists `appspine.audit-sink` as a
    // hard requirement, so a real App cannot run this path without a sink.
    @Optional() @Inject(AUDIT_SINK) private readonly auditSink?: AuditSinkPort,
    @Optional() @Inject(RBAC_POLICY) private readonly rbacPolicy?: RbacPolicyPort,
    @Optional() @Inject(OIDC_AUTH_CONFIG) configured?: OidcAuthConfig,
  ) {
    this.config = configured ?? oidcAuthConfigFromEnvironment();
  }

  // OIDC is the sole identity source (dev_docs/framework/035) — kept as its own public
  // method since consumers outside Passport's guard flow (e.g. WebSocket handshakes)
  // call this directly to verify a bearer token.
  verifyJwtToken(token: string): Promise<JwtUser> {
    return this.verifyOidcJwtToken(token);
  }

  async buildOidcJwtUser(payload: Record<string, unknown>): Promise<JwtUser> {
    this.assertAuthorizedParty(payload);
    const email = payload.email as string | undefined;
    if (!email) {
      throw new UnauthorizedException('OIDC token is missing an email claim');
    }

    const resolved = await this.oidcIdentity.resolve({
      issuer: (payload.iss as string | undefined) ?? '',
      subject: (payload.sub as string | undefined) ?? '',
      email,
      // Identity is keyed on (issuer, subject); the email claim is only ever used to *link* a
      // pre-existing account, and an unverified email must not be trusted for that.
      emailVerified: payload.email_verified === true,
      name: payload.name as string | undefined,
    });

    return this.buildPrincipal(resolved.userId);
  }

  /**
   * Maps an already-verified identity (caller has confirmed `email` is present and verified) to a
   * local principal, JIT-provisioning if needed. Contains no `azp` logic — callers own that check
   * (see `buildOidcJwtUser` above and `DelegatedPrincipalMapperService`'s `'jit'` path, which has
   * its own upstream verification).
   *
   * Email-keyed by design: a delegated token comes from another App, so `(issuer, subject)` for
   * *this* App's realm is not available. That is why the delegated trust profile is configured
   * per-issuer rather than derived from the token.
   */
  async mapVerifiedIdentityToLocalPrincipal(
    email: string,
    name: string | undefined,
  ): Promise<JwtUser> {
    const existing = await this.identityStore.findByEmail(email);
    if (existing) {
      if (!existing.isActive) {
        throw new UnauthorizedException('No active local account for this OIDC identity');
      }
      return this.buildPrincipal(existing.id);
    }

    const created = await this.provision(email, name);
    return this.buildPrincipal(created.id);
  }

  /**
   * JIT-provisions the local account for a delegated login, and records that it happened.
   *
   * The audit record is not optional decoration: this is the outermost trust boundary in the
   * system — another App presenting an RFC 8693 token causes an account to exist here — and the
   * pre-split `provisionOidcUser()` wrote one. Losing it in the split was silent, because nothing
   * asserted on it.
   *
   * Best-effort, exactly as before: an audit outage must not turn a valid delegated login into a
   * failure. The interactive path in `OidcIdentityService.link()` is transactional instead, because
   * there the audit write shares a transaction with the mapping row it describes; here there is no
   * mapping row — the delegated profile is configured per-issuer, not derived from the token.
   */
  private async provision(email: string, name: string | undefined): Promise<{ id: string }> {
    let created: { id: string };
    try {
      created = await this.identityStore.create({ email, name });
    } catch (error) {
      // Two concurrent first delegated logins for the same email both saw "no local account".
      // The loser must not fail a login that is perfectly valid — re-read the winner's row.
      // Only a *missing* row means the error was real.
      const winner = await this.identityStore.findByEmail(email);
      if (!winner) throw error;
      if (!winner.isActive) {
        throw new UnauthorizedException('No active local account for this OIDC identity');
      }
      return winner;
    }

    try {
      await this.auditSink?.record({
        entityType: 'User',
        entityId: created.id,
        action: 'CREATE',
        actorId: created.id,
        actorEmail: email,
        appName: process.env.APP_NAME ?? 'appspine-app-template',
      });
    } catch {
      this.logger.warn('Failed to record delegated OIDC provisioning audit');
    }

    return created;
  }

  /**
   * Find-only lookup for an already-verified identity — never provisions. Returns `null` for both
   * "no User with this email" and "User exists but inactive"; the delegated
   * (`provisioning: 'never'`) path collapses both into one opaque error so this cannot be used to
   * probe which emails have a local account (see plan §9/§13).
   */
  async findLocalPrincipalByVerifiedEmail(email: string): Promise<JwtUser | null> {
    const user = await this.identityStore.findWithRolesByEmail(email);
    if (!user?.isActive) {
      return null;
    }
    return this.principalFrom(user.id, user.email, user.name, user.roles);
  }

  private async buildPrincipal(userId: string): Promise<JwtUser> {
    const user = await this.identityStore.findWithRolesById(userId);
    if (!user) {
      throw new UnauthorizedException('Failed to resolve the local account for this OIDC identity');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('No active local account for this OIDC identity');
    }
    return this.principalFrom(user.id, user.email, user.name, user.roles);
  }

  /**
   * Flattening is RBAC's algorithm, reached through `appspine.rbac-policy` (PL0-04 section 2).
   * With no RBAC plugin installed the principal is authenticated but unauthorized — deny-all with
   * no roles — rather than silently inheriting anything.
   */
  private principalFrom(
    id: string,
    email: string,
    name: string | null,
    roles: RoleGrant[],
  ): JwtUser {
    const authorization = this.rbacPolicy?.flatten(roles) ?? {
      roleNames: [],
      permissionPolicy: 'DENY_ALL',
      permissions: [],
    };

    return {
      sub: id,
      email,
      name,
      roleName: authorization.roleNames.includes(SYSTEM_ADMIN_ROLE)
        ? SYSTEM_ADMIN_ROLE
        : (authorization.roleNames[0] ?? ''),
      ...authorization,
    };
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

      // getOidcSigningKey() makes a network call to the IdP's JWKS endpoint — an outage,
      // DNS failure, or rate-limit rejection (jwksRequestsPerMinute: 5, see
      // getOidcClient()) lands here indistinguishable from a forged/expired token unless
      // logged. Without this, a Keycloak outage presents as "every user's token is
      // suddenly invalid" with zero server-side trace.
      this.logger.warn(`OIDC token verification failed: ${errorMessage(error)}`);
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

    this.oidcClient = jwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: this.config.jwksUrl,
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
          issuer: this.config.issuer,
          audience: this.config.audience,
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

          try {
            this.assertAuthorizedParty(payload);
          } catch (error) {
            reject(error);
            return;
          }

          resolve(payload);
        },
      );
    });
  }

  private assertAuthorizedParty(payload: Record<string, unknown>): void {
    // hasOwnProperty (not plain property access, and not Object.hasOwn — tsconfig.base's
    // lib target predates ES2022) so a polluted Object.prototype.azp can't be read as if
    // the token actually carried the claim.
    // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn needs an ES2022 lib target this package doesn't have.
    const azp = Object.prototype.hasOwnProperty.call(payload, 'azp') ? payload.azp : undefined;
    const expected = this.config.audience;

    if (typeof azp !== 'string' || azp.length === 0) {
      // Logs the expected value and a safe representation of whatever was actually
      // received (never the token itself) so a real cross-app replay is distinguishable
      // from a local OIDC_AUDIENCE misconfiguration in the server-side trace.
      this.logger.warn(
        `OIDC token rejected: authorized party claim is missing or invalid (expected "${expected}", received ${JSON.stringify(azp)})`,
      );
      throw new UnauthorizedException('OIDC token has an invalid authorized party claim');
    }

    if (azp !== expected) {
      this.logger.warn(
        `OIDC token rejected: authorized party does not match this application (expected "${expected}", received "${azp}")`,
      );
      throw new UnauthorizedException(
        'OIDC token authorized party does not match this application',
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
