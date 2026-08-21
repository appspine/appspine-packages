# @appspine/plugin-cli

## 2.0.0

### Minor Changes

- edb7936: Add `build` and `doctor` (051 PL2-03).

  `build` is a generation framework plus one concrete generator. PL2-05, PL2-06 and PL2-07 each
  register a function against it, so determinism and drift detection are written once rather than
  three times. `--check` runs the same generation and compares instead of writing: a drift check on a
  different code path from the generator can only tell you the two disagree, never which is right.

  Artefacts record the digest of the inputs they came from, which lets `--check` distinguish three
  kinds of staleness — never generated, inputs changed, or the generator itself changed. That last
  one matters in practice: upgrading the CLI makes every App drift at once, and an operator needs to
  know that was not them.

  `.appspine/generated/catalog.json` is what the manifests alone can say: ids, versions, digests,
  enabled/disabled, provides/requires, routes, provider tokens, Prisma models, and environment key
  **names** with their required/secret flags. Never a value — a test sets a sentinel secret in the
  environment and asserts it does not appear, while the key's name must.

  `build` refuses to generate from an inventory that does not resolve. Artefacts from a broken graph
  would look authoritative, describe an App that cannot boot, and become what `doctor` compares
  against.

  `doctor` reports what is knowable without booting anything, and says so: `enabled` / `disabled` are
  inventory facts, but every entry's `runtimeState` is `unknown-until-boot`, because `failed` and
  `degraded` are lifecycle outcomes. Environment keys are checked for presence, never read. Drift gets
  its own exit code — the fix is "run build", not "change your inputs" — but any other error outranks
  it, so an unresolvable inventory is never reported as something a rebuild would fix.

- fd642e7: Add `add`, `remove`, `list`, `validate` and `config-stub` (051 PL2-02).

  Every mutating command computes a change plan first and applies it second, so `--dry-run` is
  literally the same code path stopping in the middle rather than a second description that can
  disagree with what actually happens. The diff it prints is a unified diff over the canonical
  serialisation — the exact text a reviewer will see in the pull request.

  The refusals are the substance:

  - `add` requires the package to be installed, because the CLI cannot preflight a manifest it cannot
    read; it rejects a second identical entry with `CONFLICT` rather than silently doing nothing; and
    it refuses outright when the resulting inventory would not resolve.
  - `remove` resolves the inventory _without_ the entry and declines if anything still enabled needs a
    capability only that entry provided — the alternative is discovering it during a deploy.
  - `list` never refuses to show the state just because it does not resolve. Someone running `list` is
    usually trying to find out why something is broken.
  - `validate` separates "an input is malformed" (`VALIDATION_FAILED`) from "the inputs are fine but
    do not compose" (`RESOLUTION_FAILED`), because a caller reacts to those differently.

  `add` records the dependency in `package.json` and stops there: installing reaches the network and
  mutates `node_modules`, so the CLI names the step instead of taking it. `remove` leaves
  `package.json` alone and says plainly that no data was deleted (051 decision 13).

  `CommandDefinition` now declares its own `flags`, so `--dry-run` on a read-only command is a usage
  error instead of a silent no-op.

- 63eb0cc: Generate `.appspine/generated/backend/composition.ts` (051 PL2-05).

  The one thing this generator exists to guarantee is **static imports**. 051 plan §6.4 and §9 both
  forbid resolving a package name at runtime, and the reason is not stylistic: a dynamic import is
  invisible to the bundler, to TypeScript and to a dependency scanner — the three readers this file is
  written for. Every plugin the App runs appears as a real `import` statement, in resolved
  registration order, deduplicated so a multi-instance plugin is one import and several entries.

  It emits TypeScript rather than JSON because the App compiles it: a wrong export name fails the
  build loudly instead of at boot. PL1-03 froze `GeneratedComposition` before this generator existed,
  so the host has had a working consumer of the shape the whole time.

  The import name is a convention (`health-check` → `healthCheckPlugin`), which makes it only as good
  as its enforcement — so `051-pl1-architecture-check.mjs` now asserts that every package with a
  manifest exports exactly that name from its `./plugin` subpath. A violation fails in the package
  that caused it rather than in some consumer's build days later.

  A disabled plugin is dropped from the imports, so it cannot reach the bundle, but stays in the
  inventory the file embeds, so the catalog can still report it as disabled.

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

- 6339d8a: Add `appspine.plugin-lock.json` (051 PL2-04).

  The lockfile is derived and committed, and that pair decides everything else about it. Derived, so
  `appspine build` regenerates it and `build --check` can assert it is current. Committed, so it is
  sorted, canonically formatted, and says as little as it can get away with — a human reads it as a
  diff.

  It records the _result_ of resolution: registration order, the capability graph, each instance's
  dependencies, and per package the version, manifest digest and Prisma fragment digest. It does not
  record tarball resolution or integrity — `pnpm-lock.yaml` owns those, and a second source of truth
  for which bytes are installed goes stale silently with nothing to say which one is right. It records
  environment keys by name only.

  The two lockfiles have to be read together, which is what the drift diagnostics are for. Upgrading a
  package through pnpm without rebuilding leaves a plugin lock describing the previous version's
  capability graph, and the App would boot on a graph nobody reviewed. Each kind of drift is named
  separately because the fix differs: a changed version means the package manager ran without a
  rebuild; a changed manifest digest at the _same_ version means the installed package was modified in
  place, which `doctor` deliberately does not treat as something a rebuild fixes.

  `build` now brings both kinds of derived state up to date in one command, because a repository where
  only one of them was refreshed is a repository whose lock describes a graph the App does not run.

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

### Patch Changes

- b895dbe: Give `doctor` the same generation inputs as `build` (051 PL2-09).

  `doctor` built its `GenerationInput` without the preset provenance `build` passes, so every
  artefact came out different and it reported drift against files `build --check` had just called
  current. Found against the real template, where it claimed four stale artefacts and four lockfile
  findings on a freshly built App.

  A diagnostic tool that cries wolf is a diagnostic tool people learn to ignore, so this is a
  correctness fix rather than cosmetics. `preset.spec.ts` now asserts a clean `doctor` immediately
  after a successful `build`, and goes red if the two inputs diverge again.

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
