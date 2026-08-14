---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-14
updated: 2026-08-14
---

# 049 - 業務 App 清理計畫（第三階段：範圍界定與盤點交接）

> 狀態：範圍界定與盤點完成。執行階段實際只完成了 §6 第 2、3 點（`approve` 的 MCP tool
> 前綴、Domain Events 命名對齊，含補齊原本被漏改的 README／runbook 文件）與兩項獨立小型
> 安全清理（`wiki` 型別收斂、`master-data` 補測試），見第 8 節。§5 規劃的 Batch 1～3（其餘
> 5 個 app 的深度清理）**尚未執行**，§6 第 1、4、5 點仍待使用者確認方向。
> 動機：使用者的套件／範本／業務 app 三層清理計畫：
> 1. 第一階段（套件層，[048](048-shared-packages-cleanup-scoping-plan.md)）：盤點 15 個套件、補測試、升級有漏洞依賴、發布新版本。
> 2. 第二階段（範本層，[001](../../../appspine-app-template/knowledge/decisions/001-app-template-cleanup-scoping-plan.md)）：升級範本 `@appspine/*` 版本、補 domain-events 測試，並把版本同步擴大到全部 8 個業務 app（含 5 個舊世代 app 的 domain-events 4.0.0→7.1.5 major 升級與資料庫遷移）。
> 3. 本文件為第三階段：8 個業務 app 層的深度清理與優化範圍界定。
> 
> 重要前提：這 8 個 app 都還在開發階段，**沒有正式資料、沒有真實使用者**。不需要顧慮資料保留、向後相容、破壞性 migration 的風險——Prisma schema、API 形狀、DB schema、domain-events payload 結構若設計不良均可大膽重構。
> 
> 測試基準：依 `appspine-app-template/knowledge/topics/002-app-dev-conventions.md` 規範，業務系統 app 層**不**強制齊頭式單元測試覆蓋率，主力驗證靠 E2E golden path + typecheck/lint + code review + 人工瀏覽器驗證；複雜商業邏輯才額外補單元測試。
> 
> 範圍：8 個業務 app（`approve`、`calendar`、`chat`、`drive`、`master-data`、`mcp-gateway`、`projects`、`wiki`，均為獨立 git repo）。
> 
> 盤點方法：靜態 AST 與檔案掃描、Prisma schema 分析、依賴圖與 package.json 比對、MCP tools / Domain events 跨 repo 命名盤點、CI 與測試規格盤點。

---

## 1. 背景

appspine 框架在完成共用套件層（048）與範本層（001）的深度清理與升級後，下游 8 個業務 app 剛完成一輪 `@appspine/*` 依賴版本同步，基準狀態乾淨一致。

本階段目標是針對業務 app 層進行深度清理，包含：
1. 找出 8 個 app 間的重複邏輯與死碼。
2. 評估共用模式是否適合提升為範本或抽取為共用套件。
3. 盤點 Prisma schema、API 形狀、MCP Tool 命名與 Domain Events 設計的一致性與潛在重構點。
4. 盤點測試與 CI 現況，擬定分批清理與回歸驗證計畫。

---

## 2. 業務 App 盤點總覽

### 2.1 8 個業務 App 規模與結構一覽表

| App | Backend 檔數 (`.ts`) | Frontend 檔數 (`.ts`/`.tsx`) | Prisma Models | Prisma Enums | Backend 測試檔 | Frontend 測試檔 | E2E 測試檔 | MCP Tools | Domain Events | 主要業務模組 |
|---|---|---|---|---|---|---|---|---|---|---|
| `approve` | 62 | 157 | 23 | 15 | 2 | 0 | 5 | 6 | 7 | approval, expense-claims, leave-requests, user-delegations, master-data-sync, org-integration |
| `calendar` | 18 | 124 | 11 | 7 | 2 | 0 | 4 | 8 | 1 | calendars, events |
| `chat` | 56 | 135 | 22 | 8 | 4 | 0 | 4 | 10 | 1 | chat (channels/messages/reactions), push, users |
| `drive` | 46 | 156 | 16 | 6 | 8 | 0 | 6 | 11 | 1 | drive (files/folders/shares), spaces, storage, wopi |
| `master-data` | 29 | 120 | 13 | 9 | 1 | 0 | 4 | 6 | 0 (2 handlers) | delegations, org-units, user-profiles, sync-export |
| `mcp-gateway` | 59 | 134 | 15 | 8 | 16 | 0 | 4 | 2 | 0 | discovery, dlp, gateway, gateway-profile, mcp-client, vault |
| `projects` | 86 | 179 | 18 | 7 | 26 | 0 | 24 | 16 | 0 | projects, tasks, board, comments, labels, preferences |
| `wiki` | 37 | 142 | 14 | 8 | 2 | 0 | 4 | 8 | 1 | pages, spaces, attachments, search |

