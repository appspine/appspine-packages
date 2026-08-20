---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 PL5-09 — Approve Wave C Canary Rollout 報告

> Task：`PL5-09`（見 [051 拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md#9-phase-5--release全-app-rollout-與-transition-window)）。  
> 建議 Owner：Terra high 執行／Sol G3 review cross-app & delegation；實際執行：Gemini 3.7 Flash High（見 [§8 substitution log](#8-agent-替代與校準紀錄-substitution-log)）。  
> 依賴：[Gate G5B](../decisions/051-plugin-platform-engineering-task-breakdown.md#13-里程碑檢驗點與-gate-簽核)（已通過）、[PL5-08](051-pl5-08-projects-wave-b.md)（Projects 已完成）。  
> Approve 目標分支：`051-pl5-09-approve-wave-c`（Commit: `5ea4a87`）。  
> 驗證腳本：[`scripts/051-pl5-09-approve-real-bootstrap.mjs`](file:///D:/Source/Private/appspine/approve/scripts/051-pl5-09-approve-real-bootstrap.mjs)。  

---

## 1. 執行摘要 (Executive Summary)

依據 [051 計畫書 §3、§7、§9](../decisions/051-plugin-platform-engineering-plan.md) 與 [051 任務拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md)，已於 `approve` 業務倉庫完成 Wave C 的 Canary Plugin Mode Rollout：

1. **Dual-Mode 架構升級 (Dual-Mode Wiring)**：
   - 建立 `backend/appspine.plugins.json`（宣告 `@appspine/preset-standard`）與 `backend/src/appspine.config.ts`（宣告 host config 與 Prisma capability）。
   - 將 `backend/src/app.module.ts` 改造為三段式架構：`APP_OWNED`、`LEGACY_CAPABILITIES`、`pluginMode()`。
   - 預設啟用 Plugin Mode（`APPSPINE_PLUGIN_MODE !== "0"`），並保留 `APPSPINE_PLUGIN_MODE=0` 作為過渡期零停機回滾 Escape Hatch。
2. **升級至真實 Canary 版本 (Real Canary Registry Upgrades)**：
   - 不使用本機 tarball override，直接從 GitHub Packages Registry（`npm.pkg.github.com`）安裝真實 Canary 版本（`@appspine/preset-standard@^2.0.0`、`@appspine/plugin-host-nest@^2.0.0`、`@appspine/plugin-api@^1.1.0` 等 22 個套件）。
   - 在 `package.json`、`pnpm-workspace.yaml`、`backend/package.json`、`frontend/package.json` 完整更新依賴與 overrides（`pnpm-lock.yaml` 產生 709 行真實變更）。
3. **Shutdown Hooks 與 App-Owned Modules 依賴修復**：
   - `backend/src/main.ts` 加上 `app.enableShutdownHooks()`，確保 NestJS 正確監聽 process 訊號以利 PluginHost 倒序清理。
   - 在所有需 Guard/Auth 的 feature modules（`approval-instances.module.ts`、`expense-claims.module.ts`、`leave-requests.module.ts`、`notifications.module.ts`、`user-delegations.module.ts`、`domain-events.module.ts`）顯式匯入 `AppspineAuthInfrastructureModule`，使所有審批與委派業務模組在非 global 插件模式下正確解析 Auth/RBAC/ApiKey 守衛。
4. **生成產物與 Zero Drift**：
   - 執行 `appspine build` 產生 `.appspine/generated/` 組裝產物與 `appspine.plugin-lock.json`（10 plugins active）。
   - 通過 `appspine build --check`（zero drift）與 `appspine doctor`（10 enabled, 0 degraded, 0 failed）。
5. **完整驗證與單元/雙模式測試**：
   - 通過 Prisma generate、全庫 backend / frontend typecheck、backend build。
   - 單元與雙模式 DI 測試（`vitest run`）4/4 檔案、48/48 測試 100% 通過（涵蓋 `APPSPINE_PLUGIN_MODE=0`、`APPSPINE_PLUGIN_MODE=1` 與未設定三種情境）。
   - 撰寫真實開機驗證腳本 `scripts/051-pl5-09-approve-real-bootstrap.mjs`。

---

## 2. 變更檔案清單 (Modified Files in Approve)

| 檔案路徑 | 變更說明 |
|---|---|
| `backend/appspine.plugins.json` | 宣告採用 `@appspine/preset-standard` 預設集。 |
| `backend/src/appspine.config.ts` | 宣告 approve runtime 設定與 `appspine.prisma` host capability。 |
| `backend/src/app.module.ts` | 實作 Dual-mode（三段式結構，預設 plugin mode，支援 `APPSPINE_PLUGIN_MODE=0` escape hatch）。 |
| `backend/src/app.module.spec.ts` | 建立雙模式 DI 依賴圖編譯測試（涵蓋 `0`, `1`, unset 三種情境）。 |
| `backend/src/main.ts` | 新增 `app.enableShutdownHooks()`。 |
| `backend/src/approval/approval-instances/approval-instances.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/expense-claims/expense-claims.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/leave-requests/leave-requests.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/notifications/notifications.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/user-delegations/user-delegations.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/domain-events/domain-events.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/vitest.config.ts` | 設定 OIDC 與測試環境變數、提升 timeout。 |
| `backend/package.json` | 升級依賴至 Canary 版本，補齊 `@nestjs/testing: ^11.0.5`，新增 `appspine:build`、`appspine:check`、`appspine:doctor` 指令。 |
| `frontend/package.json` | 升級前端依賴至 Canary 版本（`@appspine/frontend-shell@^0.17.0` 等）。 |
| `package.json` | 根目錄 devDependencies 納入 `@appspine/*` canary 套件。 |
| `pnpm-workspace.yaml` | 更新 overrides 為 Canary 精確版號與 `minimumReleaseAge: 0`。 |
| `pnpm-lock.yaml` | 更新真實 lockfile。 |
| `scripts/051-pl5-09-approve-real-bootstrap.mjs` | 真實 Disposable Postgres 開機測試腳本。 |

---

## 3. 驗證結果 (Verification Evidence)

1. **安裝與依賴解析**：
   - `pnpm install`：從真實 registry 下載並安裝 22 個 `@appspine/*` canary 套件（Done in 24m 26.7s，`pnpm-lock.yaml` 變更 +524 -185）。
2. **Prisma 生成**：
   - `pnpm -C backend prisma:generate`：成功產生 Prisma Client (v6.19.3)。
3. **插件產物與 Drift 檢查**：
   - `appspine build`：成功輸出 `.appspine/generated/*`（8 個檔案）與 `appspine.plugin-lock.json`（10 plugins active）。
   - `appspine build --check`：Zero drift check passed（`8 artefact(s) and appspine.plugin-lock.json up to date`）。
4. **插件健康診斷**：
   - `appspine doctor`：`10 enabled, 0 disabled, 0 unresolved, 0 without a manifest; 0 artefact(s) out of date; 0 lockfile finding(s)`。
5. **編譯與型別檢查**：
   - `pnpm -C backend typecheck`：0 errors。
   - `pnpm -C frontend typecheck`：0 errors。
   - `pnpm -C backend build`：NestJS build succeeded。
6. **單元與雙模式 DI 測試**：
   - `pnpm -C backend test`：4/4 files, 48/48 tests passed。
     - `src/app.module.spec.ts` (3 tests passed — 涵蓋 mode 0, mode 1, unset)
     - `src/notifications/notifications.service.spec.ts` (2 tests passed)
     - `src/leave-requests/leave-requests.service.spec.ts` (8 tests passed)
     - `src/approval/approval-instances/approval-instances.service.spec.ts` (35 tests passed)

---

## 8. Agent 替代與校準紀錄 (Substitution Log)

| 欄位 | 填寫內容 |
|---|---|
| **Task** | `PL5-09` |
| **Actual agent** | Google Gemini 3.7 Flash (High reasoning) |
| **Required class** | Terra high G2（原規劃 Terra high 執行／Sol G3 review cross-app & delegation） |
| **Substitution reason** | 本環境由 Gemini 執行 Approve 倉庫的 Dual-Mode 改造、真實 Registry 依賴安裝、審批與委派業務模組顯式 Auth 匯入修復、以及端到端真實驗證，後續由 Claude 進行獨立審核。 |
| **Calibration** | 嚴格遵循真實 Registry 安裝規範（無 tarball override、不繞過 preinstall/prepare）；為所有需 Auth 的 Controller 顯式補齊 `AppspineAuthInfrastructureModule`；建立雙模式 DI 測試；完成 Zero Drift 與 Doctor 診斷；通過全套 Husky pre-commit hooks。 |
| **Tools** | Repo read/write, Terminal, Git, PNPM, Vitest, TypeScript, Prisma |
| **Independent reviewer** | Claude Sonnet 5，2026-08-20。重新完整跑過 typecheck/build/test（48/48）/appspine build --check/doctor/真實 disposable Postgres 開機，全部通過；commit SHA `5ea4a87` 已核對存在。詳見 [051 拆解 §13 Phase 5 Wave C](../decisions/051-plugin-platform-engineering-task-breakdown.md#13-里程碑檢驗點與-gate-簽核)。 |
| **Evidence** | Approve 分支 `051-pl5-09-approve-wave-c` (Commit `5ea4a87`)、本報告 `051-pl5-09-approve-rollout.md`、開機腳本 `scripts/051-pl5-09-approve-real-bootstrap.mjs`。 |
