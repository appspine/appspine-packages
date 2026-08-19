# @appspine/oidc-delegation

## 0.4.0

### Minor Changes

- fdff215: Migrate OIDC Token Delegation capability/connector package to plugin model (051 PL4-07).

  - `@appspine/oidc-delegation`: declare backend and operations facets, `configSchema`, environment variable specifications with secret redaction for `OIDC_DELEGATION_SOURCE_CLIENT_SECRET`, and integration contract references in `appspine.plugin.json` and `./plugin`; expose plugin descriptor `oidcDelegationPlugin` and helper `oidcDelegation()`; implement `IdentityDelegationPort` on `OidcDelegationService`; export `IDENTITY_DELEGATION` token (`Symbol.for('appspine.identity-delegation')`) from `OidcDelegationModule.forRoot()`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `IdentityDelegationPort`, `ExchangeDelegatedTokenPortInput`, `DelegatedAccessTokenResult` to `./ports` and `DelegatedPrincipalContext` to `./principal`.

### Patch Changes

- Updated dependencies [4c0ce5f]
- Updated dependencies [8e67a05]
- Updated dependencies [b75516d]
- Updated dependencies [b92c1c3]
- Updated dependencies [0eaf69d]
- Updated dependencies [9cd2838]
- Updated dependencies [a41aab9]
- Updated dependencies [aeb861d]
- Updated dependencies [96f92e8]
- Updated dependencies [fdff215]
  - @appspine/plugin-api@1.1.0

## 0.3.1

### Patch Changes

- Prevent token-exchange credentials from following redirects and classify non-JSON provider 5xx
  responses as retryable provider outages.

## 0.3.0

### Minor Changes

- 85ef582: Harden OIDC delegation configuration and token validation. Delegation now requires secure
  issuer, JWKS, and token endpoint URLs unless HTTP is explicitly enabled for isolated
  development; validates policy/profile bounds and immutable configuration; enforces provider
  access-token type and policy TTL; isolates circuit breakers per policy; and bounds inbound
  security rejection logs.

  Treat missing `email_verified` as unverified, reject future-issued delegated tokens, accept the
  RFC 9068 `at+jwt` JOSE type, default delegated provisioning to `never`, and audit successful JIT
  user creation without making authentication depend on audit availability.

## 0.2.0

### Minor Changes

- 1e74af4: Fix a security-critical bug where the outbound subject-token sanity check compared the
  subject token's `azp`/`client_id` against `sourceClientId` (the token-exchange-only client,
  e.g. `wiki-delegation`) instead of the actual client that issued the subject token
  (e.g. `wiki`). With the previous behavior, every real delegation exchange failed closed
  with `invalid_subject_token`, because a real subject token is always issued by the login
  client, never by the exchange-only client.

  **Breaking change**: `OidcDelegationModuleOptions` now requires a new field,
  `subjectTokenIssuerClientId` — the client ID that actually issues the subject token
  being exchanged (e.g. `wiki`), which is distinct from `sourceClientId` (the
  token-exchange-only client, e.g. `wiki-delegation`). Existing consumers must add this
  field to their module options.

  Note: this bump is tagged `minor` (not `major`) by convention for a pre-1.0 package
  (`0.1.0` → `0.2.0`) — `changesets` does not auto-adjust bump digits for 0.x versions, so a
  `major` tag here would have produced `1.0.0` instead, which is not intended by this fix.