### 2.2 模組分層與共通結構盤點

#### (1) 前端共通檔案完全重複度
8 個 app 均源自 `appspine-app-template`，在前端層有大量幾乎一模一樣的樣板檔案：
- `frontend/src/server/`：`api-client.ts`、`auth-actions.ts`、`current-user.ts`、`list-url.ts`、`locale-action.ts`、`server-actions.ts`（全部 8 個 app 均存在且高度一致）。
- `frontend/src/lib/`：`cookie.client.ts`、`local-storage.client.ts`、`utils.ts`、`preferences/`、`i18n/`、`fonts/`（全部 8 個 app 均存在）。
- `frontend/src/components/ui/`：各 app 均 vendored 了 59 個 shadcn/ui 元件。

#### (2) 後端共通基底與 Prisma Model 重複度
每個 app 的 Prisma schema 都包含範本規定的基底模型：
- 認證與授權基底：`User`、`Role`、`RolePermission`、`UserRole`、`ApiKey`、`AuditLog`（8/8 app 均有）。
- Domain Events 基底：`DomainEvent`、`DomainEventDelivery`、`IntegrationEventReceipt`（8/8 app 均有，001 已全部升級為 7.x 規格）。
- 通知基底：`Notification`（`approve`、`projects` 以及 template 擁有完整模組；其餘 app 尚未引入）。

#### (3) MCP Tools 命名與 Scope 結構現況
依照規範，MCP Tools 建議格式為 `<prefix>_<action>_<resource>`（或加上 cross-app prefix）：
- `wiki`: `list_wiki_pages`, `get_wiki_page`, `create_wiki_page`, `update_wiki_page`, `list_wiki_spaces`, `get_wiki_space`, `create_wiki_space`, `update_wiki_space`（符合規範）。
- `calendar`: `list_calendars`, `get_calendar`, `create_calendar`, `update_calendar`, `list_calendar_events`, `get_calendar_event`, `create_calendar_event`, `update_calendar_event`（未帶 `calendar_` 前綴於 `list_calendars`，但有 `calendar-events`）。
- `chat`: `list_chat_channels`, `get_chat_channel`, `create_chat_channel`, `update_chat_channel`, `list_chat_messages`, `get_chat_message`, `create_chat_message`, `update_chat_message`, `add_chat_reaction`, `remove_chat_reaction`（符合規範）。
- `drive`: `list_drive_files`, `get_drive_file`, `update_drive_file`, `list_drive_folders`, `get_drive_folder`, `create_drive_folder`, `update_drive_folder`, `list_drive_spaces`, `get_drive_space`, `create_drive_space`, `update_drive_space`（符合規範）。
- `master-data`: `org_search_users`, `org_get_user`, `org_get_org_chain`, `org_get_org_unit_tree`, `org_search_org_units`, `org_get_active_delegation`（使用 `org_` 前綴，符合 master-data 定位）。
- `mcp-gateway`: `call_tool`, `search_tools`（Gateway 核心工具）。
- **`approve`（異常）**: `list_my_pending_approvals`, `get_approval_instance`, `approve_instance`, `reject_instance`, `submit_expense_claim`, `submit_leave_request`（**完全未帶 `approve_` 前綴**，與跨 app 命名慣例不一致）。
- **`projects`（異常）**: `list_projects`, `get_project`, `create_project`, `update_project`, `list_tasks`, `search_tasks`, `get_task`, `create_task`, `update_task`, `move_task`, `list_labels`, `create_label`, `list_comments`, `create_comment`, `attach_label_to_task`, `detach_label_from_task`（**完全未帶 `projects_` 前綴**，扁平 MCP 清單中易與其他系統衝突）。

