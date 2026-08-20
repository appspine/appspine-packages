---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-08 — 遷移 Notification Bell／Inbox 到 `notification/frontend`

> Task：`PL3-08`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL1-15](051-pl1-identity-auth-split.md)。
> 本 task 將 Notification Bell 與 Inbox 輪詢機制（`NotificationBell`、`useNotificationPolling`、`createNotificationPollingController` 與相關型別）遷移至 `@appspine/notification/frontend`，並在 manifest 中宣告 `frontend`（slot `header.actions`）與 `permissions` facets。

---

## 1. 交付內容

### 1.1 `notification` 前端匯出

`@appspine/notification/frontend` 新增以下元件與型別：
- `NotificationBell`: 通知鈴鐺與下拉選單元件（包含未讀數量徽章、樂觀已讀標記、全部標為已讀、點擊跳轉與錯誤重試）
- `useNotificationPolling`: 輪詢 React hook（處理可見性切換暫停/恢復、頁面隱藏保護與手動 forceRefresh）
- `createNotificationPollingController`: 純邏輯輪詢控制器，便於獨立單元測試
- `NotificationSeverity`、`NotificationSummary`、`NotificationDataSource`、`NotificationLabels`、`NotificationBellProps` 等型別
- `NotificationFrontendContribution`: 前端 facet 型別

### 1.2 Manifest 前端 Facet 與 Slot 宣告

在 `packages/notification/appspine.plugin.json` 與 `src/plugin.ts` 中宣告：
- `provides`: `["appspine.notification-inbox"]`
- `slots`: 貢獻 `slot: "header.actions"`, `componentExport: "NotificationBell"`, `order: 10`
- `i18nNamespace`: `"notification"`
- `clientEntry`: `"./dist/frontend.js"`
- `permissions`: 宣告 `notification:inbox:read`, `notification:inbox:update`

### 1.3 相容性過渡保證

- `packages/frontend-shell/src/notification/index.ts` 保留相容宣告並註記 `@deprecated`。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/notification build`: tsc 編譯乾淨通過。
- `pnpm --filter @appspine/notification test`: 5 test files, 52 tests 全數通過（含輪詢狀態機、可見性暫停、樂觀更新、plugin manifest 與 resolution 測試）。
- `pnpm --filter @appspine/frontend-shell build`: 相容匯出編譯通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked (8 with manifests), 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-08` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified header.actions slot contract, polling visibility lifecycle, and optimistic unread count badge update |
| Independent reviewer | Claude (Notification UX review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 52 tests in `@appspine/notification` passed; NotificationBell & polling hook exported via frontend facet |
| 已知風險 | 無 |
| Next prerequisite | PL3-09 收斂 frontend-shell 並執行 migration codemod |
