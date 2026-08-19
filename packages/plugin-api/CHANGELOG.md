# @appspine/plugin-api

## 1.1.0

### Minor Changes

- 4c0ce5f: Add the Phase 1 plugin platform core (051 PL1-01 to PL1-06, PL1-11).

  `@appspine/plugin-api` is the contract every plugin and host agrees on: `appspine.plugin/v1`
  manifest types and JSON Schema, the frozen capability-name registry, `Symbol.for` tokens with their
  minimal ports, `definePlugin()`, and the lifecycle/diagnostic contracts. Four node-only subpaths sit
  beside the root barrel — `./schema`, `./loader` (Ajv-backed manifest validation, canonical digests,
  engine and framework range checks), `./resolver` (deterministic dependency graph, conflict,
  cardinality and duplicate-contribution detection) and `./runtime` (the lifecycle engine and catalog
  model shared by the host and the testkit).

  `@appspine/plugin-testkit` gives a plugin package manifest and inventory builders, fake capability
  implementations, a lifecycle harness and recorder, and runner-agnostic catalog/diagnostic
  assertions — usable from an installed tarball, with no workspace paths.

  `@appspine/plugin-host-nest` composes a resolved inventory into a NestJS module before bootstrap,
  runs `validate -> register -> ready` per instance in dependency order, aborts startup when a
  required plugin fails, degrades only when a manifest declared how, shuts down in reverse order with
  a per-instance timeout, and exposes a redacted catalog and health view. It also owns the two host
  capabilities every plugin can rely on: the authentication strategy registry (one interactive
  provider maximum) and the principal context, with neutral `AppspineAuthGuard` /
  `InteractiveAuthGuard` / `MachineAuthGuard` replacing provider-specific guard chains.

- 8e67a05: Reconcile permissions into a reviewable plan (051 PL2-07).

  Two properties matter more than the rest. A permission **ID is immutable** — roles, audit rows and
  customer-written policies all reference it, so renaming one is a new ID plus an alias, never an
  edit. And **nothing is ever deleted**: a permission that leaves the desired state is _retired_,
  which keeps every historical grant interpretable, the same principle 051 decision 13 applies to
  Prisma data.

  PL0-06 froze the rules, and the spec drives those fixtures through this implementation: the five op
  codes of a realistic upgrade (`no-op`, `update-display`, `add`, `alias`, `retire`), the three
  fail-fast cases (alias to a target that does not exist, a downgrade onto newer state, a duplicate
  ID), and the assertion that `delete` never appears whatever left the desired state.

  On any error the reconciler returns **no plan at all** rather than the ops it managed to work out.
  A half-built plan is worse than none: an operator sees a list of changes that looks complete and
  applies it.

  `@appspine/plugin-api` tightens the `permissions` facet, the handover PL0-05 named PL2-07 for. An
  entry is either a bare namespaced ID — the shape the frozen fixture uses — or an object carrying a
  display name, an alias or a `frontendOnly` marker. `frontendOnly` is a visibility hint for the UI
  and never an authorization decision; the permission is still in the plan.

  The generated `permissions.json` holds the desired state and the plan a _fresh install_ would need.
  Reading the real current state would make a build-time generator depend on a running deployment, so
  it does not: an apply adapter reconciles against reality when reality is available. This tool never
  reads or writes an App database.

- b92c1c3: Compose `.appspine/generated/schema.prisma` from each plugin's own fragment (051 PL2-06).

  The problem this solves is one Prisma has no syntax for: a model has exactly one owning package,
  but a relation needs a field on both sides — so `rbac` needs `userRoles UserRole[]` to exist inside
  `identity-core`'s `User`. Either identity-core declares a field for an optional plugin it must not
  depend on, or somebody writes it in at composition time. This is that somebody.

  PL0-06 froze the rules before any composer existed, and `prisma-composer.spec.ts` drives those same
  fixtures through this implementation rather than restating their expectations — including the
  `A`/`bc` versus `Ab`/`c` regression that a concatenated sort key would collapse.

  `@appspine/plugin-api` tightens the `prisma` facet, the handover PL0-05 named PL2-06 for. An
  augmentation declares `{targetModel, field, owner}` as PL0-05's frozen fixture does, plus an
  optional `type`. It is optional only because that fixture predates the need for it, and the composer
  cannot write a field without one — so it says so by name (`augmentation-without-type`) instead of the
  schema rejecting a frozen fixture.

  Beyond the frozen rules the composer adds three of its own: an augmentation naming the wrong owner,
  two plugins owning one enum, and — as a warning, not an error — an augmentation the owner never
  listed in `augmentedBy`, since that list is documentation worth surfacing rather than blocking on.

  `build` composes first and refuses before writing anything. A schema with a missing relation field
  fails much later, inside Prisma, as something that looks unrelated to the plugin that caused it. The
  output is a schema and a migration _plan input_; nothing is applied, and the datasource and
  generator blocks stay in the App's own schema because they are deployment configuration, not a
  plugin contribution.

- 96f92e8: Migrate notification capability package to full plugin model (051 PL4-01).

  - `@appspine/notification`: declare backend, prisma, operations, frontend, and permissions facets in `appspine.plugin.json` and `./plugin`; export `NotificationModule` binding `NotificationService` to `NOTIFICATION_INBOX`; ship `prisma/notification.prisma` with schema digest and User model augmentation; implement full 4-stage lifecycle (`validate` -> `register` -> `ready` -> `shutdown`) and resource cleanup registry.
  - `@appspine/plugin-api`: define `NotificationInboxPort` and related types in `ports.ts`.
  - `@appspine/identity-core`: declare `notification` plugin as authorized augmenter of `User.notifications` relation in `augmentedBy`.

### Patch Changes

