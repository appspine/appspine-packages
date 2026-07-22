---
"@appspine/master-data-client": patch
---

Skip the reconciliation delete-sweep when `listFetcher` resolves with an empty list, instead of wiping every local Mirror row on a transient/partial fetch.
