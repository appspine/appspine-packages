import { PrismaService } from '@appspine/common';
import {
  AUDIT_SINK,
  type AuditSinkPort,
  IDENTITY_STORE,
  type IdentityStorePort,
} from '@appspine/plugin-api';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

export interface VerifiedOidcIdentity {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export interface ResolvedOidcIdentity {
  userId: string;
  /** `true` when this login created the mapping by linking a pre-existing email-keyed account. */
  linkedFromLegacyEmail: boolean;
  /** `true` when this login JIT-provisioned a brand new user. */
  provisioned: boolean;
}

const AUDIT_APP_NAME = () => process.env.APP_NAME ?? 'appspine-app-template';

/**
 * Maps a verified OIDC token to a local user, keyed on `(issuer, subject)` (PL0-04 section 4).
 *
 * Why not email: an IdP-side email change would otherwise create a second account, and two realms
 * that happen to issue the same `sub` would collide into one. `fixtures/051-identity-boundary/
 * cases.json` freezes exactly those three cases and `oidc-identity.spec.ts` runs them.
 *
 * PL0-04's expand/transition plan has three outcomes for a login with no mapping yet, and the
 * distinction matters:
 *
 *   - exactly one *active* legacy account with the token's verified email -> link it, in one
 *     transaction, with an audit record. This is the migration path for users who existed before
 *     `OidcIdentity` did.
 *   - no account at all -> JIT-provision, exactly as the pre-split `JwtVerifierService` did
 *     (dev_docs/framework/035 §2.3). PL0-04 §4.1's "fail closed on zero matches" governs *linking*
 *     — there is nothing to link — and §2 separately requires JIT provisioning to keep working.
 *   - a match that is inactive -> refuse. A disabled account must not be revived by logging in.
 */
@Injectable()
export class OidcIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_STORE) private readonly identityStore: IdentityStorePort,
    @Inject(AUDIT_SINK) private readonly auditSink: AuditSinkPort,
  ) {}

  async resolve(identity: VerifiedOidcIdentity): Promise<ResolvedOidcIdentity> {
    const issuer = identity.issuer?.trim();
    const subject = identity.subject?.trim();

    // Neither half of the key may be inferred or defaulted: a token missing one of them is not a
    // weaker identity, it is an unusable one.
    if (!issuer) throw new UnauthorizedException('OIDC token is missing an issuer claim');
    if (!subject) throw new UnauthorizedException('OIDC token is missing a subject claim');

    const existing = await this.prisma.oidcIdentity.findUnique({
      where: { issuer_subject: { issuer, subject } },
      select: { userId: true },
    });
    if (existing) {
      // A mapping whose account no longer exists is a dead end, and `OidcIdentity.userId` has no
      // foreign key to clear it (see the model's own note on why). Deleting the user through the
      // Users API therefore used to lock that external identity out permanently: every later login
      // resolved to the missing account, failed to build a principal, and returned 401 with no
      // operator-visible way to repair it — not even creating the account again, because the stale
      // mapping still won (Gate G1 review S7).
      //
      // Drop the dangling row and fall through to the normal link-or-provision path. `findById`
      // returning null is unambiguous: a database failure throws instead.
      const account = await this.identityStore.findById(existing.userId);
      if (account) {
        return { userId: existing.userId, linkedFromLegacyEmail: false, provisioned: false };
      }
      await this.prisma.oidcIdentity.delete({
        where: { issuer_subject: { issuer, subject } },
      });
    }

    if (!identity.emailVerified) {
      throw new UnauthorizedException('OIDC token email is not verified');
    }

    const legacy = await this.identityStore.findByEmail(identity.email);
    if (legacy) {
      if (!legacy.isActive) {
        throw new UnauthorizedException('No active local account for this OIDC identity');
      }
      await this.link(issuer, subject, legacy.id, true, identity.email, 'UPDATE');
      return { userId: legacy.id, linkedFromLegacyEmail: true, provisioned: false };
    }

    let created: { id: string };
    try {
      created = await this.provision(issuer, subject, identity);
    } catch (error) {
      // Two concurrent first logins for the same identity both saw "no local account" and both
      // tried to create one. The loser must not fail a login that is perfectly valid - re-read and
      // use the row the winner just created. Only a *missing* row means the error was real.
      const winner = await this.identityStore.findByEmail(identity.email);
      if (!winner) throw error;
      if (!winner.isActive) {
        throw new UnauthorizedException('No active local account for this OIDC identity');
      }
      await this.link(issuer, subject, winner.id, false, identity.email, 'UPDATE');
      return { userId: winner.id, linkedFromLegacyEmail: false, provisioned: false };
    }

    return { userId: created.id, linkedFromLegacyEmail: false, provisioned: true };
  }

  /**
   * Creates the account, its `(issuer, subject)` mapping and the audit record in ONE transaction.
   *
   * They used to be two: `identityStore.create()`, then a transactional `link()`. Gate G1's review
   * (S6) found what that costs. If the mapping transaction rolls back — an audit outage is enough —
   * the account survives without a mapping. The user retries, `findByEmail` now finds their own
   * half-provisioned account, and the login takes the *legacy email* branch: the mapping is written
   * with `linkedFromLegacyEmail = true` and audited as `UPDATE`. That flag is exactly what
   * operators watch to decide when the email fallback can be switched off (PL0-04 §4.1), so a
   * transient failure would have permanently inflated the number they steer by.
   */
  private async provision(
    issuer: string,
    subject: string,
    identity: VerifiedOidcIdentity,
  ): Promise<{ id: string }> {
    return this.prisma.$transaction(async (transaction: PrismaService) => {
      const user = await this.identityStore.create(
        { email: identity.email, name: identity.name },
        transaction,
      );
      await transaction.oidcIdentity.create({
        data: { issuer, subject, userId: user.id, linkedFromLegacyEmail: false },
      });
      await this.auditSink.record(
        {
          entityType: 'User',
          entityId: user.id,
          action: 'CREATE',
          actorId: user.id,
          actorEmail: identity.email,
          appName: AUDIT_APP_NAME(),
        },
        transaction,
      );
      return user;
    });
  }

  /**
   * Concurrent first logins for the same identity race here. The unique constraint on
   * `(issuer, subject)` is the arbiter: the loser re-reads the winner's row instead of failing a
   * login that is, from the user's point of view, perfectly valid.
   */
  private async link(
    issuer: string,
    subject: string,
    userId: string,
    linkedFromLegacyEmail: boolean,
    email: string,
    action: 'CREATE' | 'UPDATE',
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction: PrismaService) => {
        await transaction.oidcIdentity.create({
          data: { issuer, subject, userId, linkedFromLegacyEmail },
        });
        await this.auditSink.record(
          {
            entityType: 'User',
            entityId: userId,
            action,
            actorId: userId,
            actorEmail: email,
            appName: AUDIT_APP_NAME(),
          },
          transaction,
        );
      });
    } catch (error) {
      const existing = await this.prisma.oidcIdentity.findUnique({
        where: { issuer_subject: { issuer, subject } },
        select: { userId: true },
      });
      if (!existing) throw error;
      if (existing.userId !== userId) {
        // Two different local users now claim one external identity. Guessing which is correct is
        // exactly what PL0-04 forbids.
        throw new UnauthorizedException('OIDC identity is already mapped to a different account');
      }
    }
  }
}
