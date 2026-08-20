---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-10 — 建立 plugin catalog／health 管理面與實際路由保護

> Task：`PL3-10`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL2-08](051-pl2-08-preset-standard.md)、[PL3-09](051-pl3-09-frontend-shell-convergence.md)。
> 審查發現與修復依據：見 [051-pl3-10-independent-security-review.md](051-pl3-10-independent-security-review.md)。
> 本 task 交付 Plugin Catalog & Health 管理面元件 `PluginCatalogTable`、後端受 RBAC 保護的 `PluginCatalogController`（`GET /admin/plugins`），並在 `@appspine/health-check` manifest 宣告 `adminPages` 與 `permissions`，於 `appspine-app-template` 正式掛載 `(admin)/plugins/page.tsx`。

---

## 1. 架構歸屬與判斷理由

依據 051 拆解 §1.3「Platform foundation」分類：
1. **`@appspine/frontend-shell` 為基礎設施套件**：不應偽裝成 capability plugin 宣告 manifest，專注於提供通用 UI primitives 與 `PluginCatalogTable` 渲染元件。
2. **`@appspine/plugin-host-nest` 為執行階段 Host 核心**：提供生命週期、catalog 聚集與機敏設定遮蔽（`AppspinePluginHost.describe()`）。
3. **`@appspine/health-check` 為標準能力外掛**：作為 `@appspine/preset-standard` 的內建單例外掛，由其擁有運維診斷與健康管理職責最為合適。因此在 `@appspine/health-check` 中：
   - 宣告 `adminPages`: `{ id: "plugins", routePath: "/dashboard/plugins", title: "Plugins", componentExport: "PluginCatalogTable", order: 50, requiredPermission: "plugin:catalog:read" }`
   - 宣告 `navigationItems`: `{ id: "plugins", title: "Plugins", href: "/dashboard/plugins", icon: "Puzzle", order: 50, requiredPermission: "plugin:catalog:read" }`
   - 宣告 `permissions`: `["plugin:catalog:read"]`
   - 宣告 `controllerRoutes`: `["health", "admin/plugins"]`
   - 提供 `./frontend` 子路徑匯出與 `PluginCatalogController`。

---

## 2. 實際路由掛載與 RBAC 雙重防禦

### 2.1 後端 Controller 防禦（`GET /admin/plugins`）

在 `@appspine/health-check` 實作 `PluginCatalogController`：
```ts
@Controller('admin/plugins')
@UseGuards(InteractiveAuthGuard, SystemAdminGuard)
export class PluginCatalogController {
  constructor(@Optional() private readonly host?: AppspinePluginHost) {}

  @Get()
  getCatalog() {
    return this.host ? this.host.describe() : { outcome: 'ready', order: [], plugins: [] };
  }
}
```
- **身份驗證**：`InteractiveAuthGuard` 阻擋未登入請求（401 Unauthorized）。
- **權限檢查**：`SystemAdminGuard` 確保非系統管理員不得存取（403 Forbidden）。
- **機敏資訊遮蔽**：直接調用 `AppspinePluginHost.describe()`，其所有 plugin `config` 均已在 Phase 1（PL1-06）完成自動遮蔽（例如金鑰與密碼替換為 `[REDACTED]`）。

### 2.2 前端 Admin 頁面掛載（`appspine-app-template`）

在 `appspine-app-template/frontend/src/app/(main)/dashboard/(admin)/plugins/page.tsx`：
```tsx
import type { PluginCatalogSummary } from "@appspine/frontend-shell";
import { PluginCatalogTable } from "@appspine/frontend-shell";
import { apiFetch } from "@/server/api-client";

export default async function PluginsAdminPage() {
  const catalog = await apiFetch<PluginCatalogSummary>("/admin/plugins");

  return (
    <div className="flex flex-col gap-4">
      <PluginCatalogTable catalog={catalog} />
    </div>
  );
}
```
- **頁面級守門**：位在 `(admin)` route group 下，受 `AdminLayout` 之 `await requireAdminPage()` 保護。非 Admin 導向 `/dashboard` 或 `/login`，無法加載頁面。

---

## 3. 驗證與測試

1. **`@appspine/health-check` 測試**：
   - `src/plugin-catalog.controller.spec.ts`: 驗證 Controller 掛有 `InteractiveAuthGuard` 與 `SystemAdminGuard`，且回傳的 catalog 設定值遮蔽完整。
   - `src/plugin.spec.ts`: 驗證 manifest 與 TS 定義一致，正確宣告 `adminPages`、`navigationItems` 與 `permissions`。
   - 15/15 tests 通過。
2. **`appspine-app-template` 整合測試**：
   - `backend/src/plugin-catalog.spec.ts`: 驗證 Controller 權限守門與機敏設定遮蔽斷言。
   - `node scripts/051-pl2-09-template-dual-mode.mjs`: 真實 tarball 安裝、`appspine build` 產生、typecheck、NestJS 建置與 5 個測試檔案（11 個 tests）全數通過。
3. **靜態與架構檢核**：
   - `pnpm lint`: 628 檔案通過，0 errors，0 warnings。
   - `node scripts/051-pl1-architecture-check.mjs`: 22 packages, 0 findings。
   - `node scripts/051-pl2-10-generation-gate.mjs`: 8 goldens byte-identical，6 self-tests 通過。

---

## 4. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-10`（Remediation） |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Implemented PluginCatalogController with InteractiveAuthGuard/SystemAdminGuard, declared frontend & permissions facets in health-check, mounted (admin)/plugins/page.tsx in template, and validated tarball dual-mode |
| Independent reviewer evidence | [051-pl3-10-independent-security-review.md](051-pl3-10-independent-security-review.md)（由 Claude 獨立審查提出修復要求；後續由獨立 session 做最終簽核） |
| Branch | `051-pl3-01-frontend-contract` (packages) / `051-pl2-09-dual-mode-host` (template) |
| Tools | repo read/write, pnpm, vitest, tsc, node, git |
| Evidence | 15 tests in `@appspine/health-check` passed; 11 tests in `appspine-app-template` passed; dual-mode template verification OK; pnpm lint clean |
| 已知風險 | 無 |
