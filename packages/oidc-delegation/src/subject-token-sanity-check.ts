// Non-authoritative sanity check on the subject token before sending it to the provider.
// See 042-oidc-delegation-package-plan.md §2 decision 13 / §8: T-16610 proved empirically
// that Keycloak's own "requester must be within the subject token's audience" check does
// NOT protect against a source app being handed a token issued by a *different* app once
// that app's audience has been widened (e.g. by `fullScopeAllowed`) to include this app —
// Keycloak will happily exchange it. This check is the only control that catches that
// case reliably; it is mandatory, not optional defense-in-depth.
//
// This does not verify the token's signature and must never be used for authorization —
// it only rejects tokens that are obviously not this app's own, to stop this package from
// being usable as a token-laundering oracle for a caller-supplied bearer.
export function assertSubjectTokenBelongsToSourceClient(
  subjectToken: string,
  sourceClientId: string,
): void {
  const payload = decodeJwtPayload(subjectToken);
  const claimant = typeof payload.azp === 'string' ? payload.azp : payload.client_id;

  if (typeof claimant !== 'string' || claimant.length === 0) {
    throw new SubjectTokenSanityCheckError(
      'subject token has no azp or client_id claim identifying its issuing client',
    );
  }
  if (claimant !== sourceClientId) {
    throw new SubjectTokenSanityCheckError('subject token was not issued to this source client');
  }
}

export class SubjectTokenSanityCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubjectTokenSanityCheckError';
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new SubjectTokenSanityCheckError('subject token is not a JWT');
  }

  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('payload is not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new SubjectTokenSanityCheckError('subject token payload could not be decoded');
  }
}
