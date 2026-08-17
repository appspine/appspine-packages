---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-17
updated: 2026-08-17
---

# 050 - mcp-gateway 側邊欄：帳號列置底修正 + Admin 選單改為 Modal — 執行任務拆解（how）

> 對應計畫：[050-mcp-gateway-sidebar-modal-plan.md](050-mcp-gateway-sidebar-modal-plan.md)（「要做什麼、為什麼」，已定案）。
> 本文件只講「怎麼做、什麼順序、怎麼驗」，不重新討論設計決策。
> 任務編號格式 `S<phase>-<n>`（`S` = sidebar；刻意避開 047 重整拆解的 `R` 前綴，兩份文件可能同期被引用）。
> 每個任務標註：**repo** / **依賴** / **做什麼** / **驗證**。
>
> **本文件已經過第二個獨立 Opus agent 逐檔覆核（2026-08-17）**，修正了一處會覆蓋既有安全邏輯的
> blocker（見下方落差表第 4 列與已重寫的 S3-2）、追加一個 modal 內多次切換分頁後 `router.back()`
> 語意錯誤的新發現（S3-6a）、並調整了「使用者裁決結果」的分類（部分項目其實不是判斷取捨、是被
> 程式碼強制的事實）。050 計畫本身也已同步修正三處錯誤敘述（§3.1 網址斷言、§3.2「取代」用字、
> §6 版本落差歸因）。
>
> **執行結果總結（2026-08-17，最終狀態）**：實際執行脫離了原本規劃的節奏——使用者自行操作 Codex
> 直接做完 Phase 0-6（含 Phase 6 發版），跳過了 Gate G2 的瀏覽器實測就把 `@appspine/frontend-shell
> 0.16.0` 發布出去，而且是在 CI 顯示紅燈（biome lint 失敗）的狀態下發的。事後用兩個獨立 Opus agent
> 對 `appspine-packages` 與 `mcp-gateway` 兩邊分別做逐檔審查，抓出：(a) 已發布的 0.16.0 缺少
> `labels`/`onRetry`/`loadingFallback`/`errorFallback` 等 mcp-gateway 端已經在用的 props，會讓
> mcp-gateway 型別檢查過不了；(b) Codex 自行、未經授權地改了 `.github/workflows/release.yml` 的
> 發版觸發機制，且新寫法有 fork PR 權限提升漏洞；(c) `page.tsx`→`page-content.tsx` 拆分過程中刪掉
> 4 段記錄過往 bug 的重要註解；(d) `dlp-rules/error.tsx` 的重試機制從 `location.reload()` 換成
> `reset()` 有倒退風險；(e) `audit-log-filter-form.tsx` 有一處硬編 `"all"` 而非引用共用常數。
>
> 修復結果：release.yml 改動已捨棄（未 commit）；`0.16.1` patch 版本已透過正規 `changeset` 流程、
> 在 CI 全綠的情況下正式發布；4 段註解已補回；`dlp-rules` 重試機制改用 `router.refresh() + reset()`；
> filter form 已改引用常數；`mcp-gateway` 已升到 `0.16.1` 並移除本機 override，`appspine-packages`
> 與 `mcp-gateway` 兩邊的 typecheck / lint / build 全部驗證過是乾淨的。**唯一沒有完成的是 Gate G2
> 本身**——所有驗證都停留在靜態層級（build 產出的路由表證實 7 條 `(.)xxx` intercepting route 都
> 正確編譯出來，但沒有人用真實瀏覽器打開過 modal）。`mcp-gateway` CI 的 `E2E` job 目前是紅的，但
> 已確認在整個 050 執行開始前的 baseline commit（`fc96f98`）就已經是同樣的「Prepare database」
> 步驟失敗，屬於既有、無關的環境問題，不在本次修復範圍。S3-8/S5-1~S5-4 描述的瀏覽器手動驗證，
> 以及 e2e 規格裡欠缺的 4 個案例（reload 變完整頁、非 admin 打 intercepting route、DLP fallback
> 渲染、巢狀 dialog focus trap）仍待執行。

## 執行前必讀：計畫敘述與實際 working tree 的落差

拆解前逐檔讀過 050 引用的每一個來源檔，有三處與計畫敘述不完全一致。**執行時以現場為準**：

| 050 寫的 | 實際查到的 | 影響 |
|---|---|---|
| §3.1「7 個 admin 頁面都是直接抓資料的 async server component」→ 攔截頁可直接 import | **成立，但形狀分兩類**：`users` / `roles` / `api-keys` / `audit-logs` 收 `searchParams: Promise<...>`；`gateway-profiles` / `vault` / `dlp-rules` **完全不收 props** | S4-1 / S4-2 必須拆成兩種寫法，對無 props 的頁面傳 `searchParams` 會 TS 報錯 |
| §6.2「依賴 `^0.15.1`（已安裝 0.15.0）……兩邊已有 minor 版本落差」 | 落差**不是自然漂移**：`mcp-gateway/pnpm-workspace.yaml` 有 `overrides: '@appspine/frontend-shell': 0.15.0`，硬釘住 0.15.0，`frontend/package.json` 的 `^0.15.1` 根本沒生效 | S1-2 的本機 link 與 S6-3 的版本更新，**主戰場是 `pnpm-workspace.yaml` 那一行**，只改 `frontend/package.json` 不會有任何效果 |
| §3.2「用元件內建 Suspense/錯誤邊界**取代**逐路由的 `loading.tsx`/`error.tsx`」 | 既有的 `(admin)/dlp-rules/error.tsx`、`loading.tsx` **仍然只服務完整頁路徑**，`@modal` 攔截路徑本來就吃不到它們。共用邊界是「補上 modal 路徑缺的那一份」，不是「取代」 | S4-3 要驗的是**近似程度**，不是取代完成度；且既有兩檔**不刪** |
| §3.4「新增集中管理的 `requireAdmin()` server helper（從 `(admin)/layout.tsx` 抽出）」 | **`src/server/require-admin.ts` 已存在**，供 6 個 `actions.ts`（users/roles/api-keys/gateway-profiles/vault/dlp-rules，約 28 處呼叫）在 Server Action 情境下守門，語意是 `throw new Error(...)`（不是 `redirect`），因為 Server Action 不走 layout 守門 | **原 S3-2 整段作廢**，不能新建同名檔覆蓋既有 helper。真正要解的是：`@modal` 攔截頁需要 `redirect("/unauthorized")` 語意（比照 `(admin)/layout.tsx`），既有 `requireAdmin()` 是 `throw` 語意——兩者不能共用同一支函式，見下方 S3-2（已重寫）與判斷取捨 #3 |

另外三個現場事實，後面的排序建立在這上面：

- `packages/frontend-shell/src/components/shell/app-sidebar.tsx:47` 的 `className="relative"` 會流進 `Sidebar` 桌面分支 `sidebar-container` 的 `cn()`（`ui/sidebar.tsx:214-220`，`className` 排在合併字串最後一位，`:219`），確認覆蓋掉 `:215` 寫死的 `fixed`。050 §2 的根因**逐行核對成立**。
- `(main)/dashboard/` 底下除了 `(admin)`、`_components`、`layout.tsx`、`page.tsx`，還有一個 **`[...not-found]` catch-all**。它是 `@modal` slot 的同層手足，是本次唯一可能與 parallel route fallback 互相干擾的既有結構，S3-3 的 `default.tsx` 必須連它一起驗。
- `appspine-packages` 的 `.changeset/` 目前**只有 `README.md` + `config.json`，沒有任何待發 changeset**；`packages/frontend-shell` 的 `package.json` 版本與 `CHANGELOG.md` 首個 `## ` 標題都是 `0.15.1`（已發布）。CI 另有 `scripts/check-changeset-discipline.mjs` 守門：版本號不可手改，一定走 `changeset` CLI。

