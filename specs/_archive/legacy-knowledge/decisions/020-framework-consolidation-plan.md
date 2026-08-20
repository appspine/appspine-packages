---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-08
updated: 2026-08-03
---

# 020 - 框架休整（測試補強、template 傳播流程、文件修正）- 系統設計計畫

> 狀態：已完成（T-9100–T-9171 全數執行完畢，詳見 `020-task-breakdown.md` 第 3 節執行結果）。
> 範圍：**框架休整，不新增任何業務功能**。落點橫跨 `appspine` monorepo（`@appspine/rbac`、
> `@appspine/common` 的測試）、`appspine-app-template` 與四個既有 app（業務 E2E、文件回填、
> 版本對齊）、以及 `dev_docs` 本身（狀態行更新）。**不涉及 Prisma schema 變更、不發新的
> minor 版本**（除非測試過程挖出 bug 需要 patch）。
> 動機來源：2026-07-08 對 appspine packages 與 app-template 的全面盤點。四個 app
> （wiki/calendar/chat/project）開發完成後、drive/approve 開工前的休整期，把盤點出的
> 三類缺口（測試覆蓋、template→forks 傳播成本、文件正確性）一次補齊，讓後面兩個 app
> 站在更穩的基礎上開工。
> 跨 app 工作流程架構的初探**不在本計畫範圍**，記錄於
> `_archive/dev_docs-20260803/future_plans/Z11-cross-app-workflow-exploration.md`，approve 開工前另行深入討論。

---

## 1. 背景：盤點結果摘要

2026-07-08 的盤點結論是「架構與程式碼品質狀態良好，不需要大規模重構」——套件依賴方向乾淨、
無 TODO/FIXME 殘留、019 剛把 DatePicker 系列收斂完、八個後端套件在五個消費端的版本完全一致。
但有三類缺口值得在 drive/approve 之前補：

### 1.1 測試覆蓋是全面性的薄弱點

| 層級 | 現況（盤點時點） | 風險 |
|---|---|---|
| `@appspine/*` 套件 | `auth`(3 spec)/`m2m-api-key`(2)/`mcp-server`(2)/`metadata-schema`(1) 有測試；**`rbac`（424 LOC，含 `PermissionGuard`）、`common`（exception filter、pagination、Zod pipe）零測試** | `rbac` 是安全關鍵路徑（權限閘門）卻無任何測試；`common` 的 exception filter 是全部 app 的統一錯誤格式來源，改壞了五個 app 一起壞 |
| App 後端單元測試 | wiki 0、calendar 1（`events.service.spec.ts`）、chat 0、project 0 | 業務邏輯全靠手動驗證 |
| E2E | 五個 repo 都只有 `e2e-kit` 的框架層 golden path 三支（`auth.spec.ts`/`rbac.spec.ts`/`m2m-api-key.spec.ts`），**零業務流程 E2E** | wiki 頁面 CRUD、chat 訊息收發、project issue 流轉、calendar 事件建立都沒有回歸防護——升級 `@appspine/*` 套件版本時，CI 綠燈不代表業務功能沒壞 |

（`frontend-shell` 零測試是 019 已決策的現況：純 UI 元件套件不引入測試框架，
僅 `tsc --noEmit` 驗收，本計畫沿用該決策不翻案。）

### 1.2 template→forks 的傳播成本正在線性放大

001 當初的假設是「新系統的演進透過套件版本升級而非範本同步合併」，但實務上 template 裡
**不可套件化的部分**（app router 頁面、admin 三頁、config、workflow yml、docs）持續產生
需要逐 repo 重放的修正。近期的實據——同一個變更在 template + 四個 app 各 commit 一次：

- 「fix: skip preload for non-default fonts」×5
- 「docs: add rule to check frontend-shell before writing a local component」×5
- 019 的消費端遷移「refactor: consume DateTimePicker from @appspine/frontend-shell」×5

目前是 ×5，drive/approve 上線後變 ×7。019 本身就是這個問題的一個案例研究（同一個
巢狀 `<button>` bug 修五次），019 用「收斂進套件」解掉了 date picker 這一塊，但「收斂」
只適用於可套件化的程式碼；**對於天生不可套件化的部分，目前完全沒有流程或工具**，
連「template 從上次同步點之後改了什麼」都要靠人腦記憶。

### 1.3 文件正確性的具體缺口

1. **`appspine/docs/agent-guide.md` 的套件依賴圖寫錯**：寫著 `m2m-api-key` depends on
   `rbac`（「roles with scoped capabilities」），實際 `package.json` 是 depends on
   `auth` + `common`；`rbac` 實際是 depends on `auth` + `common`。這份是套件開發的
   權威指南，錯的依賴圖會誤導後續套件開發。
