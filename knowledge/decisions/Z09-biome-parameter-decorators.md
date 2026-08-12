---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z09 - Template `biome.json` missing `unsafeParameterDecoratorsEnabled`

## Context

While continuing `_archive/dev_docs-20260803/app-wiki/011-task-breakdown.md` from T-1140 (Pages module), ran `pnpm exec biome check
backend/src` for the first time against wiki's own NestJS controllers (previous groups only ran
`typecheck` + `build`, never `biome check`, per their recorded verification steps).

## Finding

`biome check` reported dozens of `parse` errors — "Decorators are not valid here" — on every
parameter decorator (`@Param()`, `@Body()`, `@CurrentUser()`, etc.) across **every** wiki controller,
including ones already merged in earlier groups (`spaces.controller.ts`, `space-members.controller.ts`
from T-1131/T-1133), not just the new Pages/Trash controllers. Even a single-parameter method like
`findAll(@CurrentUser() user: WikiUser)` triggered it — this isn't about parameter count, Biome simply
doesn't parse parameter decorators at all without an explicit opt-in.

Root cause: `appspine-app-template/biome.json` (and therefore `apps/wiki/biome.json`, forked from it)
never set `javascript.parser.unsafeParameterDecoratorsEnabled`. NestJS's controller pattern relies on
parameter decorators throughout, so this makes `biome check` unusable on any NestJS controller the
template or its forks write — a latent gap that had gone unnoticed because template's own
`backend/src` has no controllers of its own (Users/Roles/API Keys management lives inside the
`@appspine/*` framework packages, each with their own correctly-configured `biome.json` — the
monorepo's `appspine/biome.json` already has this setting). Wiki is the first app to write NestJS
controllers directly in `backend/src`, so it's the first place this gap could surface.

## Resolution

Added to both `appspine-app-template/biome.json` and `apps/wiki/biome.json`:

```json
"javascript": {
  "parser": {
    "unsafeParameterDecoratorsEnabled": true
  },
  "formatter": { ... }
}
```

(Matches the setting already present in `appspine/biome.json`.)

After the fix, `biome check --write backend/src` in wiki auto-fixed the remaining (genuine, non-parse)
import-order/formatting findings across 6 files. Final state: 0 errors, 7 `lint/suspicious/noExplicitAny`
warnings (exit code 0) — all on `PrismaService`-derived callback parameters that resolve to `any`
because `PrismaService` is declared `[key: string]: any` (see `@appspine/common`'s
`prisma.service.d.ts`), the same pattern `auranest-wiki`'s reference implementation already used
(explicit `: any` annotations) for the same reason.

## Verification

```powershell
pnpm exec biome check apps/wiki/backend/src   # 0 errors, 7 pre-existing-pattern warnings
pnpm -C apps/wiki/backend typecheck           # passes
pnpm -C apps/wiki/backend build                # passes
```

## Follow-up

- Retroactively, `_archive/dev_docs-20260803/app-wiki/011-task-breakdown.md` T-1131/T-1133 never ran `biome check` (only
  `typecheck`/`build`), so this gap existed unnoticed in already-"completed" tasks. No functional bug
  resulted — the compiled output was correct either way, since Biome's parser failure doesn't affect
  `tsc`/`nest build`. Not reopening those tasks; this fix covers them going forward.
- Any other app forked from `appspine-app-template` **before** this fix lands in the template's `main`
  branch will need the same one-line addition to its own `biome.json` (wiki's copy is already fixed
  directly, as recorded here).

