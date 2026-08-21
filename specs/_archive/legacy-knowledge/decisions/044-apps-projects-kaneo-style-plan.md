---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-08
updated: 2026-08-08
---

# 044 - `apps/projects` Kaneo 式綠地專案管理 App - 系統設計計畫

> [!success] 決策狀態
> **已定案，可排入執行。** Task breakdown 已建立於 [log.md](../log.md)。前案探索結論已整理至本文件的[[#前案決策摘要]]。`apps/projects` 使用全新 repo、全新資料庫與全新產品契約，不遷移或相容 `apps/project`；新 App 驗收完成後，完整移除 `apps/project` 與其資料庫。

> [!important] 正式化覆核補正
> 正式化前已核對目前 `appspine-app-template`、workspace ports、現有 `apps/project` 與 notification/i18n 行為。產品範圍沒有未解 blocker。唯一需補正的技術缺口是：template 的 locale preference 目前只存在 frontend cookie，backend 無法得知通知收件人的 locale；本計畫因此明定在新 App 持久化使用者 locale，讓 assignment notification 能依收件人語言產生。

## 1. 背景與目標

現有 `apps/project` 是 Jira 式 Project/Board/Sprint/Issue 系統。新產品的目標不是簡化舊 App 或建立相容版本，而是重新製作一個以 Task 為中心、降低方法論負擔的獨立業務 App：

```text
Project -> Task -> Board / List / Backlog
```

### 前案決策摘要

本計畫吸收先前 Kaneo 風格探索的以下結論，並以本文件作為唯一正式依據：

- 產品核心是 `Project → Task → Board / List / Backlog`，並以 My Tasks 作為跨專案的工作入口。
- 採全新的 `apps/projects` repo、資料庫、API/MCP 契約與 App identity；不複製 Kaneo，也不遷移、相容或依賴舊 `apps/project`。
- MVP 聚焦 Project、Task、Board columns、Project-local labels 與 comments；Sprint、Issue Type、worklog、WIP limits、subtasks、attachments、webhooks、saved views 與即時協作均排除。
- Task 的位置決定狀態：Backlog 為未放入欄位、active/done 由 Board column 的 `isDone` 決定；Task detail 必須能從 Board/List/Backlog 的 URL 脈絡開啟。
- 以 OIDC、RBAC、Audit、M2M API Key、MCP、domain events、雙語 i18n 及 production-grade UX 作為不可省略的 appspine 基線。

新 App 採 Kaneo 啟發的產品原則，但不 fork Kaneo、不複製 Kaneo schema，也不改變 appspine 的技術堆疊。它只繼承 appspine 的平台能力與開發慣例。

完成目標：

- 使用者不需理解 Sprint、Issue Type 或 Board type，就能建立 Project 與第一個 Task。
- Board、List、Backlog 與 My Tasks 操作同一份 Task 資料。
- UI/UX 達正式 production 交付品質，不是 template、demo 或陽春 CRUD。
- 第一版完整支援 `zh-TW` 與 `en`。
- OIDC、RBAC、Audit、M2M API Key、MCP、通知與平台治理能力完整可用。
- `apps/projects` 可在完全沒有 `apps/project` 的情況下獨立建置、測試、部署與運作。

## 2. 綠地邊界與非目標

### 2.1 綠地邊界

- 從 `appspine-app-template` 建立全新 `apps/projects` repo。
- 使用獨立 PostgreSQL database、ports、deployment、credentials 與 App identity。
- domain、Prisma schema、REST API、MCP tools、permissions、scopes 與未來 events 全部使用 Project/Task 新語意。
- 不複製舊 Prisma schema、migration、Issue/Sprint services、DTO 或 Jira 式 frontend routes。
- 可重用 `@appspine/*` packages、frontend shell、通用 UI primitives、position rebalance 演算法，以及經驗證的授權/Audit/notification 行為模式。
- `apps/project` 只能作為行為與退役盤點參考，不得成為 source、runtime 或 database dependency。

### 2.2 明確不做

- 不進行舊資料 migration、export、import、ID mapping、dual-write 或背景同步。
- 不維持舊 REST API、MCP names、scope names、events 或 URLs 的 compatibility aliases。
- 不以 `apps/project` 功能 parity 作為上線條件。
- 不建立 Workspace domain model。
- MVP 不支援多 Board、Sprint、Issue Type、Worklog/Time Entry、WIP limit、subtasks、Task relations、attachments、object storage、workflow rules、outgoing webhooks、第三方 integrations、saved views 或 Scrum/Kanban Board type。
- MVP 不提供 Project/Task permanent-delete endpoint。
- MVP 不使用 WebSocket、Server-Sent Events、presence 或即時協作狀態。
- 沒有正式 consumer 與 cross-app contract 前，不預先發布業務 domain events。

## 3. 產品體驗

### 3.1 預設入口與第一次使用

- 登入後預設進入 My Tasks。
- My Tasks 預設顯示指派給自己的未完成 Task，提供 Planned、Done、All 與 Project 篩選。
- 預設排序為逾期、priority、due date、建立時間；List view 可切換其他排序。
- Project list 是次要入口；app shell 中的 workspace 不是業務實體。

第一次使用 golden path：

```text
建立 Project
  -> 自動建立單一 Board 與 To Do / In Progress / Done
  -> 只輸入 title 建立 Task
  -> 拖放 Task
  -> 不離開 Board context 開啟 Task detail
```

### 3.2 Project 工作區

- Board、List、Backlog 位於同一個 Project shell，以固定 tabs 切換。
- Board 支援欄位內排序與跨欄位拖放。
- List 支援 server-side 搜尋、篩選、排序與密集檢視。
- Backlog 顯示尚未進入 Board 的 planned Task。
- 通用 quick-create 預設進入 Backlog；從 Board 欄位內建立時直接進入該欄位。
- Project OWNER 可新增、改名、排序、標記 done state 與刪除 Board 欄位，同時必須維持至少一個 active 與一個 done column。
- 自己的 mutation 立即更新；其他人的變更在視窗重新聚焦或定期 refetch 時同步。

### 3.3 Task detail

MVP 欄位：

- title
- Markdown description
- 單一 assignee
- 建立後不可修改的 reporter
- nullable priority：`LOW`、`MEDIUM`、`HIGH`、`URGENT`
- date-only due date，不含時間與時區
- Project-local labels
- Markdown comments
- 人類可讀 Task key
- created/updated timestamps

每個 Task 都有穩定 URL。從 Board/List 點擊時以 sheet 開啟；直接造訪或重新整理相同 URL 時顯示 full page。兩種呈現共用 application state 與 detail flow。

Task 搜尋同時提供全域與 Project 內範圍；全域結果只包含使用者有權存取的 private Project。Task key 可搜尋與深連結，但 UI 以 title 為主要辨識。

## 4. Domain model 與不變量

### 4.1 App-local models

```text
Project
ProjectMember
ProjectBoard
ProjectBoardColumn
Task
ProjectLabel
TaskLabel
TaskComment
```

Scaffold 提供的 `User` model 另外持久化 `preferredLocale`，允許值為 `zh-TW` 與 `en`，預設 `zh-TW`。這是通知 i18n 的必要資料，不建立另一套 user profile domain。

### 4.2 核心欄位方向

```text
Project
  id, name, key, description?, taskSeq, archivedAt?, createdAt, updatedAt

ProjectMember
  projectId, userId, role, addedAt, addedById?

ProjectBoard
  id, projectId(unique), name

ProjectBoardColumn
  id, boardId, name, position, isDone

Task
  id, projectId, columnId?, title, description?, assigneeId?, reporterId,
  priority?, dueDate?, position, taskKey, archivedAt?, createdAt, updatedAt

ProjectLabel
  id, projectId, name, normalizedName, color, position

TaskLabel
  taskId, labelId

TaskComment
  id, taskId, authorId, body, deletedAt?, deletedById?, createdAt, updatedAt
```

- Project key 依 name 自動產生，建立時可調整，格式為 2–10 碼大寫英數；在 App 內不分大小寫唯一，建立後不可修改。
- Task key 使用 `${PROJECT_KEY}-${sequence}`，永久唯一；Task 封存後 sequence 不回收或重用。
- ProjectLabel 是 Project-local，`normalizedName` 確保同一 Project 內名稱不分大小寫唯一。
- Assignee 必須是該 Project 成員，且一個 Task 最多一位 assignee。
- Reporter 是建立者，建立後不可修改。

### 4.3 Task placement

不建立另一個可與 Board column 漂移的 Task status enum；狀態由 placement 推導：

```text
columnId = null                      -> PLANNED / Backlog
columnId -> column.isDone = false    -> ACTIVE
columnId -> column.isDone = true     -> DONE
```

不變量：

- 每個 Project 恰有一個 Board；資料庫以 `ProjectBoard.projectId` unique constraint 保證。
- 每個 Board 至少有一個 active column 與一個 done column。
- Task column 必須屬於同一 Project 的 Board。
- Backlog 與每個 Board column 各自維護 position ordering；排序精度碰撞時只在相同 partition 內 rebalance。
- 從 Backlog 移入 Board 時可指定 column，未指定時使用第一個 active column；移回 Backlog 時清除 `columnId`。
- 移入或移出 done column 時，DONE/ACTIVE 立即由新 column 推導。
- OWNER 改變 column 的 `isDone` 會立即改變其中所有 Task 的推導狀態，必須在同一交易完成並完整 Audit。
- 刪除非空 column 時必須指定另一個 column 或 Backlog；搬移 Task 與刪除 column 在同一交易完成。
- 最後一個 active/done column 不可刪除，也不可修改成使 invariant 失效的類型。

### 4.4 Archive 與 Comment tombstone

- Project/Task 只提供 archive/restore，不提供 permanent delete。
- Archived Project 從一般清單隱藏，整個 Project 唯讀；既有成員可從 Archived Projects 查看，OWNER 可 restore。
- Archived Task 從一般 Board、List、Backlog、My Tasks 隱藏，可由 archived filter 搜尋與 restore。
- Comment 作者可修改自己的 Comment；作者或 Project OWNER 可刪除。
- 刪除 Comment 時清除正文並保留 tombstone、作者、時間與 Audit 脈絡。
- 刪除 ProjectLabel 可 hard delete label 與 TaskLabel joins，但不可影響 Task；操作必須 Audit。

## 5. 授權、Audit 與通知

### 5.1 Project roles

| 操作 | VIEWER | MEMBER | OWNER |
|---|---:|---:|---:|
| 讀取 Project、Board、Task、Label、Comment | 是 | 是 | 是 |
| 建立、更新、移動、封存/還原 Task | 否 | 是 | 是 |
| 建立 Comment、修改自己的 Comment | 否 | 是 | 是 |
| 管理 Label | 否 | 是 | 是 |
| 設定 Board columns | 否 | 否 | 是 |
| 管理 Project metadata 與 members | 否 | 否 | 是 |
| 封存/還原 Project | 否 | 否 | 是 |

- Project 固定使用 `VIEWER`、`MEMBER`、`OWNER`，不提供 custom roles。
- 所有 Project 都是 private；只有成員與系統 ADMIN 能發現或存取。
- 只有具備系統層 `PROJECT_CREATE` permission 的使用者可建立 Project；建立者自動成為 OWNER。
- 最後一位 OWNER 不可被移除或降級。
- 移除其他成員時，在同一交易解除該成員所有未完成 Task 的 assignee 並記錄 Audit。
- 系統 ADMIN bypass 與 Project role checks 在共用 domain/application service 實作；REST 與 MCP 不可複製分歧邏輯。

### 5.2 三層授權

- 所有業務 endpoint 使用 OIDC/JWT 或 M2M API Key 認證。
- 系統層 Permission 提供粗粒度 app gate；`PROJECT_READ` 控制進入 Project 功能，`PROJECT_CREATE` 控制建立 Project，Project metadata/archive 寫入另受 `PROJECT_UPDATE` 控制。MVP 不建立 `PROJECT_DELETE`。
- API key scopes 使用新 App identity：`projects-projects:read/write`、`projects-tasks:read/write`、`projects-labels:read/write`、`projects-comments:read/write`，notification inbox 沿用 `notifications:read/write`。
- Project membership/role 是所有 Project-scoped resource 的第二層授權。
- M2M/MCP write 必須解析 acting user；未綁定或停用 user 一律 fail closed。

### 5.3 Audit 與 notification

- Project、Member、BoardColumn、Task、Label、Comment 的主要 mutation 全部寫入 Audit Log。
- Audit 記錄 actor、API key/MCP context、entity、operation、AI operation metadata 與必要 changed fields。
- MVP 只發送 Task assignment/reassignment notification；不發送 Comment、due date、逾期或 status notification。
- 指派 notification 與 Task mutation 使用同一交易邊界，具備穩定 idempotency key，避免重複或 orphan notification。
- Locale switch 同時更新 frontend preference 與已登入 User 的 `preferredLocale`。Backend 依收件人的 persisted locale 產生 `zh-TW` 或 `en` notification；缺值時使用 `zh-TW`。
- MVP 不發布業務 domain events。未來出現 consumer 時，先依 [[043-cross-app-integration-contracts-plan]] 建立正式 capability/binding，再加入可靠 event。

## 6. REST 與 MCP

### 6.1 REST vocabulary

- App identity：`projects`
- REST resources：`/projects`、`/tasks`、`/labels`、`/comments`
- Project-scoped collection routes 必須能直接取得並驗證 Project context。
- Archive/restore 使用明確 action endpoints 或等價的明確 command，不以永久 `DELETE` 偽裝。
- Backend 回傳穩定 error code 與結構化參數；frontend 不直接顯示英文 exception message。

### 6.2 MVP MCP tools

Tool methods 呼叫與 REST/UI 相同的 application services 與 authorization rules。宣告名稱採 Task vocabulary，對外 canonical name 加上 `projects` prefix：

- Projects：list、get、create、update。
- Tasks：list、search、get、create、update、move。
- Comments：list、create。
- Labels：list、create、attach-to-task、detach-from-task。

Project/Task archive/restore、membership、Board settings、Comment edit/delete 與 Label delete 不開放為 MVP MCP tools。MCP 不註冊任何舊 Issue alias。

## 7. Production-grade UI/UX 與 i18n

### 7.1 UI/UX release gate

可操作的 CRUD 不等於完成。以下全部是 release gate：

- Task-first 資訊架構、清楚一致的 navigation、spacing、typography、color、icon 與 interaction language。
- My Tasks、Project shell、Board、List、Backlog、Archived views 與 Task detail 具有一致 toolbar、filter、search、quick action 與 breadcrumbs。
- 完整 loading skeleton、empty、no-results、network error/retry、permission-denied 與 mutation feedback。
- Inline validation、required/optional 標示、未儲存變更保護、duplicate-submit 防護與明確 pending state。
- 可安全的 mutation 使用 optimistic update 並支援失敗 rollback；高風險操作不做不可靠 optimistic update。
- Board drag-and-drop 提供 drop target、preview、auto-scroll、失敗復原，以及鍵盤/選單 move alternative。
- Semantic controls、ARIA、screen-reader labels、可見 focus、足夠對比與 reduced-motion support。
- 使用 template theme tokens、light/dark mode、既有 theme presets、lucide icons 與 `@appspine/frontend-shell`；業務元件不寫死主題色或重做 shared primitives。
- Desktop-first 高效率工作區，同時支援 tablet/mobile；窄螢幕 Board 可水平捲動，Task detail 選用適合 viewport 的 sheet/full-page。
- 長清單採 server-side pagination、incremental loading 或 virtualization，不一次載入全部 Task。
- Route、sheet、filter/search、locale switch 與 back/forward 保留合理操作 context。
- Visual QA 覆蓋真實資料量、長文字、空資料、錯誤、低權限、窄螢幕、兩種 locale、light/dark 與 keyboard flow；template placeholder 或陽春 CRUD 畫面直接判定未完成。

### 7.2 i18n release gate

- 第一版完整支援 `zh-TW` 與 `en`，預設 `zh-TW`。
- 所有 user-facing text 來自 locale messages：包含 labels、buttons、placeholder、tooltip、filters、empty/errors、validation、confirmation、toast、notification、page metadata 與 accessibility labels。
- Product name、使用者輸入、Project key、Task key 與外部原文不翻譯。
- Prisma enum 選項來自 `GET /metadata/schema`；翻譯 key 使用 `enums.<EnumName>.<VALUE>`，兩個 locale 由 fail-loud check 驗證完整對齊。
- 日期、相對時間、數字、複數與排序使用 locale-aware formatter；date-only due date 不因時區偏移一天。
- Locale switch 持久化 cookie 與 `User.preferredLocale`，並保留 route、Project、Task、filter 與安全的 UI context。
- Layout 容納兩種語言的長度，不用固定寬度或任意截斷隱藏翻譯問題。
- Missing key、raw key、hardcoded user-facing text、依賴 fallback 或只完成單一 locale 都是 release blocker。

## 8. 架構與 scaffold

### 8.1 技術基線

- Next.js frontend、NestJS backend、Prisma 與 PostgreSQL。
- 使用最新可用的 `appspine-app-template` 與現有 `@appspine/*` packages。
- 沿用 template frontend/backend topology、OIDC、RBAC、M2M API Key、Audit、metadata schema、MCP、health check、notification、domain-event wiring 與 frontend shell。
- domain code 留在 `apps/projects`，不把單一 App 專屬元件或 services 提前提升進 framework package。

### 8.2 Identity 與 ports

```text
directory/repo: apps/projects
scaffold --name: projects
display name: Projects
APP_NAME: projects
MCP_TOOL_PREFIX: projects
DB port: 23080
backend port: 3080
frontend port: 3081
```

先由 `appspine/appspine-app-template` 建立名為 `projects` 的新 repository，clone 到 workspace 的 `apps/projects`，再從新 clone 內執行：

```bash
cd apps/projects
node scripts/scaffold-init.mjs --name projects --display-name "Projects" --db-port 23080 --backend-port 3080 --frontend-port 3081
```

2026-08-08 已對目前 template 以相同參數執行 `--dry-run`，全部 replacement rules 驗證通過且未寫入檔案。正式執行前仍須在新 clone 再跑一次 `--dry-run`，並重新核對 workspace port table；建立 App 的同一批變更必須更新 port table、repo metadata 與 knowledge pointers。

## 9. 執行階段

### Phase 1 - Product design

- 完成 My Tasks、Project switcher、Board/List/Backlog、Archived views 與 Task detail 的 production-level UX specification。
- 定稿 responsive layouts、interaction states、keyboard flows、`zh-TW`/`en` vocabulary 與 error-code mapping。
- 以 Task vocabulary 完成 route、REST 與 MCP review。

### Phase 2 - Greenfield scaffold

- 從最新 template 建立獨立 repo/database/configuration。
- 設定 identity、ports、OIDC、RBAC、M2M、Audit、metadata、MCP、health、notification 與 frontend shell。
- 驗證乾淨空資料庫 bootstrap 與 template golden path。

### Phase 3 - Domain/API foundation

- 建立 Prisma models、constraints、indexes 與 initial migration。
- 實作 role/access service、Task placement、archive/restore、member removal、column deletion與 Comment tombstone transactions。
- 定義 REST DTOs、stable error codes、MCP inputs、permissions/scopes 與 Audit coverage。
- 加入 `User.preferredLocale` persistence 與 notification locale resolution。

### Phase 4 - Backend MVP

- 實作 Project、Member、BoardColumn、Task、Label、Comment modules。
- 實作 My Tasks、Board/List/Backlog、global/project search 與 archived queries。
- 實作 ordering/rebalance、Audit、assignment notifications 與 MVP MCP tools。
- 完成 complex service unit tests、controller/authorization integration tests 與 API golden paths。

### Phase 5 - Frontend MVP

- 實作 production-grade application shell、My Tasks、Project workspace、Board/List/Backlog、Task detail 與 Archived views。
- 完成 drag-and-drop 及非滑鼠 move flow、forms、filters、search、member/label/column settings。
- 完成兩個 locale、enum parity、locale formatting、theme/responsive/accessibility 與所有 system states。
- 使用 focus/periodic refetch 同步他人變更，不加入 WebSocket/SSE。

### Phase 6 - Independent acceptance and launch

- 以全新空資料庫執行兩個 locale 的 golden path、security、MCP、Audit、notification、visual、responsive、keyboard 與 failure-path verification。
- 驗證 source/runtime/database 與舊 App 完全隔離。
- 完成 deployment、security、monitoring 與 recovery checks 後切換新產品入口。

### Phase 7 - `apps/project` decommission

- 只有在新 App 完成正式驗收並取得退役執行確認後才開始。
- 依第 11 節移除舊 runtime、integration、credentials、database、deployment、repo 與 workspace references。

## 10. 完成定義

### 10.1 Product/domain

- 空資料庫使用者能完成 Project -> Task -> move -> detail golden path，不需理解 Sprint/Issue Type。
- 每個 Project 自動建立且永遠只有一個 Board，placement invariants 於所有 mutation/concurrency 情境成立。
- Board、List、Backlog、My Tasks、search 與 Archived views 顯示一致資料。
- Project/Task archive/restore、member removal、column delete/move 與 Comment tombstone 不遺失資料且交易原子化。
- Project/Task key、private visibility、roles、system permissions 與 API key scopes 符合本計畫。
- REST/UI/MCP 共用 application services 與 Project authorization。
- Audit 與 assignment notification 在成功、失敗、重試、self-assignment、reassignment、archive 等邊界不重複、不遺漏、不產生 orphan target。

### 10.2 UI/UX/i18n

- UI 沒有 template placeholder、raw primitives 拼裝頁或僅能操作的陽春 CRUD flow。
- Desktop/tablet/mobile、light/dark、theme presets、長文字、真實資料量與所有主要 states 通過 visual/browser QA。
- Board 可使用 pointer、keyboard 或 move menu 完成相同行為，focus/ARIA/reduced-motion 正確。
- `zh-TW` 與 `en` 的核心流程、errors、validation、metadata、notifications 與 accessibility labels 完整可用。
- Locale 切換保留 context，backend notification 依 recipient persisted locale 產生；缺 locale 才 fallback `zh-TW`。
- Enum translation parity 與 missing/hardcoded/raw keys 由 CI/pre-commit fail loud 阻擋。

### 10.3 Greenfield isolation

- `apps/projects` 使用獨立 repo、DB、ports、deployment 與 credentials。
- schema 不含 Sprint、IssueType、Worklog 或舊 Issue models。
- source 不 import 舊 App，runtime 不呼叫舊 App 或讀取舊 DB。
- 不存在 migration/import、ID mapping、dual-write 或 compatibility adapter。
- 不註冊舊 Issue REST/MCP/scope/event aliases。
- 新 App 的 build、test、deploy、startup 與操作完全不需要 `apps/project`。

## 11. `apps/project` 退役與刪除

退役是本計畫的最後階段，但必須以獨立、可核對的 destructive checklist 執行：

1. 停止舊 runtime、workers 與排程。
2. 從入口、service discovery、MCP catalog、domain-event subscriptions 與跨 App references 移除。
3. 撤銷 API keys、OIDC client、secrets、webhooks、deployment、CI/CD 與監控。
4. 解析並再次確認舊 DB 的實際連線目標，確認沒有需保留的業務資料。
5. 直接刪除舊 DB、volumes 與 database credentials；不建立 dump、export、backup 或 read-only archive。
6. 移除舊 deployment resources、source repository 與 workspace checkout `apps/project`。
7. 更新 port table、knowledge indexes、contracts、deployment docs、monitoring 與所有殘留 references。
8. 執行全 workspace search、contract validation 與 knowledge lint，確認沒有有效依賴或失效連結。

舊 DB 與 source repository 刪除後沒有 rollback。Workspace knowledge base 只保留 044 與必要的退役歷史，不保留可執行舊程式。

退役完成條件：

- `apps/project` 不再出現在入口、discovery、MCP、部署或 workspace checkout。
- 舊 credentials、integrations、database、volumes、deployment 與 source repository 已移除。
- workspace 文件、ports、contracts 與監控沒有殘留有效依賴。
- `apps/projects` 可完全獨立運作。

## 12. 已拍板決策摘要

| 項目 | 決策 |
|---|---|
| App 建置 | 全新 `apps/projects` repo、DB、identity 與 deployment |
| 舊資料 | 不遷移、不匯出、不備份、不相容 |
| 舊 App 終態 | 新 App 驗收後完整刪除 `apps/project`、DB 與 repo |
| Project/Task 刪除 | MVP 只提供 archive/restore |
| Priority | nullable；`LOW`、`MEDIUM`、`HIGH`、`URGENT` |
| Project key | name 產生、建立時可調整、建立後不可修改 |
| Task key | `${PROJECT_KEY}-${sequence}`，永久唯一且不重用 |
| My Tasks | 預設自己的未完成 Task；Planned、Done、All filters |
| My Tasks 排序 | 逾期、priority、due date、建立時間 |
| WIP limit | MVP 不做，schema 不預留 |
| 通知 | 只做 assignment/reassignment，依 recipient locale |
| Domain events | 沒有正式 consumer/contract 前不發布 |
| Due date | date-only |
| Description/Comment | Markdown 原文加安全轉譯 |
| Assignee | 每個 Task 最多一位，必須是 Project member |
| 移除 member | 自動解除未完成 Task assignee，與 Audit 同交易 |
| 刪除非空 column | 指定目標 column/Backlog，搬移與刪除同交易 |
| Label | Project-local，name 不分大小寫唯一 |
| Comment delete | 保留 tombstone 與 Audit 脈絡 |
| Task detail | 固定 URL；context navigation 用 sheet，直接造訪用 full page |
| Project archive | 一般清單隱藏、全案唯讀、members 可查看、OWNER 可還原 |
| Project roles | 固定 `VIEWER`、`MEMBER`、`OWNER` |
| Project visibility | private，只有 members 與系統 ADMIN 可發現/存取 |
| Create Project | 需要 `PROJECT_CREATE`，creator 成為 OWNER |
| 通用 quick-create | 預設 Backlog；column 內建立則進入該 column |
| Search | global + Project，依 private Project access 過濾 |
| Board | 每 Project 一個；OWNER 可自訂 columns，至少一個 active/done |
| Realtime | MVP 不做 WebSocket/SSE；使用 immediate local update + focus/periodic refetch |
| UI/UX | Production-grade 是 release gate，陽春 CRUD 不算完成 |
| i18n | `zh-TW` + `en`，預設 `zh-TW`，missing/hardcoded text 是 release blocker |

## 13. 執行準備

本計畫沒有剩餘產品待決項。執行工作已拆分於 [log.md](../log.md)，涵蓋：

- template/scaffold baseline 與 repo/port 建立
- UX specification 與 visual QA fixtures
- Prisma/domain/authorization transactions
- REST/MCP/error-code contracts
- notification locale persistence
- frontend/i18n/accessibility/responsive work packages
- security、E2E、MCP、Audit、notification 與 greenfield isolation gates
- `apps/project` destructive decommission checklist

執行前 freeze artifacts：

- [log.md](../log.md)
- [log.md](../log.md)
- [log.md](../log.md)
- [log.md](../log.md)

欄位長度、pagination defaults、refetch interval、fixture volume 與具體元件選型屬 implementation-level decisions，由 task breakdown 依 [[002-app-dev-conventions|App development conventions]] 與實測決定，不得擴張本計畫的產品範圍。

## 14. 相關文件

- [[001-app-framework-plan|App framework plan]]
- [[002-app-dev-conventions|App development conventions]]
- [[043-cross-app-integration-contracts-plan|Cross-app integration contracts]]
- `appspine-app-template/README.md`
- `apps/project/README.md`（僅供退役前盤點）
