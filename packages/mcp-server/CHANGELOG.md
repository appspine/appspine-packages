# @appspine/mcp-server

## 0.6.2

### Patch Changes

- Updated dependencies [11fac40]
  - @appspine/auth@6.0.0
  - @appspine/m2m-api-key@4.0.2

## 0.6.1

Republished as `0.6.1`: `0.6.0` was already occupied on the registry by an unrelated,
never-adopted pre-migration package (old `@modelcontextprotocol/sdk@^1.29.0`, published
weeks before this migration and never referenced by any app's dist-tag or lockfile) --
`changesets publish` correctly refused to overwrite it, so this content never actually
reached the registry under `0.6.0` despite `package.json`/this changelog briefly saying so.

### Minor Changes

- bb625e1: Fixes and adds MRTR support found missing by an adversarial review of the 038 SDK v2
  migration, on top of the `0.6.0-mcp-2026-07-28.0` canary.

  **Fixes:**

  - `structuredContent` is now exposed for any serializable tool result (object, array, or
    primitive), not just plain objects -- a tool declaring a non-object `outputSchema` (array,
    string, number) previously failed the SDK's own output validation on every successful call.
  - A tool result object containing a truthy `error` field is no longer specially discarded
    down to a bare "Unknown error" text; it's returned as ordinary `structuredContent` like any
    other shape a tool's `outputSchema` describes.
  - A void-returning tool now reports success with empty content text instead of the literal
    string `"undefined"`.
  - A thrown handler error is now logged server-side (tool name, message, stack) in addition to
    being returned to the caller, so an infra-level error (a stack trace, a DB host/user) is no
    longer invisible to this app's own logs while still reaching an external API-key holder.
  - `@McpTool`'s `requiredScopes` must now be declared explicitly (`[]` for an intentionally
    public tool) -- an omitted value used to silently default to `[]`, making a tool that simply
    forgot to declare its scopes callable by every API key regardless of what it actually holds.
  - `packages/mcp-server/spike` (a throwaway SDK compatibility harness with its own
    `node_modules`) no longer ships in the published tarball.

  **Reminder (introduced earlier in this canary line, `0.6.0-mcp-2026-07-28.0`, not new here):**
  `POST /mcp` is fail-closed on Host/Origin -- every consuming app must set
  `MCP_ALLOWED_HOSTNAMES` (and `MCP_ALLOWED_ORIGIN_HOSTNAMES` if applicable) to its real
  externally-reachable hostname(s). An app running with either unset gets an empty allowlist and
  `POST /mcp` returns `403` for every call, with no startup-time error to signal why.

  **New, opt-in:** multi-round-trip (`input_required`) tool support. A tool handler can now ask
  its caller for more input before completing: return
  `await ctx.mrtr.requestInput(inputRequests, data)`, and read `ctx.mrtr.resumed` on the retried
  call to get `data` back along with the caller's answers. Off by default -- set
  `MCP_REQUEST_STATE_KEY` (32+ random bytes, base64: `node -e
"console.log(require('crypto').randomBytes(32).toString('base64'))"`) per app to turn it on;
  without it, `ctx.mrtr.requestInput` throws immediately rather than minting unprotected state.
  The minted `requestState` is HMAC-signed and bound to the calling API key and tool method, so
  it cannot be replayed by a different caller or resumed against a different tool, and each flow
  is capped at 8 re-entries by default.

## 0.6.0-mcp-2026-07-28.1

### Minor Changes

