---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-01 — 固定 frontend facet 與 package export contract

> Task：`PL3-01`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[Gate G2](051-pl2-gate-g2.md)。
> 本 task 固定 `@appspine/plugin-api` 中 `FrontendFacetContribution` 的型別定義與 JSON Schema 契約，供 PL3-02 建置期產生器與後續 PL3-03～08 各 capability 前端遷移使用。

---

## 1. 交付內容

### 1.1 `FrontendFacetContribution` 結構

在 `packages/plugin-api/src/manifest.ts` 與 `packages/plugin-api/src/schema/appspine.plugin.v1.json` 中定義了結構化前端 facet：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `adminPages` | `(string \| PluginAdminPageContribution)[]` | 插件貢獻的管理頁面定義或識別字串 |
| `navigationItems` | `(string \| PluginNavigationContribution)[]` | 側邊欄或頂部導覽項目，支援 `before`／`after` 相依與 priority |
| `slots` | `PluginSlotContribution[]` | UI 插槽貢獻（如 `dashboard.widgets`, `header.actions`, `sidebar.footer`） |
| `loginProviderUi` | `boolean` | 是否提供互動式登入按鈕／錯誤處理 UI（PL3-04） |
| `i18nNamespace` | `string` | 預設 i18n 命名空間名稱 |
| `i18n` | `PluginI18nContribution` | 支援多語系 namespace 與 locales 清單 |
| `clientEntry` | `string` | 套件發布之 Client Component 入口（如 `./dist/frontend/client.js`） |
| `serverEntry` | `string` | 套件發布之 Server Component 入口（如 `./dist/frontend/server.js`） |

### 1.2 相容性保證

- 維持對 PL0-05 凍結 fixture（`rbac-full-facets.json`、`oidc-auth-interactive-provider.json`）的完全向下相容，簡化字串形式（`adminPages: ["roles"]`）與完整物件形式皆能通過 Ajv 結構驗證。
- 非 facet 欄位維持與凍結合約 byte-identical。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/plugin-api test`: 5 test files, 107 tests 全數通過。
- `pnpm --filter @appspine/plugin-api build`: tsc 編譯乾淨通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked, 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-01` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Claude Sonnet roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified against Phase 2 Gate G2 baseline and frozen manifest fixtures |
| Independent reviewer | Sol (G3) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 107 tests passed in `@appspine/plugin-api`, `schema.spec.ts` 斷言通過 |
| 已知風險 | 無 |
| Next prerequisite | PL3-02 實作 Next.js build-time generator |