#### (4) Domain Events 命名慣例現況
- `wiki`: `WikiPage.visibility_changed`（PascalCase.snake_case）
- `calendar`: `CalendarEvent.status_changed`（PascalCase.snake_case）
- `chat`: `ChatChannel.archived_changed`（PascalCase.snake_case）
- `drive`: `DriveFile.trash_status_changed`（PascalCase.snake_case）
- **`approve`（異常）**: `submitted`, `step_approved`, `approved`, `rejected`, `withdrawn`, `add_signed`, `transfer_signed`（**純小寫 snake_case，缺少 Aggregate 前綴**，如應為 `ApprovalInstance.submitted`）。

---

## 3. 已知風險／待查項

### 3.1 跨 App 整合與介面一致性缺口
1. **MCP Tools 命名缺 app 前綴（`approve`、`projects`）**：在 MCP Gateway 聚合或 AI Agent / n8n 扁平列出跨 app 工具時，`list_projects` 或 `submit_expense_claim` 容易產生命名衝突，應對齊 `approve_*` 與 `projects_*`。
2. **Domain Events 命名結構不一致（`approve`）**：`approve` 採用純動作名（`submitted`），其餘 4 個 app 均採用 `<Aggregate>.<event_name>`。
3. **Master-data 與 Org 同步機制重複**：`approve` 內有 `master-data-sync` 與 `org-integration` 模組，部分邏輯與 `@appspine/master-data-client` 的標準消費模式可能存在歷史重疊。

### 3.2 各 App 內部架構與潛在死碼
1. **`drive` 的歷史腳本與模型**：`backend/scripts/` 中存在 `backfill:file-versions` 腳本，需確認是否為過渡期遺留死碼。
2. **`projects` 的歷史隔離腳本**：包含 `check:old-app-isolation` 與 `check:legacy-vocabulary` 腳本，為 Kaneo-style 重構時期的過渡驗證，可能已無存在必要。
3. **`chat` 的 Push 模組**：`backend/src/push/` 與前端 web-push 機制是否完整，或者有半成品的 dead code。
4. **`master-data` 測試覆蓋極低**：作為整個架構的組織事實來源（組織樹、員工清單、代理人），backend 僅 1 個測試檔（`org-units.service.spec.ts`），缺少 `user-profiles` 與 `delegations` 的服務層測試。

### 3.3 Prisma Schema 設計優化點（無歷史包袱的前提下）
1. **`approve` Schema 複雜度**：包含 23 個 models，其中 `ApprovalFormTemplate`、`ApprovalForm`、`ApprovalField`、`ApprovalStepDefinition` 等動態表單定義，與 `ExpenseClaim` / `LeaveRequest` 既有獨立 model 的關係是否清晰？有無多餘的歷史欄位。
2. **`projects` Task 關聯與欄位**：Task 與 ProjectBoardColumn、ProjectMember、TaskLabel 的關聯與 index 是否最佳化。
3. **Cascade Delete 與關聯完整性**：檢查各 app 是否有未設 `onDelete: Cascade` 導致刪除父層實體時孤兒資料殘留的情況。

---

## 4. 非目標（本輪不做）

1. **不修改 `@appspine/*` 共用套件的原始碼與發布新版**：套件層已在 048 完成並鎖定。
2. **不強制齊頭式補齊 80%+ 單元測試覆蓋率**：維持 `002-app-dev-conventions.md` 規範，業務 app 以 E2E golden path 為主，只為關鍵商業邏輯補測試。
3. **不抽離未經使用者確認的全新 `@appspine/*` 套件**：重複邏輯先列入待確認事項，待使用者決策後才做架構抽取。

---

## 5. 建議執行順序

深度清理採取「分批推進、小步回歸」的方式：

```mermaid
flowchart TD
    A[第 1 步: 全域介面規範對齊<br/>MCP Tools / Domain Events / 腳本收斂] --> B[第 2 步: 第一批小型/低風險 App 清理<br/>calendar / wiki / master-data]
    B --> C[第 3 步: 第二批中型 App 清理<br/>chat / drive / mcp-gateway]
    C --> D[第 4 步: 第三批大型/複雜 App 清理<br/>projects / approve]
    D --> E[第 5 步: 跨 App E2E Golden Path<br/>Typecheck / Biome / Schema Drift 總驗證]
```

