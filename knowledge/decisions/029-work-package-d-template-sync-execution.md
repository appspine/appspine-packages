---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-20
updated: 2026-08-03
---

# 029 Work Package D - Template Sync Execution Record

Date: 2026-07-20

Scope: replay `appspine-app-template` changes after `7214f00` through `918b70b` for the six existing business apps: `wiki`, `calendar`, `drive`, `chat`, `project`, and `approve`.

Authoritative source:

- `docs/agent-guide.md` - Template change propagation workflow.
- `_archive/dev_docs-20260803/framework/029-task-breakdown.md` - Work Package D tasks `T-11440` through `T-11465`.
- `appspine-app-template/scripts/list-template-changes.mjs 7214f00` - replay checklist.

## Replay Summary

The app source/config deltas from the Work Package D template window were already present in the six apps from the Work Package B/C propagation commits. This package formalized the sync state by updating each app's `docs/template-sync.md` to:

- move `Last synced template commit` from `7214f00` to `918b70b`;
- add a Work Package D replay table mapping each upstream template commit to the app commit(s) that already applied the change;
- mark docs-only template commits as `N/A` where no app source replay was required.

## Apps Synced

| App | Task | Sync Log Updated | Source State Confirmed |
|---|---|---|---|
| `apps/wiki` | `T-11440` | `apps/wiki/docs/template-sync.md` | `@appspine/*` pins current; domain-events module/schema/checks present; local `select`, `use-mobile`, `layout-utils`, and `theme-utils` copies absent; breadcrumb wrapper uses `@appspine/frontend-shell`. |
| `apps/calendar` | `T-11445` | `apps/calendar/docs/template-sync.md` | Same template-sync surface confirmed. |
| `apps/drive` | `T-11450` | `apps/drive/docs/template-sync.md` | Same template-sync surface confirmed; drive-specific package overrides preserved. |
| `apps/chat` | `T-11455` | `apps/chat/docs/template-sync.md` | Same template-sync surface confirmed; previous breadcrumb drift is closed by the shared `HeaderBreadcrumbs` wrapper. |
| `apps/project` | `T-11460` | `apps/project/docs/template-sync.md` | Same template-sync surface confirmed. |
| `apps/approve` | `T-11465` | `apps/approve/docs/template-sync.md` | Same template-sync surface confirmed; approve-specific domain-events barrel import preserved. |

## Verification

Commands were run with `npm.cmd --prefix ...` and local `node_modules/.bin` because `pnpm` was not on PATH and Corepack could not download pnpm in the network-restricted sandbox. Backend tests were run with `JWT_SECRET=dev-secret` and `AUTH_MODE=local` where needed by the fail-loud auth behavior.

| App | Typecheck | Biome | Backend Tests | Domain Events Drift/Subscribers | Frontend Build |
|---|---|---|---|---|---|
| `wiki` | Pass | Pass, existing warnings only | Pass: 1 file, 3 tests | Pass | Blocked: `next/font` failed to fetch Google Fonts because outbound network is blocked. |
| `calendar` | Pass | Pass | Pass: 1 file, 3 tests | Pass | Blocked: same Google Fonts network fetch. |
| `drive` | Pass | Pass | Pass: 2 files, 4 tests | Pass | Blocked: same Google Fonts network fetch. |
| `chat` | Pass | Pass | Pass: 1 file, 3 tests | Pass | Blocked: same Google Fonts network fetch. |
| `project` | Pass | Pass, existing `noExplicitAny` warnings only | Pass: 2 files, 7 tests | Pass | Blocked: same Google Fonts network fetch. |
| `approve` | Pass | Pass | Pass: 1 file, 24 tests | Pass | Blocked: same Google Fonts network fetch. |

## Open Gaps

- `next build` could not be completed in this sandbox for any of the six apps because the build fetches Google Fonts through `next/font/google`, and outbound network access is blocked. The failure is unrelated to the Work Package D documentation-only changes.
- `wiki` and `project` still emit pre-existing Biome `noExplicitAny` warnings. Biome exited successfully; no new warnings were introduced by this package.

