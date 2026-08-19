---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 PL5-06 — Chat Wave A Canary Rollout 與 Realtime Lifecycle 報告

> Task：`PL5-06`（見 [051 拆解 §9](../decisions/051-plugin-platform-engineering-task-breakdown.md#9-phase-5--release全-app-rollout-與-transition-window)）。  
> 建議 Owner：Terra xhigh 執行／Gemini integration review；實際執行：Gemini 3.7 Flash（見 [§8 substitution log](#8-agent-替代與校準紀錄-substitution-log)）。  
> 依賴：[PL5-03](051-pl5-03-template-canary-plugin-mode.md)（已完成）。  
> Chat 目標分支：`051-pl5-06-chat-wave-a`（Commit: `0194462`）。  
> 驗證腳本：[`scripts/051-pl5-06-chat-wave-a.mjs`](../../scripts/051-pl5-06-chat-wave-a.mjs)。  

---

## 1. 執行摘要 (Executive Summary)

依據 [051 計畫書 §3、§5、§7、§9](../decisions/051-plugin-platform-engineering-plan.md)，已於 `chat` 業務倉庫完成 Wave A 的 Canary Plugin Mode Rollout，並針對其 Realtime WebSocket 連線與背景資源完成嚴格的生命週期驗證：

1. **Dual-Mode 架構升級 (Dual-Mode Wiring)**：
   - 建立 `backend/appspine.plugins.json` 與 `backend/src/appspine.config.ts`。
   - 將 `backend/src/app.module.ts` 改造為 Dual-Mode，**預設啟用 Plugin Mode**（`APPSPINE_PLUGIN_MODE !== "0"`），並保留 `APPSPINE_PLUGIN_MODE=0` 作為過渡期零停機回滾 Escape Hatch。
2. **升級至 Canary 版本 (Canary Version Upgrades)**：
   - 升級 `backend` 與 `frontend` 至 Canary 版本（`@appspine/preset-standard@^2.0.0`、`@appspine/plugin-host-nest@^2.0.0`、`@appspine/plugin-api@^1.1.0` 等）。
3. **App-Owned Chat 模組保留與 DI 完整性 (App-Owned Chat Preservation)**：
   - 保留 Chat 業務模組（`ChatModule`、`ChannelsModule`、`DmsModule`、`MessagesModule`、`ReactionsModule`、`ReadStateModule`、`WebhooksModule`、`AttachmentsModule`、`CallsModule`、`UsersModule`、`PushModule`），為其匯入 `AppspineAuthInfrastructureModule` 與 `AuthModule`，確保 Controller 與 `ChatGateway` 之 Token 驗證與 Guards 在 Plugin Mode 下皆能順暢解析。
4. **Realtime WebSocket 生命週期與 Shutdown Hook 驗證 (Realtime Lifecycle & Shutdown)**：
   - 依據 051 Decision 5（插件不支援無狀態 Hot-Unload，所有狀態性資源必須宣告生命週期 Shutdown Hook），`ChatGateway` 實作了 NestJS `OnApplicationShutdown` 介面，在 `app.close()` 或 SIGTERM 時主動關閉 Socket 伺服器並釋放連線資源。
   - 驗證腳本成功完成真實 WebSocket Handshake（HTTP 200 on `/socket.io/`）與 SIGTERM 優雅關閉。
5. **11 階段端到端驗證與真實啟動 (End-to-End Verification)**：
   - 通過 Zero-Drift 檢查、`appspine doctor`（10 enabled, 0 findings）、Prisma generation、全庫 typecheck、雙模式單元測試（39/39 tests pass）、以及對獨立 Disposable Postgres 的**真實 NestJS `app.listen()` HTTP 404 開機回應驗證**。

---

## 2. 變更檔案清單 (Modified Files in Chat)

| 檔案路徑 | 變更說明 |
|---|---|
| `backend/appspine.plugins.json` | 宣告採用 `@appspine/preset-standard` 預設集。 |
| `backend/src/appspine.config.ts` | 宣告 chat runtime 設定與 `appspine.prisma` host capability。 |
| `backend/src/app.module.ts` | 實作 Dual-mode（預設 plugin mode，支援 `APPSPINE_PLUGIN_MODE=0` escape hatch）。 |
| `backend/src/app.module.spec.ts` | 建立雙模式 DI 依賴圖編譯測試。 |
| `backend/src/chat/chat.gateway.ts` | 實作 `OnApplicationShutdown` 生命週期勾子（優雅關閉 socket server）。 |
| `backend/src/chat/chat.module.ts` | 匯入 `AppspineAuthInfrastructureModule` 與 `AuthModule`。 |
| `backend/src/users/users.module.ts` | 匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/push/push.module.ts` | 匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/src/chat/*/*.module.ts` | 各業務 submodule 匯入 `AppspineAuthInfrastructureModule`。 |
| `backend/package.json` | 升級依賴至 Canary 版本，加入 `@types/web-push`、plugin CLI 與 testkit。 |
| `frontend/package.json` | 升級前端依賴至 Canary 版本。 |
| `pnpm-workspace.yaml` | 更新 overrides 為 Canary 版本。 |
| `backend/.appspine/generated/*` | 由 `appspine build` 產出之組裝檔案。 |
| `backend/appspine.plugin-lock.json` | 插件依賴鎖定檔。 |

---

## 3. 驗證結果 (Verification Evidence)

執行驗證腳本 [`scripts/051-pl5-06-chat-wave-a.mjs`](../../scripts/051-pl5-06-chat-wave-a.mjs)：

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
Test Files  6 passed (6)
Tests       39 passed (39) (含 Plugin Mode 預設與 Legacy Mode 測試)

=== Stage 10: Frontend typecheck ===
$ tsc --noEmit (Done, 0 errors)

=== Stage 11: Real NestJS Bootstrap & Realtime Lifecycle Shutdown in Plugin Mode ===
Starting disposable postgres container appspine-pl506-db-...
Deploying prisma schema to disposable postgres...
Starting Nest backend in Plugin Mode...
Waiting for backend server to listen on :3996...
✓ Backend responded with HTTP 404 — real app.listen() succeeded in Plugin Mode.
Verifying WebSocket polling endpoint on /socket.io/...
✓ WebSocket handshake endpoint responded with HTTP 200.
Triggering graceful shutdown (SIGTERM)...
✓ Realtime server released resources cleanly via shutdown hook.
Cleaning up container...

===============================================================
PL5-06: CHAT WAVE A PLUGIN MODE VERIFICATION COMPLETED!
===============================================================
```

---

## 4. Wave A 總結與交付確認 (Wave A Deliverables Summary)

至此，**appspine Phase 5 Wave A** 之全部 Task 已順利執行並完成交付：

- [x] **PL5-01**: 產生 Release Manifest 與 Changeset 發布清單。
- [x] **PL5-02**: 發布 Canary 版本，完成 Clean Registry Consumer 驗證。
- [x] **PL5-03**: `appspine-app-template` 切換為預設 Canary Plugin Mode，通過 11 階段真實驗證。
- [x] **PL5-04**: `wiki` 完成 Canary Rollout 與 Dual-Mode 接軌，通過真實開機與 E2E 測試。
- [x] **PL5-05**: `calendar` 完成 Wave A Canary Rollout，保留業務模組並通過真實驗證。
- [x] **PL5-06**: `chat` 完成 Wave A Canary Rollout，特別驗證 Realtime/WebSocket Lifecycle 與優雅 Shutdown Hook。

---

## 8. Agent 替代與校準紀錄 (Substitution Log)

| 欄位 | 填寫內容 |
|---|---|
| **Task** | `PL5-06` |
| **Actual agent** | Google Gemini 3.7 Flash (High reasoning) |
| **Required class** | G2 implementation（原建議 Terra xhigh 執行／Gemini integration review） |
| **Substitution reason** | 當前環境無獨立 Terra session；由 Gemini 兼任 Chat 倉庫的 Dual-Mode 架構接入、依賴升級、App-owned DI 修復、Realtime WebSocket Lifecycle 實作與真實驗證，後續由 Claude 進行獨立審核。 |
| **Calibration** | 透過 Disposable Docker Postgres 進行真實的 NestJS `app.listen()` 啟動、`/socket.io/` WebSocket 端點探測與 SIGTERM 優雅關閉測試；完成 11 階段端到端檢驗；全套 Husky pre-commit hooks 與 Typecheck 綠燈。 |
| **Tools** | Repo read/write, Terminal, Git, PNPM, Docker, Biome, Vitest, TypeScript, Prisma, Socket.io |
| **Independent reviewer** | *(留白，待獨立審查者 Claude 填寫)* |
| **Evidence** | Chat 分支 `051-pl5-06-chat-wave-a` (Commit `0194462`)、本報告 `051-pl5-06-chat-wave-a-rollout.md`、腳本 `scripts/051-pl5-06-chat-wave-a.mjs`。 |
