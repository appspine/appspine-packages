---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-01 — 遷移 `notification` plugin（4A）

> Task：`PL4-01`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。
> 依賴：[Gate G3](051-pl3-gate-g3.md)、[PL1-09](051-pl1-pilot-plugins.md)（`audit-log` 試點）、[PL2-06](051-pl2-06-prisma-composer.md)（Prisma composer）。
> Changeset：`.changeset/051-phase4-notification-plugin.md`。

---

## 1. 任務目標與交付範圍

`@appspine/notification` 是 Phase 4 首個遷移的標準業務 capability 套件（4A 第一項）。本 task 將其升級為符合 `appspine.plugin/v1` 規範的正式 Capability Plugin，完成 backend、prisma、operations、frontend、permissions 五大 facets 整合、穩定 capability token 反轉、schema digest 計算與完整 4 階段生命週期管理。

### 1.1 核心交付物

1. **Capability Token 與 Port（`@appspine/plugin-api`）**：
   - 於 `packages/plugin-api/src/ports.ts` 定義 `NotificationInboxPort`、`NotificationRecord`、`CreateNotificationInput`、`NotificationPage`、`NotificationQuery` 與 `NotificationPortOptions`。
   - 透過 `NOTIFICATION_INBOX = Symbol.for('appspine.notification-inbox')` 提供跨插件穩定注入 token。

2. **Backend Facet 與 `NotificationModule`（`@appspine/notification`）**：
   - 建立 `packages/notification/src/notification.module.ts`，以 `useExisting` 綁定 `NotificationService` 至 `NOTIFICATION_INBOX`，保證 singleton 實例狀態一致。
   - `NotificationService` 實作 `NotificationInboxPort`，支援多元 transaction 客戶端。

3. **Prisma Facet 與 Schema Fragment**：
   - 交付官方 schema fragment `packages/notification/prisma/notification.prisma`（包含 `model Notification`、複合唯一索引 `@@unique([recipientUserId, idempotencyKey])`、查詢索引與 User 關聯）。
   - 計算並鎖定 schema digest（`sha256:4b54a9a0b53089bcc33a08afd99c3a7507a3119930e95072ccab83e0d5e0dedf`）。
   - 宣告 `augments: [{ targetModel: "User", field: "notifications", owner: "identity-core", type: "Notification[] @relation(\"NotificationRecipient\")" }]`；並同步於 `@appspine/identity-core` 的 `augmentedBy` 完成雙向合約授權。

4. **Operations Facet 與 Lifecycle 機制**：
   - 宣告 `healthIndicatorId: "notification"`、`metricsPrefix: "notification"`、`shutdownTimeoutMs: 5000`。
   - 實作完整 4 階段 Lifecycle：
     - `validate`: 檢驗 host 必須具備 `appspine.prisma` 與 `appspine.principal-context`。
     - `register`: 註冊資源並記錄日誌。
     - `ready`: 標記服務就緒。
     - `shutdown`: 觸發 `cleanupNotificationResources()`，自動停止所有註冊之背景 worker、計時器與活躍輪詢器。

5. **Frontend & Permissions Facets**（接續 Phase 3 PL3-08）：
   - `frontend`: 貢獻 `slot: "header.actions"`, `componentExport: "NotificationBell"`, `order: 10`, `i18nNamespace: "notification"`, `clientEntry: "./dist/frontend.js"`。
   - `permissions`: 宣告 `notification:inbox:read`、`notification:inbox:update`。

### 1.2 關聯修復揭露（Pre-existing Typecheck Fixes）

在執行全倉庫 `pnpm typecheck` 驗證時，發現以下 3 個套件的 `src/plugin.spec.ts` 存在 Phase 3 關閉 Gate G3（commit `ac246b2`）時遺留的 pre-existing 型別檢查錯誤：
- `packages/rbac/src/plugin.spec.ts:86`
- `packages/m2m-api-key/src/plugin.spec.ts:89`
- `packages/domain-events/src/plugin.spec.ts:82`

**錯誤原因與重現**：
在 `PluginBackendFactory` 型別定義規範需要傳入 `(context: PluginRuntimeContext)` 參數後，上述三個測試檔案仍以無參數形式呼叫 `plugin.backend?.()`，導致 TypeScript 報錯：
```
error TS2554: Expected 1 arguments, but got 0.
```
**修復方式**：
將呼叫端補上 dummy context 轉型（`backend?.({} as unknown as PluginRuntimeContext)`），確保型別檢查嚴格通過。此修正並非 PL4-01 notification 本身引入的變更，純粹為修正 pre-existing issue 以確保 Monorepo 全套 build/typecheck 保持綠燈。

