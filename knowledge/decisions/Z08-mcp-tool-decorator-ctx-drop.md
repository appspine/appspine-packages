---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z08 - `registerMcpToolsFromInstance()` dropped `McpCallContext`
> 註：本檔編號與 app-calendar 的 Z08 衝突，屬 framework 之獨立記錄。

## Context

While starting `_archive/dev_docs-20260803/app-wiki/011-task-breakdown.md` Group K (MCP tool registration), before writing wiki's
`@McpTool()`-decorated methods, checked `@appspine/mcp-server`'s actual tool-registration wiring to
confirm `ctx.actingUserId` (added in Group 0, T-1090/T-1091) would actually reach a tool method's
handler body.

## Finding

`McpService.createServer()` (`packages/mcp-server/src/mcp.service.ts`) correctly calls
`tool.handler(args, ctx)` for every registered tool. But `registerMcpToolsFromInstance()`
(`packages/mcp-server/src/mcp-tool.decorator.ts`) — the helper apps use to turn `@McpTool()`-decorated
service methods into registry entries — built its `handler` as:

```ts
handler: (args: unknown) =>
  (method as (args: unknown) => Promise<unknown>).call(instance, args),
```

This silently drops the `ctx` argument before it ever reaches the decorated method. Any app using
`@McpTool()` + `registerMcpToolsFromInstance()` (the documented, intended registration path — see
`_archive/dev_docs-20260803/framework/002-app-dev-conventions.md` CRUD step 3) had no way to read `ctx.actingUserId` inside a tool
handler, which defeats the entire point of the Group 0 fix: the acting-user id would be present on
`ctx` but structurally unreachable from application code.

No app in the workspace had registered any MCP tools yet (`grep -rn "registerMcpToolsFromInstance|@McpTool("`
across `appspine`, `appspine-app-template`, and `apps/` matched only `dev_docs/*.md`), so this had no
live consumer to break — it was caught before it could cause a production failure.

## Resolution

Changed the generated handler to forward both arguments:

```ts
handler: (args: unknown, ctx: McpCallContext) =>
  (method as (args: unknown, ctx: McpCallContext) => Promise<unknown>).call(instance, args, ctx),
```

Added `packages/mcp-server/src/mcp-tool.decorator.spec.ts` asserting a decorated method receives both
`args` and `ctx` unchanged when invoked through the registry. Released as `@appspine/mcp-server@0.2.2`
(patch — internal wiring fix, `McpToolOptions`/`@McpTool()` public API unchanged).

## Verification

```powershell
pnpm -C appspine typecheck   # all packages pass
pnpm -C appspine build       # all packages pass
pnpm -C appspine test        # mcp-server: 2 existing + 1 new test, all pass
pnpm -C appspine exec biome check packages/mcp-server/src/mcp-tool.decorator.ts packages/mcp-server/src/mcp-tool.decorator.spec.ts
```

## Follow-up

- Needs `pnpm release` (human with `GITHUB_TOKEN`) to actually publish, same as Z07.
- `apps/wiki/backend/package.json` needs to consume `@appspine/mcp-server@^0.2.2` (or later) before
  `_archive/dev_docs-20260803/app-wiki/011-task-breakdown.md` T-1200/T-1201 register any tools — tracked as part of continuing
  011 execution, not a separate action item.

