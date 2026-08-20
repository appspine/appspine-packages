---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z10 - `@appspine/mcp-server` transitive dependency version mismatch

## Context

While starting `_archive/dev_docs-20260803/app-wiki/011-task-breakdown.md` T-1200 (registering wiki's first MCP tools), after
upgrading `apps/wiki/backend/package.json`'s `@appspine/mcp-server` to `^0.2.2` (Z08's fix), the
backend crashed on boot — before any of the new MCP tool code was even involved.

## Finding

```
UnknownDependenciesException: Nest can't resolve dependencies of the ApiKeyGuard (PrismaService, ?).
Please make sure that the argument ApiKeyRateLimiter at index [1] is available in the McpModule module.
```

Root cause: the exact same class of bug as `_archive/dev_docs-20260803/app-template/Z05-template-common-singleton-override.md`
and `_archive/dev_docs-20260803/framework/Z07-common-version-cascade-gap.md`, this time hitting `@appspine/m2m-api-key`
instead of `@appspine/common`. Wiki's `backend/package.json` declared `"@appspine/m2m-api-key": "^1.0.0"`
(resolving to the exact `1.0.0` published during 010), while `@appspine/mcp-server@0.2.2` depends on
`@appspine/m2m-api-key@1.0.1` (published during the Z07 cascade fix — `@appspine/mcp-server` itself
transitively depends on `@appspine/auth`/`@appspine/m2m-api-key`, so its own dependency range moved
forward when those were patched). pnpm therefore installed **two separate copies** of
`@appspine/m2m-api-key` in `node_modules`: wiki's direct `1.0.0` and mcp-server's transitive `1.0.1`.
`McpController`'s `@UseGuards(ApiKeyGuard)` resolved to the `1.0.1` copy's `ApiKeyGuard` class, but
wiki's `app.module.ts` only ever imported `ApiKeysModule` from the `1.0.0` copy (via its own direct
dependency), which registers *that* copy's `ApiKeyRateLimiter` as a global provider — a different class
identity than the one the `1.0.1` `ApiKeyGuard` asks for. NestJS DI does exact class-reference matching,
so the two never matched.

Confirmed this was independent of the new MCP tool code (temporarily removed `SpacesMcpTools`/
`PagesMcpTools` from their modules and rebuilt — the same crash occurred, since it's triggered purely
by the mismatched dependency graph the moment `McpModule`'s controller is instantiated at bootstrap,
which happens regardless of whether any tools are registered).

Verified duplicate packages directly:

```powershell
Get-ChildItem "apps/wiki/node_modules/.pnpm" -Filter "@appspine+m2m-api-key@*"
# @appspine+m2m-api-key@0.1.3_...  (stale)
# @appspine+m2m-api-key@1.0.0_...  (wiki's direct dependency)
# @appspine+m2m-api-key@1.0.1_...  (mcp-server's transitive dependency)
```

## Resolution

Bumped every `@appspine/*` framework package in `apps/wiki/backend/package.json` up to the versions
the Z07 cascade fix actually published, not just `@appspine/mcp-server`:

| Package | Before | After |
|---|---|---|
| `@appspine/auth` | `^1.0.0` (1.0.0) | `^1.0.1` |
| `@appspine/m2m-api-key` | `^1.0.0` (1.0.0) | `^1.0.1` |
| `@appspine/rbac` | `^1.0.0` (1.0.0) | `^1.0.1` |
| `@appspine/health-check` | `^0.1.0` (0.1.1) | `^0.1.2` |
| `@appspine/metadata-schema` | `^0.2.1` (0.2.1) | `^0.2.2` |
| `@appspine/mcp-server` | already `^0.2.2` | unchanged |
| `@appspine/common`, `@appspine/audit-log` | already current | unchanged |

After `pnpm install`, both wiki's direct dependency and `@appspine/mcp-server`'s transitive dependency
on `@appspine/m2m-api-key` resolve to the same `1.0.1`, and the backend boots cleanly
(`GET /mcp/health` → `toolCount: 8`).

## Lesson (extends Z07's)

Z07 already noted that bumping a foundational shared package (there: `@appspine/common`) without
letting every dependent package's own version follow leaves stale transitive pins around. This
confirms the failure mode isn't limited to the package that was directly bumped — **any consumer app
that later adds a dependency on one of the newly-republished packages** (here, wiki adding
`@appspine/mcp-server@0.2.2`, which itself depends on the newly-republished `@appspine/auth`/
`@appspine/m2m-api-key`) can reintroduce the same duplicate-class-token crash if the consumer's *other*
direct dependencies on the same packages haven't been bumped in lockstep. Whenever bumping one
`@appspine/*` package in a consumer app's `package.json`, check whether that package's own
`peerDependencies`/`dependencies` moved forward past what the app's other direct `@appspine/*`
dependencies declare, and bump those together in the same change — don't bump one package in
isolation and assume `pnpm install` will surface the mismatch loudly (it silently installs both copies;
the failure only surfaces at NestJS DI resolution time, not at install time).

## Verification

```powershell
pnpm -C apps/wiki/backend typecheck   # passes
pnpm -C apps/wiki/backend build        # passes
node apps/wiki/backend/dist/src/main.js
# GET /health -> 200
# GET /mcp/health -> {"status":"ok","toolCount":8}
```

## Follow-up

None — this was resolved entirely within the wiki app repo (dependency version bump), no framework
package changes needed this time.

