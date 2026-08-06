/**
 * Thrown by DelegatedPrincipalMapperService for any identity-mapping failure (missing
 * email, unverified email, no matching/active local User). Deliberately a single error
 * type regardless of which sub-case triggered it — DelegatedAuthGuard converts all of
 * them to the same opaque 401, so this app never becomes an oracle for "does this email
 * exist locally" (see 042-oidc-delegation-package-plan.md §9/§13).
 */
export class DelegatedIdentityMappingError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'DelegatedIdentityMappingError';
  }
}