- b75516d: Add `@appspine/plugin-cli` (051 PL2-01).

  The App-facing tool that owns `appspine.plugins.json`, and nothing else. This release is the shell
  the rest of Phase 2 registers commands against: the inventory file format and its JSON Schema
  (`appspine.plugins/v1`), canonical read/write, the config and secret boundary, stable exit codes,
  and a single machine-readable result envelope (`appspine.cli-result/v1`) rendered from the same
  object as the human output. `add` / `remove` / `list` / `validate` land in PL2-02, `build` /
  `doctor` in PL2-03.

  Three constraints are enforced by tests rather than by convention: the CLI writes exactly one file
  (asserted by listing the App directory before and after), it cannot load a package by name at
  runtime (no `import()`, `require()` or child process anywhere in the shipped source), and a
  `configRef` shaped like a credential — a token, a connection string, a PEM header — is rejected
  without the offending text ever appearing in the diagnostic.

  `@appspine/plugin-api` replaces four literal NUL bytes in `sortDiagnostics`' key separator with
  `\u0000` escapes. Behaviour is identical; the bytes made the file read as binary to grep, diff and
  review tooling, which is how a control character stayed invisible in a reviewed source file.

- 0eaf69d: Migrate Domain Events capability package to full plugin model (051 PL4-05).

  - `@appspine/domain-events`: declare all 5 facets (backend, frontend, prisma, permissions, operations) in `appspine.plugin.json` and `./plugin`; create `prisma/domain-events.prisma` schema fragment and compute LF-normalized sha256 digest; implement `DomainEventsAdminGuard` injecting `@appspine/plugin-api`'s `SCOPE_MATCHER` port; refactor `DomainEventsAdminController` to use neutral `AppspineAuthGuard` and `DomainEventsAdminGuard` with strict fail-closed authorization; introduce `DomainEventsModule` standard capability module providing `DomainEventRegistry`, `DomainEventsService`, `DOMAIN_EVENTS` token, and `DomainEventDispatcherService`; decouple `DomainEventsAdminModule` and dependencies/tsconfig references from concrete `@appspine/auth` and `@appspine/m2m-api-key`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `DomainEventsPort` and `RecordDomainEventPortInput` interfaces to `./ports`.

- 9cd2838: Migrate Master Data Client connector package to multi-instance plugin model (051 PL4-08).

  - `@appspine/master-data-client`: declare `cardinality: "multiple"`, backend and operations facets, `configSchema`, environment variable specifications with secret redaction for `MASTER_DATA_API_KEY`, and `optionalFailurePolicy` with instance isolation boundary in `appspine.plugin.json` and `./plugin`; expose plugin descriptor `masterDataClientPlugin` and helper `masterDataClient()`; implement `MasterDataClientPort` on `MasterDataReconciliationService`; register instance-aware tokens (`Symbol.for('appspine.master-data-client#<instanceId>')`) and `MASTER_DATA_CLIENT` token (`Symbol.for('appspine.master-data-client')`) from `MasterDataClientModule.forRoot()` and plugin backend factory; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `MasterDataClientPort` to `./ports`.

- a41aab9: Migrate Model Context Protocol Server capability package to full plugin model (051 PL4-06).

  - `@appspine/mcp-server`: declare backend (`global: true` compatibility bridge) and operations facets in `appspine.plugin.json` and `./plugin`; retain `@Global()` on `McpModule` during Phase 4 transition for downstream `*.mcp.ts` feature module compatibility; bind and export `MCP_TOOLS` token; refactor `McpToolRegistry` to implement `McpToolsPort` and inject `@appspine/plugin-api`'s `SCOPE_MATCHER` port with fallback matching; refactor `McpController` to use neutral `MachineAuthGuard` and propagate `Principal` / `MachinePrincipal` acting user context into `McpCallContext`; introduce package-local `extractWorkflowId` and remove direct dependencies on `@appspine/m2m-api-key` and `@appspine/audit-log`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `McpToolsPort`, `McpToolDefinitionPort`, and `McpCatalogEntryPort` interfaces to `./ports`.

- aeb861d: Migrate Metadata Schema Introspection capability package to full plugin model (051 PL4-04).

  - `@appspine/metadata-schema`: declare backend and permissions facets in `appspine.plugin.json` and `./plugin`; bind and export `METADATA_SCHEMA` token; implement `MetadataScopeGuard` injecting `@appspine/plugin-api`'s `SCOPE_MATCHER` port; refactor `MetaController` to use neutral `AppspineAuthGuard` and `MetadataScopeGuard` with strict fail-closed authorization; decouple `dependencies` and `tsconfig.build.json` references from `@appspine/m2m-api-key`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `MetadataSchemaPort` interface to `./ports`.

- fdff215: Migrate OIDC Token Delegation capability/connector package to plugin model (051 PL4-07).

  - `@appspine/oidc-delegation`: declare backend and operations facets, `configSchema`, environment variable specifications with secret redaction for `OIDC_DELEGATION_SOURCE_CLIENT_SECRET`, and integration contract references in `appspine.plugin.json` and `./plugin`; expose plugin descriptor `oidcDelegationPlugin` and helper `oidcDelegation()`; implement `IdentityDelegationPort` on `OidcDelegationService`; export `IDENTITY_DELEGATION` token (`Symbol.for('appspine.identity-delegation')`) from `OidcDelegationModule.forRoot()`; add classic/node10 `moduleResolution` compatibility shims (`plugin.js`, `plugin.d.ts`).
  - `@appspine/plugin-api`: add `IdentityDelegationPort`, `ExchangeDelegatedTokenPortInput`, `DelegatedAccessTokenResult` to `./ports` and `DelegatedPrincipalContext` to `./principal`.
