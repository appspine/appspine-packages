---
'@appspine/oidc-delegation': minor
'@appspine/plugin-api': patch
---

Migrate OIDC Token Delegation capability/connector package to plugin model (051 PL4-07).

- `@appspine/oidc-delegation`: declare backend and operations facets, `configSchema`, environment variable specifications with secret redaction for `OIDC_DELEGATION_SOURCE_CLIENT_SECRET`, and integration contract references in `appspine.plugin.json` and `./plugin`; expose plugin descriptor `oidcDelegationPlugin` and helper `oidcDelegation()`; implement `IdentityDelegationPort` on `OidcDelegationService`; export `IDENTITY_DELEGATION` token (`Symbol.for('appspine.identity-delegation')`) from `OidcDelegationModule.forRoot()`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
- `@appspine/plugin-api`: add `IdentityDelegationPort`, `ExchangeDelegatedTokenPortInput`, `DelegatedAccessTokenResult` to `./ports` and `DelegatedPrincipalContext` to `./principal`.
