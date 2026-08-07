import type { JwtUser } from '../decorators/current-user.decorator';

/**
 * Trust configuration for one endpoint-scoped delegated (Token Exchange) token profile.
 * See 042-oidc-delegation-package-plan.md §9. `requiredAudience` + `additionalAllowedAudiences`
 * (rather than a single allow-list) exist so the audience check can require the token's
 * audience set to both *contain* `requiredAudience` and be a *subset* of the allowed set —
 * a single flat allow-list is easy to implement as "any overlap passes", which is wrong.
 */
export type DelegatedOidcTrustProfile = {
  expectedIssuer: string;
  /** Allow HTTP issuer/JWKS URLs for explicitly isolated development environments. */
  allowInsecureHttp?: boolean;
  requiredAudience: string;
  additionalAllowedAudiences: readonly string[];
  allowedClientIds: readonly string[];
  requiredScopes: readonly string[];
  /** Scope namespace prefix (e.g. `"approve:"`) — any scope with this prefix that isn't in
   * `requiredScopes` is rejected; scopes outside the namespace (`openid`, `profile`, ...) are
   * ignored. See plan §2 decision 15. */
  delegationScopeNamespace: string;
  maxTokenAgeSeconds: number;
  clockToleranceSeconds: number;
  /**
   * `'never'` (recommended default): only ever look up an existing local User by verified
   * email; never create one. A delegated caller with no matching local User is rejected
   * with a generic 401 and nothing is written to the database. `'jit'` opts into the same
   * just-in-time provisioning the general login path uses — only appropriate when the
   * endpoint's own access model tolerates a delegated caller getting a fresh local account.
   * See plan §2 decision 12 for why `'never'` must be the default: general login is gated by
   * Keycloak per-client access checks that the delegated path bypasses entirely.
   */
  provisioning?: 'never' | 'jit';
};

export type ResolvedDelegatedOidcTrustProfile = Omit<DelegatedOidcTrustProfile, 'provisioning'> & {
  provisioning: 'never' | 'jit';
};

export type DelegationContext = {
  issuer: string;
  externalSubject: string;
  sourceClientId: string;
  audience: string;
  scopes: readonly string[];
};

export type VerifiedDelegatedClaims = DelegationContext;

export type DelegatedTokenVerificationResult = {
  claims: VerifiedDelegatedClaims;
  email: string | undefined;
  emailVerified: boolean;
  name: string | undefined;
};

export type DelegatedRequestUser = JwtUser;
