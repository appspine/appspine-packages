---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-05 — 遷移 Roles Admin 到 `rbac/frontend`

> Task：`PL3-05`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL1-11](051-pl1-identity-auth-split.md)。
> 本 task 將 Roles Admin UI（`RolesTable`、`CreateRoleDialog`、`RoleRowActions` 與相關型別）遷移至 `@appspine/rbac/frontend`，並在 manifest 中宣告 `frontend` 與 `permissions` facets。

---

## 1. 交付內容

### 1.1 `rbac` 前端匯出

`@appspine/rbac/frontend` 新增以下元件與型別：
- `RolesTable`: 角色列表表格元件（支援 Policy、Permissions 與使用者/API Key 計數）
- `CreateRoleDialog`: 建立角色對話框
- `RoleRowActions`: 角色編輯與刪除操作
- `RoleRow`、`EnumOption`、`RoleSortField`、`RolesTableKey`、`RolesTableProps` 等型別
- `RbacFrontendContribution`: 前端 facet 型別

### 1.2 Manifest 前端 Facet 宣告

在 `packages/rbac/appspine.plugin.json` 與 `src/plugin.ts` 中宣告：
- `adminPages`: 貢獻 `id: "roles"`, `routePath: "/dashboard/roles"`, `componentExport: "RolesTable"`, `requiredPermission: "rbac:role:read"`, `order: 20`
- `navigationItems`: 貢獻 `id: "roles"`, `href: "/dashboard/roles"`, `icon: "ShieldCheck"`, `order: 20`, `after: "users"`
- `i18nNamespace`: `"rbac"`
- `clientEntry`: `"./dist/frontend.js"`
- `permissions`: 宣告 `rbac:role:create`, `rbac:role:update`, `rbac:role:delete`, `rbac:role:read`

### 1.3 相容性過渡保證

- `packages/frontend-shell/src/components/admin/roles-table.tsx`、`create-role-dialog.tsx`、`role-row-actions.tsx` 保留相容宣告並註記 `@deprecated`。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/rbac build`: tsc 編譯乾淨通過。
- `pnpm --filter @appspine/rbac test`: 3 test files, 31 tests 全數通過（含 plugin manifest, schema digest 與 resolution 測試）。
- `pnpm --filter @appspine/frontend-shell build`: 相容匯出編譯通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked (5 with manifests), 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-05` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified role permissions tree, system role protection, and static frontend imports |
| Independent reviewer | Claude (RBAC UX & permissions review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 31 tests in `@appspine/rbac` passed; roles table, create dialog & row actions published |
| 已知風險 | 無 |
| Next prerequisite | PL3-06 遷移 API Keys Admin 到 m2m-api-key/frontend |
