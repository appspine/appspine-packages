---
type: topic
scope: cross-repo
status: active
created: 2026-07-01
updated: 2026-08-03
supersedes: null
superseded_by: null
---

# 002 - App 開發規範 - 程式碼規範

> 本文件為「業務系統開發框架」系列文件第二份，記錄各業務系統 app 共通的程式碼開發規範。
> 來源：既有 `auranest` 專案的 `CLAUDE.md` / `docs/claude-infra.md`，篩選出與架構決策無關、可直接沿用的部分搬移過來。
> 範圍：命名慣例、目錄結構慣例、Lint 規範、Prisma 慣例、註解與文件規範、錯誤回應格式、API 設計規範、Git/Commit 規範、測試規範、前端元件規範、新增 CRUD 模組標準流程。
> 狀態：基本規範已定案。
>
> **已搬到 `appspine-app-template/docs/conventions.md`**（英文，隨 template repo 一起 fork 出去，
> forked 出去的團隊看不到這份 `dev_docs`）：這份文件是內部規劃紀錄，`conventions.md` 才是實際隨 repo
> 出貨、agent/開發者會讀到的版本。搬的時候已排除框架內部才適用的部分（例如 `@appspine/*` 套件本身的
> changesets 發版流程），並修正了跟後面章節有出入的地方（`AppSelect`、TanStack Query 相關描述——經確認
> appspine-app-template 目前兩者都沒有用到，予以移除/改寫，避免文件互相矛盾）。**之後修改本文件時，記得
> 同步檢查 `conventions.md` 是否也要更新。**

## 命名慣例

- **檔案**：kebab-case（例如 `leave-request.controller.ts`）
- **Class / Type**：PascalCase（例如 `LeaveRequestController`）
- **Function / 變數**：camelCase（例如 `createLeaveRequest`）
- **常數**：SCREAMING_SNAKE_CASE（例如 `MAX_RETRY`）
- **環境變數**：SCREAMING_SNAKE_CASE（例如 `DATABASE_URL`、`AUTH_MODE`）
- 禁止在程式碼中寫死 `localhost`，一律用環境變數

## 目錄結構慣例

每個業務系統 1 個 repo，內含 `frontend/`、`backend/` 子目錄（見 001「App 範本機制」）：

```
<app-repo>/
  frontend/        Next.js app，沿用 blank_shadcn_app 結構（src/app、src/components、src/lib 等）
  backend/
    src/            NestJS 模組（依業務模組分資料夾，如 src/my-module/）
    prisma/         schema.prisma + migrations/
    scripts/        gen-data-dictionary.ts 等開發工具腳本
  docs/             data-dictionary.md 等自動產生文件
  e2e/              E2E 測試（存在才觸發 CI e2e job，見 001「框架基本功能」）
  docker-compose.yml
```

## Lint 規範

- 統一使用 **Biome**，repo 根目錄放單一 `biome.json`，同時涵蓋 `frontend/` 與 `backend/`（不像 AuraNest 分 root/frontend 兩份版本——因為 appspine 是單一 repo 結構，沒有 AuraNest 那種 frontend/backend 各自獨立套件版本的問題）。
- `frontend/` 沿用 `blank_shadcn_app` 既有的 `biome.json` 規則為基礎。
- Commit 前需通過 `biome check`（搭配 Git 規範裡的 `tsc --noEmit`）。

## Prisma 慣例

- **Model 名稱**：PascalCase 單數（例如 `User`）
- **Table 名稱**：snake_case 複數，透過 `@@map("users")`
- **欄位**：camelCase，透過 `@map("snake_case")`
- **不可跨 app 外鍵**：業務系統間透過事件或 API 溝通，不可直接 FK 到別的系統的資料庫（呼應 001「資料庫各自獨立」決策）。呼叫 master-data app（見 001「與 Enterprise Master Data App 的釐清」）時同樣適用本條；具體的 stable id + display snapshot 存法見
  `_archive/future-plans-Z18-20260722/Z18-enterprise-master-data-center.md` §5–6
  （原 Z18，已封存但內容仍供參考）；本機唯讀複本（Sync/Cache）標準化做法見
  `_archive/dev_docs-20260803/app-master-data/033-master-data-app-plan.md`。
