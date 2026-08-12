---
type: topic
scope: cross-repo
status: active
created: 2026-08-07
updated: 2026-08-07
---

# Integration contract compatibility matrix

`check-compatibility` compares a pinned previous schema with a proposed next schema and emits
machine-readable findings. It never changes a version or digest.

| Change | strict | tolerant-reader | provider-compatible |
| --- | --- | --- | --- |
| Add optional response/event property | informational | compatible | informational |
| Add required property | breaking | breaking | breaking |
| Remove property | breaking | compatible for unknown optional provider fields; breaking for required fields | breaking |
| Remove enum value | breaking | breaking | breaking |
| Relax requiredness | compatible, informational | compatible | compatible |
| Restrict `additionalProperties` | breaking | warning | breaking |
| Relax `additionalProperties` | compatible, informational | compatible | compatible, informational |
| Change type, pattern, or declared limit | breaking | breaking | breaking |

The implementation is shared with `@appspine/integration-contracts` when its built artifact is
available; the CLI fallback applies the same directional rules so index and validation remain
usable before package compilation. Canonical manifests sort artifact paths and object keys, then
hash the canonical JSON with SHA-256. A binding stores the exact capability version and digest.
