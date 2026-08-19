---
'@appspine/master-data-client': minor
'@appspine/plugin-api': patch
---

Migrate Master Data Client connector package to multi-instance plugin model (051 PL4-08).

- `@appspine/master-data-client`: declare `cardinality: "multiple"`, backend and operations facets, `configSchema`, environment variable specifications with secret redaction for `MASTER_DATA_API_KEY`, and `optionalFailurePolicy` with instance isolation boundary in `appspine.plugin.json` and `./plugin`; expose plugin descriptor `masterDataClientPlugin` and helper `masterDataClient()`; implement `MasterDataClientPort` on `MasterDataReconciliationService`; register instance-aware tokens (`Symbol.for('appspine.master-data-client#<instanceId>')`) and `MASTER_DATA_CLIENT` token (`Symbol.for('appspine.master-data-client')`) from `MasterDataClientModule.forRoot()` and plugin backend factory; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
- `@appspine/plugin-api`: add `MasterDataClientPort` to `./ports`.
