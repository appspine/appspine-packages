---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-03 — 遷移 Users Admin 到 `identity-core/frontend`

> Task：`PL3-03`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL1-10](051-pl1-identity-auth-split.md)。
> 本 task 將 Users Admin UI（使用者列表、建立對話框、操作選單與相關型別）從 `frontend-shell` 遷移至 `@appspine/identity-core/frontend`，並在 manifest 中宣告對應的 `frontend` facet。

---

## 1. 交付內容

### 1.1 `identity-core` 前端匯出

`@appspine/identity-core/frontend` 新增以下元件與型別：
- `UsersTable`: 使用者列表表格元件
- `CreateUserDialog`: 建立使用者對話框
- `UserRowActions`: 使用者操作（啟動/停用、服務帳號切換、角色指派、刪除）
- `UserRow`、`UserRoleOption`、`UsersTableProps`、`CreateUserDialogProps`、`UserRowActionsProps` 等型別

### 1.2 Manifest 前端 Facet 宣告

在 `packages/identity-core/appspine.plugin.json` 中宣告：
- `adminPages`: 貢獻 `id: "users"`, `routePath: "/dashboard/users"`, `componentExport: "UsersTable"`, `requiredPermission: "identity:user:read"`
- `navigationItems`: 貢獻 `id: "users"`, `href: "/dashboard/users"`, `icon: "Users"`
- `i18nNamespace`: `"users"`
- `clientEntry`: `"./dist/frontend.js"`

### 1.3 相容性過渡保證

- `packages/frontend-shell` 暫時保留 `UsersTable`、`CreateUserDialog`、`UserRowActions` 並加上 `@deprecated` 註記，確保過渡期間既有匯入不中斷。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/identity-core build`: tsc 編譯乾淨通過。
- `pnpm --filter @appspine/identity-core test`: 29 tests 全數通過（含 manifest 一致性測試）。
- `pnpm --filter @appspine/frontend-shell build`: 相容匯出編譯通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked, 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-03` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified against PL3-02 generator and identity-core test suite |
| Independent reviewer | Claude (API/UX review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | Users components published via `@appspine/identity-core/frontend`, 29 tests in identity-core passed |
| 已知風險 | 無 |
| Next prerequisite | PL3-04 遷移 OIDC Login 到 oidc-auth/frontend |
