---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-17
updated: 2026-08-17
---

# 050 - mcp-gateway 側邊欄：帳號列置底修正 + Admin 選單改為 Modal - 系統設計計畫

> 狀態：**已定案，待執行**。本文件講「要做什麼、為什麼」；「怎麼做、什麼順序、怎麼驗」見執行拆解
> [050-mcp-gateway-sidebar-modal-task-breakdown.md](050-mcp-gateway-sidebar-modal-task-breakdown.md)（Opus 產出）。

## 1. 背景與問題

使用者回報兩件 `apps/mcp-gateway` 前端 UI 問題（元件多數來自共用套件
`@appspine/frontend-shell`，源碼在本 repo `packages/frontend-shell`）：

1. 左側邊欄底部的帳號列（如「Dev Admin」）沒有真正置底。
2. 側邊欄混雜了一整組只有系統管理者會用到的「administration」選單（Users / Roles / API Keys /
   Gateway Profiles / Vault / Audit Logs / DLP Rules，共 7 項），干擾一般選單，希望比照
   Claude.ai 網頁版帳號設定視窗的做法，改用彈出視窗（modal）承載，而不是常駐佔用側邊欄空間。

兩個唯讀 Explore agent 已完成程式碼層級調查（非本機瀏覽器實測），根因與設計已確認：問題 1 有
明確的單檔根因（見第 2 節），問題 2 的路由結構、可重用元件、跨 app 影響範圍已盤點清楚（見第 3
節）。使用者已就 admin 選單的路由策略與套用範圍做出決定（保留獨立網址、用 intercepting route
疊加、先做 `mcp-gateway`）。

## 2. Part A — 帳號列未置底：根因已確認

**根因**：`packages/frontend-shell/src/components/shell/app-sidebar.tsx:47` 寫了

```tsx
<Sidebar {...props} className="relative">
```

而 `Sidebar` 桌面版分支（`packages/frontend-shell/src/components/ui/sidebar.tsx:211-221`）本身已經
在同一個 div 上寫死 `fixed inset-y-0 h-svh ...`。兩者透過 `cn()`（= `twMerge(clsx(...))`，
`lib/utils.ts:1-6`）合併 className 時，`tailwind-merge` 把 `static/fixed/absolute/relative/sticky`
視為同一組互斥的「position」class group，**只保留合併時排在最後的那個**——也就是外面傳進來的
`relative`（排在最後）會把寫死的 `fixed` 覆蓋掉。結果 `data-slot="sidebar-container"` 實際渲染出來
是 `position: relative`，不是 `position: fixed`。

**為什麼只在內容過長時才會發現**：`sidebar-wrapper` 是 `flex min-h-svh w-full`
（`sidebar.tsx:127-128`），預設 `align-items: stretch`，會撐到最高的 flex 子項（主內容欄）那麼高。
`sidebar-container` 變成 `relative` 後仍在文件流內、`h-svh` 高度不變，短頁面時視窗本身不會捲動，
視覺上跟真正 `fixed` 幾乎一樣；但只要右側主內容夠長、整頁需要捲動，這個「假 fixed」的側邊欄
（含帳號列）就會跟著頁面一起被捲走——正好對應使用者「右側內容過長就會發生」的觀察。已排除
「有 transform/filter/backdrop-filter/will-change/contain 的祖先元素劫持 fixed containing
block」這個常見的替代解釋：`sidebar-wrapper` 到 `<body>` 之間沒有任何 DOM 包裝層（I18nProvider /
TooltipProvider / PreferencesStoreProvider 都是純 context provider，不渲染 DOM），且逐一檢查過
`transform`/`backdrop-blur`/`will-change`/`contain-`/`perspective` 的所有命中，均為條件式的 Radix
Portal 彈窗內容（只在開啟時掛載、且是 sidebar 的手足而非祖先）或無關的 hover/rotate 效果。

**修正**：`app-sidebar.tsx:47` 移除多餘的 `className="relative"`（改成 `<Sidebar {...props}>`）。
`fixed` 本身已是有效的 CSS positioning context，`SidebarResizer`（`sidebar-resizer.tsx`，用
`absolute` 定位）不需要額外的 `relative` 才能正確定位，拿掉後不影響其行為。單一檔案、一行異動，
風險低。