- **消費 `apps/master-data` 的通用作法已寫進 `appspine-app-template/docs/conventions.md`「Consuming apps/master-data」一節**（2026-07-22 由 033 更新）：link key、M2M API Key 認證、org-chain 只回事實不選主管、Snapshot vs Sync/Cache、Mirror 慣例、兩種失敗模式的取捨，這份文件才是新 fork 出去的團隊看得到的版本，本文件之後若要調整這套慣例，記得同步過去。
- Prisma client output 使用預設路徑，不可自訂 output

## 註解與文件規範

## Enum / i18n 慣例

- **Prisma enum 的前端選項來源一律是 `GET /metadata/schema`**：不要在前端寫死 `const OPTIONS = [...]` 來 mirror schema。
  只要 schema 改了、重新 `prisma generate` 後，runtime metadata 就應該反映新 enum 值。
- **enum 翻譯 key 一律放在 locale JSON 的頂層 `enums` namespace**，格式固定為
  `enums.<EnumName>.<VALUE>`，例如 `enums.PermissionPolicy.DENY_ALL`、`enums.Permission.USERS_READ`。
  不要把 enum key 分散到 `roles`、`users` 等功能 namespace，也不要改成巢狀物件。
- **所有 Prisma enum 都要補翻譯，不管當下 UI 有沒有用到**。例如 `AuditAction` 雖然目前尚未直接顯示在畫面，
  仍要先補 `enums.AuditAction.*`，避免 schema 一擴充或 UI 一接上就立刻出現漏翻譯。
- **pre-commit 必須 fail-loud 檢查 enum 翻譯是否跟 schema 對齊**：新增、刪除、改名 Prisma enum value 後，
  `en.json` / `zh-TW.json` 的 `enums` key 也要同步更新，缺漏要擋 commit。
- **M2M API Key 的 `resource:action` scopes 不屬於這套 enum 翻譯機制**。它們是 derived scope catalog，
  不是 Prisma enum value；若未來要翻譯 scope，需另立機制，不要塞進 `enums` namespace。

- 所有程式碼註解（`//`、`/* */`、JSDoc、Prisma `///`）一律使用英文；只在 WHY 不明顯時才寫（隱藏限制、workaround、反直覺行為），不寫 WHAT（好的命名就該說明 WHAT）
- `dev_docs/` 以外的文字（文件、commit message）一律使用英文
- **Prisma `///` 文件註解為必填**：是 Metadata Schema API 與 data dictionary 的資料來源，直接影響 AI agent 可理解的 schema 品質（呼應 001「AI 整合細節」）。已由 `pnpm -C backend check:schema-docs` 強制檢查（enum 缺 `///` 就 fail-loud），並在 `.husky/pre-commit` 擋 commit（`appspine-app-template` 起，見 Z13）
- `docs/data-dictionary.md` 為自動產生檔案，禁止手動編輯

## 錯誤回應格式

