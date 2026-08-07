# @appspine/auth

OIDC-only authentication for appspine backends (dev_docs/framework/035): verifies a Keycloak
access token, maps the verified identity to a local `User`, and exposes `@CurrentUser()` /
`JwtAuthGuard` / `AdminGuard` for the rest of the app to consume.

## General login (`AuthModule`)

`AuthModule` is `@Global()` and reads its configuration from environment variables
(`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`) — every consuming app already imports it once
and gets `JwtAuthGuard`, `AdminGuard`, `@CurrentUser()`, and `UsersService` everywhere. This is
the existing general-login path. It now requires `email_verified === true` before using an
email for identity mapping, and every successful JIT-created `User` gets a non-blocking audit
record. Delegated-token acceptance still requires explicitly opting into `DelegatedAuthModule`
(see below).

## Delegated (Token Exchange) inbound trust profile (042)

For [[042-oidc-delegation-package-plan]]: an **independent, endpoint-scoped** module for
verifying delegated access tokens minted via `@appspine/oidc-delegation`'s Token Exchange —
e.g. a request from Wiki, acting on behalf of a signed-in user, calling Approve. This is a
completely separate trust profile from general login:

- `DelegatedAuthModule` does not modify `AuthModule` or `OidcStrategy` in any way. A consumer
  that never imports it sees zero change in behavior or startup requirements.
- A delegated token is **only** accepted on an endpoint explicitly decorated with
  `@DelegatedProfile('profile-name')` — there is no global switch to accept delegated tokens
  everywhere, by design.
- The same delegated token is rejected by every other endpoint, including the general
  `/auth/me` — general login's `azp === OIDC_AUDIENCE` check is untouched and still runs on its
  own path.

### Configure

```ts
import { AuthModule, DelegatedAuthModule } from '@appspine/auth';

@Module({
  imports: [
    AuthModule, // unchanged
    DelegatedAuthModule.forFeature({
      profiles: {
        'submit-knowledge-document-change': {
          expectedIssuer: process.env.OIDC_ISSUER,
          requiredAudience: 'approve',
          additionalAllowedAudiences: [],
          allowedClientIds: ['wiki-delegation'],
          requiredScopes: ['approve:knowledge-document-change:submit'],
          delegationScopeNamespace: 'approve:',
          maxTokenAgeSeconds: 120,
          clockToleranceSeconds: 10,
          provisioning: 'never', // see below — do not change this without reading why
        },
      },
    }),
  ],
})
export class AppModule {}
```

Profiles are validated and copied immutably at module startup. `expectedIssuer` and
`OIDC_JWKS_URL` must use HTTPS. An isolated local environment using HTTP must opt in explicitly
with `allowInsecureHttp: true` on every configured delegated profile; this flag must not be set
in production. Missing/empty arrays, duplicate entries, malformed scope namespaces, unsafe
time bounds, or a missing JWKS URL stop the app at boot.

### Use

```ts
import { CurrentDelegatedUser, CurrentUser, DelegatedAuthGuard, DelegatedProfile } from '@appspine/auth';

@DelegatedProfile('submit-knowledge-document-change')
@UseGuards(DelegatedAuthGuard, PermissionGuard) // AND-composed — see "Guard composition" below
@Post('knowledge-document-change-requests')
submit(
  @CurrentUser() user: JwtUser, // same shape/decorator as general login — target app's local User
  @CurrentDelegatedUser() delegation: DelegationContext | undefined, // issuer/externalSubject/sourceClientId/audience/scopes, for audit only
) {
  /* business logic — not part of this package */
}
```

`DelegatedAuthGuard` populates `request.user` with a normal `JwtUser` (same shape general login
produces), so every existing consumer of `@CurrentUser()`, `PermissionGuard`,
`resolveActingUserId()`, and audit helpers keeps working unmodified. The delegation-specific
metadata (issuer, externalSubject, sourceClientId, audience, scopes) is attached separately as
`request.delegationContext`, readable via `@CurrentDelegatedUser()` — this is additive and never
changes what `@CurrentUser()` returns.

### `provisioning: 'never'` vs `'jit'`

- **`'never'` (default, and what you should use unless you have a specific reason not to):**
  only looks up an existing local `User` by the delegated token's verified email. If none
  exists, the request is rejected with a generic 401 and **no row is created**. This is the
  actual mechanism behind "a user who only has Wiki access can't do anything in Approve via
  delegation" — general login is gated by Keycloak per-client access checks that the delegated
  path bypasses entirely, so this package must not silently JIT-provision a local account for
  someone who was never granted access to this app.
- **`'jit'`:** opts into the same just-in-time provisioning general login uses. Only choose this
  if the endpoint's own access model genuinely tolerates a delegated caller getting a fresh
  local account on first use. A successful account creation writes the same non-blocking
  `User`/`CREATE` audit event as general-login JIT provisioning.

### Guard composition — do not add to `JwtOrApiKeyGuard`'s OR-chain

`@appspine/m2m-api-key`'s `JwtOrApiKeyGuard` is an OR-composed guard (API key OR general JWT).
`DelegatedAuthGuard` must be composed as an **independent, AND-style guard**
(`@UseGuards(DelegatedAuthGuard, PermissionGuard)`), never folded into that OR-chain — doing so
would risk an endpoint silently accepting a delegated token nobody intended it to accept. Every
delegated endpoint must carry `@DelegatedProfile()` explicitly; `DelegatedAuthGuard` throws
immediately on any handler that doesn't.

### Error semantics

- Missing/malformed token, bad signature, wrong issuer/audience/client/scope, expired/future
  token, and "no local account" (`provisioning: 'never'`) **all produce the same opaque 401**
  (`Invalid delegated token`) — the underlying reason is only visible in server-side logs, never
  in the HTTP response, so this package can't be used to probe which emails have a local
  account here.
- A local account that exists but lacks the required permission produces a normal **403** from
  your own `PermissionGuard` — that's a different, later check this package doesn't perform.
- Rejections are logged server-side with only the profile and a bounded, de-identified category
  (`token_rejected`, `identity_mapping_failed`, or `internal_error`). Each profile/category
  bucket emits at most 20 detail events per minute plus one suppressed-count summary; underlying
  exception messages, tokens, email addresses, secrets, and claims are never logged.

### Emergency disable

There is deliberately no global "disable delegated auth" flag — remove the offending
endpoint's `@DelegatedProfile()`/`DelegatedAuthGuard` and redeploy. If you need to disable
*all* delegated endpoints in an app at once in an emergency, stop importing
`DelegatedAuthModule.forFeature(...)` from `AppModule` and redeploy; every endpoint that had a
delegated profile will then fail to boot (fail-fast, not fail-open) until it's either
reconfigured or its decorator is removed.

### Adding a second delegated policy

See `@appspine/oidc-delegation`'s README ("Adding a new delegation policy") for the full
end-to-end steps (IdP-side scope + client scope, outbound policy, then the matching
`DelegatedOidcTrustProfile` entry described here).
