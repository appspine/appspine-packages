# 051 PL1-14 — clean consumer

Proves the Phase 1 packages work **as published**, not as workspace links.

`node scripts/051-pl1-clean-consumer.mjs` (or `pnpm run verify:phase1`) does the whole thing:

1. `pnpm pack` each package — `pnpm`, not `npm`, because it rewrites `workspace:*` to the concrete
   version exactly as publishing does;
2. materialise a throwaway consumer in the OS temp directory, with npm `overrides` pinning every
   transitive `@appspine/*` resolution to those tarballs, so nothing is fetched from a registry;
3. `npm install --ignore-scripts` (051 plan §9: a plugin must not run install hooks) and then an
   explicit `prisma generate` against `prisma/schema.prisma`;
4. assert `npm ls` contains no symlinked dependency — a single link would invalidate everything
   below it;
5. run `consumer.mjs`.

`consumer.mjs` checks, in order:

- every published entry point resolves from **both** CJS `require` and ESM `import`, including the
  `./loader`, `./resolver`, `./runtime`, `./schema` and `./plugin` subpaths;
- every plugin tarball actually contains `appspine.plugin.json` and its declared Prisma fragment,
  and the manifest passes the real loader against the installed framework versions;
- a `.d.ts` exists beside every resolved entry point;
- a real Nest application boots in **plugin mode** through `createAppspineModule()` with all four
  pilots, produces the expected registration and shutdown order, reports `ready`, and shows OIDC
  registered as the single interactive strategy;
- composition of a plugin whose required capability is absent fails before Nest starts;
- the legacy **`@appspine/auth` wiring** still boots and still exposes its pre-split surface.

## Why a hand-written schema

`prisma/schema.prisma` is assembled by hand from the plugins' fragments plus the RBAC/API-key
relations that `identity-core` deliberately does not declare (PL0-04 §2). PL2-06's composer
generates this; until it exists, the fixture keeps its own copy and the plugin specs assert each
fragment's digest separately.

## Not covered here

Frontend facets (Phase 3), the plugin lockfile (PL2-04) and generated composition (PL2-05) have no
implementation yet, so this fixture wires plugins by hand the way `appspine.config.ts` will.
