# @appspine/oidc-delegation

Backend-only, provider-neutral OAuth 2.0 Token Exchange (RFC 8693) client for delegating a
user's identity from one appspine app to another — e.g. a Wiki backend calling Approve on
behalf of the currently signed-in user, without ever handing Approve the user's Wiki access
token or impersonating them with a service account.

See [042-oidc-delegation-package-plan.md](../../../knowledge/decisions/042-oidc-delegation-package-plan.md)
for the full design and security rationale. This README covers only how to configure and use
the package; it doesn't repeat that document's threat model.

## What this package does — and does not do

- Exchanges a subject access token for a short-lived, audience-restricted access token via a
  named, server-side-registered policy. Callers can only pass `subjectToken` and a `policy`
  name — never a raw audience, scope, or source client (see "Security model" below).
- Ships one provider adapter: Keycloak Standard Token Exchange V2. No second IdP adapter is
  planned for the first version.
- Does **not** verify or decode the delegated token it returns, map it to a local user, or
  enforce any RBAC — that is entirely `@appspine/auth`'s job on the target app side. The two
  packages have no runtime dependency on each other.
- Does **not** cache tokens across requests, retry internally, or support refresh tokens,
  offline access, DPoP, or mTLS in this version.
- Has no browser/frontend entry point. It is meant to run inside a NestJS backend only.

## Install

```bash
pnpm add @appspine/oidc-delegation
```

## Configure

```ts
import { OidcDelegationModule } from '@appspine/oidc-delegation';

@Module({
  imports: [
    OidcDelegationModule.forRoot({
      provider: 'keycloak',
      tokenEndpoint: process.env.OIDC_DELEGATION_TOKEN_ENDPOINT,
      // The confidential client this app uses to *initiate* exchanges. This should be a
      // dedicated delegation-only client (no login capability), not your app's own OIDC
      // login client — see the plan doc §2 decision 4 for why.
      sourceClientId: process.env.OIDC_DELEGATION_CLIENT_ID, // e.g. 'wiki-delegation'
      sourceClientSecret: process.env.OIDC_DELEGATION_CLIENT_SECRET,
      // The client your app's users actually log into and receive access tokens from —
      // almost always DIFFERENT from sourceClientId above. Required so the mandatory
      // outbound sanity check (see "Security model" below) knows what a legitimate subject
      // token looks like; getting this wrong makes every real exchange fail closed, since
      // the dedicated exchange-only client above never itself issues tokens to anyone.
      subjectTokenIssuerClientId: process.env.OIDC_LOGIN_CLIENT_ID, // e.g. 'wiki'
      // HTTPS is required by default. Only isolated local development may set
      // allowInsecureTokenEndpoint: true.
      requestTimeoutMs: 5000, // optional, default 5000
      maxExchangesPerMinutePerPolicy: 60, // optional, default 60 — see "Outbound throttling" below
      policies: {
        'submit-knowledge-document-change': {
          targetAudience: 'approve',
          requestedScopes: ['approve:knowledge-document-change:submit'],
          maxExpiresInSeconds: 120,
        },
      },
    }),
  ],
})
export class AppModule {}
```

Configuration is validated at startup. URLs with embedded credentials, insecure token
endpoints without the explicit development opt-in, empty identifiers, unsafe scopes
(`offline_access`, duplicates, or whitespace), invalid bounds, and empty policy maps all fail
closed before the first exchange.

## Use

```ts
constructor(private readonly oidcDelegation: OidcDelegationService) {}

async submitForApproval(inboundRequest: Request) {
  const subjectToken = extractBearerToken(inboundRequest); // must be THIS request's own,
                                                             // already-verified bearer —
                                                             // never a token read from a
                                                             // request body or header value
  const delegated = await this.oidcDelegation.exchange({
    subjectToken,
    policy: 'submit-knowledge-document-change',
  });
  // delegated.accessToken is a short-lived Bearer token scoped to `approve` only.
  await fetch('https://approve.internal/api/knowledge-document-change-requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${delegated.accessToken}` },
    body: JSON.stringify(payload),
  });
}
```

## Testing your own code against this package

Use the `./testing` entry point — it needs no network access and no real IdP:

```ts
import { createSuccessFixture, createDenyFixture } from '@appspine/oidc-delegation/testing';
import { OidcDelegationService } from '@appspine/oidc-delegation';