---

## Phase 0 — 基準確認（不改動任何檔案）

目的：本計畫唯一的高風險項（Next.js intercepting route 層級判斷）**只能靠本機瀏覽器實測**證明，所以開工前必須先確認「本機跑得起來」不是假設；同時把 050 §3.1 那句「可以直接 import 不用重構」從斷言變成逐檔核實過的事實。

> **執行狀態（2026-08-17，Codex 第一次執行紀錄）**：S0-1／S0-3／S0-4 已完成，S0-2／S0-5 卡在
> Codex 沙盒環境限制（非計畫本身的問題）——沙盒沒有 Docker Engine 存取權、連不到 localhost
> 瀏覽器、也沒有 `pnpm`；且這次 Codex 的 workspace 只放行 `appspine-packages`，寫不到
> `mcp-gateway`。**沒有任何檔案被改動、沒有 push**，兩個 repo 仍是乾淨狀態
> （`appspine-packages` HEAD `06c0765`、`mcp-gateway` HEAD `fc96f98`）。Gate G1 因此**尚未過關**，
> 後續執行（無論是誰／哪個 agent 做）必須先解掉這兩個環境限制才能繼續，見下方各任務狀態標記。

### ✅ S0-1 兩個 repo 的 baseline 快照與記憶體檢查（已完成）
- **repo**：`appspine-packages`、`mcp-gateway`
- **依賴**：無
- **做什麼**：記錄兩 repo 的 branch / HEAD SHA / working tree 狀態。目前已確認：`mcp-gateway` clean（HEAD `fc96f98`）；`appspine-packages`（HEAD `b24a95c`）有 `M knowledge/index.md` 與兩個 untracked 的 050/Z32 文件——**都是文件，不影響程式碼異動的可回溯性**，但開工前先把它們 commit 掉，讓後續 Part A/B 的 diff 乾淨。同時檢查可用實體記憶體（既有教訓：兩個 Docker stack + dev server + IDE 會把可用記憶體壓到 0.5GB 以下，導致 tsc/node OOM 看起來像程式碼 bug）。
- **驗證**：兩 repo 各有 SHA 紀錄；`git status --short` 只剩預期內的異動；可用記憶體 ≥ 4GB，否則先關掉其他 Docker stack。**已由 Codex 執行確認**：`mcp-gateway` clean（HEAD `fc96f98`）；`appspine-packages` clean（HEAD `06c0765`，050 文件已 commit＋push，見下方 Phase 6 前言）；可用記憶體約 6.65GB，足夠。

### 🚫 S0-2 確認本機 dev 環境起得來（Codex 沙盒卡住，需要真正的本機環境重跑）
- **repo**：`mcp-gateway`
- **依賴**：S0-1
- **做什麼**：`docker compose up -d`（Keycloak + DB）→ `pnpm dev`（root script 用 `concurrently` 同時起 backend 與 frontend，frontend 固定 `next dev -p 3071`）。注意兩個本機特例：(a) 本機 dev Keycloak 跑在 **8280** 而非 workspace 標準 8180，遇到 issuer 不合要用環境變數覆蓋，**不要去改文件裡的 port**；(b) `mcp-gateway/.npmrc` 用 `${GITHUB_TOKEN}` 對 GitHub Packages 認證，若 `pnpm install` 回 401，是既知的 token 漂移問題，先確認 token 有效再往下。
- **驗證**：瀏覽器開 `http://localhost:3071/dashboard`，能用 admin 帳號登入並看到現有 7 項 administration 選單；隨手點開 `/dashboard/audit-logs` 有資料。
- **執行紀錄**：Codex 這次跑在沒有 Docker Engine 存取權、連不到 localhost 瀏覽器的沙盒裡，`docker compose up -d` 與瀏覽器驗證兩者都做不到，port 3071/8280/5438 全部無法連。**這是執行環境限制，不是計畫或程式碼問題**——任何後續執行者（Codex 或其他 agent）都需要在有 Docker daemon 存取權、且能開真實瀏覽器連 localhost 的環境下才能過這關。

### ✅ S0-3 逐檔核實 7 個 admin `page.tsx` 的預設匯出形狀（已完成，Codex 覆核一致）
- **repo**：`mcp-gateway`
- **依賴**：無（可與 S0-2 並行）
- **做什麼**：這是把 050 §3.1 的斷言轉成事實。逐檔確認 `src/app/(main)/dashboard/(admin)/*/page.tsx` 的 `export default async function` 簽章。已核實結果：

  | 路由 | props | 備註 |
  |---|---|---|
  | `users` | `{ searchParams: Promise<{page,search,sortField,sortOrder}> }` | `users/page.tsx:23-27` |
  | `roles` | 同上 | `roles/page.tsx:17-21` |
  | `api-keys` | 同上 | `api-keys/page.tsx:22-26` |
  | `audit-logs` | `{ searchParams: Promise<{page,holderIdentifier,profileId,appName,success,dlpHit}> }` | 欄位不同，型別要各自照抄 |
  | `gateway-profiles` | **無** | `gateway-profiles/page.tsx:8` `export default async function GatewayProfilesPage()` |
  | `vault` | **無** | `vault/page.tsx:8` |
  | `dlp-rules` | **無** | `dlp-rules/page.tsx:11` |

  結論：**斷言成立**——7 個都是自帶資料抓取的 async server component，攔截頁直接 import 預設匯出即可，7 個既有頁面一行都不用改。但「原封不動轉送 `searchParams`/`params`」（050 §3.4）只適用於前 4 個。
- **驗證**：表格 7 列都有實際行號依據；`grep -n "export default async function" src/app/\(main\)/dashboard/\(admin\)/*/page.tsx` 輸出 7 筆。

> **判斷取捨（需要使用者確認）**：對 3 個無 props 的頁面，攔截頁採「不宣告、不轉送 props」寫法（`<VaultPage />`），而非硬塞一個被忽略的 `searchParams`。理由：那 3 個元件的 props 型別是 `{}`，多傳會直接 TS 編譯失敗，不是風格選擇。若之後這些頁面要加篩選參數，再單獨補。

### ✅ S0-4 核實 `dlp-rules` 多出的兩個檔案實際做了什麼（已完成，Codex 覆核一致）
- **repo**：`mcp-gateway`
- **依賴**：無
- **做什麼**：讀 `(admin)/dlp-rules/error.tsx` 與 `loading.tsx`，記下要被「近似」的具體行為，作為 S4-3 的比對基準。已核實：
  - `error.tsx`（21 行，`'use client'`）：用 app 自己的 `Alert`/`Button`，文案來自 `dlpRules` namespace 的 `loadErrorTitle` / `loadErrorDescription` / `retry`，重試動作是 `globalThis.location.reload()`。
  - `loading.tsx`（17 行）：app 自己的 `Skeleton`，特定版型（標題 40 寬 + 副標 80 寬 + 右上 40 寬按鈕 + 12 高工具列 + 64 高表格）。
  - 兩者都**只掛在 `(admin)/dlp-rules/` 這條完整頁路徑上**。新增的 `@modal/(.)dlp-rules/` 是另一條路由分支，不會繼承。
- **驗證**：兩份檔案內容已逐行記錄；確認其餘 6 個 admin 資料夾沒有 `error.tsx`/`loading.tsx`（`ls (admin)/*/` 已確認）。

