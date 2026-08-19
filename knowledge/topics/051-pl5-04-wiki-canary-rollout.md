---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 PL5-04 — Wiki Canary Rollout 報告

> Task：`PL5-04`（見 [051 拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md#9-phase-5--release全-app-rollout-與-transition-window)）。  
> 建議 Owner：Terra xhigh 執行／Gemini integration review；實際執行：Gemini 3.7 Flash（見 [§8 substitution log](#8-agent-替代與校準紀錄-substitution-log)）。  
> 依賴：[PL5-03](051-pl5-03-template-canary-plugin-mode.md)（已完成）。  
> Wiki 目標分支：`051-pl5-04-wiki-canary`（Commit: `eeef21f`）。  
> 驗證腳本：[`scripts/051-pl5-04-wiki-canary.mjs`](../../scripts/051-pl5-04-wiki-canary.mjs)。  

---

## 1. 執行摘要 (Executive Summary)

依據 [051 計畫書 §3、§7、§9](../decisions/051-plugin-platform-engineering-plan.md)，已於 `wiki` 業務倉庫完成全面升級與 Canary Plugin Mode Rollout：

1. **Dual-Mode 架構升級 (Dual-Mode Wiring)**：
   - 建立 `backend/appspine.plugins.json` 與 `backend/src/appspine.config.ts`。
   - 將 `backend/src/app.module.ts` 改造為 Dual-Mode，**預設啟用 Plugin Mode**（`APPSPINE_PLUGIN_MODE !== "0"`），並保留 `APPSPINE_PLUGIN_MODE=0` 作為過渡期零停機回滾 Escape Hatch。
2. **升級至 Canary 版本 (Canary Version Upgrades)**：
   - 升級 `backend` 與 `frontend` 至 Canary 版本（`@appspine/preset-standard@^2.0.0`、`@appspine/plugin-host-nest@^2.0.0`、`@appspine/plugin-api@^1.1.0` 等）。
3. **App-Owned Modules DI 隔離與基礎架構相容 (DI Resolution)**：
   - 為 Wiki 專屬業務模組（`SpacesModule`、`PagesModule`、`AttachmentsModule`、`SearchModule`）引入 `AppspineAuthInfrastructureModule`，確保在非全域 Auth 的 Plugin Mode 下，各業務 Controller 之 Auth Guards 能正確解析。
4. **生成產物與 Lockfile (Generated Artifacts & Lockfile)**：
   - 執行 `appspine build` 產生 `.appspine/generated/` 8 項組裝產物與 `appspine.plugin-lock.json`。
5. **11 階段端到端驗證與真實啟動 (End-to-End Verification)**：
   - 通過 Zero-Drift 檢查、`appspine doctor`（10 enabled, 0 findings）、Prisma generation、全庫 typecheck、雙模式單元測試（25/25 tests pass）、以及對獨立 Disposable Postgres 的**真實 NestJS `app.listen()` HTTP 404 開機回應驗證**。

---

## 2. 變更檔案清單 (Modified Files in Wiki)

| 檔案路徑 | 變更說明 |
|---|---|
| `backend/appspine.plugins.json` | 宣告採用 `@appspine/preset-standard` 預設集。 |
| `backend/src/appspine.config.ts` | 宣告 wiki runtime 設定與 `appspine.prisma` host capability。 |
| `backend/src/app.module.ts` | 實作 Dual-mode（預設 plugin mode，支援 `APPSPINE_PLUGIN_MODE=0` escape hatch）。 |
| `backend/src/app.module.spec.ts` | 建立雙模式 DI 依賴圖編譯測試。 |
| `backend/src/spaces/spaces.module.ts` | 匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/pages/pages.module.ts` | 匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/attachments/attachments.module.ts` | 匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/search/search.module.ts` | 匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/package.json` | 升級依賴至 Canary 版本，加入 plugin CLI 與 testkit。 |
| `frontend/package.json` | 升級前端依賴至 Canary 版本。 |
| `pnpm-workspace.yaml` | 更新 overrides 為 Canary 版本。 |
| `backend/.appspine/generated/*` | 由 `appspine build` 產出之組裝檔案。 |
| `backend/appspine.plugin-lock.json` | 插件依賴鎖定檔。 |

---

## 3. 驗證結果 (Verification Evidence)

執行驗證腳本 [`scripts/051-pl5-04-wiki-canary.mjs`](../../scripts/051-pl5-04-wiki-canary.mjs)：

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
Test Files  4 passed (4)
Tests       25 passed (25) (含 Plugin Mode 預設與 Legacy Mode 測試)

=== Stage 10: Frontend typecheck ===
$ tsc --noEmit (Done, 0 errors)

=== Stage 11: Real NestJS Bootstrap in Plugin Mode against Disposable Postgres ===
Starting disposable postgres container appspine-pl504-db-...
Deploying prisma schema to disposable postgres...
Starting Nest backend in Plugin Mode...
✓ Backend responded with HTTP 404 — real app.listen() succeeded in Plugin Mode.
Cleaning up container...

===============================================================
PL5-04: WIKI CANARY PLUGIN MODE VERIFICATION COMPLETED!
===============================================================
```

---

## 4. 下一步前置條件檢查 (Prerequisites for PL5-05 Calendar & PL5-06 Chat)

- [x] Wiki Canary Rollout 已順利完成並通過全套驗證與 Commit（`eeef21f`）。
- [x] 可以正式進入 **PL5-05**（`calendar` Wave A Rollout）與 **PL5-06**（`chat` Wave A Rollout）。

---

## 8. Agent 替代與校準紀錄 (Substitution Log)

| 欄位 | 填寫內容 |
|---|---|
| **Task** | `PL5-04` |
| **Actual agent** | Google Gemini 3.7 Flash (High reasoning) |
| **Required class** | G2 implementation（原建議 Terra xhigh 執行／Gemini integration review） |
| **Substitution reason** | 當前環境無獨立 Terra session；由 Gemini 兼任 Wiki 倉庫的 Dual-Mode 架構接入、依賴升級、App-owned DI 修復與真實驗證，後續由 Claude 進行獨立審核。 |
| **Calibration** | 透過 Disposable Docker Postgres 進行真實的 NestJS `app.listen()` 啟動測試；完成 11 階段端到端檢驗；全套 Husky pre-commit hooks 與 Typecheck 綠燈。 |
| **Tools** | Repo read/write, Terminal, Git, PNPM, Docker, Biome, Vitest, TypeScript, Prisma |
| **Independent reviewer** | *(留白，待獨立審查者 Claude 填寫)* |
| **Evidence** | Wiki 分支 `051-pl5-04-wiki-canary` (Commit `eeef21f`)、本報告 `051-pl5-04-wiki-canary-rollout.md`、腳本 `scripts/051-pl5-04-wiki-canary.mjs`。 |
