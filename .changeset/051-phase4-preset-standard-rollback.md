---
'@appspine/preset-standard': minor
'@appspine/identity-core': patch
'@appspine/rbac': patch
'@appspine/m2m-api-key': patch
---

Complete `@appspine/preset-standard` graph and perform full rollback rehearsal (051 PL4-10).

- Expand `@appspine/preset-standard` from the Phase 2 pilot (2 plugins) to the full standard capabilities graph (10 plugins: `health-check`, `audit-log`, `identity-core`, `oidc-auth`, `notification`, `rbac`, `m2m-api-key`, `metadata-schema`, `domain-events`, `mcp-server`).
- Resolve graph dependency cycle between `identity-core` and `rbac`: `identity-core` no longer reverse-depends on `appspine.rbac-policy` in its manifest, adhering to 051 §13 foundation decoupling while retaining optional runtime DI consumption.
- Augment `facets.prisma.augments` across `rbac` and `m2m-api-key` with explicit relation types (`UserRole[]`, `ApiKey[]`) for clean schema composition.
- Complete 5-stage automated rehearsal and verification:
  1. Real tarball packaging and clean install on `appspine-app-template` with zero codegen drift and passing dual-mode tests.
  2. Baseline verification of legacy representative app (`wiki`).
  3. Multi-instance connector composition (`@appspine/master-data-client` with `crm` and `erp` instances).
  4. Lifecycle safety verification: plugin disabling / removal produces clean disabled catalogs while guaranteeing Zero Data Drop on database migrations.
  5. Dual-mode legacy switch-back validation (`APPSPINE_PLUGIN_MODE=1` <-> `0`) ensuring zero-migration rollback safety.
