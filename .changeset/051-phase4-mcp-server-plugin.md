---
'@appspine/mcp-server': minor
'@appspine/plugin-api': patch
---

Migrate Model Context Protocol Server capability package to full plugin model (051 PL4-06).

- `@appspine/mcp-server`: declare backend (`global: true` compatibility bridge) and operations facets in `appspine.plugin.json` and `./plugin`; retain `@Global()` on `McpModule` during Phase 4 transition for downstream `*.mcp.ts` feature module compatibility; bind and export `MCP_TOOLS` token; refactor `McpToolRegistry` to implement `McpToolsPort` and inject `@appspine/plugin-api`'s `SCOPE_MATCHER` port with fallback matching; refactor `McpController` to use neutral `MachineAuthGuard` and propagate `Principal` / `MachinePrincipal` acting user context into `McpCallContext`; introduce package-local `extractWorkflowId` and remove direct dependencies on `@appspine/m2m-api-key` and `@appspine/audit-log`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
- `@appspine/plugin-api`: add `McpToolsPort`, `McpToolDefinitionPort`, and `McpCatalogEntryPort` interfaces to `./ports`.
