---
'@appspine/rbac': minor
---

Migrate RBAC capability package to full plugin model (051 PL4-02).

- `@appspine/rbac`: declare backend (with `@Global()` compatibility bridge for Phase 4 transition), frontend, prisma, and permissions facets in `appspine.plugin.json` and `./plugin`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`); expand `./plugin` re-exports with stable authorization tokens (`RBAC_POLICY`, `SYSTEM_ADMIN_ROLE`, `SYSTEM_USER_ROLE`), ports (`RbacPolicyPort`, `RoleGrant`, `PrincipalAuthorization`), guards, and services.