## 3. Part B — Admin 選單改為 Modal（Next.js intercepting route，保留原網址）

使用者已拍板：**保留每個 admin 頁面原本的網址**（可分享、可重新整理），用 Next.js App Router 的
*intercepting route*（`(.)folder` 慣例）讓「從側邊欄點進去」時以 modal 疊加在目前頁面上，
「直接打網址／重新整理」時仍照舊渲染成完整頁面。範圍先做 `apps/mcp-gateway`，共用的 modal 外殼
元件放進 `@appspine/frontend-shell`（供之後 `appspine-app-template` 等其他 app 重用外殼；各 app
的選單項目與頁面內容不共用，理由見 3.1）。

### 3.1 調查確認的關鍵事實

- `apps/mcp-gateway` 的 7 個 admin 頁面在
  `src/app/(main)/dashboard/(admin)/{users,roles,api-keys,gateway-profiles,vault,audit-logs,dlp-rules}/page.tsx`，
  每個都是**直接做資料抓取的 async server component**（例如 `users/page.tsx` 內直接
  `apiFetch(...)` 抓資料、直接渲染 `<UsersTable>`），不是「已拆好的純內容元件」。這代表新增的
  intercepting page 可以**直接 import 既有 page.tsx 的預設匯出**再包一層 modal 外殼，不需要拆分
  重構既有 7 個頁面。
- 全部相關 repo（`apps/mcp-gateway`、`appspine-app-template`、`apps/approve`、`apps/calendar`、
  `apps/chat`、`apps/master-data`、`apps/wiki`、`apps/projects`、`apps/drive`）目前**完全沒有**
  intercepting/parallel route 的先例（`(.)`、`(..)`、`@modal` 慣例），這是本 workspace 頭一次
  導入，需要在本機 dev 環境實測確認 Next.js 對路由層級的判斷符合預期。
- `appspine-app-template` 用同一份 `NavGroup`/`(admin)/layout.tsx` 版型（角色守門邏輯逐位元組相同）
  但項目較少（只有 users/roles/api-keys，沒有 vault/audit-logs/dlp-rules/gateway-profiles）——
  證實只有「modal 外殼」該收斂進共用套件，選單清單與頁面內容仍須留在各 app（呼應本 repo 021 號
  決策「Next.js page 是檔案系統路由，無法整頁搬進套件」的既有結論）。
- 共用套件的 `DialogContent`（`packages/frontend-shell/src/components/ui/dialog.tsx:41-72`）預設
  是 `sm:max-w-sm` 的小尺寸表單彈窗，沒有「寬版設定視窗」變體，新元件需要自帶 className 覆蓋
  （用同一個 `cn()`/twMerge 機制——這裡是刻意利用「後蓋前」的行為，不是 Part A 那種誤觸碰撞）。
- `HeaderBreadcrumbs`（`header-breadcrumbs.tsx`）純粹依 `pathname` 判斷內容。**修正（Opus 審查
  發現，見 task-breakdown 判斷取捨 #8）**：intercepting route **會**改變網址（這正是「保留獨立
  網址、可分享可重整」的前提），所以背景頁麵包屑會跟著網址從「Dashboard」變成「Administration /
  Users」——這是正確行為，與重新整理後的完整頁一致，不需要額外處理去「保持不動」。

### 3.2 B1 — 共用套件新增 `AdminSettingsModal`（`packages/frontend-shell`）

新檔 `src/components/shell/admin-settings-modal.tsx`（`'use client'`）：

- Props：`title`、`navItems: {id, title, url, icon?}[]`、`activeId`、`onClose: () => void`、
  `LinkComponent`（沿用既有 `ShellLinkComponent` 型別）、`children`。
- 內部用現有 `Dialog`/`DialogContent`，`onOpenChange={(open) => !open && onClose()}`；
  `DialogContent` 覆蓋成寬版兩欄版型（例如 `sm:max-w-4xl h-[85vh] p-0 flex overflow-hidden`）：
  左側迷你導覽（仿 `SidebarMenuButton` 樣式列出 `navItems`，依 `activeId` 標示 active）、右側
  `flex-1 overflow-y-auto` 內容區放 `children`。
