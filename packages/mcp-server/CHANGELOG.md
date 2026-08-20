# @appspine/mcp-server

## 2.0.0-canary.0

### Major Changes

- Complete the v3 legacy-removal milestone: remove the `@appspine/auth` facade workspace,
  capability-specific UI transition exports from `@appspine/frontend-shell`, the provider-specific
  `JwtOrApiKeyGuard`, and the deprecated domain-event webhook helper. RBAC, MCP server, M2M API key,
  and audit-log capability modules are no longer global; feature modules must import the composed
  platform bridge explicitly.

## 1.0.0

### Major Changes

- 4c0ce5f: Split `@appspine/auth` into provider-neutral identity and OIDC authentication (051 PL1-10, PL1-12,
  PL1-13).

  `@appspine/identity-core` (new) owns the `User` model, Users CRUD, `AdminGuard`, the system role
  constants and the `appspine.identity-store` capability. It no longer queries RBAC's tables: default
  roles and role assignment go through the new `appspine.rbac-policy` capability, and its Prisma
  fragment no longer declares the `userRoles` / `actingApiKeys` relations that RBAC and API keys
  contribute as augmentations. The `password` column is carried but never read.

  `@appspine/oidc-auth` (new) owns JWKS/RS256 verification, the `azp` authorized-party check, the
  delegated (RFC 8693) inbound trust profile, and a new `OidcIdentity` model that keys external
  identity on `(issuer, subject)` instead of the email claim. A login with no mapping links exactly
  one active account with a verified matching email, JIT-provisions when there is none, and refuses an
  inactive account — all through `appspine.identity-store`, never a direct `User` query. It registers
  as the App's single interactive authentication strategy.

  `@appspine/auth` becomes a transition-only compatibility facade: every pre-split export is
  re-exported from its new owner, and `AuthModule` composes the two new modules and stays global.
  New work belongs in the two new packages.

  **This release requires a migration, despite `./prisma/user.prisma` being byte-identical.**
  `AuthModule` now composes `OidcAuthModule`, and every OIDC login reads `OidcIdentity` — so an App
  that upgrades `@appspine/auth` without first creating the `oidc_identities` table loses all
  interactive login. The migration is purely additive (one new table, no change to `users`); see
  `packages/oidc-auth/prisma/migrations/README.md` for the statement and the rollout order.

  The four packages below are `major` because each gained a **required** peer it did not have before:
  `@appspine/plugin-host-nest` for all four, plus `@appspine/identity-core`, `@appspine/oidc-auth` and
  `@appspine/rbac` for `@appspine/auth`. `@appspine/m2m-api-key`'s new `@appspine/rbac` peer is
  declared optional: without an `appspine.rbac-policy` provider the App still boots and `ApiKeyGuard`
  fails closed rather than authorising a permission-less principal.

  `@appspine/rbac` gains `RbacPolicyService` behind the `appspine.rbac-policy` token, takes ownership
  of `buildUserContext` (moved from `@appspine/auth`), and no longer imports the auth package.
  `@appspine/m2m-api-key` validates an acting user through `appspine.identity-store` rather than
  reading the `User` table directly, and `@appspine/mcp-server` takes its request-identity type from
  the host. All packages now export `./package.json`.

### Minor Changes

- a41aab9: Migrate Model Context Protocol Server capability package to full plugin model (051 PL4-06).

  - `@appspine/mcp-server`: declare backend (`global: true` compatibility bridge) and operations facets in `appspine.plugin.json` and `./plugin`; retain `@Global()` on `McpModule` during Phase 4 transition for downstream `*.mcp.ts` feature module compatibility; bind and export `MCP_TOOLS` token; refactor `McpToolRegistry` to implement `McpToolsPort` and inject `@appspine/plugin-api`'s `SCOPE_MATCHER` port with fallback matching; refactor `McpController` to use neutral `MachineAuthGuard` and propagate `Principal` / `MachinePrincipal` acting user context into `McpCallContext`; introduce package-local `extractWorkflowId` and remove direct dependencies on `@appspine/m2m-api-key` and `@appspine/audit-log`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `McpToolsPort`, `McpToolDefinitionPort`, and `McpCatalogEntryPort` interfaces to `./ports`.

### Patch Changes

- Updated dependencies [4c0ce5f]
- Updated dependencies [8e67a05]
- Updated dependencies [b75516d]
- Updated dependencies [b92c1c3]
- Updated dependencies [0eaf69d]
- Updated dependencies [9cd2838]
- Updated dependencies [a41aab9]
- Updated dependencies [aeb861d]
- Updated dependencies [96f92e8]
- Updated dependencies [fdff215]
  - @appspine/plugin-api@1.1.0
  - @appspine/plugin-host-nest@2.0.0

## 0.6.8

### Patch Changes

- Updated dependencies [3282f18]
  - @appspine/m2m-api-key@5.0.0
  - @appspine/audit-log@1.0.1
  - @appspine/auth@6.2.2

## 0.6.7

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.
- Updated dependencies [147d374]
  - @appspine/audit-log@1.0.1
  - @appspine/auth@6.2.2
  - @appspine/m2m-api-key@4.0.7

## 0.6.6

### Patch Changes

- Updated dependencies [85ef582]
  - @appspine/auth@6.2.0
  - @appspine/m2m-api-key@4.0.6

## 0.6.5

### Patch Changes

- Updated dependencies [fa55e75]
  - @appspine/auth@6.1.0
  - @appspine/m2m-api-key@4.0.5

## 0.6.4

### Patch Changes

- @appspine/audit-log@1.0.0
- @appspine/auth@6.0.1
- @appspine/m2m-api-key@4.0.4

## 0.6.3

### Patch Changes

- Updated dependencies [15fc8c4]
  - @appspine/auth@6.0.1
  - @appspine/m2m-api-key@4.0.3

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
