# @appspine/master-data-client

## 0.1.2

### Patch Changes

- 4947b0b: Skip the reconciliation delete-sweep when `listFetcher` resolves with an empty list, instead of wiping every local Mirror row on a transient/partial fetch.

## 0.1.1

### Minor Changes

- 807782f: Add the initial master data sync/cache client package with mirror schema conventions, seq-safe event handlers, and reconciliation helpers.

### Patch Changes

- c85473a: Skip stale delete events during mirror sync and add async Nest module configuration for injected app services.