### 🟡 S0-5 核實 `@appspine/frontend-shell` 的版本鏈路（結論已由 Opus 事先查證，Codex 這次跑不了 `pnpm` 只能覆核靜態部分）
- **repo**：`mcp-gateway`、`appspine-packages`、`appspine-app-template`
- **依賴**：無
- **做什麼**：把 S6-3 要改的位置全部先定位出來。已核實：
  - `mcp-gateway/frontend/package.json:20` → `"@appspine/frontend-shell": "^0.15.1"`
  - `mcp-gateway/pnpm-workspace.yaml` `overrides` 區塊 → `'@appspine/frontend-shell': 0.15.0` ← **真正生效的那一行**
  - 實際安裝：`node_modules/@appspine/frontend-shell/package.json` 版本 `0.15.0`（與 override 一致，佐證上一點）
  - `appspine-app-template/frontend/package.json:22` → `^0.15.0`（本次不動，050 §6.2 已排除）
  - `appspine-packages/packages/frontend-shell/package.json` 版本 `0.15.1`，`exports` 有 `.` / `./notification` / `./server` 三個進入點，`files` 只含 `dist`，`build` = `tsc -p tsconfig.build.json`
- **驗證**：四處版本字串都有檔案:行號紀錄——**這部分已確認**。`pnpm -C frontend why @appspine/frontend-shell` 顯示解析結果來自 override——**這部分 Codex 這次做不到**，沙盒裡沒有 `pnpm` 可執行，只能從既有檔案內容推論版本鏈路，未能用指令即時驗證。後續執行者需要在有 `pnpm` 的環境下補跑這一條指令確認。

> **閘門 G1**：S0-1 ~ S0-5 全綠才進 Phase 1。此時尚未動任何程式碼，零成本回頭。**目前狀態：未過關**（卡在 S0-2 的 Docker/瀏覽器存取，與 S0-5 的 `pnpm` 指令驗證）。
>
> **另一個必要條件（Codex 這次才發現，原文件沒提到）**：執行環境（不論是 Codex CLI 或其他 agent）必須同時擁有 `d:\Source\Private\appspine\appspine-packages` **與** `d:\Source\Private\appspine\mcp-gateway` **兩個 repo 的寫入權限**——Phase 2 動 `appspine-packages`，Phase 3-5 幾乎全部動 `mcp-gateway`。Codex 這次的 workspace 只放行了前者，寫不到後者，這件事必須在下一次執行前解決（例如把 CLI 的工作目錄設在 `d:\Source\Private\appspine` 這個共同上層目錄再啟動，讓兩個子目錄都在存取範圍內）。

---

## Phase 1 — Part A：帳號列置底修正

排最前面的理由：單檔一行、與 Part B 零耦合、可獨立驗證，而且它會順便把「本機套件 link」這條 Part B 也要用的通道先打通並驗證過。

### S1-1 移除 `app-sidebar.tsx` 多餘的 `relative`
- **repo**：`appspine-packages`
- **依賴**：G1
- **做什麼**：`packages/frontend-shell/src/components/shell/app-sidebar.tsx:47`，`<Sidebar {...props} className="relative">` → `<Sidebar {...props}>`。**只改這一行**，不要順手動 `ui/sidebar.tsx`。`SidebarResizer`（`:72`，用 `absolute` 定位）不需要祖先的 `relative`——`fixed` 本身就是有效的 containing block，拿掉後行為不變（此點在 S1-3 一併目視確認）。
- **驗證**：`pnpm -C packages/frontend-shell typecheck` 通過；`git diff --stat` 顯示 1 檔 1 行。

### S1-2 用 pnpm override 把 mcp-gateway 接到本機建置版
- **repo**：`appspine-packages`、`mcp-gateway`
- **依賴**：S1-1
- **做什麼**：不等發版就能實測的通道。因為 `exports` 全部指向 `./dist`，**必須先建置**：
  1. `pnpm -C packages/frontend-shell build`（開發期間可改跑 `pnpm -C packages/frontend-shell dev` 開 tsc watch）
  2. 改 `mcp-gateway/pnpm-workspace.yaml` 既有的那一行：`'@appspine/frontend-shell': 0.15.0` → `'@appspine/frontend-shell': link:../../appspine-packages/packages/frontend-shell`
  3. `pnpm -C mcp-gateway install`

  **不要改 `frontend/package.json`**：override 的優先權在它之上，改了也不會生效，反而讓 S6-3 收尾時分不清哪一處是暫時的。這一行改動是本計畫全程唯一的暫時性狀態，S6-3 必須還原。
- **驗證**：`ls -l mcp-gateway/node_modules/@appspine/frontend-shell` 顯示為 symlink 指向 `appspine-packages/packages/frontend-shell`；重啟 `pnpm dev` 後 `/dashboard` 正常渲染（證明 dist 完整、不是半成品）。

### S1-3 瀏覽器實測置底行為
- **repo**：`mcp-gateway`
- **依賴**：S1-2
- **做什麼**：挑一個資料夠多、右側主內容一定會超出視窗高度的頁面（`/dashboard/audit-logs` 最合適，有分頁表格）。修正前後各截一次圖：捲到頁面最底時，左側帳號列（`SidebarFooter` 內的 `UserNav`）是否仍貼齊視窗底部。順便在 DevTools 確認 `[data-slot="sidebar-container"]` 的 computed `position` 從 `relative` 變成 `fixed`。
- **驗證**：computed style 為 `fixed`；捲動到底時帳號列不隨頁面捲走；`SidebarResizer` 的拖曳把手仍在側邊欄右緣正確位置、拖曳寬度正常。

---

## Phase 2 — Part B 共用套件端：`AdminSettingsModal`

先做套件端的理由：它是純新增（不動任何既有元件），mcp-gateway 端的每一個檔案都要 import 它，先讓它可 import，Phase 3 才不會被「型別還不存在」卡住。

### S2-1 新增 `admin-settings-modal.tsx`
- **repo**：`appspine-packages`
- **依賴**：S1-1（同一份本機建置，共用 S1-2 的 link 通道）
- **做什麼**：新檔 `packages/frontend-shell/src/components/shell/admin-settings-modal.tsx`（`'use client'`），照 050 §3.2：
  - Props：`title: string`、`navItems: readonly {id: string; title: string; url: string; icon?: LucideIcon}[]`、`activeId: string`、`onClose: () => void`、`LinkComponent: ShellLinkComponent`、`children: ReactNode`，加上**兩個可選 props**（使用者已確認現在就做，不當作日後擴充）：`loadingFallback?: ReactNode`（不傳則用內建通用骨架）、`errorFallback?: (retry: () => void) => ReactNode`（不傳則用內建通用錯誤畫面，`retry` 呼叫端可接 `router.refresh()`）。`ShellLinkComponent` / `ShellLinkProps` 從同目錄 `./navigation.js` import（型別定義在 `navigation.ts:42-51`）。
  - 外殼：`<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>` + `<DialogContent className="...">`。
  - 左側迷你導覽：照 `SidebarMenuButton` 的視覺語彙列出 `navItems`，用 `LinkComponent` 產生連結（**不能用 `next/link`**，套件不依賴 Next.js），`item.id === activeId` 標示 active 並加 `aria-current="page"`。
  - 右側 `flex-1 overflow-y-auto` 內容區，`children` 外包 `<Suspense fallback={loadingFallback ?? <內建骨架>}>` 與一個 class component 錯誤邊界（React 沒有 hook 版錯誤邊界，必須是 class；`render()` 有 `this.state.error` 時優先呼叫 `errorFallback?.(retry)`，否則用內建通用錯誤畫面，`retry` 是邊界自己的 `resetError`）。
  - 無障礙：`DialogContent` 需要可及的標題與說明，用 `<DialogTitle>` 放 `title`（若視覺上不顯示則加 `sr-only`）；**Radix 同時也會在缺少 `DialogDescription` 時於 console 警告**（不只缺標題會警告），補一個 `sr-only` 的 `<DialogDescription>` 一併蓋掉。
