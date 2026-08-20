---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-01
updated: 2026-08-03
---

# 004 - 框架完整收尾計劃

> 本文件為 003 之後的下一階段執行計劃，目標是讓整個框架具備「可透過瀏覽器完整使用」的狀態。
> 狀態：計劃已定案，待執行。

## 背景

`appspine/appspine` 的八個後端套件已完成、發布、並接進 `appspine-app-template`，後端 API 全部可用（見 `003-shared-package-reuse-plan.md`）。目前缺口：

- controllers 沒有稽核紀錄
- 前端沒有 shell 套件
- 沒有 E2E 測試骨架
- 沒有管理 UI（只能靠 curl 管理使用者/角色/API key）

完成後：框架本身全功能，可以直接用來建第一個業務系統。

---

## 範圍（四個工作包）

### 1. 補稽核紀錄（`@appspine/auth`, `@appspine/rbac`, `@appspine/m2m-api-key`）

**目標**：每個寫入操作（create/update/delete）都呼叫 `AuditLogService.record()`。

**技術決策**：
- `@appspine/audit-log` 的 `AuditLogModule` 已是 `@Global()`，所以 NestJS DI 在 runtime 不需要各套件顯式 import 它。
- 但 TypeScript compile 時需要 type，所以在 auth/rbac/m2m-api-key 的 `package.json` 新增 `@appspine/audit-log` 為 **peerDependency + devDependency**。
- 在各 controller 的 constructor 注入 `AuditLogService`，`record()` 呼叫沿用 003 文件描述的格式。
- 不採用 `AuditEmitterService`（pg-boss 集中佇列，已在 003 明確排除）。

**影響範圍**：
- `packages/auth/src/users/users.controller.ts` — 注入並呼叫 (create/update/updateRoles/remove)
- `packages/rbac/src/roles/roles.controller.ts` — 同上 (create/update/replacePermissions/remove)
- `packages/m2m-api-key/src/api-keys.controller.ts` — 同上 (create/update/remove)
- 三個套件的 `package.json` 各加 peer/devDependency；各自的 Module 更新以允許 DI 解析 `AuditLogService`
- Changeset patch bump → 新版本發布
- `appspine-app-template/backend/package.json` 更新至新版本

---

### 2. `@appspine/frontend-shell`（新套件）

**目標**：把現有 `appspine-app-template/frontend` 裡的 shell 層抽成可共用套件。

**MVP 範疇**（只抽真正通用的，app 特有的留在 template）：

| 元件 | 說明 | 目前位置 |
|---|---|---|
| `<DashboardShell>` | 整個 layout wrapper（sidebar + main content slot），接受 `navItems`/`header` props | `app/(main)/dashboard/layout.tsx` |
| `<ThemeSwitcher />` | 主題切換按鈕 | `sidebar/theme-switcher.tsx` |
| `<SidebarResizer />` | 側欄寬度拖曳（已修好 a11y） | `sidebar/sidebar-resizer.tsx` |
| `<UserNav user={} onSignOut={fn} />` | 側欄底部使用者資訊 + 登出 | `sidebar/nav-user.tsx` |

**app 特有，留在 template 不抽**：導覽項目清單、app logo、特定路由結構

**技術決策**：
- 套件輸出純 React 元件（`"use client"` where needed）
- Peer deps: `next`, `react`, `react-dom`, `tailwindcss`, shadcn/ui 系列（由 app 側提供）
- `tsconfig.json`：`"jsx": "preserve"`，讓 Next.js/Turbopack 處理 JSX
- `appspine-app-template/next.config.ts`：加 `transpilePackages: ['@appspine/frontend-shell']`
- `frontend/` 重構：把上述元件換成從套件 import

---

### 3. 管理 UI（`appspine-app-template/frontend`）

後端 API 已就緒，前端需要：

#### 3a. 前端 Auth 層（先決條件）

- **Login 頁面**：`app/(external)/login/page.tsx` — Server Action 呼叫 `POST /auth/login` → `Set-Cookie` httpOnly JWT
- **Middleware**：`middleware.ts` 讀 cookie，未登入重導至 `/login`
- **登出**：Server Action 清除 cookie，重導至 `/login`
- **Auth context**：`src/stores/auth/` 或 Server Component props，傳遞 `{ userId, email, roleNames }` 給下游元件

#### 3b. 管理頁面（ADMIN only，透過 roleNames check 在 layout 層保護）

| 路由 | 說明 |
|---|---|
| `/dashboard/users` | 使用者列表（分頁搜尋）+ 建立/停用/刪除 + 指派角色 |
| `/dashboard/roles` | 角色列表 + 建立/刪除 + Permission 勾選 |
| `/dashboard/api-keys` | API Key 列表 + 建立（一次性顯示 key）+ 停用/刪除 |

**UI 風格**：沿用現有 shadcn DataTable/Dialog/Form，跟現有 dashboard 一致

**呼叫後端**：Next.js Server Actions，帶 httpOnly cookie token 發送至後端 API

---

### 4. `@appspine/e2e-kit`（新套件）

符合 001 文件描述的 E2E 測試骨架：

**套件結構**：
```
packages/e2e-kit/
  src/
    config.ts             — createPlaywrightConfig({ baseURL, apiURL }) factory
    fixtures/
      auth.fixture.ts     — 登入 fixture，storageState 快取到 .auth/
    specs/
      auth.spec.ts        — register/login/me golden path
      rbac.spec.ts        — ADMIN 路由封鎖未授權者 → redirect to /login
      m2m-api-key.spec.ts — 建立 API key → 呼叫受保護 endpoint
  package.json
  tsconfig.json
```

**消費端用法**（appspine-app-template 加 `e2e/` 目錄）：
```ts
// e2e/playwright.config.ts
import { createPlaywrightConfig } from '@appspine/e2e-kit'
export default createPlaywrightConfig({ baseURL: 'http://localhost:3901', apiURL: 'http://localhost:3900' })
```

**CI job**（`appspine-app-template/.github/workflows/e2e.yml`）：只在 `e2e/` 目錄存在時觸發（path filter）

---

## 執行順序與依賴關係

```
① 稽核紀錄 wiring ──────────────────────────────────
   └── 新版本發布 → ③ 更新 template backend

② Auth 層（login page + httpOnly cookie + middleware）
   └── ④ 管理 UI（Users / Roles / API Keys）

⑤ @appspine/frontend-shell ── 可與 ②③④ 平行
   └── 重構 template frontend 使用套件

⑥ @appspine/e2e-kit ── 等前五步都就緒
```

建議執行順序：① → ②③（可平行）→ ④⑤（可平行）→ ⑥

---

## 已確認的技術決策

| 問題 | 決策 |
|---|---|
| 前端 JWT token 儲存 | httpOnly cookie。Login 頁面用 Server Action 寫入；`middleware.ts` 讀 cookie 判斷登入狀態。 |
| frontend-shell JSX 輸出 | `"jsx": "preserve"`，套件保留 `.tsx`，`transpilePackages: ['@appspine/frontend-shell']` 加進 `next.config.ts`，由 Next.js/Turbopack 處理。 |

## 完成後的狀態

- **後端**：每個寫入操作都留 audit log，稽核紀錄功能完整
- **前端**：有登入流程、可透過瀏覽器完整管理使用者/角色/API Key、shell 層抽成共用套件
- **測試**：有 E2E 骨架，新 app 加 `e2e/` 目錄即可繼承 golden path spec
- **下一步**：框架收尾後，可以開始建第一個實際業務系統

