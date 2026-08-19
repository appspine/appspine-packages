# @appspine/preset-standard

## 2.0.0

### Minor Changes

- f0a789d: Add `@appspine/preset-standard` and preset expansion (051 PL2-08).

  A preset is shorthand for a list of plugins, and nothing else. After expansion the inventory reads
  exactly as if the entries had been typed out, and nothing downstream — resolver, catalog, lockfile,
  host — learns a preset was involved. Everything else follows from protecting that:

  - The catalog and lockfile list **resolved plugins**, with versions and digests, and record the
    preset alongside as provenance. `standard@1.0.0` as the only entry would hide what an App actually
    runs behind a name whose meaning changes between releases.
  - An entry an App writes explicitly overrides the preset's, **and the CLI says so**. A silent
    override is how an App ends up running something other than what its own file appears to say.
  - A preset can only contribute, so adding one never swallows an app-local plugin.
  - Two presets contributing the same instance is refused rather than resolved by ordering.
  - The preset's own version is part of the source digest, so upgrading it makes every derived
    artefact drift instead of quietly describing a different set of plugins.

  `add` and `remove` edit the file as written, never the expansion — otherwise the first `add` would
  freeze a copy of the preset and upgrading it later would change nothing.

  `appspine.plugins.json` accepted a `presets` field from v1 and rejected a non-empty one until an
  expander existed. It no longer does.

- af030d3: Complete `@appspine/preset-standard` graph and perform full rollback rehearsal (051 PL4-10).

  - Expand `@appspine/preset-standard` from the Phase 2 pilot (2 plugins) to the full standard capabilities graph (10 plugins: `health-check`, `audit-log`, `identity-core`, `oidc-auth`, `notification`, `rbac`, `m2m-api-key`, `metadata-schema`, `domain-events`, `mcp-server`).
  - Resolve graph dependency cycle between `identity-core` and `rbac`: `identity-core` no longer reverse-depends on `appspine.rbac-policy` in its manifest, adhering to 051 §13 foundation decoupling while retaining optional runtime DI consumption.
  - Augment `facets.prisma.augments` across `rbac` and `m2m-api-key` with explicit relation types (`UserRole[]`, `ApiKey[]`) for clean schema composition.
  - Complete 5-stage automated rehearsal and verification:
    1. Real tarball packaging and clean install on `appspine-app-template` with zero codegen drift and passing dual-mode tests.
    2. Baseline verification of legacy representative app (`wiki`).
    3. Multi-instance connector composition (`@appspine/master-data-client` with `crm` and `erp` instances).
    4. Lifecycle safety verification: plugin disabling / removal produces clean disabled catalogs while guaranteeing Zero Data Drop on database migrations.
    5. Dual-mode legacy switch-back validation (`APPSPINE_PLUGIN_MODE=1` <-> `0`) ensuring zero-migration rollback safety.

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
