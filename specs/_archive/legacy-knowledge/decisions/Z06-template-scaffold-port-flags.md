---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z06 - Template scaffold port flags
> 註：本檔編號與 app-calendar 的 Z06 衝突，屬 framework 之獨立記錄。

## Context

When creating `apps/wiki` from `appspine-app-template`, the default Postgres host port `23900` conflicted with another local template database container. The template already exposed port-related environment variables in `.env.example`, but `scripts/scaffold-init.mjs` did not provide a way to assign per-app ports during fork initialization.

## Decision

Add explicit scaffold flags for local ports:

- `--db-port`
- `--backend-port`
- `--frontend-port`

The scaffold script validates that the ports are numeric, in TCP range, and distinct. It updates `.env.example`, `DATABASE_URL`, CORS, `NEXT_PUBLIC_API_URL`, and the frontend dev script together so new forks do not require manual multi-file port edits.

## Validation

Ran:

```powershell
node scripts/scaffold-init.mjs --name wiki --display-name "Wiki" --db-port 23910 --backend-port 3910 --frontend-port 3911 --dry-run
```

Result: dry-run validated all replacement rules without writing files.

Ran:

```powershell
node scripts/scaffold-init.mjs --name wiki --display-name "Wiki" --db-port 3910 --backend-port 3910 --frontend-port 3911 --dry-run
```

Result: failed with `--db-port, --backend-port, and --frontend-port must be distinct.`

