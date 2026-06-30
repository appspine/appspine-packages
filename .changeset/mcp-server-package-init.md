---
"@appspine/mcp-server": minor
---

Add the `@appspine/mcp-server` package: `@McpTool()` decorator + `registerMcpToolsFromInstance()` for app-defined tool registration, `McpToolRegistry` (scope-filtered tool lookup), `McpService` (Streamable HTTP transport via the official `@modelcontextprotocol/sdk`), and `McpController` (`POST /mcp` gated by `ApiKeyGuard`, `GET /mcp/health`). Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`.

The auto-CRUD-tool-generation layer (`CrudToolFactory`/`CrudExecutor`, DMMF-driven `list_*`/`get_*`/etc. tools) is not included — `dev_docs/001` is explicit that tool generation is by-app, not framework-default, so `McpToolRegistry` only exposes `registerTool()`/`listTools()` with no auto-seeding step.
