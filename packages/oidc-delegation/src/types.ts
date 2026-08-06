export type ExchangeDelegatedTokenInput = {
  subjectToken: string;
  policy: string;
};

export type DelegatedAccessToken = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
};

export interface OidcDelegationClient {
  exchange(input: ExchangeDelegatedTokenInput): Promise<DelegatedAccessToken>;
}

export type DelegationPolicyConfig = {
  targetAudience: string;
  requestedScopes: readonly string[];
  maxExpiresInSeconds: number;
};

export type OidcDelegationModuleOptions = {
  provider: 'keycloak';
  tokenEndpoint: string;
  /** The confidential client that performs the Token Exchange call itself (e.g.
   * `wiki-delegation`) — authenticates to the provider with `sourceClientSecret`. Per plan
   * §2 decision 4, this is deliberately a dedicated exchange-only client, distinct from
   * whichever client actually issues subject tokens to this app's users (see
   * `subjectTokenIssuerClientId`). */
  sourceClientId: string;
  sourceClientSecret: string;
  /**
   * The client id this app's users actually log into and receive subject tokens from
   * (e.g. `wiki`) — almost always *different* from `sourceClientId` when using a dedicated
   * delegation client. The mandatory outbound sanity check (see plan §2 decision 13/§8)
   * verifies the subject token's `azp`/`client_id` equals *this* value, not
   * `sourceClientId` — getting this wrong makes every real exchange fail closed, since a
   * dedicated exchange-only client never itself issues subject tokens to anyone.
   */
  subjectTokenIssuerClientId: string;
  /** Outbound HTTP request timeout in milliseconds. Default 5000. */
  requestTimeoutMs?: number;
  /**
   * Outbound rate limit: max exchange attempts per policy per rolling minute before
   * this package fails closed with a `provider_unavailable` error instead of calling
   * the provider. Default 60. See 042-oidc-delegation-package-plan.md §8.
   */
  maxExchangesPerMinutePerPolicy?: number;
  policies: Record<string, DelegationPolicyConfig>;
};

/**
 * Provider-neutral outbound exchange interface. The Keycloak Standard Token Exchange
 * V2 adapter is the only implementation shipped in the first version (see
 * 042-oidc-delegation-package-plan.md §3.2 — no second IdP adapter to avoid speculative
 * abstraction).
 */
export interface TokenExchangeProvider {
  exchange(params: TokenExchangeProviderParams): Promise<TokenExchangeProviderResult>;
}

export type TokenExchangeProviderParams = {
  subjectToken: string;
  targetAudience: string;
  requestedScopes: readonly string[];
};

export type TokenExchangeProviderResult = {
  accessToken: string;
  expiresInSeconds: number;
};
