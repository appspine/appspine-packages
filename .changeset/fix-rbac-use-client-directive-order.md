---
"@appspine/rbac": patch
---

Fix `CreateRoleDialog` and `RoleRowActions` failing to render as Client Components in consuming Next.js
apps. `tsc`'s CommonJS emit prepends `"use strict";` ahead of any existing directive prologue, pushing
`'use client'` to the second line of the compiled file; Next.js's client-component detection only
recognizes the directive when it is the file's first line. Added a postbuild script
(`scripts/fix-use-client-directive.mjs`) that reorders the two directives in the compiled
`dist/frontend/*.js` output — safe because directive-prologue order doesn't affect strict-mode
activation, only which line is physically first.