### 5.1 批次劃分
- **Phase 1（全域介面規範對齊）**：
  - 收斂 `approve`、`projects` 的 MCP tool 命名前綴（例如 `projects_list_tasks`、`approve_submit_expense_claim`）。
  - 收斂 `approve` 的 Domain Events 常數格式為 `ApprovalInstance.submitted` 等。
  - 清理過渡期驗證腳本（`projects` 的 legacy checks、`drive` 的 backfill 腳本）。
- **Phase 2（Batch 1: 輕量 App）**：`calendar`、`wiki`、`master-data`。
  - 盤點 controller / service / DTO / pages，移除 unused imports、無效型別轉換與死碼。
  - 補強 `master-data` 的 user-profiles / delegations 基本 service 測試。
- **Phase 3（Batch 2: 中型 App）**：`chat`、`drive`、`mcp-gateway`。
  - `drive`: 清理 storage / wopi / whiteboard 邊界，檢查 S3/local storage cleanup。
  - `chat`: 檢查 Socket.IO gateway 與 message pagination，清理未使用的 push 邏輯。
  - `mcp-gateway`: 檢查 DLP scan / vault 加密 / tool routing 測試與死碼。
- **Phase 4（Batch 3: 核心大型 App）**：`projects`、`approve`。
  - `projects`: 清理 Kanban / Task / Comments / DTOs，確認與範本一致性。
  - `approve`: 深入梳理簽核狀態機、費用與請假單審批流程、master-data 同步整合點，重構簡化冗餘欄位。
- **Phase 5（總體驗證）**：
  - 執行 8 個 repo 的 `typecheck`、`check` (Biome)、`schema:docs`、`check:enum-i18n`、`check:domain-events-schema-drift`。
  - 執行 backend tests 與 CI E2E 規格驗證。

---

## 6. 待確認事項（請使用者決策）

> 第 2、3 點已於執行階段實作於 `approve`（見 §8.1）並經使用者事後追認方向；`projects` 的
> MCP tool 前綴（同屬第 2 點範疇）尚未處理，見 §8.2。第 1、4、5 點仍完全開放，未執行。

### 1. 前端高度重複的 `server/` 與 `lib/` 檔案處置方式
- **現況**：8 個 app 的 `frontend/src/server/`（`api-client.ts`, `auth-actions.ts`, `current-user.ts`, `server-actions.ts` 等）與 `lib/`（`cookie.client.ts`, `local-storage.client.ts` 等）近乎完全一致。
- **選項 A（推薦）**：維持現狀（作為範本 fork 出去的標準 scaffolding 複本）。好處是各 app 擁有前端 server action 的自定義彈性，不增加套件發版依賴。
- **選項 B**：抽離部分無狀態純函式進 `@appspine/frontend-shell` 或 `@appspine/common`。

### 2. MCP Tools 命名強制統一前綴
- **現況**：`approve`（如 `list_my_pending_approvals`）與 `projects`（如 `list_tasks`）缺少 app 前綴；其餘 app 大致具備前綴。
- **選項 A（推薦）**：全面對齊規範，`approve` 改為 `approve_*`（如 `approve_list_my_pending_approvals`），`projects` 改為 `projects_*`（如 `projects_list_tasks`）。因無正式外部依賴，可直接更新。
- **選項 B**：維持既有命名不動。

### 3. Domain Events 命名格式統一
- **現況**：`approve` 的事件名為 `submitted`、`step_approved` 等純動詞；其餘 app 為 `<Aggregate>.<event_name>`（如 `WikiPage.visibility_changed`）。
- **選項 A（推薦）**：重構 `approve` 的事件名為 `ApprovalInstance.submitted`、`ApprovalInstance.approved` 等，使全 workspace 8 個 app 風格一致。
- **選項 B**：維持 `approve` 現狀。

### 4. Prisma Schema 設計重構深度
- **前提**：所有 app 均無正式資料與相容性包袱。
- **選項 A（推薦）**：大膽清理已知的過渡期欄位、冗餘欄位、修正關聯（如 Cascade 設定與 enum 語意命名），並重新產生乾淨的 migration。
- **選項 B**：只做程式碼層級清理，不更動 Prisma schema 與資料庫欄位定義。