- **驗證**：`pnpm -C packages/frontend-shell typecheck` + `pnpm lint`（root `biome check .`）通過。

> **判斷取捨（需要使用者確認）**：`DialogContent` 的寬版覆蓋字串定為
> `className="flex h-[85vh] w-full gap-0 overflow-hidden p-0 sm:max-w-4xl"`。
> 這是逐個 class 對著 `ui/dialog.tsx:55` 的預設字串算過 twMerge 衝突群組的結果，不是隨手抄的（Opus
> 審查已用 tailwind-merge 3.6.0 實際設定檔重新推導過一次，結論成立）：`flex` 蓋掉 `grid`（display
> 群）、`p-0` 蓋掉 `p-4`、`gap-0` 蓋掉 `gap-4`、`sm:max-w-4xl` 蓋掉 `sm:max-w-sm`（同 `sm:` 修飾詞
> 才會衝突）、`overflow-hidden` 蓋掉 `overflow-y-auto`（tailwind-merge 的 `overflow` 群設定為
> `['overflow-x','overflow-y']`，後者在此衝突群組內、會被移除）。基底的 `max-w-[calc(100%-2rem)]`
> （無 `sm:` 前綴）在窄視窗下仍生效，是真正有作用的保險。**修正**：原本說基底的 `max-h-[85vh]` 也是
> 「小視窗保險」是錯的——與新加的 `h-[85vh]` 數值相同，`max-h` 在此不構成任何額外限制，是無效
> class，純粹沒壞處，不是刻意設計。這裡是刻意利用「後蓋前」，與 Part A 那個誤觸碰撞性質相反。
> 若實測覺得 `sm:max-w-4xl` 太窄，改 `sm:max-w-5xl` 即可，不影響其他 class。

### S2-2 barrel 匯出
- **repo**：`appspine-packages`
- **依賴**：S2-1
- **做什麼**：`packages/frontend-shell/src/index.ts` 新增一行 `export * from './components/shell/admin-settings-modal.js';`。檔案是嚴格字母序，`admin-settings-modal` 排在 `./components/shell/app-sidebar.js`（目前第 23 行）**之前**。注意副檔名要寫 `.js`（ESM + `"type": "module"`，全檔一致）。
- **驗證**：`pnpm -C packages/frontend-shell build` 成功；在 mcp-gateway 端試 `import { AdminSettingsModal } from "@appspine/frontend-shell"` 能解析到型別（IDE 不報紅）。

### S2-3 套件端全量檢查並回灌本機 link
- **repo**：`appspine-packages`、`mcp-gateway`
- **依賴**：S2-2
- **做什麼**：`pnpm typecheck`（root，`pnpm -r run typecheck`）、`pnpm lint`、`pnpm test`（root `pnpm -r run test`，frontend-shell 有 vitest）。重新 build 讓 S1-2 的 symlink 拿到新 dist。
- **驗證**：三項全綠；mcp-gateway `pnpm -C frontend typecheck` 也綠（證明新匯出沒有汙染既有型別）。

---

## Phase 3 — Part B mcp-gateway 端：Users 一條的完整參考實作

**這是全計畫唯一沒有內部先例的環節。** 已核實：`mcp-gateway`、`appspine-app-template` 與其餘 7 個 app repo 完全沒有 `(.)`／`(..)`／`@modal` 的既有用法。Next.js 對 `(admin)` route group 是否對層級判斷完全透明，目前只是依官方文件推論。因此本 phase 結尾是硬閘門：**Users 這一條沒有在瀏覽器實測跑通，不准進 Phase 4**——否則錯誤的資料夾層級會被機械式複製 7 次。

### S3-1 側邊欄改為單一入口 + 抽出 `ADMIN_MODAL_ITEMS`
- **repo**：`mcp-gateway`
- **依賴**：G1、S2-2
- **做什麼**：`src/navigation/sidebar/sidebar-items.ts`：
  - 把 `:74-88` 的 `if (isAdmin)` 區塊改成推入單一項目的 group：`{ id: 2, items: [{ id: "administration", title: "administration", url: "/dashboard/users", icon: <見下方判斷取捨> }] }`，**不設 `label`**（050 §3.2：避免 group label 與項目文字重複）。
  - 把原本 7 個項目的定義原封不動抽成同檔匯出常數 `export const ADMIN_MODAL_ITEMS = [...] as const satisfies readonly NavSubItem[];`（欄位與 icon 完全沿用 `:79-85` 現有的 `Users` / `ShieldCheck` / `KeyRound` / `Workflow` / `Vault` / `ScrollText` / `ShieldAlert`），供 S3-6 的 modal 導覽重用——兩邊同一份來源，不會失同步。
  - `isAdmin` 的守門邏輯維持不變（非 admin 連入口都不出現）。
- **驗證**：`pnpm -C frontend typecheck` 通過（`title` 欄位受 `NavKey = keyof Messages["nav"]` 約束，`"administration"` 是既有 key，不需要動翻譯檔）；側邊欄目視只剩「Overview / Dashboard」+「Administration」兩塊。

> **判斷取捨（需要使用者確認）**：入口項目的**翻譯 key 沿用既有的 `nav.administration`**（`messages/en.json` 與 `zh-TW.json` 都已存在，不新增 key，也不需要翻譯工作）；**icon 選 `lucide-react` 的 `Settings2`**（需在檔頭 import 新增）。理由：原本的 group label 沒有 icon，7 個子項的 icon 各自代表自己的領域，拿任何一個當總入口都會誤導；`Settings2` 對應「設定視窗」這個新的互動語意，也貼近 050 §1 引用的 Claude.ai 帳號設定視窗慣例。若偏好維持既有語彙，改用 `ShieldCheck` 亦可，只是它目前是 Roles 的 icon，modal 內會重複。

### S3-2 新增 `requireAdminPage()` 頁面守門（已重寫——原版誤判 `requireAdmin()` 是新檔）
- **repo**：`mcp-gateway`
- **依賴**：G1
- **做什麼**：**`src/server/require-admin.ts` 已存在**，匯出 `requireAdmin()` 供 6 個
  `actions.ts`（users/roles/api-keys/gateway-profiles/vault/dlp-rules，約 28 處呼叫）在
  Server Action 情境下守門，語意是 `throw new Error("Forbidden: ADMIN role required")`——因為
  Server Action 不會經過 `(admin)/layout.tsx` 的守門，只能用 throw 讓呼叫端的錯誤處理接住。
  **不能重用這支函式做頁面守門**：7 個 `@modal` 攔截頁需要的是 `(admin)/layout.tsx` 那種
  `redirect("/unauthorized")` 語意（非 ADMIN 使用者應該被導向，而不是看到一個 thrown error 畫面）。
  在同一個檔案新增第二個具名匯出 `requireAdminPage(): Promise<CurrentUser>`，內部邏輯抄
  `(admin)/layout.tsx:13-14` 的 `getCurrentUser()` + `roleNames.includes("ADMIN")` 判斷 +
  `redirect("/unauthorized")`，**不動既有 `requireAdmin()` 一個字**、不動它的 28 個呼叫端。接著把
  `(admin)/layout.tsx` 改成呼叫 `requireAdminPage()`（消除它與 7 個攔截頁之間本來會出現的邏輯
  複製）。
- **驗證**：`pnpm -C frontend typecheck` 通過；`grep -rn "requireAdmin(" src/app/**/actions.ts` 的
  28 處呼叫點不變、行為不變；用非 ADMIN 帳號打 `/dashboard/users` 仍被導向 `/unauthorized`
  （行為零變化）。

