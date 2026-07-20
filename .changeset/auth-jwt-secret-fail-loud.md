---
"@appspine/auth": patch
---

Fail loud instead of silently falling back to a hardcoded `'dev-secret'` when `JWT_SECRET` is unset. Under `AUTH_MODE=local` (the default) this now throws at startup; `AUTH_MODE=oidc` deployments are unaffected.
