---
"@appspine/mcp-server": minor
---

Add opt-in `DiscoveryPushService`: on application bootstrap, pushes this app's tool catalog
to the 023 discovery service when `DISCOVERY_PUSH_URL` and `DISCOVERY_PUSH_TOKEN` are set
(dev_docs 023 §2.1, T-9700). No-op for apps that don't set those env vars. Also adds
`McpToolRegistry.getCatalogSnapshot()`, which reports one entry per logical tool (not per
dual-registered name) with its external-facing name, description, required scopes, and
`readOnlyHint`.
