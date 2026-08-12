---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-17
updated: 2026-08-03
---

# 026 T-10970 G7 Release Dry-Run Evidence

Date: 2026-07-17

Scope: throwaway `appspine/` worktree only. Main `appspine/` was not modified.

Worktree:

- Base commit: `95371c8f429e71b7f1a11ffabaf805c0c73d7580`
- Branch: `t-10970-domain-events-dry-run`
- Package skeleton added only in the worktree: `packages/domain-events`
- Changeset added only in the worktree: `.changeset/t-10970-domain-events-dry-run.md`

## Skeleton Boundary

The dry-run package used the G6 core boundary:

- `diff-changed-fields.ts`
- `domain-event-registry.ts`
- `domain-event-dispatcher.service.ts`
- `domain-events.service.ts`
- `domain-event-errors.ts`
- `types.ts`

The package did not include app-local Prisma schema, approval event constants, audit/webhook handlers, admin API/UI, or webhook subscription services.

During the first build attempt, direct imports of generated app Prisma symbols failed:

```text
src/domain-event-dispatcher.service.ts(3,15): error TS2305: Module '"@prisma/client"' has no exported member 'DomainEvent'.
src/domain-event-registry.ts(1,15): error TS2305: Module '"@prisma/client"' has no exported member 'DomainEvent'.
src/types.ts(1,15): error TS2305: Module '"@prisma/client"' has no exported member 'DomainEventOperation'.
```

Resolution in the throwaway package: use structural core types and accept the app-provided generated Prisma transaction client at the service boundary. This confirms the extraction boundary must not depend on app-generated model exports while `domain-events.prisma` remains app-local.

## Dependency Graph

Command:

```text
pnpm -r list --depth 1 --filter @appspine/domain-events --filter @appspine/audit-log --filter @appspine/auth --filter @appspine/health-check --filter @appspine/m2m-api-key --filter @appspine/metadata-schema --filter @appspine/rbac
```

Relevant output:

```text
@appspine/domain-events@0.0.0 ...\packages\domain-events
dependencies:
└─ @appspine/common@link:../common

@appspine/audit-log@0.4.0 ...\packages\audit-log
dependencies:
└─ @appspine/common@link:../common [deduped]

@appspine/auth@2.0.0 ...\packages\auth
dependencies:
├─ @appspine/common@link:../common [deduped]
└─ devDependency @appspine/audit-log@link:../audit-log

@appspine/health-check@0.1.2 ...\packages\health-check
dependencies:
└─ @appspine/common@link:../common [deduped]

@appspine/m2m-api-key@2.1.1 ...\packages\m2m-api-key
dependencies:
├─ @appspine/auth@link:../auth
└─ @appspine/common@link:../common [deduped]

@appspine/metadata-schema@0.2.6 ...\packages\metadata-schema
dependencies:
├─ @appspine/common@link:../common [deduped]
└─ @appspine/m2m-api-key@link:../m2m-api-key

@appspine/rbac@2.0.0 ...\packages\rbac
dependencies:
├─ @appspine/auth@link:../auth [deduped]
└─ @appspine/common@link:../common [deduped]
```

Cascade check:

- `git diff -- packages/audit-log/package.json packages/auth/package.json packages/health-check/package.json packages/m2m-api-key/package.json packages/metadata-schema/package.json packages/rbac/package.json` returned no diff after `changeset version`.
- `git diff --stat` showed only `pnpm-lock.yaml` plus the new untracked `packages/domain-events/` files.
- Lockfile diff added only the new `packages/domain-events` importer with `@appspine/common: workspace:*`.

Conclusion: adding `@appspine/domain-events` as a new package that depends on `@appspine/common` does not pull existing `@appspine/common` consumers into an internal dependency cascade. The Z21 cascade hazard remains relevant when an existing shared package is bumped and consumed by other packages, but this isolated new package did not modify the existing consumer package manifests.

## Build And Version

Command:

```text
pnpm -r run build
```

Result:

```text
packages/domain-events build: Done
packages/common build: Done
packages/audit-log build: Done
packages/auth build: Done
packages/health-check build: Done
packages/m2m-api-key build: Done
packages/mcp-server build: Done
packages/metadata-schema build: Done
packages/rbac build: Done
packages/e2e-kit build: Done
packages/frontend-shell build: Done
```

Command:

```text
pnpm changeset version
```

Result:

```text
All files have been updated. Review them and commit at your leisure
```

Observed version result:

- `packages/domain-events/package.json` moved from `0.0.0` to `0.1.0`.
- `packages/domain-events/CHANGELOG.md` was created.
- The changeset file was consumed.

## Publish Dry-Run

Requested command:

```text
pnpm changeset publish --dry-run
```

Result:

```text
error Unknown flag for publish: --dry-run
Usage: changeset publish [--tag <name>] [--otp <code>] [--no-git-tag]
```

The installed Changesets CLI therefore does not support the requested dry-run flag. Equivalent package-manager publish dry-run was run:

```text
pnpm -r publish --dry-run --no-git-checks --access restricted
```

Result:

```text
@appspine/domain-events@0.1.0 -> https://npm.pkg.github.com/
Skip publishing @appspine/domain-events@0.1.0 (dry run)
```

Conclusion: the release path can build and version the package, and a publish dry-run targets only `@appspine/domain-events@0.1.0`. The only release-script gap found is that `changeset publish --dry-run` is not a supported command with the current Changesets CLI; use `pnpm -r publish --dry-run --no-git-checks --access restricted` for dry-run evidence unless the release tooling is upgraded or wrapped.

