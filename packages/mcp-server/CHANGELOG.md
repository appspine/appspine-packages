# @appspine/mcp-server

## 0.1.0

### Minor Changes

- 5e5f745: Add the `@appspine/mcp-server` package: `@McpTool()` decorator + `registerMcpToolsFromInstance()` for app-defined tool registration, `McpToolRegistry` (scope-filtered tool lookup), `McpService` (Streamable HTTP transport via the official `@modelcontextprotocol/sdk`), and `McpController` (`POST /mcp` gated by `ApiKeyGuard`, `GET /mcp/health`). Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`.

  The auto-CRUD-tool-generation layer (`CrudToolFactory`/`CrudExecutor`, DMMF-driven `list_*`/`get_*`/etc. tools) is not included — `dev_docs/001` is explicit that tool generation is by-app, not framework-default, so `McpToolRegistry` only exposes `registerTool()`/`listTools()` with no auto-seeding step.

### Patch Changes

- Updated dependencies [ae73951]
- Updated dependencies [b742d53]
- Updated dependencies [7fe9011]
  - @appspine/auth@0.1.0
  - @appspine/m2m-api-key@0.1.0