統一 JSON 錯誤回應結構：

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "traceId": "abc-123",
  "timestamp": "2026-06-30T10:30:00Z",
  "path": "/users"
}
```

## API 設計規範

- **Controller 慣例**：`@Controller(prefix)` + class 層級 `@UseGuards(...)` + Zod-based DTO 驗證（`ZodValidationPipe`）；除非該 method 需要比 class 更嚴格的條件，否則不在個別 method 上疊加 Guard。
- **Guard chain 順序**：`JwtOrApiKeyGuard`（API Key 優先，未帶則 fallback 到 JWT）→ `AdminGuard` 或 `PermissionGuard`（擇一，視 endpoint 需求）→ `ScopeGuard`（只限制 API Key 呼叫者，JWT 使用者不受影響）。對應 001 已定案的 M2M API Key scope 設計。
  - **Scope 的 action 讀/寫分類規則**：`resource:action` 的 `action` 若為 `read`/`list`/`get` 視為讀取，其餘（`write`/`create`/`update`/`delete`）視為寫入；一個 tool 若同時宣告多個 scope、讀寫混合，只要其中任一屬於寫入，整個 tool 就視為寫入。這個分類會由 `@appspine/mcp-server` 依此規則自動衍生 MCP 協定既有的 `readOnlyHint` 標註，放進 `tools/list` 回應，供外部呼叫方判讀（見 _archive/workspace-docs-023-024-20260715/023-external-interconnect-agent-team-plan.md (歷史封存) §2.3/§6.4）——app 開發者不需手動設定，只需正確宣告 `requiredScopes`。
- **RBAC 權限模型**：
  - `roleNames: string[]`
  - `permissionPolicy: DENY_ALL | READ_ALL | ALLOW_ALL`（粗粒度）
  - `permissions: Permission[]`（細粒度，透過 RolePermission 取得）
  - `PermissionGuard` 採 OR 邏輯：含 ADMIN 角色一律放行 → `ALLOW_ALL` 放行 → `READ_ALL` 且需求只含 `*_READ` 放行 → `permissions` 命中任一則放行 → 否則 403
- **分頁慣例**：統一 `paginationQuerySchema`，`limit` 上限 100，page-based，搭配 `paginate()` / `toPrismaOrderBy()` 共用 helper。
- **RESTful 路由慣例**：標準資源走 5 個 endpoint（`GET /` list、`GET /:id`、`POST /`、`PATCH /:id`、`DELETE /:id`）。若該模組有對應的 MCP tool，tool 名稱建議對齊同一套命名（`list_*`/`get_*`/`create_*`/`update_*`/`delete_*`），並**加上跨 app 統一的 app 前綴**（例如 `wiki_list_pages`、`calendar_create_event`）——讓外部呼叫方（n8n、AI agent 等）從扁平的跨 app tool 清單裡一眼辨識工具來源於哪個 app，見 _archive/workspace-docs-023-024-20260715/023-external-interconnect-agent-team-plan.md (歷史封存) §2.2。前綴格式由共用套件 `@appspine/mcp-server` 在 tool 註冊時檢查/強制。**這組 tool 不是框架自動產生的**，由 app 自行用 `@McpTool()` 註冊，見下方「新增 CRUD 模組標準流程」第 3 步。
  - **既有 tool 名稱遷移（雙重註冊過渡期）**：`@appspine/mcp-server` 升級後，同一個 tool handler 同時註冊舊名稱與新的前綴名稱（新名稱是別名，指向同一 handler、同一 `requiredScopes`），過渡期定為 **2 個 minor 版本**，且需稽核日誌中舊名稱呼叫次數已歸零，兩條件皆滿足才在後續版本移除舊名稱。過渡期間 `tools/list` 同時列出新舊兩個名稱屬預期行為，非資料異常。
- **路徑前綴慣例**：不加全域 `/api` 前綴，路由直接掛在 root（例如 `/users`、`/api-keys`、`/mcp`、`/metadata/schema`），沿用既有 AuraNest 專案的慣例。

## Git / Commit 規範

- **Branch 策略**：trunk-based —— `main` 永遠保持可部署狀態，開發走短期功能分支（`feat/<desc>`、`fix/<desc>`，前綴對應 commit type），PR squash merge 進 `main`，不維護長期存在的 `develop`/`release` 分支。小變更（文件、設定調整）可直接 push `main`。
- Commit message 採 **Conventional Commits** 格式：`<type>(<scope>): <description>`
  - 常用 type：`feat`、`fix`、`chore`、`refactor`
- 禁止使用 `git add -A`（避免誤加 `.env` 或二進位檔），改為明確指定要加入的檔案
- 禁止使用 `--no-verify` 略過 commit hook
- `tsc --noEmit` 必須通過才能 commit

## 測試規範

分兩層處理，不對所有 app 統一規定覆蓋率門檻：

- **共用套件**（appspine monorepo）：需要單元測試，CI 跑過才能發版——壞掉會影響所有業務系統，風險最高，值得投資。
- **業務系統 app**：主力驗證手段是 001 已定義的 **E2E golden path regression**（登入、RBAC 擋未授權路由、M2M API Key 驗證）+ `tsc --noEmit`/lint + `/code-review` + 人工瀏覽器驗證。只有「複雜商業邏輯」（非顯而易見的計算、狀態機、權限判斷）才額外補單元測試，不強制整體覆蓋率數字。

## 前端元件規範

- 開發表單 / UI 前，優先檢查既有 shadcn 元件（`blank_shadcn_app` 起點內建），禁止直接使用原生 HTML 控制項（`<input type="date">`、`<select>`、`<input type="checkbox">` 等）——這些元件內建正確的 ARIA/鍵盤操作支援，原生控制項容易做出不符合無障礙標準的介面
- 下拉選單依資料來源選擇元件：
  - **靜態選項**（寫死的常數陣列，如性別、層級）→ `Select` + `SelectValue`
  - **動態選項**（API 載入，如員工清單、部門清單）→ `AppSelect`（避免 Radix `SelectValue` 在非同步載入完成前抓不到 label 的問題）
- 表單資料載入：避免濫用 `useEffect + reset` 搭配 `defaultValues` prop——TanStack Query 背景 refetch 後會產生新的 data 參照、重跑 effect，覆蓋使用者正在編輯中的欄位。依情境選擇：
  - 獨立編輯頁：`isLoading` 區塊後再 mount 表單，直接用 `defaultValues`，不需要 `useEffect`
  - Dialog（資料來自外部 prop）：在 `onOpenChange` 當下直接 `reset()`
  - Dialog（需要重新 fetch）：加 `initialized` state 避免非同步競態
- **Theming**：主題透過 `<html>` 上的 data attribute 控制——`data-theme-mode`（light/dark）、`data-theme-preset`（`brutalist`/`soft-pop`/`tangerine` 三選一）、`data-font`（8 種字型選項），實際色票/字型定義在 `frontend/src/app/globals.css`。圖表色票用 `--chart-1`~`--chart-5` 這幾個 CSS 變數（同樣定義在 `globals.css`），不要在圖表元件裡另外寫死顏色。
- **Icon**：UI 一般 icon 一律用 `lucide-react`（shadcn/ui 預設）；品牌/產品 logo 才用 `simple-icons`（透過 `components/simple-icon.tsx`），不要拿 `simple-icons` 當一般 UI icon 用。
- **動筆寫本地元件前，先查 `@appspine/frontend-shell`**：`frontend-shell` 的 `src/index.ts` 是單一扁平的匯出清單，是目前所有共用元件的完整索引。開發表單/UI 遇到「這種元件其他 app 應該也需要」的情況（日期時間選擇器、清單搜尋/分頁、app shell 層元件等）之前，先掃一眼這份清單——已經有的直接用，不要先在本地重寫一份再說。`DateTimePicker`/`DateRangePicker` 在收斂進 `frontend-shell`（見 `_archive/dev_docs-20260803/framework/019-shared-date-picker-package-plan.md`）之前，在五個 repo 裡各自演化出不同版本、同一個 bug 要分別修五次，就是沒人做這一步檢查的直接後果。
- **自訂元件放置與抽取時機**：非 shadcn primitive 的可重用元件放在 `frontend/src/components/`（扁平結構，不用再分子資料夾）。同一段 markup 被 ≥2 個地方重複使用、或單一頁面內的 markup 超過約 50 行，才抽成獨立元件；否則直接寫在頁面檔案裡，不要為了「可能以後會重用」預先抽象。
- **升級進 `@appspine/frontend-shell` 的判斷準則**：元件要同時符合兩個條件才考慮升級成共用套件：(a) 真的是框架層級（auth/導覽/主題外殼一類），不是業務領域 UI；(b) 不含任何 app 專屬的商業邏輯或文案。不確定就留在 app 本地——太早升級進共用套件，會讓一個其實只有一個業務系統在用的元件背上發版維護的負擔（呼應 003「共用套件重用計畫」的謹慎態度）。

## 新增 CRUD 模組標準流程

1. **Backend - Schema**：在 `prisma/schema.prisma` 新增 model / enum，補上 `///` 文件註解；停掉 dev server 再執行 `prisma generate` / `prisma migrate dev`
   - Prisma migration 不要用會進入互動式 prompt 的執行方式。請明確帶 migration 名稱，例如：
     `pnpm -C backend prisma:migrate -- --name add-announcements`
   - 原因：若只執行到會等待輸入 migration name 的互動狀態，agent / CI-style 操作很容易卡住，後續也不利於重現。
   - 命名慣例：使用簡短、可讀的 kebab-case 動詞片語，例如 `add-announcements`、`add-api-keys`、`rename-user-status`。
