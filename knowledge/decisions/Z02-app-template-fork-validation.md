---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z02 - App Template Fork Validation Follow-ups

## Summary

This note captures issues found during the 2026-07-02 fork validation run against
`appspine/smoke-test-app`, created from `appspine/appspine-app-template`.

Validation outcome:

- Fork creation, scaffold, local boot, Announcement CRUD implementation, and GitHub Actions E2E CI all succeeded.
- CI run `28580255904` on `appspine/smoke-test-app` completed successfully.
- One new flaky local-only E2E issue was observed and should be followed up in the framework package.

## New Findings

### 1. `@appspine/e2e-kit` auth storage state can race under parallel local Playwright runs

- Area: `appspine/packages/e2e-kit/src/auth.fixture.ts`
- Severity: Medium
- Status: New follow-up needed

Observed behavior:

- A local full-suite run of `pnpm -C e2e test` failed once with:
  `SyntaxError: Error reading storage state from ...\\e2e\\.auth\\admin.json: Unexpected end of JSON input`
- The failing stack pointed at `createAuthFixtures()` loading `admin.json`.
- A single-spec run of `announcements.spec.ts` passed.
- GitHub Actions CI run `28580255904` also passed, so this is currently a flaky / environment-sensitive issue rather than a deterministic CI blocker.

Likely cause:

- `ensureStorageState()` always logs in and rewrites the same `storageStatePath`.
- When multiple Playwright workers initialize auth fixtures at the same time, they can write/read the same `.auth/admin.json` concurrently.

Suggested fix direction:

- Update `@appspine/e2e-kit` to avoid concurrent writes to the same storage-state file.
- Options include:
  - cache-per-worker storage state paths, or
  - guard writes with a file lock / single-flight mechanism, or
  - skip regeneration when a valid storage-state file already exists.

Impact on this validation:

- Does not invalidate the fork validation result because the real fork CI completed successfully.
- Should still be tracked because it can produce confusing local false negatives for future app teams.

### 2. Validation docs mention an outdated app config path

- Area: `_archive/dev_docs-20260803/app-template/008-task-breakdown.md` / `_archive/dev_docs-20260803/app-template/008-app-template-fork-validation-plan.md`
- Severity: Low
- Status: Doc follow-up

Observed behavior:

- Validation instructions refer to `frontend/src/app/app-config.ts`.
- The actual template path used by the forked repo is `frontend/src/config/app-config.ts`.

Impact:

- No product or CI breakage.
- Can slow down manual verification by pointing reviewers at a non-existent file.

### 3. CRUD conventions should explicitly require non-interactive Prisma migration naming

- Area: `_archive/dev_docs-20260803/framework/002-app-dev-conventions.md`
- Severity: Low
- Status: Fixed in docs

Observed behavior:

- During T-805, Prisma migration creation paused waiting for an interactive migration name.
- This is easy to miss in agent-driven execution and can look like a hang.

Resolution:

- Updated `002-app-dev-conventions.md` step 1 to require an explicit non-interactive command such as:
  `pnpm -C backend prisma:migrate -- --name add-announcements`
- Added a naming convention note to prefer short kebab-case migration names.

## Reproduction Notes

Successful validation checkpoints:

- `gh repo create appspine/smoke-test-app --template appspine/appspine-app-template --private`
- `node scripts/scaffold-init.mjs --name smoke-test-app --display-name "Smoke Test App"`
- Local boot:
  - `pnpm install`
  - `docker compose up -d db`
  - `pnpm -C backend prisma:migrate`
  - `pnpm -C backend prisma:seed`
  - `pnpm dev`
  - `GET http://localhost:3900/health`
- CRUD commit:
  - `d3b26ba feat: add announcements module`
- Successful CI:
  - workflow `E2E`
  - run id `28580255904`

