---
"@appspine/auth": patch
---

Fix `AuthModule` crashing on boot under `AUTH_MODE=local`: both `LocalStrategy` and `OidcStrategy` were unconditionally registered as providers, but `OidcStrategy`'s constructor eagerly validates `OIDC_JWKS_URL` via `jwks-rsa`, which throws synchronously if it's unset — the common case when running in local mode. Only the strategy matching `AUTH_MODE` is now registered.

Caught by actually booting `appspine-app-template`'s backend against a real Postgres instance after wiring in the `@appspine/*` packages, not just typecheck/lint.