2. **Backend - Module**：依序建立 `dto`（Zod schema）→ `service`（findAll/findOne/create/update/remove）→ `controller`（含 Guard）→ `module`，並加進 `app.module.ts`
3. **Backend - MCP Tools（視需求）**：若該模組要開放給 AI agent／M2M 呼叫端使用，在 `service`（或獨立的 `<entity>.mcp.ts`）為要開放的 CRUD 方法加上 `@McpTool({ name, description, inputSchema, requiredScopes })`（來自 `@appspine/mcp-server`），並在該 module 實作 `OnModuleInit`，注入 `McpToolRegistry` 後呼叫 `registerMcpToolsFromInstance(this, registry)` 完成註冊。**框架不會自動產生 tool**——`<app前綴>_list_*`/`<app前綴>_get_*`/`<app前綴>_create_*`/`<app前綴>_update_*`/`<app前綴>_delete_*`（跨 app 統一前綴慣例，見上方「API 設計規範」）只是建議跟 REST 對齊的命名慣例，實際要不要 5 個都開、tool 名稱、`requiredScopes`（`resource:action` 格式，對應 M2M API Key 的 scope 設計與上方 action 讀/寫分類規則）都由 app 自己決定並手動撰寫
4. **Frontend - API**：`lib/<entity>-api.ts`，export 型別與 CRUD function
5. **Frontend - i18n**：同步補上翻譯檔
6. **Frontend - Sidebar**：補上選單項目與麵包屑對應
7. **Frontend - Pages**：list / new / edit 頁面，欄位多（> 8）用獨立頁面，欄位少用 Dialog
8. **TypeScript 驗證**：前後端 `tsc --noEmit` 都需通過
9. **瀏覽器驗證**：Golden path（新增/列表/編輯/刪除）+ edge case（空資料、驗證錯誤）+ regression
10. **Code Review**：`/code-review`，重點檢查 auth guard、IDOR、N+1、敏感欄位外洩
11. **修正 review 問題後再次 typecheck**
12. **Commit & Push**：依上方 Git/Commit 規範

