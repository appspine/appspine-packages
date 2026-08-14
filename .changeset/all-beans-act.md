---
'@appspine/audit-log': patch
'@appspine/auth': patch
'@appspine/common': patch
'@appspine/e2e-kit': patch
'@appspine/frontend-shell': patch
'@appspine/health-check': patch
'@appspine/m2m-api-key': patch
'@appspine/master-data-client': patch
'@appspine/mcp-server': patch
'@appspine/metadata-schema': patch
'@appspine/notification': patch
'@appspine/rbac': patch
---

Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
dependencies.
