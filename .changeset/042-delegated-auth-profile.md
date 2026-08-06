---
"@appspine/auth": minor
---

Add an independent, endpoint-scoped delegated (Token Exchange) inbound trust profile for
042-oidc-delegation-package-plan.md — a target app (e.g. Approve) can now accept a short-lived
delegated access token minted by `@appspine/oidc-delegation` on behalf of the original
end user, in addition to that user's own tokens.

- **Purely additive.** `AuthModule` and `OidcStrategy` are unchanged; a consumer that never
  imports `DelegatedAuthModule` sees no behavior or startup change. Requires Keycloak 26.2+
  (Standard Token Exchange V2) on the source app's side; this package only verifies tokens,
  it doesn't require any Keycloak version itself.
- **Endpoint-scoped, not global.** A delegated token is only accepted on a handler explicitly
  decorated with `@DelegatedProfile('profile-name')`; there is no app-wide switch. The same
  token is rejected by every other endpoint, including general login's own `/auth/me`.
- **No caller-controlled trust parameters.** Which source clients, audiences, and scopes are
  accepted comes entirely from the `DelegatedOidcTrustProfile` you configure server-side —
  never from the request.
- **`provisioning: 'never'` by default.** A delegated caller with no matching local `User` is
  rejected with a generic 401 and no row is created — delegated auth bypasses the per-client
  IdP access check general login relies on, so it must not silently provision an account for
  someone never granted access to this app.
- **No refresh tokens, no token cache** on the inbound side (nothing to cache — every request
  is verified fresh). Residual bearer-token risk (replay within the token's short TTL if
  intercepted) is unchanged from general OIDC bearer tokens and is documented in
  `@appspine/oidc-delegation`'s README, which mints these tokens.

See `packages/auth/README.md` ("Delegated (Token Exchange) inbound trust profile") for
configuration, the `provisioning: 'never'` vs `'jit'` tradeoff, Guard composition guidance
(do not fold into `@appspine/m2m-api-key`'s `JwtOrApiKeyGuard`), and the emergency-disable
procedure.
