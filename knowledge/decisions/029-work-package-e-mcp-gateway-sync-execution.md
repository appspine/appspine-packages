---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-20
updated: 2026-08-03
---

# 029 Work Package E - mcp-gateway Sync Execution Record

Date: 2026-07-20

Scope: `_archive/dev_docs-20260803/framework/029-task-breakdown.md` §6, tasks `T-11470` through `T-11485`, for `apps/mcp-gateway`.

Authoritative source:

- `docs/agent-guide.md` - Template change propagation workflow.
- `_archive/dev_docs-20260803/framework/029-task-breakdown.md` §6 - Work Package E tasks.
- `appspine-app-template/scripts/list-template-changes.mjs <sha>` - replay checklist.

## T-11470 - Corrected fork-time baseline

`apps/mcp-gateway/docs/template-sync.md` carried the literal `appspine-app-template` placeholder
(`5afc7ce (baseline)` plus the `1f7b106`/`abc1234`/`6d89a4e` example row) unmodified since fork —
`scaffold-init.mjs` never rewrites this file. `5afc7ce` predates the fork (`381f254`,
`2026-07-16T14:22:00+08:00`) by 8 days.

The real baseline was determined to be `c50f810` (`appspine-app-template`'s HEAD at fork time),
verified two ways: the fork's admin API-key page already has `c50f810`'s `meta.availableScopes`-driven
`scopeOptions`, and it lacks `@appspine/domain-events` (wired into the template only later, at
`0fe4169`). This halves the previously-estimated "18 commits behind" figure (from `5afc7ce`) to the
real gap of 6 code + 3 docs-only commits from `c50f810` to `918b70b`.

## T-11475 - `@appspine/domain-events` dependency

mcp-gateway had zero `@appspine/domain-events` wiring. Replayed the template's current (empty-registry)
adoption pattern — the same shape `0fe4169`/`faf7706`/`bee4d68`/`947270f` collectively produced upstream,
applied in one pass at the current package version rather than as four incremental steps:

- `backend/prisma/schema/domain-events.prisma` - `DomainEvent`/`DomainEventDelivery` models + two enums.
- `backend/prisma/schema/migrations/20260720075326_add_domain_events/migration.sql` - hand-authored
  (no live DB in this environment to run `prisma migrate dev`; SQL is the same deterministic
  `CREATE TABLE`/`CREATE INDEX` output as the template's own two migrations, combined into one).
- `backend/src/domain-events/domain-events.module.ts` - registry + dispatcher wired into `AppModule`,
  no handlers registered (no business events yet).
- `backend/src/app.module.ts` - added `DomainEventsModule` and `DomainEventsAdminModule.forRoot(...)`
  (working `GET /domain-events/catalog` from day one).
- `backend/scripts/check-domain-events-schema-drift.ts`, `check-domain-events-subscribers.ts` - copied
  verbatim from the template (generic, app-agnostic).
- `backend/package.json` - `@appspine/domain-events@^1.0.0` dependency + two `check:*` scripts.
- `.husky/pre-commit` - wired both new check scripts in.
- `.env.example` - added the commented `DOMAIN_EVENTS_*` dispatcher-tuning block.
- `frontend/messages/en.json`, `zh-TW.json` - added `enums.DomainEventOperation.*` and
  `enums.DomainEventDeliveryStatus.*` keys (`check:enum-i18n` failed without them).
- `docs/data-dictionary.md` - regenerated via `pnpm -C backend run schema:docs` (auto-generated, not
  hand-edited).

Did not add `docs/domain-events.md` or a `docs/conventions.md` pointer — none of the six already-synced
apps (`wiki`, `calendar`, `drive`, `chat`, `project`, `approve`) carry either, so this follows the
established fleet convention rather than over-documenting relative to peers.

## T-11480 - frontend-shell version alignment

Already at parity: `frontend/package.json` pins `@appspine/frontend-shell@^0.6.0`, resolved to `0.6.0`
in `pnpm-lock.yaml` — the latest published version, matching all six already-synced apps exactly. The
plan's "clearly behind" diagnosis was stale; no version bump was needed. No changes made for this task
beyond the verification below.

## T-11485 - Per-commit evaluation of the `c50f810`..`918b70b` window

| Upstream Commit | Disposition | Notes |
| --- | --- | --- |
| `5103cdf` | N/A - superseded | "Bump `@appspine/*` pins to latest published versions" — this repo's own ad-hoc bumps already exceed every version it sets. |
| `559e144` | N/A - superseded | Temporary `audit-log` revert to `0.4.x` after the registry briefly served an orphaned `0.5.0` build from the rolled-back 024 chat+n8n line. `audit-log` was later republished legitimately at `0.5.1`; this repo already pins `^0.5.1`, matching five of six already-synced apps (`drive` additionally carries a `pnpm-workspace.yaml` override for a `drive`-specific DI-split symptom this repo has not exhibited). |
| `0fe4169` | Replayed (T-11475) | Domain-events core wiring. |
| `3c0559d` | N/A - docs-only | `docs/domain-events.md` not carried by this repo (fleet convention). |
| `ce84b7a` | N/A - docs-only | Same as above. |
| `faf7706` | Replayed (T-11475) | Admin catalog module + `check:domain-events-subscribers` gate. |
| `bee4d68` | Replayed (T-11475) | Index folded into T-11475's single combined migration. |
| `947270f` | Replayed (T-11475) | Adopted `@appspine/domain-events@^1.0.0` directly; no intermediate pin existed to bump. |
| `918b70b` | Already present (`ed11cb1`) | "Use shared appspine utilities" — this repo's own `ed11cb1` (2026-07-20, predates this package) already migrated `header-breadcrumbs.tsx`, `layout-controls.tsx`, `preferences-provider.tsx`, and `sidebar.tsx` to `@appspine/frontend-shell` imports, and the local utility copies the template deletes (`select.tsx`, `use-mobile.ts`, `layout-utils.ts`, `theme-utils.ts`) were already absent. Verified by direct inspection of current file contents against the template's post-`918b70b` versions, not by re-diffing `ed11cb1` line-for-line. |

No app or template source files required new edits beyond the T-11475 domain-events wiring — the
`c50f810`..`918b70b` window's non-domain-events changes were either superseded by mcp-gateway's own
independent dependency work or already replayed ad-hoc by `ed11cb1`.

`apps/mcp-gateway/docs/template-sync.md` was updated: `Last synced template commit` moved to `918b70b`,
and a "Work Package E Replay" table records the mapping above.

## Verification

Run directly (pnpm was available in this environment; no sandbox workaround needed).

| Check | Result |
| --- | --- |
| `pnpm install` | Clean. |
| `pnpm -C backend prisma:generate` | Clean; new `DomainEvent`/`DomainEventDelivery` types generated. |
| `pnpm -C backend typecheck` | Pass. |
| `pnpm -C backend check` (Biome) | Pass, no warnings. |
| `pnpm -C backend check:domain-events-schema-drift` | Pass. |
| `pnpm -C backend check:domain-events-subscribers` | Pass. |
| `pnpm -C backend run schema:docs` + `check:schema-docs` | Regenerated `docs/data-dictionary.md`; check passes. |
| `pnpm -C backend check:enum-i18n` | Pass (after adding the two new enums' translations). |
| `pnpm -C backend test` (`JWT_SECRET=dev-secret AUTH_MODE=local`) | Pass: 24/24. |
| `frontend` `tsc --noEmit` | Pass. |
| `frontend` Biome check | Pass; 3 pre-existing `noExplicitAny` warnings, unrelated to this package. |
| `next build` (`NEXT_PUBLIC_API_URL` set) | **Pass** - full production build succeeded, unlike Work Package D's six apps (this environment had outbound network access for the Google Fonts fetch that blocked WP D). |

## Open Gaps

- The domain-events migration SQL was hand-authored, not generated by `prisma migrate dev` against a
  live database — no Postgres instance was reachable in this environment (`DATABASE_URL` points at
  `localhost:23070`, unreachable). The SQL is deterministic (`CREATE TABLE`/`CREATE INDEX`, no data
  transformation) and matches the template's own applied migrations byte-for-byte in structure, but it
  has not been run against a real database. Run `pnpm -C backend prisma:migrate` (or `prisma:deploy`)
  against a live dev DB before relying on the new tables.
- Gateway Bindings Panel and other mcp-gateway-specific customizations were not regression-tested in a
  browser (no live DB to run the app against). No source files under `gateway-profile/`, `vault/`, or
  the frontend bindings-panel component were touched by this package — only `app.module.ts` (two new
  module registrations) and new domain-events files — so the regression surface is limited, but this is
  not a substitute for an actual browser check before shipping.
- Committed as `apps/mcp-gateway` `9a92a3d` (domain-events wiring + baseline correction) and `3ba760a`
  (follow-up filling in `9a92a3d` as the replay commit SHA in `docs/template-sync.md`, which could not
  reference itself until after it existed).

