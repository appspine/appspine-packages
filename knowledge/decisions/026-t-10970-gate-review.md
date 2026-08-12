---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-17
updated: 2026-08-03
---

# 026 T-10970 Domain Events Extraction Gate Review

Date: 2026-07-17 (rerun 2026-07-17, see remediation notes below)

Result: **passed**. H group (`T-11000+`) is unfrozen.

This review evaluates the plan §11.1 G1-G7 extraction gates. It does not execute extraction work.

## Summary

| Gate | Result | Evidence |
| --- | --- | --- |
| G1 atomicity proven | Pass | Positive browser/manual evidence in T-10950, plus reverse rollback evidence: `apps/approve/backend/scripts/test-approval-submit-rollback.ts` (commit `3709975`, `apps/approve`), run against the real `approve-db-1` DB on port `23060`. See rerun note below for output. |
| G2 core API stable | Pass | Last 10 approve commits do not change `DomainEventsService.record()` signature, `DomainEventRegistry` interface, or `DomainEvent`/`DomainEventDelivery` schema. |
| G3 no event-type special cases | Pass | Seven event types are live; core grep found no event-type constants or `eventType` branch logic in record/fan-out/registry/dispatcher files. |
| G4 reliability mechanisms proven | Pass | T-10940/T-10950 include real retry, dead-letter, stale-lock, webhook duplicate, and audit idempotency evidence. |
| G5 second app desk-check | Pass | Project app `ProjectIssue.status_changed` desk-check below can be written without changing the core API. |
| G6 extraction boundary clear | Pass | File boundary list below has no unresolved item. |
| G7 release cost evaluated and dry-run | Pass | Throwaway `appspine/` worktree dry-run: `_archive/dev_docs-20260803/domain-events/026-t-10970-g7-dry-run-evidence.md`. Dependency graph reviewed, package built, versioned, and publish-dry-run verified without polluting the main monorepo state. |

All seven gates pass. H group (`T-11000+`) may start.

## G1 Atomicity

Positive evidence:

- `apps/approve/docs/verification/t-10950-timeline.md`
- `apps/approve/docs/verification/t-10950-browser-approval-check.json`
- `apps/approve/docs/verification/t-10950-browser-submit.png`
- `apps/approve/docs/verification/t-10950-browser-approved.png`

The browser-created leave request `cmrojpzxo002cua3c26rxxw3h` reached `APPROVED`; approval instance
`cmrojr9yn002fua3chq2k39rm` emitted `submitted`, `approved`, and `step_approved` with seq
`43`, `44`, and `45`.

Missing evidence:

- Plan §10-2 requires a test where `onSubmitted()` throws and the transaction rolls back with zero
  `ApprovalInstance`, `DomainEvent`, and `DomainEventDelivery` rows.
- T-10840 added static wiring guards and Z15 checks, but it did not run the reverse rollback
  scenario against the real transaction path.

Required remediation:

- Add and run a focused reverse atomicity verification against `ApprovalInstancesService.submit()`.
- The test must force a registered `ApprovalEnabledService.onSubmitted()` implementation to throw
  inside the transaction, then assert zero residual approval instance, domain event, and delivery rows.
- Commit that verification in `apps/approve`, update T-10950 or add a T-10970 remediation note, then
  rerun this gate.

## G2 Core API Stability

Recent approve commits:

```text
5f2250d docs(domain-events): document agent entrypoint
917ab36 docs(domain-events): add operations guide
6705454 test(domain-events): verify manual acceptance gates
aaf424f test(domain-events): verify webhook retry flow
1d3332e feat(domain-events): add webhook admin pages
613eaf7 feat(domain-events): add admin event pages
f96bdfd feat(domain-events): add admin event API
3b547d5 feat(domain-events): post webhook deliveries
5ae0dd7 feat(domain-events): add webhook subscription API
7665993 feat(domain-events): write audit logs from events
```

`git log --name-only --oneline -10` shows no changes to `backend/prisma/schema/domain-events.prisma`.
The recent `backend/src/domain-events` changes are admin API/UI support, webhook adapter, and handler
integration. They do not alter the `record(tx, input)` call shape, registry public methods, or delivery
schema.

## G3 No Event-Type Special Cases

Live event types:

- `submitted`
- `step_approved`
- `approved`
- `rejected`
- `withdrawn`
- `add_signed`
- `transfer_signed`

Core files checked:

- `backend/src/domain-events/domain-events.service.ts`
- `backend/src/domain-events/domain-event-dispatcher.service.ts`
- `backend/src/domain-events/domain-event-registry.ts`
- `backend/src/domain-events/diff-changed-fields.ts`

Grep for event constants and event-type branches in these files returned no matches. Event-specific
logic is kept in app wiring and handlers, not in record/fan-out/dispatcher core.