- Fixes and adds MRTR support found missing by an adversarial review of the 038 SDK v2
  migration, on top of the `0.6.0-mcp-2026-07-28.0` canary.

  **Fixes:**

  - `structuredContent` is now exposed for any serializable tool result (object, array, or
    primitive), not just plain objects -- a tool declaring a non-object `outputSchema` (array,
    string, number) previously failed the SDK's own output validation on every successful call.
  - A tool result object containing a truthy `error` field is no longer specially discarded
    down to a bare "Unknown error" text; it's returned as ordinary `structuredContent` like any
    other shape a tool's `outputSchema` describes.
  - A void-returning tool now reports success with empty content text instead of the literal
    string `"undefined"`.
  - A thrown handler error is now logged server-side (tool name, message, stack) in addition to
    being returned to the caller, so an infra-level error (a stack trace, a DB host/user) is no
    longer invisible to this app's own logs while still reaching an external API-key holder.
  - `@McpTool`'s `requiredScopes` must now be declared explicitly (`[]` for an intentionally
    public tool) -- an omitted value used to silently default to `[]`, making a tool that simply
    forgot to declare its scopes callable by every API key regardless of what it actually holds.
  - `packages/mcp-server/spike` (a throwaway SDK compatibility harness with its own
    `node_modules`) no longer ships in the published tarball.

  **Reminder (introduced earlier in this canary line, `0.6.0-mcp-2026-07-28.0`, not new here):**
  `POST /mcp` is fail-closed on Host/Origin -- every consuming app must set
  `MCP_ALLOWED_HOSTNAMES` (and `MCP_ALLOWED_ORIGIN_HOSTNAMES` if applicable) to its real
  externally-reachable hostname(s). An app running with either unset gets an empty allowlist and
  `POST /mcp` returns `403` for every call, with no startup-time error to signal why.

  **New, opt-in:** multi-round-trip (`input_required`) tool support. A tool handler can now ask
  its caller for more input before completing: return
  `await ctx.mrtr.requestInput(inputRequests, data)`, and read `ctx.mrtr.resumed` on the retried
  call to get `data` back along with the caller's answers. Off by default -- set
  `MCP_REQUEST_STATE_KEY` (32+ random bytes, base64: `node -e
"console.log(require('crypto').randomBytes(32).toString('base64'))"`) per app to turn it on;
  without it, `ctx.mrtr.requestInput` throws immediately rather than minting unprotected state.
  The minted `requestState` is HMAC-signed and bound to the calling API key and tool method, so
  it cannot be replayed by a different caller or resumed against a different tool, and each flow
  is capped at 8 re-entries by default.

## 0.6.0-mcp-2026-07-28.0

### Minor Changes

- 22e271a: Migrate the MCP server package to the 2026-07-28 protocol contract and MCP SDK v2.

  The package now serves modern stateless requests through `createMcpHandler` and the Node
  adapter while retaining legacy stateless compatibility during the transition period. Consumers
  should deploy the compatible gateway before upgrading downstream apps and keep the legacy path
  available until rollout verification is complete. The package also declares the Prisma runtime
  peer required by its exported authentication and audit integration modules.

## 0.5.10

### Patch Changes

- @appspine/audit-log@1.0.0
- @appspine/auth@5.0.0
- @appspine/m2m-api-key@4.0.1

## 0.5.9

### Patch Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).
- Updated dependencies
  - @appspine/audit-log@1.0.0
  - @appspine/auth@5.0.0
  - @appspine/m2m-api-key@4.0.0

## 0.5.8

### Patch Changes

- Updated dependencies
  - @appspine/auth@4.0.2
  - @appspine/m2m-api-key@3.0.4

## 0.5.7

### Patch Changes

- Updated dependencies
  - @appspine/auth@4.0.1
  - @appspine/m2m-api-key@3.0.3

## 0.5.6

### Patch Changes

- Updated dependencies
  - @appspine/auth@4.0.0
  - @appspine/m2m-api-key@3.0.2

## 0.5.5

### Patch Changes

- Updated dependencies [70c7586]
  - @appspine/auth@3.1.0
  - @appspine/m2m-api-key@3.0.1

## 0.5.4

### Patch Changes

- Updated dependencies [cc3b30a]
- Updated dependencies [cc3b30a]
  - @appspine/m2m-api-key@3.0.0
  - @appspine/auth@3.0.0

## 0.5.3

### Patch Changes

- Updated dependencies [6545ac2]
  - @appspine/auth@2.0.2
  - @appspine/m2m-api-key@2.1.3

## 0.5.2

### Patch Changes

- @appspine/auth@2.0.1
- @appspine/m2m-api-key@2.1.2

## 0.5.1

### Patch Changes

- Updated dependencies [0907ff6]
  - @appspine/m2m-api-key@2.1.0

## 0.5.0

### Minor Changes

