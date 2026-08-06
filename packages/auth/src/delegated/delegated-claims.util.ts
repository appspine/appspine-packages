import { UnauthorizedException } from '@nestjs/common';
import type { DelegatedOidcTrustProfile, VerifiedDelegatedClaims } from './types';

// All of these operate on an already signature-verified payload — none of this is a
// substitute for cryptographic verification, only claim-shape checks on top of it. See
// 042-oidc-delegation-package-plan.md §9 for the numbered verification order these
// correspond to.

export function assertAccessTokenType(payload: Record<string, unknown>): void {
  // Keycloak's access tokens carry `typ: "Bearer"` in the payload (not the RFC 9068
  // `at+jwt` header type); RFC 9068-compliant providers may only set the header. Neither
  // an ID token nor a refresh token satisfies either check.
  const payloadTyp = typeof payload.typ === 'string' ? payload.typ.toLowerCase() : '';
  if (payloadTyp !== 'bearer') {
    throw new UnauthorizedException('delegated token does not look like an access token');
  }
}

export function assertAudience(
  payload: Record<string, unknown>,
  profile: DelegatedOidcTrustProfile,
): void {
  const audiences = normalizeAudience(payload.aud);
  const allowed = new Set<string>([
    profile.requiredAudience,
    ...profile.additionalAllowedAudiences,
  ]);

  if (!audiences.includes(profile.requiredAudience)) {
    throw new UnauthorizedException('delegated token does not include the required audience');
  }
  if (!audiences.every((aud) => allowed.has(aud))) {
    throw new UnauthorizedException('delegated token has an audience outside the allowed set');
  }
}

function normalizeAudience(aud: unknown): string[] {
  if (typeof aud === 'string') return [aud];
  if (Array.isArray(aud) && aud.every((entry) => typeof entry === 'string')) {
    return aud as string[];
  }
  return [];
}

/** Normalizes `azp` (Keycloak) or `client_id` (RFC 9068) to a single `clientId`, fail-closed
 * on conflict or absence — see plan §2 decision 7 / §9 step 4. */
export function normalizeClientId(payload: Record<string, unknown>): string {
  const azp = typeof payload.azp === 'string' && payload.azp.length > 0 ? payload.azp : undefined;
  const clientId =
    typeof payload.client_id === 'string' && payload.client_id.length > 0
      ? payload.client_id
      : undefined;

  if (azp && clientId && azp !== clientId) {
    throw new UnauthorizedException('delegated token has conflicting azp and client_id claims');
  }
  const resolved = azp ?? clientId;
  if (!resolved) {
    throw new UnauthorizedException('delegated token has no azp or client_id claim');
  }
  return resolved;
}

export function assertAllowedClient(clientId: string, profile: DelegatedOidcTrustProfile): void {
  if (!profile.allowedClientIds.includes(clientId)) {
    throw new UnauthorizedException('delegated token was not issued to an allowed source client');
  }
}

export function requireExternalSubject(payload: Record<string, unknown>): string {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new UnauthorizedException('delegated token is missing a subject claim');
  }
  return payload.sub;
}

/** Enforces `requiredScopes` are all present and no unregistered scope inside the
 * delegation namespace slipped through — see plan §9 step 6 / §2 decision 15. */
export function assertScopesAndReturn(
  payload: Record<string, unknown>,
  profile: DelegatedOidcTrustProfile,
): string[] {
  const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];

  for (const required of profile.requiredScopes) {
    if (!scopes.includes(required)) {
      throw new UnauthorizedException('delegated token is missing a required delegation scope');
    }
  }
  for (const scope of scopes) {
    if (
      scope.startsWith(profile.delegationScopeNamespace) &&
      !profile.requiredScopes.includes(scope)
    ) {
      throw new UnauthorizedException('delegated token has an unrecognized delegation scope');
    }
  }
  return scopes;
}

export function assertTokenAge(
  payload: Record<string, unknown>,
  profile: DelegatedOidcTrustProfile,
): void {
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    throw new UnauthorizedException('delegated token is missing iat/exp claims');
  }
  const age = payload.exp - payload.iat;
  if (age > profile.maxTokenAgeSeconds + profile.clockToleranceSeconds) {
    throw new UnauthorizedException('delegated token exceeds the maximum allowed age');
  }
}

export function buildVerifiedClaims(
  profile: DelegatedOidcTrustProfile,
  clientId: string,
  externalSubject: string,
  scopes: string[],
): VerifiedDelegatedClaims {
  return {
    issuer: profile.expectedIssuer,
    externalSubject,
    sourceClientId: clientId,
    audience: profile.requiredAudience,
    scopes,
  };
}