2. **三個 app 的 scaffold TODO 沒回填**：calendar/chat/project 的 `docs/agent-guide.md`
   「App Positioning」段落與 `README.md` 的 API surface 表都還是 `TODO(scaffold)`
   佔位符（wiki 有回填，可當範例）。這些是 006 設計的 coding agent 入口文件，
   空著會直接降低日後 AI 協作的品質。
3. **dev_docs 狀態行過期**：INDEX.md 的「已知落差」段落已記錄此問題（010 全部做完但
   狀態行仍寫「規劃中」；011/012/014/015 的 app 早已存在但狀態行仍寫「尚未 fork」；
   014 的前段 checkbox 從未回填）。既然 `generate-index.mjs` 已經在用，應該一次性把
   來源文件的狀態行修正，讓「狀態」欄恢復可信，而不是永遠靠「已知落差」段落補救。
4. **`health-check` 版本 range 不一致**（小事）：wiki 是 `^0.1.2`，template 與
   calendar/chat/project 是 `^0.1.0`。semver 相容、無實害，但既然要動 package.json
   （工作包 B 的同步演練），順手對齊。

---

## 2. 工作包 A：測試補強

原則：**補在風險最高、且之後會被反覆依賴的地方**，不追求覆蓋率數字。

### 2.1 `@appspine/rbac` 單元測試（必做）

比照 `auth`/`m2m-api-key` 既有的 vitest 慣例（`package.json` 加 `"test": "vitest run"`，
monorepo 的 `pnpm -r run test` 與 CI 的 path-filtered test 會自動接手）：

- `PermissionGuard`：
  - 使用者有／無所需 permission 的 allow/deny
  - `@RequirePermissions` 多個 permission 的 AND 語意
  - 未標註 decorator 的 endpoint 行為（預設放行或拒絕，以現行實作為準寫成測試固定下來）
  - ADMIN 角色的 bypass 行為（若現行實作有）
  - 未登入／`request.user` 缺失時 fail-closed
- Role/Permission CRUD service 的關鍵邏輯（如重複名稱、刪除仍被 user 引用的 role 的行為）。

### 2.2 `@appspine/common` 單元測試（必做，成本低）

全部是純函式或近純的類別，不需要 NestJS 整合測試環境：

- `GlobalExceptionFilter`：HttpException（string message／array message＝Zod issues
  轉 `details`／非物件 response）、非 HttpException 的 500 fallback、`traceId` 來源
  優先序（`req.id` → `x-request-id` → randomUUID）。
- `paginate` helper：邊界（page 0／負數／超出總頁數、take 上限）。
- `ZodValidationPipe`：驗證失敗時丟出的 BadRequestException 形狀（與 exception filter
  的 array-message 約定是一對，兩邊測試互相鎖住這個契約）。

### 2.3 各 app 一支業務 golden-path E2E（必做，每 app 恰好一支）

用現成的 `@appspine/e2e-kit` fixture（登入、storageState 快取都是現成的），放進各 app
既有的 `e2e/specs/`，CI 的 e2e.yml 已經會自動跑到（path filter 含 `e2e/**`）：

| App | Golden path（單一 spec 內完成） |
|---|---|
| wiki | 建 space → 建 page → 開啟頁面驗證內容呈現 |
| calendar | 建 calendar → 建 event → 在畫面上看到該 event |
| chat | 建 channel → 送一則訊息 → 訊息出現在列表 |
| project | 建 project → 建 issue → issue 出現在 board/列表 |

目的不是覆蓋業務細節，而是讓「升級 `@appspine/*` 版本」「重放 template 修正」這類
橫向變更有一個最低限度的業務層回歸訊號（1.1 的風險主體）。細部業務測試不在本計畫
範圍，日後隨功能開發逐步累積。

### 2.4 明確不做

- `frontend-shell` 元件測試（沿用 019 決策）。
- `audit-log`（46 LOC）/`health-check`（32 LOC）：太薄，測試價值低於維護成本。
- 各 app 後端單元測試的全面補課：只靠 2.3 的 E2E 當回歸底線，單元測試隨日後改動
  該模組時再補（boy-scout rule），不在休整期一次還債。

---

## 3. 工作包 B：template→forks 傳播流程

### 3.1 問題定義

需要一個回答「template 自上次同步之後改了什麼、每個 fork 套用到哪了」的機制。
方案選擇（決策記錄見第 6 節）：**不引入 git merge/subtree 類的自動合併**（forks 的
业務改動與 template 檔案高度交錯，自動合併的衝突處理成本與風險高於人工重放），
採**輕量的同步點標記 + checklist 產生腳本**：

