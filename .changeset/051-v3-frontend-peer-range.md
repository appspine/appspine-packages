---
"@appspine/health-check": patch
"@appspine/identity-core": patch
"@appspine/notification": patch
"@appspine/oidc-auth": patch
---

Accept the v3 frontend-shell major while retaining compatibility with the final v2 transition
release. This lets the canary fleet consume the new shell without peer-dependency conflicts.
