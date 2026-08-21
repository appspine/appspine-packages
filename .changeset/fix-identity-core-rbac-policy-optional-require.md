---
"@appspine/identity-core": patch
---

Fix `findWithRolesById`/`findWithRolesByEmail` silently returning `roles: []` for every user
regardless of their actual database role assignments. `IdentityStoreService` has always injected
`RBAC_POLICY` as `@Optional()`, relying on `RbacModule` being `@Global()` for that injection to
resolve to a real instance. Now that `RbacModule` is no longer global (v3 legacy-removal), the
capability must be declared in `identity-core`'s manifest so the plugin host wires `RbacModule`
into `IdentityCoreModule`'s imports the same way `@appspine/oidc-auth` and `@appspine/m2m-api-key`
already do — this was the one package that never declared it.
