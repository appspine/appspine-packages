---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 PL5-03 — App Template 切換至 Canary Plugin Mode 報告

> Task：`PL5-03`（見 [051 拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md#9-phase-5--release全-app-rollout-與-transition-window)）。  
> 建議 Owner：Terra xhigh 執行／Gemini integration review；實際執行：Gemini 3.7 Flash（見 [§8 substitution log](#8-agent-替代與校準紀錄-substitution-log)）。  
> 依賴：[PL5-02](051-pl5-02-canary-publish.md)（已完成）。  
> Template 目標分支：`051-pl5-03-canary-plugin-mode`（Commit: `6456d78`）。  
> 驗證腳本：[`scripts/051-pl5-03-template-canary.mjs`](../../scripts/051-pl5-03-template-canary.mjs)。  

---

## 1. 執行摘要 (Executive Summary)

依據 [051 計畫書 §3、§7、§9](../decisions/051-plugin-platform-engineering-plan.md)，已於 `appspine-app-template` 倉庫完成全面升級與 Canary Plugin Mode 切換：

1. **升級至 Canary 版本 (Version Upgrades)**：
   - `backend` 與 `frontend` 全面升級至 PL5-02 的 Canary 版本（包含 `@appspine/preset-standard@^2.0.0`、`@appspine/plugin-host-nest@^2.0.0`、`@appspine/plugin-api@^1.1.0` 及全部 capability plugins）。
2. **預設 Plugin Mode 與 Legacy Escape Hatch (Default Plugin Mode)**：
   - 更新 `backend/src/app.module.ts`，將 Plugin Mode 設為**預設值**（`APPSPINE_PLUGIN_MODE !== "0"`）。
   - 保留過渡期 Legacy Escape Hatch（設置 `APPSPINE_PLUGIN_MODE=0` 可無縫切回傳統 hand-wired 模式，零 migration、零資料異動）。
3. **重新產生 Composition 與 Lockfile (Artifacts Generation)**：
   - 執行 `appspine build`，重新生成 `.appspine/generated/` 8 項產物（backend composition、catalog、admin routes、i18n、navigation、slots、permissions、schema.prisma）以及 `appspine.plugin-lock.json`。
4. **端到端 11 階段真實驗證 (End-to-End Verification)**：
   - 包含 Zero-Drift 檢查、`appspine doctor`（10 enabled, 0 findings）、Prisma generation、全庫 typecheck、雙模式單元測試（11/11 tests pass）、以及對獨立 Disposable Postgres 的**真實開機測試（`app.listen()` HTTP 404 回應證明）**。

---

## 2. 變更檔案清單 (Modified Files in Template)

| 檔案路徑 | 變更說明 |
|---|---|
| `backend/package.json` | 升級 `@appspine/*` 依賴至 Canary 版本，加入 `@appspine/preset-standard`、`@appspine/plugin-host-nest`、`@appspine/plugin-api`。 |
| `frontend/package.json` | 升級 `@appspine/frontend-shell` 與前端 subpath imports。 |
| `pnpm-workspace.yaml` | 更新 overrides 指向 Canary 版本。 |
| `backend/src/app.module.ts` | 預設啟用 Plugin Mode（`APPSPINE_PLUGIN_MODE !== "0"`），支援 `0` 切回 Legacy。 |
| `backend/src/app.module.spec.ts` | 更新測試案例驗證預設 Plugin Mode 與 `APPSPINE_PLUGIN_MODE=0` escape hatch。 |
| `backend/src/notifications/notifications.module.ts` | 顯式 import `AppspineAuthInfrastructureModule`。 |
| `backend/.appspine/generated/*` | 由 `appspine build` 產生之 8 項組裝產物。 |
| `backend/appspine.plugin-lock.json` | 插件依賴與 manifest 雜湊鎖定檔。 |

---

## 3. 驗證結果與證據 (Verification Results)

執行自動化驗證腳本 [`scripts/051-pl5-03-template-canary.mjs`](../../scripts/051-pl5-03-template-canary.mjs)：

```text
=== Stage 4: Regenerating plugin artifacts (appspine build) ===
info [artifacts-written]: wrote 8 artifacts and appspine.plugin-lock.json

=== Stage 5: Verifying zero drift (appspine build --check) ===
info [artifacts-current]: 8 artefact(s) and appspine.plugin-lock.json up to date

=== Stage 6: Running appspine doctor ===
info [doctor-summary]: 10 enabled, 0 disabled, 0 unresolved, 0 without a manifest; 0 artefact(s) out of date; 0 lockfile finding(s)

=== Stage 7: Prisma generate ===
✔ Generated Prisma Client (v6.19.3)

=== Stage 8: Backend build and typecheck ===
$ tsc --noEmit -p tsconfig.json (Done, 0 errors)
$ nest build (Done)

=== Stage 9: Backend test suite (Dual-mode) ===
Test Files  5 passed (5)
Tests       11 passed (11) (含 Plugin Mode 預設與 Legacy Mode 測試)

=== Stage 10: Frontend typecheck ===
$ tsc --noEmit (Done, 0 errors)

=== Stage 11: Real NestJS Bootstrap in Plugin Mode against Disposable Postgres ===
Starting disposable postgres container appspine-pl503-db-...
Deploying prisma schema to disposable postgres...
Starting Nest backend in Plugin Mode...
✓ Backend responded with HTTP 404 — real app.listen() succeeded in Plugin Mode.
Cleaning up container...

===============================================================
PL5-03: TEMPLATE CANARY PLUGIN MODE VERIFICATION COMPLETED!
===============================================================
```

---

## 4. 下一步前置條件檢查 (Prerequisites for PL5-04 Wiki)

- [x] Template 已切換至 Canary Plugin Mode 並通過全套 build / test / doctor / drift / real bootstrap 驗證。
- [x] 可以正式進入 **PL5-04**（`wiki` Canary Rollout，接上 Dual-Mode 分支與 Plugin Host）。

---

## 8. Agent 替代與校準紀錄 (Substitution Log)

| 欄位 | 填寫內容 |
|---|---|
| **Task** | `PL5-03` |
| **Actual agent** | Google Gemini 3.7 Flash (High reasoning) |
| **Required class** | G2 implementation（原建議 Terra xhigh 執行／Gemini integration review） |
| **Substitution reason** | 當前環境無獨立 Terra session；由 Gemini 兼任 Template 依賴升級、預設切換、產物重新產生與真實啟動驗證，後續由 Claude 進行獨立審核。 |
| **Calibration** | 透過 Disposable Docker Postgres 進行真正的 NestJS `app.listen()` 啟動測試；完成 11 階段端到端檢驗；全套 Husky pre-commit hooks 與 Typecheck 綠燈。 |
| **Tools** | Repo read/write, Terminal, Git, PNPM, Docker, Biome, Vitest, TypeScript, Prisma |
| **Independent reviewer** | *(留白，待獨立審查者 Claude 填寫)* |
| **Evidence** | Template 分支 `051-pl5-03-canary-plugin-mode` (Commit `6456d78`)、本報告 `051-pl5-03-template-canary-plugin-mode.md`、腳本 `scripts/051-pl5-03-template-canary.mjs`。 |
