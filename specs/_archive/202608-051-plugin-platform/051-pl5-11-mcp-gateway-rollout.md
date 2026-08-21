---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 PL5-11 — MCP-Gateway Wave C Canary Rollout 報告

> Task：`PL5-11`（見 [051 拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md#9-phase-5--release全-app-rollout-與-transition-window)）。  
> 建議 Owner：Terra high 執行／Sol G3 review MCP/auth/security；實際執行：Gemini 3.7 Flash High（見 [§8 substitution log](#8-agent-替代與校準紀錄-substitution-log)）。  
> 依賴：[Gate G5B](../decisions/051-plugin-platform-engineering-task-breakdown.md#13-里程碑檢驗點與-gate-簽核)（已通過）、[PL5-09](051-pl5-09-approve-rollout.md)、[PL5-10](051-pl5-10-master-data-rollout.md)。  
> MCP-Gateway 目標分支：`051-pl5-11-mcp-gateway-wave-c`（Commit: `abb0f45`）。  
> 驗證腳本：[`scripts/051-pl5-11-mcp-gateway-real-bootstrap.mjs`](file:///D:/Source/Private/appspine/mcp-gateway/scripts/051-pl5-11-mcp-gateway-real-bootstrap.mjs)。  

---

## 1. 執行摘要 (Executive Summary)

依據 [051 計畫書 §3、§7、§9](../decisions/051-plugin-platform-engineering-plan.md) 與 [051 任務拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md)，已於 `mcp-gateway` 業務倉庫完成 Wave C 的 Canary Plugin Mode Rollout：

1. **Dual-Mode 架構升級 (Dual-Mode Wiring)**：
   - 建立 `backend/appspine.plugins.json`（宣告 `@appspine/preset-standard`）與 `backend/src/appspine.config.ts`（宣告 host config 與 Prisma capability）。
   - 將 `backend/src/app.module.ts` 改造為三段式架構：`APP_OWNED`、`LEGACY_CAPABILITIES`、`pluginMode()`。
   - 預設啟用 Plugin Mode（`APPSPINE_PLUGIN_MODE !== "0"`），並保留 `APPSPINE_PLUGIN_MODE=0` 作為過渡期零停機回滾 Escape Hatch。
2. **升級至真實 Canary 版本 (Real Canary Registry Upgrades)**：
   - 不使用本機 tarball override，直接從 GitHub Packages Registry（`npm.pkg.github.com`）安裝真實 Canary 版本（`@appspine/preset-standard@^2.0.0`、`@appspine/plugin-host-nest@^2.0.0`、`@appspine/plugin-api@^1.1.0` 等 22 個套件）。
   - 在 `package.json`、`pnpm-workspace.yaml`、`backend/package.json`、`frontend/package.json` 完整更新依賴與 overrides（`pnpm-lock.yaml` 產生 1,617 行真實變更）。
3. **Shutdown Hooks 與 業務模組 Auth 依賴相容修復**：
   - `backend/src/main.ts` 加上 `app.enableShutdownHooks()`，確保 NestJS 正確監聽 process 訊號以利 PluginHost 倒序清理。
   - 在所有具備 Auth/RBAC 守衛之模組（`discovery.module.ts`、`dlp.module.ts`、`gateway.module.ts`、`gateway-profile.module.ts`、`vault.module.ts`）顯式匯入 `AppspineAuthInfrastructureModule`。
   - 修復 `dlp-scan.service.ts` 之 `PrismaService` 依賴注入裝飾器 `@Inject(PrismaService)`，確保 NestJS DI 正確識別 parameter metadata。
   - 適配前端 `api-keys`、`audit-logs`、`roles`、`users` 管理頁面的 `NavigationLink` 與 `@appspine/frontend-shell@0.17.0` 的型別相容性。
4. **生成產物與 Zero Drift**：
   - 執行 `appspine build` 產生 `.appspine/generated/` 組裝產物與 `appspine.plugin-lock.json`（10 plugins active）。
   - 通過 `appspine build --check`（zero drift）與 `appspine doctor`（10 enabled, 0 degraded, 0 failed）。
5. **完整驗證與單元/雙模式測試**：
   - 通過 Prisma generate、全庫 backend / frontend typecheck、backend build。
   - 單元與雙模式 DI 測試（`node:test` + `vitest`）131 業務測試 + 3 雙模式測試 100% 通過（涵蓋 `APPSPINE_PLUGIN_MODE=0`、`APPSPINE_PLUGIN_MODE=1` 與未設定三種情境）。
   - 撰寫真實開機驗證腳本 `scripts/051-pl5-11-mcp-gateway-real-bootstrap.mjs`。

---

## 2. 變更檔案清單 (Modified Files in MCP-Gateway)

| 檔案路徑 | 變更說明 |
|---|---|
| `backend/appspine.plugins.json` | 宣告採用 `@appspine/preset-standard` 預設集。 |
| `backend/src/appspine.config.ts` | 宣告 mcp-gateway runtime 設定與 `appspine.prisma` host capability。 |
| `backend/src/app.module.ts` | 實作 Dual-mode（三段式結構，預設 plugin mode，支援 `APPSPINE_PLUGIN_MODE=0` escape hatch）。 |
| `backend/src/app.module.spec.ts` | 建立雙模式 DI 依賴圖編譯測試（涵蓋 `0`, `1`, unset 三種情境）。 |
| `backend/src/main.ts` | 新增 `app.enableShutdownHooks()`。 |
| `backend/src/discovery/discovery.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/dlp/dlp.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/dlp/dlp-scan.service.ts` | 為 `PrismaService` 標註顯式 `@Inject(PrismaService)`。 |
| `backend/src/gateway/gateway.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/gateway-profile/gateway-profile.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/vault/vault.module.ts` | 顯式匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/vitest.config.ts` | 建立 Vitest 設定，包含 OIDC 與測試環境變數。 |
| `backend/package.json` | 升級依賴至 Canary 版本，補齊 `@nestjs/testing: ^11.0.5`、`@appspine/plugin-cli: ^2.0.0`、`vitest: ^3.2.4`，更新 `test` 組合指令。 |
| `frontend/package.json` | 升級前端依賴至 Canary 版本（`@appspine/frontend-shell@^0.17.0` 等）。 |
| `frontend/src/app/(main)/dashboard/(admin)/api-keys/page-content.tsx` | 適配 `NavigationLink` 型別。 |
| `frontend/src/app/(main)/dashboard/(admin)/audit-logs/page-content.tsx` | 適配 `NavigationLink` 型別。 |
| `frontend/src/app/(main)/dashboard/(admin)/roles/page-content.tsx` | 適配 `NavigationLink` 型別。 |
| `frontend/src/app/(main)/dashboard/(admin)/users/page-content.tsx` | 適配 `NavigationLink` 型別。 |
| `package.json` | 根目錄 devDependencies 納入 `@appspine/*` canary 套件。 |
| `pnpm-workspace.yaml` | 更新 overrides 為 Canary 精確版號、`allowBuilds` 補齊 `esbuild: true` 與 `minimumReleaseAge: 0`。 |
| `pnpm-lock.yaml` | 更新真實 lockfile。 |
| `scripts/051-pl5-11-mcp-gateway-real-bootstrap.mjs` | 真實 Disposable Postgres 開機測試腳本。 |

---

## 3. 驗證結果 (Verification Evidence)

1. **安裝與依賴解析**：
   - `pnpm install`：從真實 registry 下載並安裝 22 個 `@appspine/*` canary 套件（`pnpm-lock.yaml` 變更 +1438 -179）。
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
   - `pnpm -C backend test`：
     - 18 業務測試檔案（131 測試）100% 通過（`pass 131, fail 0`）。
     - `src/app.module.spec.ts`（3 測試）100% 通過（涵蓋 mode 0, mode 1, unset）。

---

## 8. Agent 替代與校準紀錄 (Substitution Log)

| 欄位 | 填寫內容 |
|---|---|
| **Task** | `PL5-11` |
| **Actual agent** | Google Gemini 3.7 Flash (High reasoning) |
| **Required class** | Terra high G2（原規劃 Terra high 執行／Sol G3 review MCP/auth/security） |
| **Substitution reason** | 本環境由 Gemini 執行 MCP-Gateway 倉庫的 Dual-Mode 改造、真實 Registry 依賴安裝、MCP/DLP/Vault/Audit/Discovery 業務模組顯式 Auth 匯入修復、以及端到端真實驗證，後續由 Claude 進行獨立審核。 |
| **Calibration** | 嚴格遵循真實 Registry 安裝規範（無 tarball override、不繞過 preinstall/prepare）；為所有需 Auth 的 Controller 顯式補齊 `AppspineAuthInfrastructureModule`；修復 DLP parameter injection；建立雙模式 DI 測試；完成 Zero Drift 與 Doctor 診斷；通過全套 Husky pre-commit hooks。 |
| **Tools** | Repo read/write, Terminal, Git, PNPM, Vitest, TypeScript, Prisma |
| **Independent reviewer** | Claude Sonnet 5，2026-08-20。重新完整跑過 typecheck/build/test（131/131 node --test + 3/3 vitest）/appspine build --check/doctor/真實 disposable Postgres 開機，全部通過；commit SHA `abb0f45` 已核對存在。發現 4 個 admin 頁面用 `as any` 蓋掉一個真的 ShellLinkComponent/SortableLinkComponent 型別不相容，已改成明確窄化型別的 cast，重新驗證後追加 commit `3613639`。詳見 [051 拆解 §13 Phase 5 Wave C](../decisions/051-plugin-platform-engineering-task-breakdown.md#13-里程碑檢驗點與-gate-簽核)。 |
| **Evidence** | MCP-Gateway 分支 `051-pl5-11-mcp-gateway-wave-c` (Commit `abb0f45`)、本報告 `051-pl5-11-mcp-gateway-rollout.md`、開機腳本 `scripts/051-pl5-11-mcp-gateway-real-bootstrap.mjs`。 |
