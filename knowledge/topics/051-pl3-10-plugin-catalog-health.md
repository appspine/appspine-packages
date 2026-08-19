---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-10 — 建立 plugin catalog／health 管理面

> Task：`PL3-10`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL2-08](051-pl2-08-preset-standard.md)。
> 本 task 交付 Plugin Catalog & Health 管理面元件 `PluginCatalogTable`，展示已安裝外掛清單、執行階段狀態（`ready`、`degraded`、`failed`、`not-reached`）、系統開機健康狀態（`System Ready`、`System Degraded`、`Boot Aborted`）、能力提供與需求宣告、啟動耗時與詳細診斷檢視。

---

## 1. 交付內容

### 1.1 `PluginCatalogTable` 元件

在 `@appspine/frontend-shell` 中新增：
- `PluginCatalogTable`: 外掛管理與健康狀態表格元件
  - 系統開機健康狀態徽章（`System Ready`、`System Degraded`、`Boot Aborted`）
  - 外掛統計指標卡（外掛總數、Ready 數量、Degraded 數量、Failed 數量、總啟動時間）
  - 外掛清單表格（外掛名稱、Package 版本、狀態徽章、Provides/Requires/UnresolvedOptional 能力標籤、啟動耗時、檢查按鈕）
  - 外掛詳細對話框（Package 資訊、Instance ID、Digest 雜湊值、生命週期失敗階段與錯誤訊息、敏感設定遮蔽檢查）
- 型別定義：`PluginCatalogItem`、`PluginCatalogSummary`、`PluginBootOutcome`、`PluginStatus`、`PluginCatalogTableProps` 等。

### 1.2 安全性與權限保護

- **機敏設定遮蔽保證**：所有展示之 `config` 均繼承 `AppspinePluginHost.describe()` 之遮蔽保證，不洩漏任何明文金鑰或密碼。
- **權限保護**：對應後端路由與前端頁面 `requiredPermission: "plugin:catalog:read"`。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/frontend-shell build`: tsc 編譯通過。
- `pnpm --filter @appspine/frontend-shell test`: 10 test files, 53 tests 全數通過（含 `PluginCatalogTable` 渲染、狀態徽章與診斷檢視測試）。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked (8 with manifests), 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-10` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified sensitive config redaction, system health aggregation parity, and failed plugin stage inspection |
| Independent reviewer | Sol (Plugin catalog security & permission review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 53 tests in `@appspine/frontend-shell` passed; PluginCatalogTable & diagnostics dialog verified |
| 已知風險 | 無 |
| Next prerequisite | PL3-11 Template frontend integration 與 E2E |
