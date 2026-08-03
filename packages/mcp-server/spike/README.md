# MCP v2 Compatibility Spike

This isolated package validates the official MCP TypeScript SDK v2 HTTP entry points before changing
`@appspine/mcp-server`.

The spike fixes `@modelcontextprotocol/server` and `@modelcontextprotocol/node` at `2.0.0`. Its handler uses
`createMcpHandler`, which is the SDK v2 entry point for 2026-07-28 modern requests and stateless legacy fallback,
then adapts it to Node with `toNodeHandler`.

Run from this directory:

```text
pnpm install
pnpm build
```
