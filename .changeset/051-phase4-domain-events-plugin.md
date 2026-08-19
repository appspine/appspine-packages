---
'@appspine/domain-events': minor
'@appspine/plugin-api': patch
'@appspine/plugin-host-nest': patch
'@appspine/m2m-api-key': patch
---

Migrate Domain Events capability package to full plugin model (051 PL4-05).

- `@appspine/domain-events`: declare all 5 facets (backend, frontend, prisma, permissions, operations) in `appspine.plugin.json` and `./plugin`; create `prisma/domain-events.prisma` schema fragment and compute LF-normalized sha256 digest; implement `DomainEventsAdminGuard` injecting `@appspine/plugin-api`'s `SCOPE_MATCHER` port; refactor `DomainEventsAdminController` to use neutral `AppspineAuthGuard` and `DomainEventsAdminGuard` with strict fail-closed authorization; introduce `DomainEventsModule` standard capability module providing `DomainEventRegistry`, `DomainEventsService`, `DOMAIN_EVENTS` token, and `DomainEventDispatcherService`; decouple `DomainEventsAdminModule` and dependencies/tsconfig references from concrete `@appspine/auth` and `@appspine/m2m-api-key`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
- `@appspine/plugin-api`: add `DomainEventsPort` and `RecordDomainEventPortInput` interfaces to `./ports`.
- `@appspine/plugin-host-nest`: decorate `AppspineAuthInfrastructureModule` with `@Global()` for clean application-wide authentication provider and guard resolution.
- `@appspine/m2m-api-key`: mark `IDENTITY_STORE` injection as optional in `ApiKeysService` to support graceful bootstrapping in decoupled host environments.
