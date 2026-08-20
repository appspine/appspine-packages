---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-06 — 遷移 API Keys Admin 到 `m2m-api-key/frontend`

> Task：`PL3-06`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL1-13](051-pl1-identity-auth-split.md)。
> 本 task 將 API Keys Admin UI（`ApiKeysTable`、`CreateApiKeyDialog`、`CreatedApiKeyReveal`、`ApiKeyRowActions` 與相關型別）遷移至 `@appspine/m2m-api-key/frontend`，並在 manifest 中宣告 `frontend`、`prisma` 與 `permissions` facets。

---

## 1. 交付內容

### 1.1 `m2m-api-key` 前端匯出

`@appspine/m2m-api-key/frontend` 新增以下元件與型別：
- `ApiKeysTable`: API Key 列表表格元件（支援 key prefix、actingUser、scopes、lastUsed 與啟用狀態）
- `CreateApiKeyDialog`: 建立 API Key 對話框（包含角色選取、actingUser 選取、scope 清單、rateLimit 與過期時間）
- `CreatedApiKeyReveal`: 單次明文密鑰揭露對話框，確保密鑰僅在建立時於記憶體中揭露一次並提供複製功能
- `ApiKeyRowActions`: API Key 操作（啟動/停用、更新 acting user、撤銷/刪除）
- `ApiKeyRow`、`CreateApiKeyResponse`、`CreateApiKeyResult`、`ApiKeysTableProps` 等型別
- `M2mApiKeyFrontendContribution`: 前端 facet 型別

### 1.2 Manifest 前端 Facet 宣告

在 `packages/m2m-api-key/appspine.plugin.json` 與 `src/plugin.ts` 中宣告：
- `provides`: 宣告提供 `appspine.machine-auth-provider` 與 `appspine.scope-matcher`
- `adminPages`: 貢獻 `id: "api-keys"`, `routePath: "/dashboard/api-keys"`, `componentExport: "ApiKeysTable"`, `requiredPermission: "m2m:api-key:read"`, `order: 30`
- `navigationItems`: 貢獻 `id: "api-keys"`, `href: "/dashboard/api-keys"`, `icon: "Key"`, `order: 30`, `after: "roles"`
- `i18nNamespace`: `"apiKeys"`
- `clientEntry`: `"./dist/frontend.js"`
- `permissions`: 宣告 `m2m:api-key:create`, `m2m:api-key:update`, `m2m:api-key:delete`, `m2m:api-key:read`

### 1.3 相容性過渡保證

- `packages/frontend-shell/src/components/admin/api-keys-table.tsx`、`create-api-key-dialog.tsx`、`created-api-key-reveal.tsx`、`api-key-row-actions.tsx` 保留相容宣告並註記 `@deprecated`。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/m2m-api-key build`: tsc 編譯乾淨通過。
- `pnpm --filter @appspine/m2m-api-key test`: 4 test files, 21 tests 全數通過（含 API key 驗證、scope 防護、manifest 一致性與 resolution 測試）。
- `pnpm --filter @appspine/frontend-shell build`: 相容匯出編譯通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked (6 with manifests), 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-06` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified secret plaintext one-time reveal security, scope editing safety, and no secret leakage in list/table payloads |
| Independent reviewer | Sol (security-sensitive API key & credential management review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 21 tests in `@appspine/m2m-api-key` passed; one-time reveal flow & revocation UX preserved |
| 已知風險 | 無 |
| Next prerequisite | PL3-07 遷移 Domain Events Admin 到 domain-events/frontend |