> **判斷取捨（需要使用者確認，已改寫）**：新增 `requireAdminPage()` 而不是讓既有 `requireAdmin()`
> 改成 `redirect` 語意。理由：`requireAdmin()` 的 28 個呼叫端全部在 Server Action 裡，把它改成
> `redirect` 會讓 Server Action 對非 ADMIN 使用者的失敗模式從「拋錯、呼叫端可以 catch 顯示訊息」
> 變成「觸發一次跟表單提交無關的整頁導向」，是破壞性變更，且 `appspine-app-template` 有逐位元組
> 相同的一份、範圍會外溢。另一個選項是**不新增函式，讓 7 個攔截頁直接沿用既有 `requireAdmin()`
> 的 throw 語意**，非 ADMIN 使用者在 modal 裡會看到 `AdminSettingsModal` 內建的通用錯誤邊界，而不是
> 被導向 `/unauthorized`——這樣完全不用碰 `require-admin.ts`，但會讓「同一個角色檢查在完整頁與
> modal 頁呈現不同 UX」。這裡選擇加新函式維持 UX 一致，但兩個選項都可行，需要使用者確認要哪一個。

### S3-3 建立 `@modal` parallel route slot
- **repo**：`mcp-gateway`
- **依賴**：S3-1
- **做什麼**：新檔 `src/app/(main)/dashboard/@modal/default.tsx`：
  ```tsx
  export default function Default() {
    return null;
  }
  ```
  這是 parallel route slot 的必備檔案：任何未被 `@modal` 底下路由命中的導覽，slot 都會退回 `default.tsx`。**特別注意**：`dashboard/` 底下有一個既有的 `[...not-found]` catch-all 手足，S3-8 要專門驗它沒被這個 slot 影響。
- **驗證**：檔案存在；`pnpm dev` 重啟後 `/dashboard` 與一個不存在的路徑（如 `/dashboard/zzz`，應命中 `[...not-found]`）行為都與加 slot 之前完全相同。

### S3-4 `dashboard/layout.tsx` 接收並轉送 `modal` slot
- **repo**：`mcp-gateway`
- **依賴**：S3-3
- **做什麼**：`src/app/(main)/dashboard/layout.tsx:12` 的簽章 `{ children }` 改成 `{ children, modal }: Readonly<{ children: ReactNode; modal: ReactNode }>`，並在 `:27-34` 的 `<DashboardShellBridge>` 上新增 `modal={modal}`。**不要動 `:16-24` 的登入守門與 preference 讀取邏輯**。
- **驗證**：`pnpm -C frontend typecheck` 通過；`/dashboard` 仍正常渲染。

### S3-5 `dashboard-shell-bridge.tsx` 接收並渲染 `modal`
- **repo**：`mcp-gateway`
- **依賴**：S3-4
- **做什麼**：`_components/dashboard-shell-bridge.tsx`：`DashboardShellBridgeProps`（`:33-39`）新增 `readonly modal?: ReactNode;`；函式參數解構加 `modal`；`:152` 的 `{children}` 改成 `{children}{modal}`（在 `<DashboardShell>` 內、children 之後）。因為 modal 是 Radix Portal 掛到 body，DOM 位置不影響視覺層級，但放在 shell 內才拿得到 `useTranslations` / `usePathname` 的 context。
- **驗證**：typecheck 通過；`/dashboard` 視覺零變化（此時 `modal` 恆為 `default.tsx` 的 `null`）。

### S3-6 新增 `admin-modal.tsx` app 端 wrapper
- **repo**：`mcp-gateway`
- **依賴**：S3-1、S3-5、S2-2
- **做什麼**：新檔 `src/app/(main)/dashboard/_components/admin-modal.tsx`（`'use client'`），包一層 `AdminSettingsModal`，補齊套件不知道的 app 專屬資訊：
  - `onClose`：見下方 S3-6a，**不是**單純的 `router.back()`。
  - `LinkComponent`：與 `dashboard-shell-bridge.tsx:41-47` 的 `AppLink` 同形（`next/link` + `prefetch={false}`）。**判斷：把 `AppLink` 從 bridge 抽到共用檔再兩邊 import**，不要複製第二份。
  - `navItems`：`ADMIN_MODAL_ITEMS` 逐項跑 `tNav(item.title)` 翻譯（`useTranslations("nav")`，與 bridge `:58` 同一套）。
  - `activeId`：`usePathname()` 取最後一段，對照 `ADMIN_MODAL_ITEMS` 的 `id`。
  - `title`：`tNav("administration")`。
  - props：`{ activeId: string; children: ReactNode }`。
- **驗證**：typecheck 通過；lint 通過（`pnpm -C frontend check`）。

### S3-6a 修正 modal 關閉語意（Opus 審查新發現的 bug，050 原文與初版拆解都沒發現）
- **repo**：`mcp-gateway`
- **依賴**：S3-6
- **做什麼**：`onClose={() => router.back()}` 在 modal 內**只切換過一次分頁**時沒問題，但
  Users → Roles → Vault 這樣連續切三次分頁，因為 modal 內的每個 `LinkComponent` 導覽都是一次
  intercepted 導覽、各自推一筆 history（`/dashboard/roles`、`/dashboard/vault`…），使用者按「關閉」
  時 `router.back()` 只會退回上一個分頁（`/dashboard/roles`），要按三次關閉才能真的回到背景頁。
  修法：`AdminModal` mount 時用 `useRef` 記住**進入 modal 前**的 pathname（例如在
  `dashboard-shell-bridge.tsx` 或最外層攔截頁掛載時用 `sessionStorage`/context 存一次「上一個非
  admin pathname」），`onClose` 改成 `router.push(entryPathname)`；modal 內部分頁切換一律用
  `router.replace()` 而不是預設的 push 導覽，避免疊 history。**兩者擇一即可**：只需保證「按一次
  關閉」與「按瀏覽器上一頁」都能一步回到背景頁。
- **驗證**：在 modal 內連續切換 Users → Roles → Vault，按關閉按鈕與按 Esc 都只需一次就回到背景頁
  （不是先跳回 Roles）；瀏覽器上一頁行為合理（不會需要按 3 次上一頁）。

### S3-7 新增 `@modal/(.)users/page.tsx`
- **repo**：`mcp-gateway`
- **依賴**：S3-2、S3-6
- **做什麼**：新檔 `src/app/(main)/dashboard/@modal/(.)users/page.tsx`：
  ```tsx
  import { requireAdminPage } from "@/server/require-admin";
  import { AdminModal } from "../../_components/admin-modal";
  import UsersPage from "../../(admin)/users/page";

  export default async function InterceptedUsersPage(props: {
    searchParams: Promise<{ page?: string; search?: string; sortField?: string; sortOrder?: string }>;
  }) {
    await requireAdminPage();
    return (
      <AdminModal activeId="users">
        <UsersPage searchParams={props.searchParams} />
      </AdminModal>
    );
  }
  ```
  `searchParams` 的型別逐字照抄 `(admin)/users/page.tsx:25-27`。既有的 `(admin)/users/page.tsx` **一個字都不改**。
  **註記**：直接 `import UsersPage from "../../(admin)/users/page"` 把一個路由的 default export
  當一般元件匯入，是可行但非官方文件明說支援的 Next.js 用法（App Router 沒有正式禁止，也沒有正式
  保證），未來若這個 app 導入 PPR 或 `"use cache"` 之類的路由層特性，這個耦合點要重新檢視。
- **驗證**：typecheck 通過；`pnpm dev` 能編譯不報路由衝突。