## G4 Reliability

Evidence:

- Retry/dead-letter/admin retry: `apps/approve/docs/verification/t-10940-timeline.md`
- Echo server log: `apps/approve/docs/verification/t-10940-echo.log`
- Dead-letter screenshot: `apps/approve/docs/verification/t-10940-dead-letter.png`
- Retry processed screenshot: `apps/approve/docs/verification/t-10940-retry-processed.png`
- Stale audit idempotency: `apps/approve/docs/verification/t-10950-stale-audit.json`
- Webhook duplicate same event id: `apps/approve/docs/verification/t-10950-stale-webhook.json`
- Webhook duplicate receiver log: `apps/approve/docs/verification/t-10950-stale-webhook.log`

## G5 Project App Desk-Check

Candidate: `apps/project` issue status change.

Event constant draft:

```ts
export const ProjectIssueEvents = {
  StatusChanged: "project_issue.status_changed",
} as const;
```

Snapshot draft:

```ts
function projectIssueSnapshot(issue: {
  id: string;
  projectId: string;
  issueKey: string;
  status: ProjectIssueStatus;
  columnId: string | null;
  updatedAt: Date;
}) {
  return {
    id: issue.id,
    projectId: issue.projectId,
    issueKey: issue.issueKey,
    status: issue.status,
    columnId: issue.columnId,
    updatedAt: issue.updatedAt.toISOString(),
  };
}
```

`IssuesService.update()` wiring draft:

```ts
const before = await tx.projectIssue.findUniqueOrThrow({ where: { id } });
const updated = await tx.projectIssue.update({ where: { id }, data: dto });

if (dto.status !== undefined && before.status !== updated.status) {
  await this.domainEvents.record(tx, {
    aggregateType: "ProjectIssue",
    aggregateId: id,
    eventType: ProjectIssueEvents.StatusChanged,
    operation: "UPDATE",
    actorUserId: actorId,
    before: projectIssueSnapshot(before),
    after: projectIssueSnapshot(updated),
    changedFields: ["status", "updatedAt"],
    metadata: auditMeta,
  });
}
```

`IssuesService.move()` wiring draft:

```ts
const before = await tx.projectIssue.findUniqueOrThrow({ where: { id } });
const updated = await tx.projectIssue.update({
  where: { id },
  data: { columnId: dto.columnId, position: targetPosition, status },
});

if (before.status !== updated.status) {
  await this.domainEvents.record(tx, {
    aggregateType: "ProjectIssue",
    aggregateId: id,
    eventType: ProjectIssueEvents.StatusChanged,
    operation: "UPDATE",
    actorUserId: actorId,
    before: projectIssueSnapshot(before),
    after: projectIssueSnapshot(updated),
    changedFields: ["status", "columnId", "position", "updatedAt"],
    metadata: auditMeta,
  });
}
```

Subscription draft:

```ts
registry.on(ProjectIssueEvents.StatusChanged, projectIssueAuditHandler);
registry.on(ProjectIssueEvents.StatusChanged, projectIssueSearchIndexHandler);
```

Desk-check conclusion: the existing core API is sufficient. The project app would still need its own
Prisma schema rows/migration and app-local handlers/event constants, but no core API changes are
needed.

## G6 Extraction Boundary

Move into `@appspine/domain-events`:

- `backend/src/domain-events/diff-changed-fields.ts`
- `backend/src/domain-events/domain-event-registry.ts`
- `backend/src/domain-events/domain-event-dispatcher.service.ts`
- `backend/src/domain-events/domain-events.service.ts`
- `backend/src/domain-events/domain-event-errors.ts`
- `backend/src/domain-events/types.ts` after removing approval-specific aliases
- generic test helpers/scripts for diff, registry, service, and dispatcher behavior

Stay app-local:

- `backend/prisma/schema/domain-events.prisma` for now; each app owns its Prisma schema and migrations.
- `backend/src/domain-events/events.ts` approval event constants.
- `backend/src/domain-events/handlers/audit-record.handler.ts`.
- `backend/src/domain-events/handlers/webhook-post.handler.ts`.
- `backend/src/domain-events/webhook-secret.crypto.ts`.
- `backend/src/domain-events/webhook-subscriptions.*`.
- `backend/src/domain-events/domain-events-admin.*`.
- Frontend admin pages and i18n.
- `DOMAIN_EVENTS_*` env values and deployment tuning.
- Approval snapshot builders and all calls from `approval-instances.service.ts`.

No unresolved boundary item was found.

## G7 Release Cost

Observed package/dependency facts:

- New package would depend on Nest lifecycle/types and `@appspine/common`'s `PrismaService`.
- Existing packages that depend on `@appspine/common` include `audit-log`, `auth`, `health-check`,
  `m2m-api-key`, `metadata-schema`, and `rbac`.
- Z21 evidence is in `_archive/dev_docs-20260803/framework/Z21-shared-package-release-infra-gaps.md`; it documents
  the previous internal-dependency cascade and release-access hazards.
- The monorepo release scripts are Changesets based: `version-packages` runs `changeset version`,
  and `release` runs `pnpm -r run build && changeset publish`.

Dry-run status:

- Not completed.
- A meaningful dry-run requires creating `packages/domain-events/package.json`, adding exports,
  adding a changeset, and running the package build/version/publish path.
- T-10970 is still in the A-G scope where `appspine/` must not be modified, so this review cannot
  create the package or changeset only to dry-run release.

Required remediation:

- After G1 is fixed, either create a throwaway branch/worktree for `appspine/` dry-run evidence or
  move G7 dry-run into the first H task after explicitly allowing the package skeleton.
- The dry-run must include dependency graph output and show whether `@appspine/common` consumers
  would receive an internal dependency cascade.

## Decision

Do not continue to H group.

Remediation tasks:

1. Add reverse atomicity verification for `onSubmitted()` rollback and commit the result.
2. Produce real release dry-run evidence for `@appspine/domain-events` without polluting the main
   appspine monorepo state.
3. Rerun T-10970 after both pieces of evidence exist.

## 2026-07-17 Remediation Rerun Note

Result remains **failed**. H group remains frozen.

Updated gate status:

| Gate | Result | New evidence |
| --- | --- | --- |
| G1 atomicity proven | **Fail** | `apps/approve/backend/scripts/test-approval-submit-rollback.ts` was added locally and passes TypeScript/biome checks, but the real DB run is still blocked. `pnpm -C backend exec dotenv -e ../.env -- ts-node scripts/test-approval-submit-rollback.ts` fails with `PrismaClientInitializationError P1001`: cannot reach database server at `localhost:23060`. `com.docker.service` is stopped and cannot be started from this session. |
| G7 release cost evaluated and dry-run | Pass | Throwaway worktree evidence: `_archive/dev_docs-20260803/domain-events/026-t-10970-g7-dry-run-evidence.md`. `appspine/` main worktree remained clean; the registered dry-run worktree and branch were discarded. |

G7 conclusion:

- The dry-run package built successfully after removing app-generated Prisma model type imports from the package skeleton and using structural core types while keeping `domain-events.prisma` app-local.
- `pnpm changeset version` produced `@appspine/domain-events@0.1.0`.
- The installed Changesets CLI does not support `changeset publish --dry-run`; equivalent `pnpm -r publish --dry-run --no-git-checks --access restricted` showed only `@appspine/domain-events@0.1.0` would be published.
- Existing `@appspine/common` consumers (`audit-log`, `auth`, `health-check`, `m2m-api-key`, `metadata-schema`, `rbac`) had no `package.json` cascade after `changeset version`.

Remaining remediation before T-10970 can pass:

1. Start the approve DB on port `23060`.
2. Run `pnpm -C backend exec dotenv -e ../.env -- ts-node scripts/test-approval-submit-rollback.ts`.
3. Commit the successful G1 verification in `apps/approve` and add the commit SHA/output summary to `_archive/dev_docs-20260803/domain-events/026-task-breakdown.md`.
4. Rerun T-10970 G1-G7 and change the top-level result only after all gates pass.

## 2026-07-17 Second Rerun Note (G1 closed)

The blocker was not `com.docker.service`: Docker Desktop's engine was already reachable
(`docker version`/`docker ps` succeeded), but no containers were running. `approve-db-1` had
simply not been started for this session.

Steps taken:

- `docker compose up -d db` in `apps/approve` started `approve-db-1` on port `23060`; the
  container reached `health: healthy` within ~15s.
- Ran `pnpm -C backend exec dotenv -e ../.env -- ts-node scripts/test-approval-submit-rollback.ts`
  against the real database.

Output:

```text
T-10970 submit rollback probe passed
{
  "entityType": "T10970RollbackProbe",
  "entityId": "t-10970-rollback-entity",
  "residuals": {
    "approvalInstances": 0,
    "domainEvents": 0,
    "domainEventDeliveries": 0
  }
}
```

`onSubmitted()` threw inside the transaction and `ApprovalInstancesService.submit()` rejected
with the expected error; all three tables showed zero residual rows for the probe entity.
Committed as `apps/approve` commit `3709975`
(`test(domain-events): verify submit rollback atomicity`).

G1 is now **Pass**. Combined with the G7 pass above, all seven gates pass. **H group
(`T-11000+`) is unfrozen.**

