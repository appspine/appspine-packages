---
"@appspine/m2m-api-key": minor
---

Add the `@appspine/m2m-api-key` package: `ApiKeyGuard` (hashed-key lookup, rate limiting, scope/role attachment to `request.user`), `JwtOrApiKeyGuard` (API key first, falls back to JWT), `ScopeGuard` (`resource:action` scope matching, JWT users unrestricted), `Scopes` decorator, and `ApiKeysService`/`ApiKeysController` (ADMIN-only key CRUD). Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`.

Scope validation on create/update is format-only (`resource:read|write|*` or `*`) for now — cross-referencing against the app's real scope catalog is deferred until `@appspine/metadata-schema` exists, to avoid a forward dependency.
