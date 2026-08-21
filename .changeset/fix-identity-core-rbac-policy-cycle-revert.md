---
"@appspine/identity-core": patch
"@appspine/oidc-auth": patch
---

Revert 3.0.1's fix for `findWithRolesById`/`findWithRolesByEmail` always returning `roles: []`:
declaring `appspine.rbac-policy` in `identity-core`'s manifest creates a genuine dependency cycle
(`rbac` itself requires `appspine.identity-store`), which the plugin resolver correctly refuses to
build (`appspine build` fails with `dependency-cycle`) -- it was never a safe fix. `identity-core`
now stays as it was before 3.0.1 (never declaring `rbac-policy`, so those two methods keep returning
`roles: []`, same as always), and `@appspine/oidc-auth`'s `JwtVerifierService` -- the only real
caller -- looks roles up itself via its own already-cycle-free `rbac-policy` dependency instead of
relying on `identity-core` to have populated them.
