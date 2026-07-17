---
"@appspine/domain-events": patch
---

Guard `DomainEventDispatcherService`'s completion writes (PROCESSED/IGNORED/DEAD_LETTER/PENDING) on the delivery still being `PROCESSING`, using `updateMany` instead of an unconditional `update` by id. Closes a race where an admin action (retry/ignore) that reassigns a delivery mid-flight could get silently clobbered by the worker's own completion write once its handler settled — the same defense apps/approve's admin service already applies on its side of this race.

Fixes `@appspine/domain-events/testing` failing to resolve for consumers whose `tsconfig.json` uses classic (`node`/`node10`) `moduleResolution`, which never consults `package.json`'s `exports` map. Adds root-level `testing.js`/`testing.d.ts` shim files (re-exporting `./dist/testing`) so that resolution strategy finds the subpath directly, alongside the existing `exports` entry that already serves modern resolvers.
