---
"@appspine/frontend-shell": major
"@appspine/audit-log": major
"@appspine/rbac": major
"@appspine/m2m-api-key": major
"@appspine/mcp-server": major
"@appspine/domain-events": major
---

Complete the v3 legacy-removal milestone: remove the `@appspine/auth` facade workspace,
capability-specific UI transition exports from `@appspine/frontend-shell`, the provider-specific
`JwtOrApiKeyGuard`, and the deprecated domain-event webhook helper. RBAC, MCP server, M2M API key,
and audit-log capability modules are no longer global; feature modules must import the composed
platform bridge explicitly.
