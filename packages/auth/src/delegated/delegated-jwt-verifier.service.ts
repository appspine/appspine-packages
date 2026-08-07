import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt, { type JwtHeader } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import {
  assertAccessTokenType,
  assertAllowedClient,
  assertAudience,
  assertScopesAndReturn,
  assertTokenAge,
  buildVerifiedClaims,
  normalizeClientId,
  requireExternalSubject,
} from './delegated-claims.util';
import type { DelegatedOidcTrustProfile, DelegatedTokenVerificationResult } from './types';

/**
 * Cryptographic + claim verifier for delegated (Token Exchange) access tokens. Deliberately
 * independent of `JwtVerifierService` / `OidcStrategy` — the general login trust profile
 * must never be able to accept a delegated token, so this does not share their signature
 * verification call site, only (optionally) the same `OIDC_JWKS_URL` value, since delegated
 * tokens are issued by the same IdP as general login tokens. See
 * 042-oidc-delegation-package-plan.md §9.
 */
@Injectable()
export class DelegatedJwtVerifierService {
  private oidcClient: JwksClient | null = null;

  async verify(
    token: string,
    profile: DelegatedOidcTrustProfile,
  ): Promise<DelegatedTokenVerificationResult> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !this.hasKidHeader(decoded.header)) {
      throw new UnauthorizedException('delegated token is missing a key id');
    }

    let payload: Record<string, unknown>;
    try {
      const signingKey = await this.getSigningKey(decoded.header.kid);
      payload = await this.verifySignature(token, signingKey, profile);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid delegated token');
    }

    // Steps 2a, 3-7 of plan §9 — order matters: type before audience/client (cheap checks
    // first), audience before client (both must hold before trusting who the requester is).
    assertAccessTokenType(payload, decoded.header.typ);
    assertAudience(payload, profile);
    const clientId = normalizeClientId(payload);
    assertAllowedClient(clientId, profile);
    const externalSubject = requireExternalSubject(payload);
    const scopes = assertScopesAndReturn(payload, profile);
    assertTokenAge(payload, profile);

    return {
      claims: buildVerifiedClaims(profile, clientId, externalSubject, scopes),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
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

  private async getSigningKey(kid: string): Promise<string> {
    const key = await this.getOidcClient().getSigningKey(kid);
    return key.getPublicKey();
  }

  private verifySignature(
    token: string,
    signingKey: string,
    profile: DelegatedOidcTrustProfile,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        signingKey,
        {
          algorithms: ['RS256'],
          issuer: profile.expectedIssuer,
          clockTolerance: profile.clockToleranceSeconds,
        },
        (error, payload) => {
          if (error) {
            reject(error);
            return;
          }
          if (!payload || Array.isArray(payload) || typeof payload === 'string') {
            reject(new UnauthorizedException('delegated token payload is invalid'));
            return;
          }
          resolve(payload);
        },
      );
    });
  }
}
