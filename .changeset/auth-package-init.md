---
"@appspine/auth": minor
---

Add the `@appspine/auth` package: `LocalStrategy`/`OidcStrategy` passport strategies, an `AUTH_MODE`-aware `JwtAuthGuard`, `AdminGuard`, `AuthController` (register/login/me), and `UsersService`/`UsersController`. Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`, with the OIDC permission gap resolved (looks up local RBAC grants by email) and the `/auth/me` guard fixed to match the active `AUTH_MODE`.