const service = new OidcDelegationService(moduleOptions, { provider: createSuccessFixture() });
```

Available fixtures: `createSuccessFixture`, `createDenyFixture(category)`,
`createTimeoutFixture`, `createMalformedFixture`. Each returns a `FakeOidcDelegationProvider`
whose `.calls` array records every exchange attempt, for asserting on what was actually sent.

## Security model (summary — see the plan doc for full detail)

- **Callers cannot choose the source client, audience, or scopes per call.** Those come only
  from server-side module configuration and the named policy. `exchange({subjectToken, policy})`
  is the entire public input surface.
- **The subject token must be this request's own, already-verified bearer.** Before any
  provider call, this package decodes (not verifies) the subject token and rejects it if its
  `azp`/`client_id` claim doesn't match this app's configured `subjectTokenIssuerClientId`
  (**not** `sourceClientId` — those are deliberately different clients, see "Configure"
  above). This is a mandatory control, not optional defense-in-depth — real testing against
  Keycloak (see the plan doc's
  T-16610 evidence) found that Keycloak's own audience-based protection does **not** reliably
  stop a token issued by a *different* app from being exchanged, once that app's own token
  audience has been widened by unrelated realm configuration. This package's own check is what
  actually stops that.
- **Access-token-only response contract.** The provider response must identify
  `issued_token_type` as an OAuth access token, use Bearer `token_type`, contain an integer
  `expires_in`, and omit `refresh_token`. The returned lifetime must not exceed the selected
  policy's `maxExpiresInSeconds`; any mismatch fails closed and no token is returned.
- **No provider error is ever passed through verbatim.** Errors are normalized into one of six
  categories (`invalid_subject_token`, `policy_not_found`, `policy_violation`,
  `exchange_denied`, `provider_unavailable`, `malformed_provider_response`) — branch on
  `error.category`, not `error.message`, which is for logs only.
- **Nothing sensitive is ever logged.** Log events are a fixed shape
  (`provider`/`policy`/`category`/`latencyMs`/`correlationId`) — there is no code path that can
  interpolate a token, secret, or claim into a log line, because the logger interface simply
  never receives one.

## Transport assumption

This package assumes the network between the source app and the target app (e.g. Wiki backend
↔ Approve backend) is trusted or encrypted (TLS, service mesh mTLS, or equivalent). It does not
add transport-level protection of its own — see "Residual risk" below.

## Adding a new delegation policy

The first version ships with exactly one policy per deployment (e.g.
`submit-knowledge-document-change`). To add another (for example, a future `withdraw` action):

1. Pick a delegation scope name in the `<targetApp>:<resource>:<action>` namespace (e.g.
   `approve:knowledge-document-change:withdraw`) — see
   [042-oidc-delegation-package-plan.md](../../../knowledge/decisions/042-oidc-delegation-package-plan.md)
   §2 decision 15.
2. On the IdP side, add that scope as an optional client scope on the source's delegation
   client, with a hardcoded audience mapper (not `fullScopeAllowed`/audience-resolve) — see
   `dev-infra/README.md`'s "`wiki` → `approve` OIDC delegation" section for the exact steps used
   for the first policy.
3. Add a new entry to this module's `policies` map with the new `targetAudience`,
   `requestedScopes`, and `maxExpiresInSeconds`.
4. On the target app, add a matching `@appspine/auth` `DelegatedOidcTrustProfile` entry with the
   same scope in its `requiredScopes` — see that package's README for the inbound side,
   including how to enable/disable a delegated profile per endpoint.

## Outbound throttling

Every `exchange()` call is rate-limited per policy (`maxExchangesPerMinutePerPolicy`, default
60/min) and backed by a simple circuit breaker: after 5 consecutive provider failures, further
calls fail immediately with `provider_unavailable` for 30 seconds without hitting the network.
Circuit state is isolated per policy, a rejected call while open does not extend the cooldown,
and a successful provider call resets that policy's failure count. This exists so a
business-layer retry loop (or an attacker) can't hammer the IdP's token endpoint hard enough
to trip its own brute-force protection and lock out normal logins for everyone.

## Secret rotation

`sourceClientSecret` is read once at module init from whatever you pass into `forRoot()` —
typically an environment variable. Rotating it means updating that value and restarting the
process; this package does not cache or persist it anywhere beyond the running process's
memory.

## Residual risk

A delegated access token is a bearer token like any other: if it leaks within its (short) TTL,
it can be replayed by whoever holds it, audience-restricted to the target app. This package
minimizes exposure by enforcing each policy's configured maximum TTL, rejecting a provider
that issues a longer-lived token, avoiding caches, and never logging tokens. There is no
implicit TTL default: the IdP client and `maxExpiresInSeconds` must be configured to agree.
DPoP or mTLS sender-constrained tokens would further reduce replay risk, but are out of scope
for this version. This package also assumes the network between your app and the target app is
trusted or encrypted (TLS/service mesh) — it does not add transport-level protection of its
own.

## What this package will refuse to do

- Accept `sourceApp`, a raw audience, or raw scopes as call-site parameters.
- Exchange a token whose `azp`/`client_id` doesn't match this app's configured
  `subjectTokenIssuerClientId`.
- Return a response that includes a refresh token.
- Request `offline_access` from a delegation policy.
- Return a provider token whose lifetime exceeds the selected policy maximum.
- Retry a failed exchange internally, or exceed the configured per-policy rate limit.