## 第三方憑證儲存慣例

> 來源：_archive/workspace-docs-023-024-20260715/023-external-interconnect-agent-team-plan.md (歷史封存)
> §3.2/§2.4，因 AI Agent Team app 的金鑰清單（Key Vault）需要保管第三方憑證（appspine
> app 的 M2M key、LLM 供應商金鑰）而新增。**與既有 M2M key 儲存方式性質不同，不要混用**：
> M2M key 是雜湊單向儲存、只用於驗證比對，本來就不可還原；第三方憑證要能被實際拿去呼叫
> 別的系統，必須可還原，因此規則不同：

- **應用層加密**：金鑰值以主金鑰 encrypt-at-rest 後存密文，不是明碼存資料庫，DB dump
  外洩也看不到明碼
- **主金鑰以環境變數在部署時提供**，不引入 KMS 等新基礎設施（如未來確有需要，KMS 可作為
  升級路徑，非目前要求）
- **操作體驗比照 M2M key 慣例**：明碼只在建立當下顯示一次，之後只顯示遮罩（例如末幾碼）；
  支援同一筆憑證新舊並存一段時間，達成零停機輪替
- **主金鑰輪替**（全部憑證要重新加密）屬於罕見、高風險維運操作，不做成自助功能，走維運
  手冊、真正需要時才執行——與上面「單筆憑證輪替」是不同層級的操作

