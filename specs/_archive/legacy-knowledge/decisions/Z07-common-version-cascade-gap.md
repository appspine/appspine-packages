---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z07 - `@appspine/common` internal-dependency cascade gap
> 註：本檔編號與 app-calendar 的 Z07 衝突，屬 framework 之獨立記錄。

## Context

`_archive/dev_docs-20260803/app-template/Z05-template-common-singleton-override.md` recorded a workaround (`pnpm-workspace.yaml`
override pinning `@appspine/common: 0.2.0` in `appspine-app-template`) for a NestJS DI failure caused
by two copies of `@appspine/common` (`0.2.0` direct, `0.1.1` nested under `@appspine/rbac@1.0.0`)
producing two distinct `PrismaService` class tokens.

That override made the symptom go away for `appspine-app-template`, but it did not fix the root
cause: the published `@appspine/rbac@1.0.0` (and several sibling packages) still declared
`"@appspine/common": "0.1.1"`. Every future app forked from the template — or any other consumer of
these packages — would hit the same duplicate-token failure unless it also added the same override.

## Root cause

`_archive/dev_docs-20260803/app-wiki/011-task-breakdown.md` T-1094 bumped `@appspine/common` `0.1.1 → 0.2.0` via a changeset
scoped to three packages (`@appspine/mcp-server`, `@appspine/common`, `@appspine/audit-log`). The
changesets config (`appspine/.changeset/config.json`) sets `"updateInternalDependencies": "patch"`,
so `changeset version` correctly proposed cascading a patch bump to every other in-monorepo consumer
of `@appspine/common` via `workspace:*` (`@appspine/rbac`, `@appspine/auth`, `@appspine/m2m-api-key`,
`@appspine/metadata-schema`, `@appspine/health-check`) so their published manifests would resolve to
the new version.

T-1094's execution result notes: "已修正 `changeset version` 自動產生的非目標 package bump，只保留三個
目標套件變更" — i.e. that cascade was deliberately discarded, following the task's "only touch the
three target packages" scoping language too literally. That scoping was meant to prevent unrelated
feature creep, not to block a same-dependency version-range fix that the tool itself flagged as
required. This is the actual defect: `@appspine/common` is a foundational package almost everything
in the monorepo depends on, so bumping it without letting the cascade complete leaves every dependent
package's published manifest pointing at a version that no longer exists as the "current" one.

## Resolution

Added a changeset (`appspine/.changeset/sync-common-0-2-0-across-framework-packages.md`) explicitly
bumping the five affected packages (patch, no functional code change) so `changeset version` rewrites
their `@appspine/common` dependency to the current `0.2.0` at publish time. Running it correctly
cascaded one level further to `@appspine/mcp-server` too (it depends on `@appspine/auth` and
`@appspine/m2m-api-key`, both bumped here), confirming the cascade now resolves cleanly end-to-end.

Additionally fixed three `peerDependencies` ranges that `changeset version` does **not**
auto-rewrite (only `dependencies`/`devDependencies` declared as `workspace:*` get resolved at publish
time; explicit semver ranges in `peerDependencies` are left as-is and only linted with a warning):
`@appspine/rbac`, `@appspine/auth`, `@appspine/m2m-api-key` each declared
`"@appspine/audit-log": "^0.2.0"` as a peer dependency, which no longer covers the `0.3.0` that
T-1094 also shipped. Bumped all three to `^0.3.0`.

Versions after this fix:

| Package | Before | After |
|---|---|---|
| `@appspine/rbac` | 1.0.0 | 1.0.1 |
| `@appspine/auth` | 1.0.0 | 1.0.1 |
| `@appspine/m2m-api-key` | 1.0.0 | 1.0.1 |
| `@appspine/metadata-schema` | 0.2.1 | 0.2.2 |
| `@appspine/health-check` | 0.1.1 | 0.1.2 |
| `@appspine/mcp-server` | 0.2.0 | 0.2.1 (cascade of the above) |

## Lesson for future changesets in this monorepo

When a changeset bumps a widely-depended-on package (`@appspine/common` in particular), let
`changeset version`'s internal-dependency cascade complete for **all** flagged packages, not just the
ones the task originally scoped in. "Don't expand scope" applies to functional changes, not to a
dependency-range fix the tool itself is telling you is required — discarding that cascade silently
reintroduces the exact duplicate-package/DI-token failure class this monorepo has already hit once
(Z05). If a maintainer genuinely wants to defer a specific package's re-publish, that decision should
be written down explicitly (which package, why, what breaks for consumers in the meantime), not
applied blanket to "everything the tool proposed beyond the original three."

## Verification

```powershell
pnpm -C appspine typecheck   # all 10 buildable packages pass
pnpm -C appspine build       # all 10 buildable packages pass
pnpm -C appspine test        # auth 3, m2m-api-key 7, metadata-schema 1, mcp-server 2 — all pass
```

`pnpm install` at the monorepo root shows no new duplicate `@appspine/common` resolution once these
packages are published and re-consumed.

## Follow-up (not done here)

- **Publish**: this task only ran `pnpm changeset` + `pnpm version-packages` (safe, local, no
  credentials needed). Publishing (`pnpm release`) needs a `GITHUB_TOKEN` with GitHub Packages write
  access, same as `_archive/dev_docs-20260803/app-wiki/011-task-breakdown.md` T-1094 — a human with that token needs to run it.
- **`appspine-app-template` / `apps/wiki`**: the `pnpm-workspace.yaml` override from Z05 is not
  required to be removed — it is harmless and still resolves to `0.2.0`. Once the five packages above
  are published and either repo bumps to consume them, the override can be dropped as it'll no longer
  be doing anything; leaving it in place in the meantime is not a problem and does not block ongoing
  `011-task-breakdown.md` execution (wiki continues from T-1140 unaffected by this fix).

