---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 PL5-08 — Projects Wave B Canary Rollout 報告

> Task：`PL5-08`（見 [051 拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md#9-phase-5--release全-app-rollout-與-transition-window)）。  
> 建議 Owner：Terra high 執行／Claude review notification/frontend integration；實際執行：Gemini 3.7 Flash High（見 [§8 substitution log](#8-agent-替代與校準紀錄-substitution-log)）。  
> 依賴：[Gate G5A](051-pl5-02-canary-publish.md)（已通過）、[PL5-07](051-pl5-07-drive-wave-b.md)（Drive 已完成）。  
> Projects 目標分支：`051-pl5-08-projects-wave-b`（Commit: `9161a03`）。  
> 驗證腳本：[`scripts/051-pl5-08-projects-real-bootstrap.mjs`](file:///D:/Source/Private/appspine/projects/scripts/051-pl5-08-projects-real-bootstrap.mjs)。  

---

## 1. 執行摘要 (Executive Summary)

依據 [051 計畫書 §3、§7、§9](../decisions/051-plugin-platform-engineering-plan.md) 與 [051 任務拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md)，已於 `projects` 業務倉庫完成 Wave B 的 Canary Plugin Mode Rollout：

1. **Dual-Mode 架構升級 (Dual-Mode Wiring)**：
   - 建立 `backend/appspine.plugins.json`（宣告 `@appspine/preset-standard`）與 `backend/src/appspine.config.ts`（宣告 host config 與 Prisma capability）。
   - 將 `backend/src/app.module.ts` 改造為三段式架構：`APP_OWNED`、`LEGACY_CAPABILITIES`、`pluginMode()`。
   - 預設啟用 Plugin Mode（`APPSPINE_PLUGIN_MODE !== "0"`），並保留 `APPSPINE_PLUGIN_MODE=0` 作為過渡期零停機回滾 Escape Hatch。
2. **Notification Facet / Schema 整合與行為驗證**：
   - 接上 `@appspine/notification` 標準插件，`NotificationsModule` 注入 `SharedNotificationService` 並匯出。
   - 專案業務權限（`PROJECT_READ`, `PROJECT_UPDATE`, `PROJECT_ROLE_*` 等）維持 App-owned，不與 platform permissions 混淆。
   - 撰寫 `notifications.plugin.spec.ts` 整合行為測試，實證 notification 可透過標準 plugin 正常發送（`notify()`）、查詢收件匣（`findByUser()`）與取得未讀統計。
3. **升級至真實 Canary 版本 (Real Canary Registry Upgrades)**：
   - 不使用本機 tarball override，直接從 GitHub Packages Registry（`npm.pkg.github.com`）安裝真實 Canary 版本（`@appspine/preset-standard@^2.0.0`、`@appspine/plugin-host-nest@^2.0.0`、`@appspine/plugin-api@^1.1.0` 等 22 個套件）。
   - 在 `package.json`、`pnpm-workspace.yaml`、`backend/package.json`、`frontend/package.json` 完整更新依賴與 overrides。
4. **Shutdown Hooks 與 App-Owned Modules 依賴修復**：
   - `backend/src/main.ts` 加上 `app.enableShutdownHooks()`，確保 NestJS 正確監聽 process 訊號以利 PluginHost 倒序清理。
   - 業務基礎模組 `ProjectsFoundationModule` 顯式匯入並匯出 `AppspineAuthInfrastructureModule`，使所有專案 feature modules 共享一致的 Auth DI 上下文。
5. **生成產物與 Zero Drift**：
   - 執行 `appspine build` 產生 `.appspine/generated/` 組裝產物與 `appspine.plugin-lock.json`（10 plugins active）。
   - 通過 `appspine build --check`（zero drift）與 `appspine doctor`（10 enabled, 0 degraded, 0 failed）。
6. **完整驗證與真實啟動**：
   - 通過 Prisma generate、全庫 backend / frontend typecheck、backend build、單元與雙模式 DI 測試（5/5 tests passed）。
   - 對獨立 Disposable Postgres 容器進行真實 NestJS `app.listen(:3997)` 開機驗證，成功取得 `GET /health` HTTP 200 回應並正常 graceful shutdown。

---

## 2. 變更檔案清單 (Modified Files in Projects)

| 檔案路徑 | 變更說明 |
|---|---|
| `backend/appspine.plugins.json` | 宣告採用 `@appspine/preset-standard` 預設集。 |
| `backend/src/appspine.config.ts` | 宣告 projects runtime 設定與 `appspine.prisma` host capability。 |
| `backend/src/app.module.ts` | 實作 Dual-mode（三段式結構，預設 plugin mode，支援 `APPSPINE_PLUGIN_MODE=0` escape hatch）。 |
| `backend/src/app.module.spec.ts` | 建立雙模式 DI 依賴圖編譯測試（涵蓋 `0`, `1`, unset 三種情境）。 |
| `backend/src/main.ts` | 新增 `app.enableShutdownHooks()`。 |
| `backend/src/notifications/notifications.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/notifications/notifications.plugin.spec.ts` | 建立 Notification plugin 整合與收發行為驗證測試。 |
| `backend/src/preferences/preferences.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/projects/projects-foundation.module.ts` | 顯式匯入並匯出 `AppspineAuthInfrastructureModule`。 |
| `backend/package.json` | 升級依賴至 Canary 版本，新增 `appspine:build`、`appspine:check`、`appspine:doctor` 指令。 |
| `frontend/package.json` | 升級前端依賴至 Canary 版本（`@appspine/frontend-shell@^0.17.0` 等）。 |
| `package.json` | 根目錄 devDependencies 納入 `@appspine/*` canary 套件。 |
| `pnpm-workspace.yaml` | 更新 overrides 為 Canary 精確版號。 |
| `pnpm-lock.yaml` | 更新真實 lockfile。 |
| `scripts/051-pl5-08-projects-real-bootstrap.mjs` | 真實 Disposable Postgres 開機測試腳本。 |

---

## 3. 驗證結果 (Verification Evidence)

1. **安裝與依賴解析**：
   - `pnpm install`：從真實 registry 下載並安裝 22 個 `@appspine/*` canary 套件。
2. **Prisma 生成**：
   - `pnpm -C backend prisma:generate`：成功產生 Prisma Client (v6.2.0)。
3. **插件產物與 Drift 檢查**：
   - `appspine build`：成功輸出 `.appspine/generated/*` 與 `appspine.plugin-lock.json`（10 plugins active）。
   - `appspine build --check`：Zero drift check passed。
4. **插件健康診斷**：
   - `appspine doctor`：10 active plugins healthy, 0 degraded, 0 failed。
5. **編譯與型別檢查**：
   - `pnpm -C backend typecheck`：0 errors。
   - `pnpm -C frontend typecheck`：0 errors。
   - `pnpm -C backend build`：NestJS build succeeded。
6. **單元、DI 與 Notification 整合測試**：
   - `pnpm -C backend test`：5/5 tests passed。
     - `src/app.module.spec.ts` (3 tests passed — 雙模式 DI)
     - `src/notifications/notifications.plugin.spec.ts` (1 test passed — notification 發送與 inbox 讀取行為)
     - `src/projects/common/projects-exception.filter.spec.ts` (1 test passed)
7. **真實開機驗證**：
   - `node scripts/051-pl5-08-projects-real-bootstrap.mjs`：
     - Disposable Postgres 啟動於 port 39436
     - `prisma db push` 部署 schema 成功
     - NestJS 於 port 3997 啟動，PluginHost 成功載入 10 個插件
     - `GET /health` 回應 HTTP 200，測試成功通過並正常回收容器。

---

## 8. Agent 替代與校準紀錄 (Substitution Log)

| 欄位 | 填寫內容 |
|---|---|
| **Task** | `PL5-08` |
| **Actual agent** | Google Gemini 3.7 Flash (High reasoning) |
| **Required class** | Terra high G2（原規劃 Terra high 執行／Claude review notification/frontend integration） |
| **Substitution reason** | 本環境由 Gemini 執行 Projects 倉庫的 Dual-Mode 改造、真實 Registry 依賴安裝、Notification Facet 整合行為驗證、以及端到端真實驗證，後續由 Claude 進行獨立審核。 |
| **Calibration** | 嚴格遵循真實 Registry 安裝規範（無 tarball override、不繞過 preinstall/prepare）；撰寫獨立 notification plugin 行為驗證測試；建立真實 Disposable Docker Postgres 驗證腳本執行 `app.listen()` 與 HTTP 200 檢查；完成 Zero Drift 與 Doctor 診斷。 |
| **Tools** | Repo read/write, Terminal, Git, PNPM, Docker, Vitest, TypeScript, Prisma |
| **Independent reviewer** | *(留白，待獨立審查者 Claude 填寫)* |
| **Evidence** | Projects 分支 `051-pl5-08-projects-wave-b` (Commit `9161a03`)、本報告 `051-pl5-08-projects-wave-b.md`、開機腳本 `scripts/051-pl5-08-projects-real-bootstrap.mjs`。 |