## 發現服務推送慣例

> 來源：_archive/workspace-docs-023-024-20260715/023-external-interconnect-agent-team-plan.md (歷史封存)
> §2.1，T-9700。每個 app 若要讓外部整合者（n8n、AI agent）透過發現服務找到自己，在
> `.env`／`.env.example` 補上三個變數即可，`@appspine/mcp-server` 的 `DiscoveryPushService`
> 會在啟動時自動推送：

- `DISCOVERY_PUSH_URL`：發現服務的 base URL
- `DISCOVERY_PUSH_TOKEN`：發現服務管理員透過 `POST /discovery/apps` 為這個 app 核發的推送
  token（明碼只顯示一次）——**只填進本機（gitignored）`.env`，`.env.example` 留空**
- `PUBLIC_BASE_URL`：這個 app 對外可連到的 base URL，`mcpEndpointUrl`／
  `metadataEndpointUrl` 由此推導（`<PUBLIC_BASE_URL>/mcp`、
  `<PUBLIC_BASE_URL>/metadata/schema`）

三者任一沒設就完全不推送（opt-in，不影響既有行為）；推送失敗只記 log、不影響本 app 自身
請求（發現服務是輔助用的目錄，不是依賴）。推送時機是「應用程式啟動時」（`OnApplicationBootstrap`），
不是排程輪詢——部署本來就會重啟行程，天然對齊「部署時推送」的節奏，不需要額外引入排程套件。

## Domain Events 使用慣例

> 來源：`026-domain-events-approve-plan.md` §11（套件抽取 gate）+
> `future_plans/Z20-domain-events-outbox.md`。026 計畫 H 組完成 `@appspine/domain-events`
> 套件抽取，並在 `apps/approve`（完整版：webhook 訂閱 admin CRUD、加密 secret、
> audit-record handler）與 `apps/wiki`（最小垂直切片：單一 code-registered `webhook.post`
> handler、env 設定 URL/secret，無 admin UI/subscription model）兩個 app 實際落地驗證後，
> 已回填進 `appspine-app-template`（T-11030，見 026-task-breakdown.md 執行紀錄）。
> **是選擇性採用的模式，不是每個模組都需要**——只有需要「業務寫入與衍生副作用
> （webhook、跨系統通知、未來 workflow relay）解耦，且副作用必須可靠送達（at-least-once，
> 支援 retry/dead-letter）」的場景才適合引入。
>
> 028 計畫（`028-domain-events-standardization-plan.md`）在六個 app（approve/wiki/calendar/
> chat/drive/project）+ template 落地驗證後，把「宣告式訂閱」（`@DomainEventSubscriber`
> decorator）與「共用 admin（catalog/list/detail/retry/ignore）」補進本節，取代原本純手動
> `registry.on()` 註冊的寫法。

### 檔案位置標準

每個 app 的 domain events 程式碼一律遵守以下擺放規則，agent 新增訂閱時照做即可，不用碰
其他檔案：

