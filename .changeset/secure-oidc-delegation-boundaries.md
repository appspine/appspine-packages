---
'@appspine/auth': minor
'@appspine/oidc-delegation': minor
---

Harden OIDC delegation configuration and token validation. Delegation now requires secure
issuer, JWKS, and token endpoint URLs unless HTTP is explicitly enabled for isolated
development; validates policy/profile bounds and immutable configuration; enforces provider
access-token type and policy TTL; isolates circuit breakers per policy; and bounds inbound
security rejection logs.

Treat missing `email_verified` as unverified, reject future-issued delegated tokens, accept the
RFC 9068 `at+jwt` JOSE type, default delegated provisioning to `never`, and audit successful JIT
user creation without making authentication depend on audit availability.