- Fix: `McpCallContext` now carries `workflowId` (the caller-supplied
  `X-Appspine-Workflow-Id` correlation header, dev_docs 002/023 §2.5), extracted in
  `McpController.handlePost()` and passed through to every `@McpTool()` handler. Previously
  this header was documented and referenced throughout dev_docs 023 (including T-9610's own
  stated verification criteria — "帶 X-Appspine-Workflow-Id header 呼叫一支 tool 後，
  audit_logs 該筆記錄含 header 值") but was never actually read anywhere in this package, so
  the correlation id never reached any consuming app's audit log regardless of what the caller
  sent. `McpToolDefinition` handlers should pass `ctx.workflowId` through as
  `RecordAuditLogDto.workflowId` when recording an audit log entry for a write tool.

  This is a breaking type change for anyone constructing a `McpCallContext` object literal by
  hand (the new field is required, not optional, to keep it impossible to silently forget) —
  bumped minor rather than major since this package hasn't reached 1.0 yet and no consuming app
  constructs this type directly (only `McpController` does).

## 0.4.0

### Minor Changes

- 01fea3f: Add opt-in `DiscoveryPushService`: on application bootstrap, pushes this app's tool catalog
  to the 023 discovery service when `DISCOVERY_PUSH_URL` and `DISCOVERY_PUSH_TOKEN` are set
  (dev_docs 023 §2.1, T-9700). No-op for apps that don't set those env vars. Also adds
  `McpToolRegistry.getCatalogSnapshot()`, which reports one entry per logical tool (not per
  dual-registered name) with its external-facing name, description, required scopes, and
  `readOnlyHint`.

## 0.3.1

### Patch Changes

- c966c26: Add an optional `?challenge=<nonce>` query param to `GET /mcp/health` that echoes the value back unchanged. Used by the 023 discovery service to verify control of an app's MCP endpoint before accepting an endpoint-location change (dev_docs 023 §2.1). Read-only and additive -- omitting the param behaves exactly as before.

## 0.3.0

### Minor Changes

- 1276664: Add cross-app tool naming dual registration (`MCP_TOOL_PREFIX` env var, dev_docs 002/023 §2.2) and automatic `readOnlyHint` derivation from `requiredScopes` in `tools/list` responses (dev_docs 002/023 §2.3/§6.4). Both are additive and backward compatible — apps that haven't set `MCP_TOOL_PREFIX` yet keep registering only the unprefixed tool name.

### Patch Changes

- @appspine/auth@2.0.0
- @appspine/m2m-api-key@2.0.0

## 0.2.4

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.1.1
  - @appspine/m2m-api-key@1.0.3

## 0.2.3

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.1.0
  - @appspine/m2m-api-key@1.0.2

## 0.2.2

### Patch Changes

- Fix `registerMcpToolsFromInstance()` dropping the `McpCallContext` argument when invoking
  `@McpTool()`-decorated methods. `McpService.createServer()` already calls `tool.handler(args, ctx)`,
  but the registration helper's generated handler only forwarded `args`, so any app registering tools
  this way had no way to read `ctx.actingUserId`/`ctx.roleNames`/`ctx.scopes` inside the tool method —
  defeating the point of the acting-user context added for wiki app MCP tools. See
  `dev_docs/Z08-mcp-tool-decorator-ctx-drop.md`.

## 0.2.1

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.0.1
  - @appspine/m2m-api-key@1.0.1

## 0.2.0

### Minor Changes

- Add MCP acting-user context and AuditAction RESTORE/MOVE for wiki app prerequisites.

  Consumers of `@appspine/audit-log` must also update their Prisma schema fragment: the `AuditAction` enum now includes `RESTORE` and `MOVE`. The fragment is not synchronized automatically through the npm package.

## 0.1.4

### Patch Changes

- Updated dependencies
  - @appspine/auth@1.0.0
  - @appspine/m2m-api-key@1.0.0

## 0.1.3

### Patch Changes

- @appspine/auth@0.1.3
- @appspine/m2m-api-key@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [0399175]
- Updated dependencies [8cd6c2a]
  - @appspine/auth@0.1.2
  - @appspine/m2m-api-key@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [382888e]
  - @appspine/auth@0.1.1
  - @appspine/m2m-api-key@0.1.1

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