| 內容 | 位置 | 規則 |
| --- | --- | --- |
| 事件常數 | `backend/src/domain-events/events.ts` | `as const` 物件，一個 aggregate 一個常數物件 |
| Handler class | `backend/src/domain-events/handlers/<name>.handler.ts` | 一檔一 class，class 名 `<Name>DomainEventHandler`，必掛 `@DomainEventSubscriber` |
| 接線 | `backend/src/domain-events/domain-events.module.ts` | 唯一允許出現 `registerDomainEventSubscribers()`／`registry.on()`／`registerPrefix()`／`registerHandlerKeyContributor()` 的檔案 |
| `record()` 呼叫點 | 各業務 service 內 | 必與業務寫入同一 transaction（既有規則不變） |

### `@DomainEventSubscriber` decorator

Handler class 掛 `@DomainEventSubscriber({ key, eventType, description })`（比照
`@McpTool()` 的 class-decorator + 自動掃描寫法），`domain-events.module.ts` 改用
`registerDomainEventSubscribers([handler, ...], registry)` 一次註冊，取代逐條手寫
`registry.on(...)`：

```ts
@Injectable()
@DomainEventSubscriber({
  key: "webhook.post",
  eventType: WikiPageEvents.VISIBILITY_CHANGED,
  description: "Posts an outbound webhook when a wiki page's visibility changes.",
})
export class WebhookPostDomainEventHandler implements DomainEventHandler {
  readonly key = "webhook.post";
  async handle(input) { ... }
}
```

- **`description` 必填**：空字串在 `registerDomainEventSubscribers()` 直接 throw（開機
  fail-loud）。這個欄位會顯示在共用 admin 的 catalog 畫面（`registry.describe()`），寫給
  日後看畫面的人，不是寫給自己。
- **decorator 的 `key` 必須與 class 的 `readonly key` 一致**——兩處宣告同一個事實，
  `registerDomainEventSubscribers()` 會核對，不一致一樣開機就炸，不會靜默漏掉。

### 何時該用 decorator（code-registered）vs 何時維持手動註冊（data-driven）

見 `_archive/dev_docs-20260803/domain-events/Z20-domain-events-outbox.md` §8 完整推導，摘要：

- **絕大多數訂閱都該 code-registered**（掛 `@DomainEventSubscriber`）——「Y 發生時通知 X」
  是開發時期決策，該進 `git log`、該被 `tsc` 檢查，不該是一筆可被 admin 在 UI 上任意改的
  資料列。
- **唯一合理的例外是 admin 設定的路由**（如 approve 的 webhook 訂閱表——由 admin 在
  operations time 決定哪些 URL 收哪些事件，是正當的資料驅動場景）。這類 handler 透過
  `registerPrefix()`／`registerHandlerKeyContributor()` 解析，**刻意不掛 decorator**——
  在檔案頂部加 `// @domain-events-undecorated: <原因>` 標記，讓下面的檢查腳本知道這是
  刻意豁免，不是忘記裝飾。
- **豁免不能用檔名判斷**：wiki 的 `webhook-post.handler.ts` 與 approve 同名，但 wiki 是
  exact-registered、必須掛 decorator；只有檔內標記能正確區分兩者的裝飾要求相反。

### `check:domain-events-subscribers` 檢查

各 app `backend/scripts/check-domain-events-subscribers.ts`（掛 pre-commit）做兩件事的
grep 級靜態檢查（不是 AST，目標是擋住「忘了照規範」）：

1. `backend/src/` 底下除了 `domain-events.module.ts` 沒有任何檔案直接呼叫 `registry.on(`。
2. 每個 `handlers/*.handler.ts` 都含 `@DomainEventSubscriber` 或明確的
   `@domain-events-undecorated:` 豁免標記。

