---
"@appspine/mcp-server": patch
---

Add an optional `?challenge=<nonce>` query param to `GET /mcp/health` that echoes the value back unchanged. Used by the 023 discovery service to verify control of an app's MCP endpoint before accepting an endpoint-location change (dev_docs 023 §2.1). Read-only and additive -- omitting the param behaves exactly as before.