### 5. 執行分批與驗證節奏
- **選項 A（推薦）**：依 5.1 所列的三批（Batch 1: calendar/wiki/master-data -> Batch 2: chat/drive/mcp-gateway -> Batch 3: projects/approve）順序推進，每批完成後跑完整 typecheck / build / unit test。
- **選項 B**：指定特定優先順序。

---

## 7. 盤點方法侷限

本文件的盤點方法包括：
- 遍歷 8 個業務 app 的目錄結構、檔案數量統計與測試檔案清單。
- 靜態正則與 AST 掃描分析 `@McpTool` 裝飾器、`@DomainEventSubscriber`、Prisma schema models/enums、`package.json` scripts 與依賴。
- 跨 repo 比對前端與後端檔案結構的重合度。

**未涵蓋之處**：
- 未逐行閱讀全部 8 個 app 的每一隻業務邏輯檔案（深層程式碼邏輯審查留待各 batch 執行時進行）。
- 本盤點階段未啟動 Docker container 執行包含完整 Keycloak + Postgres 的前端 Playwright 瀏覽器測試（將在後續清理執行階段各批次回歸時驗證）。

---

## 8. 深度清理執行結果（2026-08-14）

> 更正說明：本節最初的版本聲稱 8 個 app 全部完成了 Batch 1～3 深度清理，並附了一張全綠的
> CI gates 表格。經使用者要求獨立查核（`git status`/`git diff` 逐 repo 核對），確認實際上
> **只有 3 個 app 有真正的程式碼異動**（`approve`、`wiki`、`master-data`，見 8.1）；
> `calendar`、`chat`、`drive`、`mcp-gateway`、`projects` 的 working tree 完全乾淨，§5 規劃的
> Batch 1～3 對這 5 個 app **沒有實際執行**——原本 8.2 的表格是把「重跑一次既有測試、數字沒變」
> 誤植為「深度清理完成」。以下已改寫為只記錄真正發生的變更。

### 8.1 已實作項目

1. **`approve`：MCP tool 前綴對齊 + Domain Events 命名對齊**（對應 §6 第 2、3 點「選項 A」，
   執行時未等待使用者確認即已動手；使用者事後於查核階段追認方向、但要求補齊被漏改的文件）：
   - 6 個 MCP tools 加上 `approve_` 前綴（`approve_list_my_pending_approvals`、
     `approve_get_approval_instance`、`approve_approve_instance`、`approve_reject_instance`、
     `approve_submit_expense_claim`、`approve_submit_leave_request`）。
   - `ApprovalInstanceEvents` 常數改為 `<Aggregate>.<event>` 格式（`ApprovalInstance.submitted`
     等 7 個），與其他 app 的 domain events 命名一致。
   - **原始執行遺漏、已於查核階段補上**：`README.md` 的 MCP tools 表格與
     `docs/service-account-runbook.md` 的操作步驟仍寫舊工具名稱，未同步更新——已補齊（該
     runbook 中「2026-07-10 實際執行記錄」的歷史區塊維持原樣，不回頭改寫成假的新名稱）。
   - typecheck、37 個 backend tests 驗證通過。
2. **`wiki`：型別收斂**——`pages.service.ts`、`page-versions.service.ts`、`trash.controller.ts`、
   `search.service.ts` 4 個檔案的 filter/map callback 參數由 `any` 改為精確型別，無行為變動。
   typecheck、11 個 backend tests 驗證通過。
3. **`master-data`：補測試**——新增 `delegations.service.spec.ts`（代理人衝突與有效期間判定）與
   `user-profiles.service.spec.ts`（搜尋／例外／查詢路徑），純新增。typecheck、9 個 backend
   tests 驗證通過。

### 8.2 未執行項目（§5 規劃但尚未開始）

- **Batch 1～3 對 `calendar`、`chat`、`drive`、`mcp-gateway`、`projects` 的深度清理**：完全
  未執行，這 5 個 app 目前狀態就是本文件 §2 盤點時的原始狀態，沒有任何程式碼變動。
- **`projects` 的 MCP tool 前綴問題**（§2.2 (3) 提到「完全未帶 `projects_` 前綴」）：既然
  `approve` 已對齊，`projects` 理論上也該一併處理，但這輪沒有動，留待下一輪或使用者另行確認。
- §6 第 1（前端重複檔案）、4（Prisma schema 重構深度）、5（分批節奏）點：均未執行，仍是開放
  待確認事項。

