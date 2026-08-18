---
'@appspine/plugin-cli': minor
---

Generate `.appspine/generated/backend/composition.ts` (051 PL2-05).

The one thing this generator exists to guarantee is **static imports**. 051 plan §6.4 and §9 both
forbid resolving a package name at runtime, and the reason is not stylistic: a dynamic import is
invisible to the bundler, to TypeScript and to a dependency scanner — the three readers this file is
written for. Every plugin the App runs appears as a real `import` statement, in resolved
registration order, deduplicated so a multi-instance plugin is one import and several entries.

It emits TypeScript rather than JSON because the App compiles it: a wrong export name fails the
build loudly instead of at boot. PL1-03 froze `GeneratedComposition` before this generator existed,
so the host has had a working consumer of the shape the whole time.

The import name is a convention (`health-check` → `healthCheckPlugin`), which makes it only as good
as its enforcement — so `051-pl1-architecture-check.mjs` now asserts that every package with a
manifest exports exactly that name from its `./plugin` subpath. A violation fails in the package
that caused it rather than in some consumer's build days later.

A disabled plugin is dropped from the imports, so it cannot reach the bundle, but stays in the
inventory the file embeds, so the catalog can still report it as disabled.