- `children` 外包一層 `<Suspense>`（loading fallback）與一個簡單的 client 錯誤邊界。**修正（Opus
  審查發現）**：這**不是取代**、是**補上 modal 路徑本來就沒有的那一份——`(admin)/dlp-rules/` 的
  `loading.tsx`/`error.tsx` 只服務完整頁路徑（直接打網址／重新整理），`@modal` 攔截路徑是另一條
  路由分支，本來就吃不到它們，兩個既有檔案**維持不動、不刪**。共用邊界在 modal 內是**近似**——
  通用骨架取代 dlp-rules 貼合版型的 skeleton，通用錯誤文案取代 `dlpRules` 專屬 i18n 文案，這兩點
  降級是否可接受待與使用者確認（見 task-breakdown 判斷取捨 #5）。
- 於 `src/index.ts` barrel 匯出 `AdminSettingsModal` 及其 props 型別。

### 3.3 B2 — `apps/mcp-gateway` 側邊欄選單調整

`src/navigation/sidebar/sidebar-items.ts`：

- 把現有 7 項的 `administration` `NavGroup` 換成**單一入口項目**（沿用既有 `administration`
  翻譯 key 當標題，不另設 group label，避免文字重複），連到 `/dashboard/users`。
- 把原本 7 個項目的定義抽成獨立匯出常數（如 `ADMIN_MODAL_ITEMS`），供 3.4 的 modal 內部導覽重用，
  兩邊共用同一份來源，不會兩邊各寫一份而失同步。

### 3.4 B3 — Intercepting route 接線

- `src/app/(main)/dashboard/@modal/default.tsx`：新檔，`export default function Default() { return null }`
  （parallel route slot 必備）。
- `src/app/(main)/dashboard/layout.tsx`：改成接收並轉送 `modal` slot（`{ children, modal }`）。
- `src/app/(main)/dashboard/_components/dashboard-shell-bridge.tsx`：新增 `modal?: ReactNode`
  prop，在 `{children}` 之後一併 render。
- 新檔 `src/app/(main)/dashboard/_components/admin-modal.tsx`（`'use client'`）：包一層
  `AdminSettingsModal`，補上 `onClose={() => router.back()}`、`LinkComponent`、把
  `ADMIN_MODAL_ITEMS` 標題跑過 `tNav` 翻譯、依 `usePathname()` 算出 `activeId`。
- 7 個新檔（`@modal/(.)users/page.tsx`、`(.)roles/page.tsx`、`(.)api-keys/page.tsx`、
  `(.)gateway-profiles/page.tsx`、`(.)vault/page.tsx`、`(.)audit-logs/page.tsx`、
  `(.)dlp-rules/page.tsx`）：每個**直接 import 對應的既有 `(admin)/xxx/page.tsx` 預設匯出**，
  包進 `<AdminModal activeId="xxx">`，原封不動轉送 `searchParams`/`params`。7 個既有頁面完全
  不用改，邏輯零重複。
  - `(admin)` 是 route group、不影響網址深度，`@modal` 與 `(admin)` 同層，理論上 `(.)xxx`
    （同層攔截）就是對的深度；此點需在本機 dev 環境實測確認，若 Next.js 判斷的層級與預期不同，
    改成 `(..)xxx` 修正。
- **修正並待決（Opus 審查發現的 blocker）**：原計畫誤以為 `requireAdmin()` 是新檔，實際上
  `src/server/require-admin.ts` **已存在**，供 6 個 `actions.ts`（users/roles/api-keys/
  gateway-profiles/vault/dlp-rules，共約 28 處呼叫）在 Server Action 情境下守門——它是**用
  `throw new Error(...)`**（不是 `redirect`），因為 Server Action 不會經過 `(admin)/layout.tsx`
  的守門。`@modal` 底下的 7 個攔截頁一樣不會繼承 `(admin)/layout.tsx` 的保護、必須各自守門，但
  直接沿用既有 `requireAdmin()` 會讓非 ADMIN 使用者在 modal 頁面上看到 `throw` 產生的錯誤畫面，
  而不是 `(admin)/layout.tsx` 那種 `redirect("/unauthorized")`。是否新增一個 redirect 語意的頁面
  守門變體（例如 `requireAdminPage()`），還是接受 modal 路徑的非 ADMIN 使用者看到錯誤畫面，是
  執行前必須先決定的問題，見 task-breakdown 判斷取捨 #3。

