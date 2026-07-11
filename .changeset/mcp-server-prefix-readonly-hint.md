---
"@appspine/mcp-server": minor
---

Add cross-app tool naming dual registration (`MCP_TOOL_PREFIX` env var, dev_docs 002/023 §2.2) and automatic `readOnlyHint` derivation from `requiredScopes` in `tools/list` responses (dev_docs 002/023 §2.3/§6.4). Both are additive and backward compatible — apps that haven't set `MCP_TOOL_PREFIX` yet keep registering only the unprefixed tool name.