### S3-8 瀏覽器實測 Users 這一條（**本計畫最關鍵的驗證**）
- **repo**：`mcp-gateway`
- **依賴**：S3-7
- **做什麼**：用 admin 帳號，在 `http://localhost:3071` 逐項實測：
  1. 停在 `/dashboard`，點側邊欄「Administration」→ **應**疊出 modal、背景仍是 dashboard、網址變成 `/dashboard/users`。
  2. modal 內容與 `/dashboard/users` 完整頁一致（表格、搜尋、分頁都在）。
  3. 按 Esc 或點遮罩或右上 X → modal 關閉、退回 `/dashboard`。
  4. modal 開著時按瀏覽器**重新整理** → 變成完整頁面（非攔截版，無 modal 外殼）。
  5. 新分頁直接貼 `/dashboard/users` → 完整頁面，行為與改動前相同。
  6. `/dashboard/zzz` 仍命中 `[...not-found]`（確認 slot 沒吃掉 catch-all）。
  7. 瀏覽器上一頁/下一頁在 modal 開關間行為合理，且連續切 2-3 個分頁後按一次關閉能直接回到背景頁（S3-6a 的驗證）。
  8. 在 modal 內開一次巢狀 dialog（`CreateUserDialog`，Users 頁面右上角）：能正常開關、關閉巢狀 dialog 不會連同外層 modal 一起關掉。**提前在這裡測，不要拖到 Phase 5**——這是 Radix focus trap 疊層最容易出問題的地方，越晚發現、已複製的路由越多。
- **驗證**：8 項全部符合預期。**只要第 1 項疊不出來（例如點下去直接變成完整頁、或 modal 空白）**，就是層級判斷問題，走下一段的回退程序。

> **判斷取捨（需要使用者確認）**：`(.)` vs `(..)` 的判定與回退程序。`(admin)` 是 route group，對網址深度透明，`@modal` 與 `(admin)` 同層掛在 `dashboard/` 下，**因此推論 `(.)users`（同層攔截）是對的**——但這是推論，Next.js 對 route group 的內部層級計算未經本機驗證。若 S3-8 第 1 項失敗，依序試：(a) 先 `rm -rf .next` 清 build cache 重試一次（parallel/intercepting route 對 stale cache 敏感）；(b) 改把 `@modal` slot 移到 `(main)/` 這一層、用 `@modal/(.)dashboard/users` 攔截（有些 Next.js 版本對「slot 與被攔截路由的共同祖先」算法與官方文件描述有出入，這個變體先於改深度嘗試）；(c) 都不行才把資料夾改名為 `@modal/(..)users/`；(d) 再不行才試 `(..)(..)`。**只有 Users 一條做這個試錯**，定案的層級寫進本文件後才進 Phase 4。

> **閘門 G2 — 停下來確認**：S3-8 的 7 項全綠才進 Phase 4。這是全計畫唯一的高風險判斷點，錯誤的層級一旦被複製到 7 條路由，除錯成本乘以 7。
> **回滾**：Phase 3 全部是**新增檔案** + 3 處小改（`sidebar-items.ts`、`layout.tsx`、`dashboard-shell-bridge.tsx`、`(admin)/layout.tsx`）。刪掉 `@modal/` 整個資料夾 + revert 那 4 個檔，即完全復原到 Phase 2 結束狀態，`(admin)/` 底下 7 個頁面全程未被觸碰。

---

## Phase 4 — 複製 pattern 到其餘 6 條路由

閘門 G2 過了之後，這裡是機械式複製，唯一需要思考的是 `dlp-rules` 的落差。

### S4-1 複製 3 條「有 `searchParams`」的路由
- **repo**：`mcp-gateway`
- **依賴**：G2
- **做什麼**：照 S3-7 的模板建 `@modal/(.)roles/page.tsx`、`(.)api-keys/page.tsx`、`(.)audit-logs/page.tsx`（層級用 S3-8 定案的那個）。每條各自：`await requireAdmin()`、`<AdminModal activeId="roles|api-keys|audit-logs">`、import 對應的 `(admin)/xxx/page`、`searchParams` 型別**逐字照抄該頁自己的宣告**——特別是 `audit-logs`，它的欄位是 `{page, holderIdentifier, profileId, appName, success, dlpHit}`，與另外兩條完全不同，照抄 users 的會編譯失敗。
- **驗證**：`pnpm -C frontend typecheck` 通過；3 條各自從側邊欄 modal 內導覽點進去都能正確顯示。

### S4-2 複製 3 條「無 props」的路由
- **repo**：`mcp-gateway`
- **依賴**：G2
- **做什麼**：建 `@modal/(.)gateway-profiles/page.tsx`、`(.)vault/page.tsx`、`(.)dlp-rules/page.tsx`。因為對應頁面不收 props（S0-3 已核實），攔截頁本身也**不宣告 props**，內容為 `await requireAdmin()` + `<AdminModal activeId="..."><XxxPage /></AdminModal>`。
- **驗證**：typecheck 通過；3 條在 modal 內都能正常顯示。

### S4-3 讓 `@modal/(.)dlp-rules` 對齊既有 `error.tsx`/`loading.tsx` 的專屬體驗（已依使用者裁決更新）
- **repo**：`mcp-gateway`
- **依賴**：S4-2、S0-4、S2-1（`loadingFallback`/`errorFallback` props）
- **做什麼**：**使用者已確認**：不接受通用近似，`@modal/(.)dlp-rules/page.tsx` 要把 `AdminSettingsModal`
  的 `loadingFallback`/`errorFallback` props 接上既有 `dlpRules` 專屬文案：
  - `loadingFallback`：把 `(admin)/dlp-rules/loading.tsx`（17 行，`Skeleton` 版型：標題 40 寬 + 副標
    80 寬 + 右上 40 寬按鈕 + 12 高工具列 + 64 高表格）原封不動搬進一個小型 client component，
    modal 與完整頁共用同一份 JSX（可以把 `loading.tsx` 本身改成 `export`，攔截頁與 `loading.tsx`
    都 import 它，避免兩份重複）。
  - `errorFallback`：把 `(admin)/dlp-rules/error.tsx`（21 行）用到的 `dlpRules` namespace
    文案（`loadErrorTitle`/`loadErrorDescription`/`retry`）與 `Alert`/`Button` 版型抄一份到攔截頁的
    `errorFallback` 實作，**重試動作改成呼叫 `errorFallback` 收到的 `retry` 參數（modal 邊界的
    `resetError`）**，不能沿用 `error.tsx` 原本的 `globalThis.location.reload()`——在 modal 情境下
    reload 會把使用者丟到完整頁，語意錯誤。
  - **既有兩檔仍不刪**：繼續服務 `/dashboard/dlp-rules` 完整頁路徑。
- **驗證**：暫時把 `dlp-rules/page.tsx` 的 `apiFetch("/dlp-rules")` 改打不存在端點（或停 backend），
  確認 modal 內顯示的錯誤文案與完整頁 `error.tsx` 逐字一致、按重試能重新載入且**不會**跳出 modal；
  loading 骨架與完整頁 `loading.tsx` 視覺一致；測完還原 `apiFetch` 呼叫。

---

## Phase 5 — 全量驗證

050 §4 的每一項對應到這裡的一個任務。全部在本機 dev + 本機 link 版套件上跑，不需要等發版。

### S5-1 modal 內 7 條導覽與內容一致性
- **repo**：`mcp-gateway`
- **依賴**：S4-1、S4-2、S4-3
- **做什麼**：從側邊欄開 modal，依序切 Users → Roles → API Keys → Gateway Profiles → Vault → Audit Logs → DLP Rules。每一條比對：內容與該路由完整頁一致、左側迷你導覽的 active 標示正確、網址同步變成該路由。順便測 modal 內的互動（搜尋、分頁、排序、開子 dialog 如 `CreateUserDialog`）——**巢狀 Dialog 是這裡最可能出問題的地方**（Radix 的 focus trap 疊層）。
- **驗證**：7 條全部內容一致、active 正確、網址正確；至少在 Users 與 DLP Rules 各開一次子 dialog，確認能正常開關且關掉子 dialog 不會連 modal 一起關掉。