### 3.2 做法

1. **同步點標記**：每個 fork repo 的 `docs/` 下新增 `template-sync.md`，記錄
   「上次同步到 template 的哪個 commit SHA」＋逐條的套用記錄（template commit →
   本 repo 對應 commit／或「不適用」＋原因）。初始值：本計畫執行時逐 repo 盤點
   目前實際狀態後回填（019 剛做完全面同步，是很好的基準點）。
2. **checklist 產生腳本**：`appspine-app-template/scripts/list-template-changes.mjs`
   （plain Node、無依賴，比照 `generate-index.mjs` 的風格）——輸入
   「fork repo 的 `template-sync.md` 記錄的 SHA」，輸出 template 自該 SHA 之後的
   commit 清單（排除純 docs/CI 可選項另計），供人工逐條判斷「要重放／不適用」。
3. **流程規範化**：在 workspace 根的 `docs/agent-guide.md` 新增一節「Template change
   propagation」：template 收到任何修正後，決定它是否需要傳播（bug fix 必傳播、
   template 專屬的 scaffold 邏輯不用）；需要傳播者在**同一個工作階段**內跑腳本、
   逐 fork 重放、更新各 fork 的 `template-sync.md`。把「修 template 就要問傳播」
   變成規則而不是記憶。

### 3.3 admin 三頁收斂評估（評估與決策，不含實作）

users/roles/api-keys 三個 admin 頁在五個 repo 各有一份幾乎相同的拷貝，是目前
「不可套件化面積」的最大宗。本計畫內完成**評估與決策**：

- 盤點五份拷貝目前的實際 diff（是否已有 fork 各自演化的部分）。
- 評估收斂進 `frontend-shell` 的可行性與 API 形狀（頁面吃 server actions／fetch 的
  注入方式、i18n、與各 app `(admin)` route group 的接合點）。
- 產出結論寫進本文件第 6 節決策記錄；**若決定做，另開編號計畫**（比照 019 之於 005
  的模式），實作不在 020 範圍——避免休整計畫膨脹成大型遷移。

---

## 4. 工作包 C：文件修正

對應 1.3 的四項，全部是機械性修正：

1. **`appspine/docs/agent-guide.md` 依賴圖**：逐套件對照 `package.json` 的
   `dependencies` 重寫「Package Dependency Architecture」一節（`m2m-api-key` →
   `auth` + `common`；`rbac` → `auth` + `common`；`mcp-server` → `auth` +
   `m2m-api-key`；`metadata-schema` → `common` + `m2m-api-key`；`audit-log`/
   `health-check` → `common`；`e2e-kit`/`frontend-shell` → 無工作區依賴）。
2. **scaffold TODO 回填**：calendar/chat/project 的 `docs/agent-guide.md`
   「App Positioning」與 `README.md` API/MCP tools 表，以 wiki 的回填內容為格式範例，
   內容從各 app 的 controllers／MCP tool 註冊處整理（各自獨立 repo、各自 commit）。
3. **dev_docs 狀態行一次性更新**：010–019 逐份把「狀態：」行改成與實際相符
   （010「已完成」、011/012/014/015「已完成，app 已上線於 apps/<name>」、
   013/016「規劃完成，尚未開工」、017/018/019 以實際為準）；014 的前段 checkbox
   依 `apps/chat` 實況回填；改完重跑 `node dev_docs/scripts/generate-index.mjs`。
   同時更新 `generate-index.mjs` 內寫死的「已知落差」段落——狀態行修正後該段落的
   三條敘述會過期，改為記錄「已於 020 修正，此欄位自此應保持回填」的短註記。
4. **`health-check` 版本對齊**：template + calendar/chat/project 的
   `backend/package.json` 改 `^0.1.2`，`pnpm install` 更新 lockfile（各自 commit，
   可併入其他該 repo 的 020 commit）。

---

## 5. 高階執行順序（供後續 task-breakdown 展開）

```
appspine monorepo：
  1. 工作包 A：@appspine/rbac 測試（2.1）→ @appspine/common 測試（2.2）
     （若測試挖出 bug：修正 + changeset patch 發版，消費端順著工作包 B 的流程升級）
  2. 工作包 C-1：docs/agent-guide.md 依賴圖修正

appspine-app-template：
  3. 工作包 B-2：scripts/list-template-changes.mjs
  4. 工作包 C-4：health-check ^0.1.2

workspace 根（dev_docs / docs）：
  5. 工作包 B-3：docs/agent-guide.md 新增傳播流程一節
  6. 工作包 C-3：dev_docs 狀態行更新 + generate-index.mjs 已知落差段落改寫 + 重跑 index

四個 app（wiki → calendar → chat → project，各自獨立 repo、各自 commit）：
  7. 工作包 B-1：docs/template-sync.md 初始盤點回填
  8. 工作包 A-3：業務 golden-path E2E 一支（2.3 的表）
  9. 工作包 C-2：scaffold TODO 回填（wiki 已完成，跳過）
  10. 工作包 C-4：health-check ^0.1.2（wiki 已是 ^0.1.2，跳過）

收尾：
  11. 工作包 B-4（3.3）：admin 三頁收斂評估，結論回填本文件第 6 節
```

