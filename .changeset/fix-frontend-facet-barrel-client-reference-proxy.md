---
"@appspine/rbac": patch
"@appspine/identity-core": patch
"@appspine/m2m-api-key": patch
"@appspine/domain-events": patch
"@appspine/notification": patch
"@appspine/oidc-auth": patch
---

Fix every `'use client'` component in a `*/frontend` facet resolving to `undefined` (`Element type is
invalid`) whenever a Server Component imports it -- `CreateRoleDialog`, `CreateUserDialog`,
`CreateApiKeyDialog`, `NotificationBell`, `LoginButton`, etc. TypeScript's CJS `export * from` compiles
to a `for...in` enumeration over the re-exported module; Next.js's RSC client-reference proxy (what a
`'use client'` module becomes when required from a Server Component) only implements property access
(`get`), not enumeration, so `for...in` silently copies zero properties from it. Both barrel layers
(`*/frontend/index.ts` and `*/frontend.ts`) now use explicit named exports, which compile to direct
property access and work correctly. `@appspine/oidc-auth` additionally stops relying on
`identity-core`'s `findWithRolesById`/`findWithRolesByEmail` for role data -- see the companion
`@appspine/identity-core` changeset for why those can never populate roles -- and looks roles up
through its own `rbac-policy` dependency instead.