### S5-2 reload 與直接打網址的行為
- **repo**：`mcp-gateway`
- **依賴**：S5-1
- **做什麼**：7 條各測兩次：(a) modal 開著時按重新整理 → 應變成完整頁面；(b) 新分頁直接貼網址 → 應是完整頁面。特別確認 `/dashboard/dlp-rules` 完整頁仍走它自己的 `loading.tsx`/`error.tsx`。
- **驗證**：14 次全部符合；完整頁面的版型、麵包屑、側邊欄與改動前一致。

### S5-3 非 ADMIN 帳號的守門
- **repo**：`mcp-gateway`
- **依賴**：S5-2
- **做什麼**：用一個沒有 ADMIN role 的帳號登入，三層都要擋：
  1. 側邊欄**不出現**「Administration」入口（`getSidebarItems(isAdmin)` 的既有邏輯，S3-1 已保留）。
  2. 直接打完整頁網址 `/dashboard/users` 等 7 條 → `(admin)/layout.tsx` 經 `requireAdmin()` 導向 `/unauthorized`。
  3. **攔截路由本身**：從一個 admin session 開著 modal 的狀態切換帳號、或用 client-side 導覽觸發 `@modal/(.)users`——這是 S3-2 存在的唯一理由，必須確認 `requireAdmin()` 真的被執行、真的導向 `/unauthorized`，而不是渲染出空 modal 或洩漏資料。
- **驗證**：三層各 7 條全部被擋；瀏覽器 Network 面板確認沒有任何 admin API 回應被送到非 admin 的 client。

### S5-4 麵包屑行為
- **repo**：`mcp-gateway`
- **依賴**：S5-1
- **做什麼**：`HeaderBreadcrumbs`（`_components/sidebar/header-breadcrumbs.tsx`）純粹依 `usePathname()` 查 `BREADCRUMB_LABELS`，而該表已經涵蓋全部 7 條 admin 路由。實測 modal 開啟時背景頁 header 的麵包屑內容。
- **驗證**：modal 開啟於 `/dashboard/users` 時，麵包屑顯示「Administration / Users」；關閉 modal 後回到「Dashboard」。

> **判斷取捨（需要使用者確認）**：050 §3.1 寫「intercepting route 不會改變網址，背景頁的麵包屑不需要額外處理」——**前半句反了**：攔截路由**確實會**改變網址（這正是「保留獨立網址、可分享可重整」的前提），所以 `pathname` 會變、麵包屑**會**跟著從「Dashboard」變成「Administration / Users」。判斷這是**正確行為**（網址是唯一真相，麵包屑跟著網址走，與重新整理後的完整頁一致），不做任何額外處理。若使用者期望的是「modal 開啟時背景頁麵包屑保持不動」，那需要額外傳遞背景 pathname，屬於新需求。

### S5-5 兩個 repo 的靜態檢查
- **repo**：`appspine-packages`、`mcp-gateway`
- **依賴**：S5-3、S5-4
- **做什麼**：`appspine-packages`：`pnpm typecheck`、`pnpm lint`、`pnpm test`。`mcp-gateway`：`pnpm -C frontend typecheck`、`pnpm -C frontend check`（biome）。
- **驗證**：五項全綠。

> **閘門 G2 的延伸**：S5-1 ~ S5-5 全綠是進 Phase 6 的**前提**。Phase 6 之前的所有東西都還在本機、可隨時 revert；Phase 6 第一個 push 之後就有外部可見產物。

---

## Phase 6 — 發版與依賴更新

> **閘門 G3 — 執行前必須再次口頭向使用者確認。**
> `appspine-packages` 的 `main` 一旦收到 push，`.github/workflows/release.yml` 的 `changesets/action@v1` 就會自動走版本 PR → 發布到 GitHub Packages 的流程，**這是外部可見、且已發布版本無法收回**的動作。取得本份任務拆解的核准**不等於**取得 push 授權；S6-2 執行前要單獨再問一次。

### S6-1 在 `appspine-packages` 加 changeset
- **repo**：`appspine-packages`
- **依賴**：S5-5、G3（口頭確認）
- **做什麼**：`pnpm changeset` 走 CLI 互動（**不要手寫檔案、更不要手改 `package.json` 的版本號**——`scripts/check-changeset-discipline.mjs` 這道 CI 守門專門抓「版本被手改、changeset 被孤立」，歷史上同一個套件被咬過兩次）。選 `@appspine/frontend-shell`，bump 類型建議 **minor**：Part A 是行為修正（patch 級），但 Part B 新增了 `AdminSettingsModal` 這個對外 API，屬於新功能。摘要要同時寫兩件事（帳號列置底修正 / 新增 admin 設定 modal 外殼）。產出的 `.changeset/*.md` 是新增檔——目前該目錄只有 `README.md` 與 `config.json`，沒有其他待發 changeset 會被一起帶上車。
- **驗證**：`.changeset/` 出現一個新的 `.md`，frontmatter 是 `"@appspine/frontend-shell": minor`；`package.json` 的版本號**沒有**被手動改動。

### S6-2 commit 並 push，等 CI 自動發布
- **repo**：`appspine-packages`
- **依賴**：S6-1、**G3 口頭確認已取得**
- **做什麼**：把 Part A（`app-sidebar.tsx`）、Part B（`admin-settings-modal.tsx`、`index.ts`）與 changeset 一起 commit，push 到 `main`。CI 會開 / 更新「Version Packages」PR；合併該 PR 後 `Release` workflow 才真正發布。**注意：push 後不要再手動跑 `pnpm publish`**，會與自動流程撞車。
- **驗證**：`gh run list --workflow=release.yml --limit 3` 最新一筆 success；「Version Packages」PR 合併後，GitHub Packages 上出現新版本（預期 `0.16.0`）；`packages/frontend-shell/CHANGELOG.md` 首個 `## ` 標題等於新版本號。

### S6-3 更新 `mcp-gateway` 的版本並移除暫時的本機 override
- **repo**：`mcp-gateway`
- **依賴**：S6-2（**必須等真的發布完成**）
- **做什麼**：兩處都要改，順序不能顛倒：
  1. `pnpm-workspace.yaml` 的 `overrides` → 把 S1-2 塞進去的 `link:../../appspine-packages/packages/frontend-shell` 換成新發布的確切版本（如 `0.16.0`）。**這一行是真正生效的那一行**（S0-5 已核實）。
  2. `frontend/package.json:20` 的 `"^0.15.1"` → `"^0.16.0"`，讓宣告與 override 一致，不再留下誤導性的版本落差。
  3. `pnpm install`。

  `appspine-app-template` 的 `pnpm-workspace.yaml` override（目前同樣釘在 `0.15.0`）本次**不動**，
  050 §6 已明確排除——這代表本次發版**才是**兩邊版本落差真正出現的時間點（發版前兩邊其實一致，
  見 S0-5 與 050 §6 修正說明），不是既有落差的延續。
- **驗證**：`ls -l frontend/node_modules/@appspine/frontend-shell` **不再是 symlink**；`grep -rn "link:" pnpm-workspace.yaml` 無輸出；`pnpm -C frontend typecheck` 通過。

