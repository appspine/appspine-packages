---
"@appspine/m2m-api-key": minor
---

Allow `call` as a scope action word (`resource:call`) alongside the existing `read`/`write`/`*`.
Added for dev_docs 025's `apps/mcp-gateway` aggregator, whose `call_tool` meta-tool declares
`requiredScopes: ["gateway:call"]` -- a forwarded tool invocation isn't itself a read or a write
on the gateway's own resources, so neither existing action word fit. Purely additive: every
previously-valid scope string is still valid.