- **何時該發事件**：只有「衍生」副作用才走 domain events——核心業務狀態機、DB 交易內的強一致
  寫入（例如版本鎖、同交易內的通知寫入）**永遠留在同步路徑**，不要為了套用這個模式而把本來就
  該同步的邏輯拆成非同步事件（見 [Z20-domain-events-outbox.md](Z20-domain-events-outbox.md) §2「synchronous core, asynchronous derived effects」邊界）。
- **`record()` 必須跟業務寫入同一個 transaction**：`DomainEventsService.record(tx, input)` 一定
  要用呼叫方自己的 transaction client 呼叫，不能寫完業務資料才另外呼叫——否則失去「不遺失事件」
  的保證。
- **Handler 冪等要求**：dispatcher 是 at-least-once 語意（stale-lock 回收、重試都可能造成同一個
  handler 對同一個 delivery 重跑），handler 實作必須用 `eventId`（或 `eventId + handlerKey`）當
  冪等 key，不能假設只會執行一次。
- **事件常數用 `as const`，不要用自由字串**：仿 `ApprovalInstanceEvents`/`WikiPageEvents`，一個
  typo 會讓訂閱永遠比對不到，是最難 debug 的錯誤類型。
- **Schema pattern 用文件 + drift-check，不注入 schema**：`@appspine/domain-events` 套件本身不含
  `.prisma` 檔案（每個 app 自己管理 migration 歷史），改用套件 `docs/prisma-model.md` 提供可複製
  貼上的 `DomainEvent`/`DomainEventDelivery` model 定義，並用套件匯出的
  `checkDomainEventSchemaDrift()` 比對 app 自己產生的 `Prisma.dmmf.datamodel`，掛進
  `check:domain-events-schema-drift` script + pre-commit（比照 `check:schema-docs` 手法）。
  `appspine-app-template` 起，這個 script 已內建在每個新 fork 裡。
- **`appspine-app-template` 現況**：`DomainEventsModule` 已接進 `AppModule`，dispatcher 會啟動，
  但 handler registry 刻意留空——template 沒有業務事件，新 fork 出去的第一個事件由該 app 自己
  定義並註冊。T-11290 補上 `DomainEventsAdminModule.forRoot(DomainEventsModule)`（catalog 等
  admin 端點，即使 registry 是空的也回傳「目前沒有訂閱」，是有用的起手驗證點）與
  `(handlerKey, createdAt)` migration，但**不**內建 catalog/list/detail 前端頁面——沒有任何
  handler 時沒有東西可看，新 fork 加了第一個 handler 之後，照抄 `apps/wiki` 或
  `apps/calendar` 的 `frontend/src/app/(main)/dashboard/(admin)/domain-events/` 目錄與
  side/breadcrumb/i18n 項目即可。細節見 `appspine-app-template/docs/domain-events.md`
  （英文，隨 template 一起 fork 出去）；本文件此段落已同步搬到
  `appspine-app-template/docs/conventions.md`。
- **參考實作**：`apps/approve`（github.com/appspine/approve）是完整版範例；
  `apps/wiki`（github.com/appspine/wiki）、`apps/calendar`（github.com/appspine/calendar）、
  `apps/chat`（github.com/appspine/chat）、`apps/drive`（github.com/appspine/drive）與
  `apps/project`（github.com/appspine/project）是最小垂直切片範例。閱讀各 app 的
  `backend/src/domain-events/` 與第一個事件所在 service，依實際需求選擇要做到哪個程度，不需要
  每個 app 都做完整版。

## 已釐清事項

- **Auth 拓樸與本文件的關係**：AuraNest V2 改用自建的中心化 Admin Center 做 JWT SSO，乍看與 001 的 `AUTH_MODE=local|oidc` 不同，但已釐清兩者不衝突——`AUTH_MODE=oidc` 接的是既有外部 IdP（Keycloak），不是框架自建的中心服務，SSO 透過既有 Keycloak 達成。詳見 001「身份/權限細節」。

