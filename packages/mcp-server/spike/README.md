# MCP v2 Compatibility Spike

This isolated package validates the official MCP TypeScript SDK v2 HTTP entry points before changing
`@appspine/mcp-server`.

The spike fixes `@modelcontextprotocol/server` and `@modelcontextprotocol/node` at `2.0.0`. Its handler uses
`createMcpHandler`, which is the SDK v2 entry point for 2026-07-28 modern requests and stateless legacy fallback,
then adapts it to Node with `toNodeHandler`.

## Compatibility matrix

| Request class | Classifier signal | Default handler | Strict handler |
| --- | --- | --- | --- |
| Modern 2026-07-28 | Per-request `_meta` envelope with `io.modelcontextprotocol/protocolVersion` | Modern per-request server; JSON or SSE | Same |
| Legacy 2025-era | Claim-less JSON-RPC, including `initialize` | Stateless legacy fallback | HTTP 400 rejection |
| Header/body mismatch | Modern header disagrees with body classification or envelope | HTTP 400, `-32020` | Same |
| Modern header without envelope | `MCP-Protocol-Version: 2026-07-28` but no required `_meta` claim | HTTP 400, `-32602` | Same |
| Missing JSON content type | POST without `application/json` | HTTP 415 | Same |

Gateway policy: cache only conclusive per-origin modern/legacy classifications. Do not cache auth failures,
5xx responses, or ambiguous validation errors; invalidate the verdict on deployment, protocol-policy, or upstream
route changes. The cache belongs at the gateway boundary, not inside the SDK server handler.

Run from this directory:

```text
pnpm install --ignore-scripts
pnpm build
pnpm smoke
```
