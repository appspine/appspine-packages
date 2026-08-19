---
'@appspine/metadata-schema': minor
'@appspine/plugin-api': patch
---

Migrate Metadata Schema Introspection capability package to full plugin model (051 PL4-04).

- `@appspine/metadata-schema`: declare backend and permissions facets in `appspine.plugin.json` and `./plugin`; bind and export `METADATA_SCHEMA` token; implement `MetadataScopeGuard` injecting `@appspine/plugin-api`'s `SCOPE_MATCHER` port; refactor `MetaController` to use neutral `AppspineAuthGuard` and `MetadataScopeGuard` with strict fail-closed authorization; decouple `dependencies` and `tsconfig.build.json` references from `@appspine/m2m-api-key`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
- `@appspine/plugin-api`: add `MetadataSchemaPort` interface to `./ports`.