### 3.5 執行順序（概要，詳細任務拆解見 task-breakdown）

先完整做 **Users** 一條（3.2 外殼 + 3.3 選單調整 + 3.4 路由接線 + `@modal/(.)users`），在本機
dev 環境用瀏覽器工具實測跑通（含 admin 守門、reload 行為、modal 開關），確認 intercepting route
深度判斷正確後，再照同一個 pattern 機械式複製到其餘 6 條路由。

## 4. 驗證方式

需要啟動本機開發環境（`apps/mcp-gateway` 的 `docker-compose.yml` 服務 + `pnpm dev`）用瀏覽器
工具實際測試——執行前先檢查目前可用記憶體（同時跑多個 Docker stack 曾導致 tsc/node OOM，見
本地環境記憶體壓力的既有教訓）。

- **Part A**：找一個資料夠多、頁面會捲動的 admin 頁（如 Audit Logs），修正前後各截圖比對，確認
  捲動到底時帳號列仍貼齊視窗底部。
- **Part B**：
  - 從側邊欄點新的「Administration」項目 → 確認以 modal 疊加在目前頁面上，網址變成
    `/dashboard/users`。
  - modal 內切換 Users/Roles/API Keys/Gateway Profiles/Vault/Audit Logs/DLP Rules，確認內容與
    現有完整頁面一致。
  - modal 開著時按瀏覽器重新整理 → 確認變成完整頁面（非攔截版）。
  - 直接打網址到 `/dashboard/dlp-rules` 等 → 確認完整頁面行為不變。
  - 非 ADMIN 帳號：側邊欄不出現該入口，且直接打 `@modal` 攔截路由與完整頁面路由都要被擋下。
  - 背景頁麵包屑在 modal 開啟時仍正確顯示。
- 在 `appspine-packages` 與 `apps/mcp-gateway/frontend` 分別跑 `pnpm typecheck` / `pnpm lint`
  （或 `check`）。

## 5. 發版與依賴更新（最後一步，執行前會再次確認）

- 本機驗證時，先用暫時的 `pnpm` override／`pnpm link` 讓 `apps/mcp-gateway` 的
  `@appspine/frontend-shell` 指向本機建置版本，不用等真的發版就能實測。
- 驗證通過後在 `appspine-packages` 加 changeset、commit、push——CI（`changesets/action@v1`）
  會照現有慣例自動發布新版本。
- 發布完成後把 `apps/mcp-gateway/frontend/package.json` 的 `@appspine/frontend-shell` 版本號
  更新、`pnpm install`，移除暫時的 override，做最後一次確認。

## 6. 待確認 / 風險

1. Intercepting route 的資料夾層級（`(.)` vs `(..)`）需要實測才能確定，`(admin)` route group
   是否真的對 Next.js 的層級判斷完全透明，目前只是依官方文件推論，尚未跑過。
2. **修正（Opus 審查發現）**：原敘述「兩邊已有 minor 版本落差」是誤判。`apps/mcp-gateway` 的
   `frontend/package.json` 雖寫 `^0.15.1`，但**實際生效的是 `pnpm-workspace.yaml` 的 `overrides`
   硬釘 `0.15.0`**，而 `appspine-app-template` 的 `pnpm-workspace.yaml` 也用同樣的 override 釘在
   `0.15.0`——兩邊實際安裝版本**完全相同，沒有落差**；`package.json` 裡的版本宣告只是沒有反映
   override、具有誤導性。本次發版後，`mcp-gateway` 的 override 會更新到新版本（見 task-breakdown
   S6-3），`appspine-app-template` 的 override 維持 `0.15.0` 不動——這才是本計畫刻意造成、之後才
   會出現的落差，暫不在本計畫範圍內處理 `appspine-app-template` 的同步升級。
3. 啟動本機 Docker 開發環境（Keycloak + DB）進行實測，需留意先前已知的本機記憶體壓力問題。
