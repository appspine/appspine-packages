---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z04 - Template Backend Start Entrypoint
> 註：本檔編號與 app-calendar 的 Z04 衝突，屬 framework 之獨立記錄。

## Context

During 011 T-1095 verification, `pnpm -C backend build` succeeded, but `pnpm -C backend start` failed before the NestJS app could boot.

## Finding

The existing template backend `start` script pointed to `dist/main`, while the current Nest build output is `dist/src/main.js`.

Observed error:

```text
Error: Cannot find module 'D:\Source\Private\appspine\appspine-app-template\backend\dist\main'
```

## Resolution

Update `appspine-app-template/backend/package.json`:

```json
"start": "dotenv -e ../.env -- node dist/src/main"
```

This keeps the build layout unchanged and makes the existing start command match the actual compiled entrypoint.

## Verification

Re-run as part of 011 T-1095:

```powershell
pnpm -C backend build
pnpm -C backend start
```

Then verify `GET /health` returns 200.

