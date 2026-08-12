# @appspine/oidc-delegation

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
