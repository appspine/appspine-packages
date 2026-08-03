---
"@appspine/mcp-server": minor
---

Fixes and adds MRTR support found missing by an adversarial review of the 038 SDK v2
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