Task breakdown 另開 `020-task-breakdown.md` 展開，task ID 建議從 **T-9100** 起
（019 用到 T-9040，跳一段避免衝突）。

---

## 6. 決策記錄

| 決策點 | 結論 | 詳見 |
|---|---|---|
| 休整範圍要不要含大規模 refactor | 不要——盤點結論是程式碼品質良好，缺的是測試與流程，不是重寫 | 第 1 節 |
| 測試補強的範圍 | `rbac` + `common` 單元測試、各 app 恰好一支業務 E2E；不做 frontend-shell/audit-log/health-check、不全面補 app 單元測試 | 第 2 節 |
| template 傳播用自動合併還是人工重放 | 人工重放 + 同步點標記 + checklist 腳本——forks 業務改動與 template 檔案交錯，自動合併風險高於效益 | 第 3.1 節 |
| admin 三頁收斂要不要在 020 做 | 020 完成評估與決策（決定收斂，另開編號計畫實作） | 第 3.3 節、第 6.1 節 |
| 跨 app 工作流程架構要不要進 020 | 不進——記錄於 `future_plans/Z11-cross-app-workflow-exploration.md`，approve 開工前深入討論後升級成編號計畫 | Z11 全文 |
| dev_docs 狀態行過期怎麼處理 | 一次性修正來源文件 + 改寫 generate-index.mjs 寫死的「已知落差」段落，讓狀態欄恢復可信 | 第 4 節第 3 項 |

### 6.1 Users / Roles / API Keys 三頁 Admin 收斂至 frontend-shell 評估結論

#### 1. 現狀盤點與 Diff
目前 wiki, calendar, chat, project 等應用的 admin 頁面（用戶管理、角色權限、API Key 管理）在前端程式碼中幾乎是 100% 的拷貝。經過盤點，目前各 App 的實現完全相同，並無 fork 出現各自業務演化、自訂攔截或特殊 UI 特徵。

#### 2. 收斂可行性
**完全可行**。
- **後端端點一致**：這三頁在前端呼叫的 API（`/api/users`、`/api/roles`、`/api/api-keys`）均對接框架層 `@appspine/auth`、`@appspine/rbac` 和 `@appspine/m2m-api-key` 後端套件，端點契約和資料結構均為標準化且固定。
- **前端依賴一致**：各 App 均基於 Next.js App Router 與 TailwindCSS + shadcn/ui 的 UI 基礎。

#### 3. API 形狀與接合點設計
- **前端組件打包**：在 `@appspine/frontend-shell` 內建立並導出 `<UsersAdmin />`、`<RolesAdmin />`、`<ApiKeysAdmin />` 三個主要模組（內含 Table, Dialog, Create/Update Forms 及其 Zod schemas）。
- **API 注入方式**：元件將透過 Prop 接收一個 `apiPrefix` (預設為 `/api`) 或 `apiClient` 實例，以適應不同 App 路由對接的靈活性，例如：
  ```tsx
  import { UsersAdmin } from "@appspine/frontend-shell";
  export default function UsersAdminPage() {
    return <UsersAdmin apiPrefix="/api" />;
  }
  ```
- **i18n**：元件將使用 React Context 或是 prop 來傳入 i18n translations，或在 `frontend-shell` 內部整合多國語言支援。
- **與 `(admin)` route group 的接合點**：各 App 只需在 `src/app/(main)/dashboard/admin/[module]/page.tsx` 中建立簡單的 Next.js page 檔，並直接 return 對應元件即可，大幅降低各 app 的程式碼重複度與維護複雜度。

#### 4. 決策與後續計畫
- **決策**：強烈建議收斂。
- **實作規畫**：本 020 框架休整計畫不含其實作。預計在 `approve` / `drive` 等下一個業務系統開工前，另立新的編號計畫（例如 `021-admin-pages-frontend-shell-consolidation-plan.md`）進行實作，並在新 template 中移除非必要程式碼。

---

若執行過程中出現新的待決問題，比照既有慣例在此文件補充，或另開 Z系列記錄文件。