### S6-4 以已發布版本重跑一次收尾確認
- **repo**：`mcp-gateway`
- **依賴**：S6-3
- **做什麼**：重啟 dev 環境，重跑 S1-3（置底）、S5-1（7 條 modal 導覽）、S5-3（非 admin 守門）三項的縮減版煙霧測試——證明實測結果來自真正發布的套件，不是本機 link 的樂觀假象。最後把本文件與 050 計畫的 `status` 依既有慣例更新。
- **驗證**：三項煙霧測試通過；`mcp-gateway` 的 commit 只含 `pnpm-workspace.yaml` / `frontend/package.json` / `pnpm-lock.yaml` 的版本更新，沒有殘留任何暫時性改動。

---

## 依賴關係摘要

```
Phase 0 (基準 + 逐檔核實 §3.1 斷言)
   │
   ├──> Phase 1 (Part A：一行修正 + 本機 link 通道) ── 可獨立驗收、可獨立回滾
   │        │
   │        └──> Phase 2 (共用套件：AdminSettingsModal + barrel)
   │                 │
   └─────────────────┴──> Phase 3 (Users 參考實作)  ★ 唯一無先例、唯一試錯點
                                │
                            【閘門 G2：瀏覽器實測 7 項全綠】
                                │
                                └──> Phase 4 (機械式複製其餘 6 條 + dlp-rules 落差覆核)
                                          │
                                          └──> Phase 5 (全量驗證：050 §4 逐項)
                                                    │
                                                【閘門 G3：口頭確認 push 授權】
                                                    │
                                                    └──> Phase 6 (changeset → CI 自動發布 → 版本更新 → 移除 override)
```

**可並行**：Phase 1 與 Phase 2 都在 `appspine-packages`，動的是不同檔案（`app-sidebar.tsx` vs 新檔 + `index.ts`），一個人做時照順序即可；Phase 3 的 S3-1 / S3-2 只依賴 G1，可在 Phase 2 進行中先做。
**絕對不可並行**：Phase 4 必須在 G2 之後。Phase 3 的資料夾層級是唯一的未知數，未定案前複製任何一條都是在複製可能錯誤的結構。

## 檢查點與回滾摘要

| 閘門 | 位置 | 過不了就 |
|---|---|---|
| G1 | Phase 0 結束（基準 + §3.1 斷言核實 + 版本鏈路定位） | 尚未動任何檔案，零成本。若 S0-3 發現某頁其實不能直接 import，該條改列為需先拆分的例外 |
| **G2** | **S3-8 Users 一條瀏覽器實測 7 項全綠** | 先清 `.next` 重試；仍失敗則 `(.)users` → `(..)users` 重試。回滾＝刪 `@modal/` 資料夾 + revert 4 個小改檔，`(admin)/` 7 頁全程未被觸碰 |
| **G3** | **S6-2 push 之前，需再次口頭確認** | 不 push 即可。Phase 0–5 全部在本機，`git reset` 就回到原點。**push 之後發布不可收回**，只能發新版本修正 |

## 使用者裁決結果（已經 Opus 覆核 + 使用者確認 2 項，2026-08-17）

第二個獨立 Opus agent 逐檔核對過本文件與 050 計畫、並重新推導過關鍵計算（twMerge 衝突群組、
版本鏈路），把原本 10 項拆成「真正需要裁決」與「其實是被程式碼強制、不需要裁決」兩類，並新增
覆核中發現的一個 bug。真正需要裁決的 6 項中，前 2 項使用者已確認，已同步套用進本文件本體：

1. **✅ 已確認：新增 `requireAdminPage()`，`redirect("/unauthorized")`**（S3-2）。不動既有
   `requireAdmin()` 與它的 28 處 Server Action 呼叫端；`@modal` 攔截頁與 `(admin)/layout.tsx`
   共用 `requireAdminPage()`，非 ADMIN 使用者在 modal 路徑與完整頁路徑看到一致的行為。
2. **✅ 已確認：`AdminSettingsModal` 現在就補上 `loadingFallback`/`errorFallback` props**
   （S2-1、S4-3）。`dlp-rules` 的 modal 攔截頁對齊既有 `error.tsx`/`loading.tsx` 的 zh-TW 專屬
   文案與版型，不接受通用近似降級。

以下 4 項尚未逐一詢問，暫依文件內建議的預設值執行，**如有不同意見請在動工前提出**：

3. **`(.)` vs `(..)` 的判定與回退程序**（S3-8）：`(admin)` route group 對網址深度是否真的透明給 Next.js 的 intercepting route 判斷，只是依官方文件推論，尚未本機驗證過。回退順序：清 `.next` cache → 把 `@modal` slot 移到 `(main)/` 層改用 `(.)dashboard/users` → `(..)users` → `(..)(..)`。**只在 Users 一條試錯**，定案後才進 Phase 4 複製，避免錯誤層級被複製 7 次的除錯成本。
4. **modal 開啟時背景頁麵包屑會跟著網址變成「Administration / Users」**（S5-4，050 §3.1 已同步修正）：這是網址確實改變（保留獨立網址的前提）帶來的正確行為，與重新整理後的完整頁一致；若期望背景頁麵包屑「保持不動」，是一個新需求，不在本計畫範圍。
5. **「Administration」入口沿用既有 `nav.administration` 翻譯 key、icon 用 `Settings2`**（S3-1）：不新增翻譯 key；7 個子項的 icon 各有領域語意，挑任一個當總入口都會誤導，`Settings2` 對應「設定視窗」的新互動語意。改用 `ShieldCheck` 亦可，但它已是 Roles 的 icon，modal 內會重複。
6. **Phase 6 的 push 需要單獨的口頭授權**（閘門 G3）：核准本份任務拆解**不等於**授權 push。`appspine-packages` 的 `main` 一收到 push，`changesets/action@v1` 就會自動走發布流程，產物外部可見且無法收回。這一項本質上不需要「現在」決定，執行到 Phase 6 時會再問一次。

**以下 3 項 Opus 審查後改分類為「被程式碼強制、非真正的判斷取捨」，不需要使用者花時間確認，僅供知悉**：

- 任務編號前綴用 `S`（避開 047 的 `R` 前綴）——純命名慣例，無替代方案的取捨空間。
- 3 個 admin 頁面（`gateway-profiles`/`vault`/`dlp-rules`）不轉送 `searchParams`——它們的預設匯出根本不收 props，硬傳會直接 TS 編譯失敗，不是風格選擇。
- 本機 link 與最終版本更新的戰場是 `pnpm-workspace.yaml` 的 `overrides`、不是 `frontend/package.json`——這是重新核實後的**事實修正**（連帶修正了 050 §6：兩邊版本目前其實一致，不是「既有 minor 落差」），不是一個需要選邊站的取捨。

**Opus 審查新增發現，已併入拆解本體，一併請使用者知悉**：

- **S3-6a（新任務）**：modal 內連續切換多個分頁（如 Users → Roles → Vault）後，原本 `onClose={() => router.back()}` 的關閉語意只會退回上一個分頁，要按多次才能回到背景頁——050 原文與初版拆解都沒發現這個 bug，已加入 S3-6a 的修法與驗證步驟。
- S3-8 新增第 8 項驗證：巢狀 dialog（如 `CreateUserDialog`）的 focus trap 疊層行為提前在 Phase 3、G2 之前就測，不要拖到 Phase 5 才發現（發現得越晚，已複製的路由越多、返工成本越高）。
- S2-1 補上 `DialogDescription` 的無障礙需求（Radix 對缺少標題與缺少說明都會各自警告一次，不只標題）。
- S3-7 補上一句耦合警語：直接 `import` 另一個路由的 `page.tsx` 預設匯出來重用，是可行但非官方正式保證的 Next.js 用法，日後若導入 PPR/`"use cache"` 需要重新檢視。
