# @appspine/master-data-client

## 0.2.0

### Minor Changes

- 9cd2838: Migrate Master Data Client connector package to multi-instance plugin model (051 PL4-08).

  - `@appspine/master-data-client`: declare `cardinality: "multiple"`, backend and operations facets, `configSchema`, environment variable specifications with secret redaction for `MASTER_DATA_API_KEY`, and `optionalFailurePolicy` with instance isolation boundary in `appspine.plugin.json` and `./plugin`; expose plugin descriptor `masterDataClientPlugin` and helper `masterDataClient()`; implement `MasterDataClientPort` on `MasterDataReconciliationService`; register instance-aware tokens (`Symbol.for('appspine.master-data-client#<instanceId>')`) and `MASTER_DATA_CLIENT` token (`Symbol.for('appspine.master-data-client')`) from `MasterDataClientModule.forRoot()` and plugin backend factory; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `MasterDataClientPort` to `./ports`.

### Patch Changes

- Updated dependencies [4c0ce5f]
- Updated dependencies [8e67a05]
- Updated dependencies [b75516d]
- Updated dependencies [b92c1c3]
- Updated dependencies [0eaf69d]
- Updated dependencies [9cd2838]
- Updated dependencies [a41aab9]
- Updated dependencies [aeb861d]
- Updated dependencies [96f92e8]
- Updated dependencies [fdff215]
  - @appspine/plugin-api@1.1.0

## 0.1.4

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.

## 0.1.3

### Patch Changes

- Fixes from a deep-read audit of domain-events and the rest of the shared packages: dead code removal (UsersService.findByEmail, MetaService.getAvailableScopes, mcp-server's duplicated extractWorkflowId/matchScope), duplicated logic consolidated into single sources of truth (webhook posting now calls @appspine/domain-events instead of being copy-pasted per app, scope-matching shared between m2m-api-key and mcp-server, audit-log's Actor type, DMMF types shared via a new @appspine/common export), and several real bug fixes (JWT verification failures no longer swallowed silently, master-data-client's reconciliation now isolates per-entity failures instead of one failure skipping the whole pass, a stale ADMIN role string literal replaced with SYSTEM_ADMIN_ROLE, PermissionPolicy comparisons using the real enum, domain-event prefix resolution now falls through to a later matching prefix instead of stopping at the first one, admin delivery date-range filtering no longer silently widens by up to 24h, and diff-changed-fields no longer throws on bigint fields).

## 0.1.2

### Patch Changes

- 4947b0b: Skip the reconciliation delete-sweep when `listFetcher` resolves with an empty list, instead of wiping every local Mirror row on a transient/partial fetch.

## 0.1.1

### Minor Changes

- 807782f: Add the initial master data sync/cache client package with mirror schema conventions, seq-safe event handlers, and reconciliation helpers.

### Patch Changes

- c85473a: Skip stale delete events during mirror sync and add async Nest module configuration for injected app services.
