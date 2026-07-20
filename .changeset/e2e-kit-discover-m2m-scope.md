---
"@appspine/e2e-kit": patch
---

Fix `registerM2mApiKeySpec` hardcoding a `users:read` restricted scope that no
longer exists in any app's `/metadata/schema` response (`User` is `@internal`
and excluded from `deriveScopes`). The spec now creates the wildcard key
first, reads the app's real `availableScopes` from the response, and picks a
non-wildcard scope from that list to test restriction against — no per-app
configuration needed. Fixes a 30s UI timeout on `createApiKeyFromUi` for
every app that wires real metadata-backed scope options into the Create API
key dialog.
