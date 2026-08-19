---
'@appspine/m2m-api-key': minor
---

Migrate Machine-to-Machine API Keys capability package to full plugin model (051 PL4-03).

- `@appspine/m2m-api-key`: implement `ApiKeyMachineStrategy` satisfying host `AuthenticationStrategy` and register with `AuthenticationStrategyRegistry` on module init; implement `ScopeMatcherService` and export `SCOPE_MATCHER` token; declare backend (with `@Global()` compatibility bridge for Phase 4 transition), frontend, prisma, and permissions facets in `appspine.plugin.json` and `./plugin`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`); mark `JwtOrApiKeyGuard` as deprecated in favor of host neutral `AppspineAuthGuard`.