---

## 2. 驗證與測試覆蓋

本 task 建立了多維度的測試驗證：

### 2.1 單元與 Manifest / Lifecycle 測試（`plugin.spec.ts`）
- 驗證 `appspine.plugin.json` 與 TS 常數 100% deep-equal。
- 驗證通過嚴格模式的 `parsePluginManifest()`。
- 驗證 schema digest 與 `prisma/notification.prisma` 完全一致。
- 驗證 5 大 facets 與 User augmentation 宣告。
- 驗證 `validate → register → ready → shutdown` 狀態機轉換與缺少 `appspine.prisma` 時的安全阻擋。

### 2.2 Legacy vs Plugin 行為 Parity 對照測試（`parity.spec.ts`）
- 對比直接透過 `NotificationService` 與透過 `NOTIFICATION_INBOX` Token 注入兩種使用路徑。
- 涵蓋 `notify`、`notifyMany`（含批次大小上限與重複略過）、`getInbox`、`getUnreadCount`、`markRead`、`markAllRead`、`archive` 及無效參數與找不到記錄之例外處理，證明雙向行為 100% 一致。

### 2.3 Recipient Isolation 隔離測試（`recipient-isolation.spec.ts`）
- 證明多租戶/使用者間資料嚴格隔離：
  - User A 無法讀取 User B 的收件匣。
  - User A 的未讀計數不受 User B 影響。
  - User A 無法標記或封存 User B 的通知（拋出 `NotFoundException`）。
  - User A 執行 `markAllRead` 僅影響自身通知。
  - 同一 `idempotencyKey` 在不同 recipient 之間互不衝突且獨立存在。

### 2.4 Worker / Poll Cleanup 測試（`lifecycle-cleanup.spec.ts`）
- 證明背景輪詢控制器在 `stop()` 時完全清除 `setInterval` 定時器。
- 證明外掛生命週期進入 `shutdown` 時，所有註冊之資源清理 handler 均被調用且具備容錯隔離能力。

### 2.5 Monorepo 平台級整合檢驗
- `pnpm --filter @appspine/notification test`: 8 test files, 74 tests 全數 PASS。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages (8 with manifests), 0 findings。
- `node scripts/051-pl2-10-generation-gate.mjs`: 20/20 checks PASS（包含 schema 與 8 個 generated 構件驗證）。
- `node scripts/051-pl2-09-template-dual-mode.mjs`: 乾淨隔離環境 tarball 安裝、build、typecheck 及 Nest/Next unit tests 全數 PASS。
- `pnpm lint`：634 檔案 0 errors, 0 warnings。
- `pnpm typecheck`：22 packages 0 errors。
- `pnpm test`：全套件單元與合約測試全數 PASS。

---

## 3. 回滾策略（Rollback Plan）

若 notification plugin 在 consumer 端整合出現未預期問題：
1. 既有 consumer 可維持直接 import `NotificationService` 與 `NotificationModule` 的 legacy wiring，無需切換至 plugin mode。
2. 資料庫層面：停用 plugin 不會 DROP `notifications` 資料表或遺失任何通知資料。
3. 可透過 Git 直接 revert 本 branch (`051-pl4-01-notification-plugin`)，對其他 capability packages 無破壞性影響。

---

## 4. Execution Log & §11 Substitution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL4-01` 遷移 `notification` plugin（4A） |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (`implementation`) |
| Substitution reason | 本 session 由使用者指派 Gemini 執行；原 051 計畫建議 roster 為 Terra high |
| Calibration | 依 051 §11 執行嚴格校準：遵循雙份 manifest 同步、Prisma schema digest 驗證、token 反轉、User 模型雙向 augmentation 授權、5 大 facets 宣告與 4 階段 lifecycle。撰寫 parity、isolation、cleanup 測試並執行 full gate 驗證 |
| Independent reviewer | Claude（Notification Contract & Permission Review） |
| Repos / Branches | `appspine-packages` (`051-pl4-01-notification-plugin`) |
| Commit SHA | 見當前 branch commit 紀錄 |
| Evidence | 74/74 unit tests in `@appspine/notification` pass; architecture check 0 findings; generation gate 0 findings; template dual mode pass; pnpm lint 0 errors; pnpm typecheck 0 errors |
| 已知風險 | 無 |
| 下一任務前置 | PL4-02 遷移 `rbac` plugin（4A） |
