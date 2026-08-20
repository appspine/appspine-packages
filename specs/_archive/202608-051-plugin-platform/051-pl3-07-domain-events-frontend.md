---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-07 — 遷移 Domain Events Admin 到 `domain-events/frontend`

> Task：`PL3-07`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL1-14](051-pl1-identity-auth-split.md)。
> 本 task 將 Domain Events Admin UI（`DomainEventsTable`、`DomainEventCatalogTable`、`DomainEventDeliveriesPanel`、`DomainEventDetailPanel` 與相關型別）遷移至 `@appspine/domain-events/frontend`，並在 manifest 中宣告 `frontend` 與 `permissions` facets。

---

## 1. 交付內容

### 1.1 `domain-events` 前端匯出

`@appspine/domain-events/frontend` 新增以下元件與型別：
- `DomainEventsTable`: 領域事件稽核紀錄列表元件（包含 seq、event、aggregate、changedFields、deliveries 與時間）
- `DomainEventCatalogTable`: 事件訂閱目錄與派送統計視圖（支援程式註冊訂閱者、資料驅動處理器與未解析派送）
- `DomainEventDeliveriesPanel`: 派送紀錄面板（支援 compact 列表摘要與 full 詳細表格，內建 retry 與 ignore 操作）
- `DomainEventDetailPanel`: 事件詳細資訊面板（包含變更欄位、before/after/metadata JSON 檢視）
- `DomainEventRow`、`DomainEventDeliveryRow`、`DomainEventCatalogView`、`DomainEventsTableProps` 等型別
- `DomainEventsFrontendContribution`: 前端 facet 型別

### 1.2 Manifest 前端 Facet 宣告

在 `packages/domain-events/appspine.plugin.json` 與 `src/plugin.ts` 中宣告：
- `provides`: `["appspine.domain-events"]`
- `optionalRequires`: `["appspine.audit-sink", "appspine.machine-auth-provider", "appspine.rbac-policy"]`
- `adminPages`: 貢獻 `id: "domain-events"`, `routePath: "/dashboard/domain-events"`, `componentExport: "DomainEventsTable"`, `requiredPermission: "domain-events:event:read"`, `order: 40`
- `navigationItems`: 貢獻 `id: "domain-events"`, `href: "/dashboard/domain-events"`, `icon: "Activity"`, `order: 40`, `after: "api-keys"`
- `i18nNamespace`: `"domainEvents"`
- `clientEntry`: `"./dist/frontend.js"`
- `permissions`: 宣告 `domain-events:event:read`, `domain-events:event:retry`, `domain-events:event:ignore`

### 1.3 相容性過渡保證

- `packages/frontend-shell/src/components/admin/domain-events-table.tsx`、`domain-event-catalog-table.tsx`、`domain-event-deliveries-panel.tsx`、`domain-event-detail-panel.tsx` 保留相容宣告並註記 `@deprecated`。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/domain-events build`: tsc 編譯乾淨通過。
- `pnpm --filter @appspine/domain-events test`: 12 test files, 76 tests 全數通過（含 event dispatcher, subscriber, drift check, admin service, plugin manifest 與 resolution 測試）。
- `pnpm --filter @appspine/frontend-shell build`: 相容匯出編譯通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked (7 with manifests), 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-07` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified delivery status filtering, dead-letter retry/ignore actions, and catalog subscriber inspection |
| Independent reviewer | Claude (Domain events UX review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 76 tests in `@appspine/domain-events` passed; event audit, catalog and delivery panels published |
| 已知風險 | 無 |
| Next prerequisite | PL3-08 遷移 Notification Bell／Inbox 到 notification/frontend |
