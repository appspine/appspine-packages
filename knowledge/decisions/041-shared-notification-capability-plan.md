---
type: decision
scope: cross-repo
status: active
created: 2026-08-05
updated: 2026-08-05
supersedes: null
superseded_by: null
---

# 041 - Shared Notification Capability 正式實作計畫

> 狀態：**已定案，執行中（framework package 已完成，consumer rollout 待 release gate）**。本計畫把先前的通知能力探索收斂成 Phase 1 正式實作範圍；逐項工作、
> 依賴與驗收方式見 [log.md](../log.md)。
>
> 核心決定：以 Approve 為 reference implementation，建立 app-local
> `@appspine/notification` 後端套件與 `@appspine/frontend-shell/notification` 前端 subpath，
> 再以 Project issue assignment 作第二個 consumer。此計畫不建立中央 Notification app，
> 也不實作 email、Teams、Slack、webhook、template database、preferences 或 digest。

---

## 1. 決策摘要

appspine 的通知能力採「共用 contract、各 App 自有資料」模式：

```text
Approve DB ── Notification rows ── Approve inbox
Project DB ── Notification rows ── Project inbox
Future App DB ── Notification rows ── Future App inbox

                  shared backend behavior
                    @appspine/notification

                  shared frontend primitives
             @appspine/frontend-shell/notification
```

正式決策如下：

1. 每個 business app 保有自己的 notification table、migration、API authorization、資料生命週期
   與 deployment lifecycle。
2. `@appspine/notification` 提供 transaction-aware、idempotent 的建立、查詢與狀態修改能力，
   不包含 React/Next.js，也不擁有來源 app 的 event catalog、recipient rule 或 route。
3. `@appspine/frontend-shell/notification` 提供 headless/低耦合 bell、badge、recent dropdown 與
   polling hook，不硬編碼 API endpoint。
4. Approve 的既有通知是 reference implementation；Project 的 issue assignment 是第二個、
   不同 domain 的驗證 consumer。
5. `notify()` 同時支援 caller-provided transaction 與一般 Prisma client；不強制所有通知都透過
   Domain Events。
6. 每個通知必須有 caller-provided `idempotencyKey`，並以
   `unique(recipientUserId, idempotencyKey)` 防重。
7. Phase 1 只建立 `Notification`。In-app inbox 不建立 `NotificationDelivery`；外部 channel 的
   delivery model 與 worker 留給後續獨立計畫。
8. 不把 `notifyRole()`／`notifyOrgUnit()` 放進 core。來源 app 先解析並 snapshot recipients，
   再呼叫 `notifyMany()`。
9. `Notification` 不是 audit log。不可依賴通知表保存法遵或不可變業務紀錄；該責任仍由
   `@appspine/audit-log` 與來源 app 負責。
10. Phase 1 的功能範圍雖然只到 bell/recent dropdown，但 UI/UX 必須達 production quality；
    placeholder、unstyled list、只處理 happy path 或「能操作就算完成」不符合驗收。

### 1.1 決策分類

為避免把「未實作」誤寫成「尚未決定」，041 將狀態分成三類：

- **本計畫已決定**：app-local topology、Phase 1 只做 in-app、Approve + Project、template 預設
  scaffold、rendered title/body snapshot、polling、backend/frontend package 邊界、transaction、
  idempotency 與 ownership contract。執行者不得在 task 中自行改回中央 app、email-first 或
  event-only notification。
- **刻意延後，不阻擋 041**：external delivery、preferences/digest、retention/purge、central app、
  realtime transport。它們不列入 041 完成條件，出現真實需求時各自另開 decision plan。
- **執行時 gate，不是產品待決**：欄位最大長度、migration 採單次或 expand/contract、package
  實際初始版本、scope 字串與 Project occurrence key 的最終格式。這些必須在對應 task 先實查、
  留證據，再進入後續工作包，不能默認或散落在 implementation 中。

---

## 2. 實查基線

### 2.1 Approve 已有可運作的第一版

目前 `apps/approve` 已具備：

- `backend/prisma/schema/approve.prisma` 的 `ApprovalNotification` model，映射
  `approval_notifications` table。
- `backend/src/notifications/` 的 list、unread count、mark read、mark all read API。
- `frontend/src/app/(main)/dashboard/_components/sidebar/notification-bell.tsx` 的 bell、最近十筆
  dropdown 與 30 秒 unread polling。
- approval state machine 在同一個 Prisma transaction 中寫入通知，確保業務狀態與通知同步提交。

現況不足：

- model 只有 `type/title/instanceId/isRead`，無通用 source、target、category、severity 與 archive。
- 使用 Boolean `isRead`，沒有實際 read timestamp。
- 沒有 idempotency key，package 化或 event retry 後可能重複建立。
- `markRead` 先查 ownership 再 update，可改為單一 ownership-bound mutation。
- bell 與 API client 是 Approve-local，尚未驗證跨 app 重用。

### 2.2 Domain Events 已解決上游可靠觸發

`@appspine/domain-events` 已提供 transaction-bound event recording、subscriber registry、
claim-and-lock、retry/backoff、stale-lock reclaim 與 dead-letter。041 不重做這些機制。

責任鏈固定為：

```text
business transaction
  ├─ 直接建立 Notification（需要原子性/read-your-writes）
  └─ 或記錄 DomainEvent -> subscriber 建立 Notification（非同步衍生效果）

Notification -> app-local inbox
```

本計畫沒有 external channel，因此尚不需要第二段 delivery worker。

### 2.3 Project 適合作為第二個 consumer

`apps/project` 的 `ProjectIssue` 已有 nullable `assigneeId`，create/update 都在
`IssuesService` 處理，且 create 已使用 transaction 產生 issue sequence。它能驗證 Approve 以外的：

- 新 app 從零導入標準 Notification schema，而非相容既有 table。
- create 與 reassignment 兩種 notification occurrence。
- self-assignment 不通知、assignee 未變更不通知、解除指派不通知等產品規則。
- 共用 bell 對不同 entity route 的 callback 能力。

Project 的 Phase 1 事件定為 `project.issue.assigned`，不在本計畫同時加入 comment mention、
due-date reminder 或 sprint 通知。

---

## 3. 目標與非目標

### 3.1 目標

- 建立並發布 `@appspine/notification`。
- 在 `@appspine/frontend-shell` 新增 `./notification` export subpath。
- 用 DMMF drift checker 維持 consumer schema 與 package contract 一致。
- 將 Approve 遷移到共用 contract，保留既有資料、transaction 與 UI 行為。
- 在 Project 實作 issue assignment notification，證明第二個 domain 可重用。
- 在 `appspine-app-template` scaffold 標準 schema、backend wiring、pre-commit drift check 與 bell。
- 補齊 backend unit、schema drift、frontend component/hook 與兩個 consumer 的 E2E 驗證。
- 交付具完整互動狀態、響應式、light/dark、i18n、accessibility 與實機視覺 QA 的 production-grade
  bell/recent notification experience。

### 3.2 非目標

- `apps/notification` 中央 app 或跨 app inbox。
- Email、Teams、Slack、webhook delivery。
- `NotificationDelivery`／`NotificationDeliveryAttempt`、retry worker 或 dead-letter UI。
- Database-editable templates、template admin UI。
- User preferences、quiet hours、org-policy precedence、digest。
- WebSocket、SSE、browser push 或 mobile push；Phase 1 維持 polling。
- 將所有既有 business apps 都加上空的 Notification table。
- Org/role recipient resolution helper。
- 把 Notification 當 audit log 或 workflow state。
- Retention/purge worker；在 general rollout 或外部 delivery 前另開 follow-up 定案。

任何上述非目標若在執行中出現需求，必須另開 plan，不得塞入 041 task 造成範圍膨脹。

---

## 4. Backend Package 設計

### 4.1 Package 與依賴方向

新增：

```text
appspine/packages/notification/
  src/
  docs/prisma-model.md
  package.json
  tsconfig.json
  tsconfig.build.json
```

Package 採用與 `domain-events` 相同的 backend package 方向，peer dependencies 只包含必要的：

- `@appspine/common`
- `@nestjs/common`
- `@nestjs/core`
- `@prisma/client`
- `zod`

Core package 不直接依賴 `@appspine/auth`、`@appspine/rbac`、`@appspine/m2m-api-key` 或
`@appspine/frontend-shell`。Current principal、permission 與 API scopes 由各 consumer controller
處理，避免 notification package 決定不同 app 的 authorization policy。

預期 exports：

```text
@appspine/notification
@appspine/notification/testing
```

### 4.2 Runtime contract

建議輸入型別：

```ts
interface CreateNotificationInput {
  recipientUserId: string;
  idempotencyKey: string;
  type: string;
  category?: string;
  severity?: "info" | "success" | "warning" | "critical";
  title: string;
  body?: string;
  sourceApp: string;
  sourceEventId?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  targetPath?: string;
}

interface NotifyOptions {
  tx?: NotificationTxClient;
}
```

`NotificationTxClient` 使用 structural typing，不從 consumer 的 generated Prisma Client 匯入型別。
一般 `PrismaService` 與 `Prisma.TransactionClient` 都能滿足 package 所需的 notification delegate。

公開方法：

```ts
notify(input, options?): Promise<NotificationRecord>
notifyMany(inputs, options?): Promise<NotificationRecord[]>
getInbox(recipientUserId, query): Promise<PaginatedResult<NotificationRecord>>
getUnreadCount(recipientUserId): Promise<{ count: number }>
markRead(notificationId, recipientUserId): Promise<NotificationRecord>
markAllRead(recipientUserId): Promise<{ count: number }>
archive(notificationId, recipientUserId): Promise<NotificationRecord>
```

Package 提供 query/input Zod schema，但不提供綁定特定 permission/scope 的 controller。

### 4.3 Validation

最低 validation contract：

- 所有 ID、`idempotencyKey`、`type`、`sourceApp` 為 non-empty string。
- `idempotencyKey`、`type`、`category`、source 欄位有明確最大長度，防止無界索引與 payload。
- `title` 與 `body` 有最大長度；body 可省略。
- `targetPath` 若存在，必須是以 `/` 開頭的 app-local path，不接受 scheme-relative `//`、
  `http:`、`https:` 或其他外部 URL。
- `severity` 是 package-level string union，資料庫存 `String`，不新增 Prisma enum。
- `type` 與 `category` 是 app-owned namespaced string，例如 `project.issue.assigned`；新增 business
  notification type 不需要發布 package 新版本。

### 4.4 Transaction contract

- 呼叫者傳入 `tx` 時，所有 notification write 都使用該 client，package 不另開 transaction。
- 未傳 `tx` 時才使用注入的 `PrismaService`。
- `notifyMany()` 在傳入 transaction 時必須全批共用同一 transaction client。
- Package 不承諾分散式 exactly-once；它只在單一 app DB 內以唯一鍵提供 idempotent create。

### 4.5 Idempotency contract

資料庫唯一約束：

```text
unique(recipientUserId, idempotencyKey)
```

重複呼叫採 **first-write-wins**：回傳既有 row，不用第二次輸入覆寫 title、body、target 或 source
snapshot。這可避免 retry 因 template 或資料在兩次呼叫間變化而改寫使用者已看見的通知。

建議 key：

```text
Approve step activation:
  approve.step.activated:<stepId>:<recipientUserId>

Project issue create assignment:
  project.issue.assigned:create:<issueId>:<recipientUserId>

Project reassignment:
  project.issue.assigned:update:<issueId>:<updatedAt>:<recipientUserId>

Domain-event subscriber:
  <handlerKey>:<eventId>:<recipientUserId>:<notificationType>
```

### 4.6 Query 與 mutation safety

- Inbox 預設只回傳 `archivedAt = null`，依 `createdAt desc, id desc` 排序並使用既有 pagination
  contract。
- Unread count 條件固定為 recipient、`readAt = null`、`archivedAt = null`。
- `markRead`／`archive` 必須以 `id + recipientUserId` 放在同一個 mutation condition，不先查再改。
- 找不到或不屬於該 recipient 時統一回 Not Found，不能洩漏另一位使用者是否有該通知。
- `markAllRead` 只修改目前 recipient 未封存、未讀的 rows，回傳實際更新筆數。

---

## 5. Prisma Model Contract

標準 logical model：

```prisma
model Notification {
  id               String    @id @default(cuid())
  recipientUserId  String    @map("recipient_user_id")
  recipient        User      @relation("NotificationRecipient", fields: [recipientUserId], references: [id], onDelete: Cascade)
  idempotencyKey   String    @map("idempotency_key")
  type             String
  category         String?
  severity         String    @default("info")
  title            String
  body             String?
  sourceApp        String    @map("source_app")
  sourceEventId    String?   @map("source_event_id")
  sourceEntityType String?   @map("source_entity_type")
  sourceEntityId   String?   @map("source_entity_id")
  targetPath       String?   @map("target_path")
  readAt           DateTime? @map("read_at")
  archivedAt       DateTime? @map("archived_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  @@unique([recipientUserId, idempotencyKey])
  @@index([recipientUserId, archivedAt, readAt, createdAt])
  @@index([sourceApp, sourceEntityType, sourceEntityId])
  @@map("notifications")
}
```

Consumer 可以調整 relation name 與 physical table `@@map`，但 model/delegate name、package 使用的
欄位、唯一約束與查詢索引不可漂移。DMMF drift checker 的政策因此是：

- 嚴格檢查 model name、欄位型別/nullability/default/map、relation from fields、唯一鍵與索引欄位。
- 不強制 physical table name，允許 Approve 繼續映射 `approval_notifications`。
- 不強制 User model 反向 relation 欄位名稱。
- 另外提供純函式 unit tests，證明缺欄、錯型別、缺 unique、缺 index 都會被偵測。

Package 不注入 schema fragment。文件提供 model pattern，template scaffold 保存可生成 migration 的
實際 `.prisma` 檔，各 app 擁有自己的 migration。

---

## 6. Frontend Contract

`@appspine/frontend-shell/package.json` 新增：

```text
./notification
```

此 subpath 至少匯出：

- `NotificationSummary` view model
- `NotificationDataSource` callback interface
- `useNotificationPolling()`
- `NotificationBell`
- recent notification empty/loading/error primitives

設計約束：

- 不 import consumer 的 API client、route、i18n messages 或 generated type。
- Consumer 傳入 `loadUnreadCount`、`loadRecent`、`markRead`、`markAllRead`、`resolveHref`。
- Polling interval 預設 30 秒，可由 consumer 調整；unmount、tab hidden/visible 與 overlapping request
  必須有明確行為，至少不得在 unmount 後 set state 或同時累積無界 requests。
- Bell badge 超過 99 顯示 `99+`，保留鍵盤操作、ARIA label 與 dropdown focus semantics。
- Mark-read 失敗不阻擋 navigation；optimistic count 不得降到負數。
- Phase 1 不新增 full-page inbox；共用 recent dropdown 足以驗證 contract。Backend inbox API 仍保留，
  讓後續 consumer 能建立 app-local full-page inbox。

### 6.1 Production UX quality gate

「Phase 1 不做 full-page inbox」只限制功能範圍，不降低成品質量。Bell/dropdown 必須符合：

- **資訊層級**：未讀與已讀有清楚但不只靠顏色的差異；item 至少可呈現 type/severity icon、title、
  optional body、localized timestamp 與 unread indicator。長 title/body 必須截斷或換行合理，不能撐破
  dashboard shell。
- **完整狀態**：initial loading 使用不造成 layout shift 的 skeleton；empty state 有清楚文案與圖示；
  fetch/mark failure 有 non-blocking feedback 與 retry/recovery；mark-all pending 時避免重複提交；資料刷新
  不讓 dropdown 閃回空白。
- **互動品質**：server-rendered initial unread count 或等效 hydration input，避免登入後 badge 先顯示 0
  再跳動；mark one/all 使用 optimistic UI 時必須 rollback 或由下一次 refresh 正確收斂；navigation、
  dropdown close 與 read mutation 的順序一致且可預期。
- **響應式**：desktop、窄 sidebar、tablet 與 mobile viewport 都不溢出；dropdown width 受 viewport
  constraint，在 touch device 有足夠 hit target，不以 hover 作唯一提示。
- **Design system**：只使用 frontend-shell/shadcn design tokens 與既有 typography、radius、shadow、
  spacing；light/dark theme 都有足夠 contrast，不加入 consumer-specific magic color 或散落 CSS fork。
- **i18n/time**：所有文字由 consumer 提供 i18n；zh-TW/en 都要實測。時間以目前 locale/timezone 格式化，
  相對時間若使用，必須提供可讀的 absolute timestamp（例如 tooltip 或 accessible label）。
- **Accessibility**：鍵盤可完整操作；focus visible/focus restore 正確；ARIA label/live region 不重複朗讀；
  unread indicator、severity 與 error 不只靠顏色；respect reduced motion。
- **Performance**：recent list 有明確上限與 stable key；避免開啟 dropdown 時重複 waterfall；hidden tab
  不持續無意義 polling，恢復 visible 時 refresh；slow request 不覆蓋較新的 state。

必須用真實 dashboard integration 做視覺 QA，不接受只看 component unit test：

```text
Desktop + mobile
Light + dark
zh-TW + en
Loading + empty + unread/read mix + long content + 99+ + error/retry
```

Approve、Project、template fresh fork 都要保留 Playwright screenshot 或等效可重現證據。任何明顯
alignment、overflow、contrast、focus、z-index、scroll 或 hydration 問題都屬 release blocker。

---

## 7. Approve 遷移方案

### 7.1 Schema 相容

- Prisma model rename 為 `Notification`，physical table 保留 `@@map("approval_notifications")`，避免
  無價值的 table rename。
- 新增通用欄位、unique 與 indexes。
- 舊 `id` 保留。
- `userId` 遷移為 `recipientUserId`；physical column 可在 migration 中 rename，或以 `@map("user_id")`
  保留，最終選擇以 migration dry run 的最小風險方案為準，但 Prisma logical field 必須統一。
- `instanceId` backfill 到 `sourceEntityId`，`sourceEntityType = "ApprovalInstance"`、
  `sourceApp = "approve"`、`category = "approval"`、`severity = "info"`。
- 既有 row 的 `idempotencyKey = "legacy:" + id`，保證唯一且不假裝知道歷史 occurrence。
- `isRead = true` 的 row 將 `readAt` backfill 為 `createdAt`，因舊 schema 沒有真實閱讀時間；這是
  best-known historical approximation，migration 註解與執行紀錄必須誠實標示。
- 根據 `instanceId` 產生既有 detail route 的 `targetPath`；無 instance 的 row 保留 null。

Migration 必須先在 disposable database 套用並驗證 row count、unique、read/unread count 與 rollback
策略，再進正式 consumer commit。

### 7.2 Backend 遷移

- Approval state machine 的 notification writes 改呼叫 package service，傳入既有 `tx`。
- 每個 step activation occurrence 使用穩定 idempotency key；createMany fan-out 改為
  `notifyMany(..., { tx })`。
- Approve controller 保留 app-local route，scopes 改採 table-derived 命名
  `approval_notifications:read/write`（見 §16 命名決策修正）。
- List/unread/mark read/mark all read 改委派 package service；archive endpoint 可加入但 bell 不必在
  Phase 1 顯示 archive UI。
- Ownership mutation 改為 package 的 atomic condition。

### 7.3 Frontend 遷移

- 現有 local API adapter 保留，改把資料 mapping 成 `NotificationSummary`。
- Local `NotificationBell` 改用 shared component/subpath，保留 Approve i18n、30 秒 polling、最近十筆
  與 `/dashboard/approvals/:id` navigation。
- 不能把 Approve route 或 translation key 搬進 frontend-shell。

---

## 8. Project 第二個 Consumer

### 8.1 Notification policy

只實作 `project.issue.assigned`：

- Create issue 時有 assignee，且 assignee 不等於 actor：通知 assignee。
- Update issue 時 assignee 從 A/null 變成不同的 B，且 B 不等於 actor：通知 B。
- assignee 未改變：不通知。
- 解除指派：不通知。
- Self-assignment：不通知。
- 重新指派給曾經擔任 assignee 的 user：這是新的 occurrence，應通知；key 必須包含本次
  `updatedAt`。

通知 snapshot：

```text
type        = project.issue.assigned
category    = project
severity    = info
sourceApp   = project
entityType  = ProjectIssue
entityId    = issue.id
targetPath  = /dashboard/projects/<projectId>/issues/<issueId>
```

Title/body 由 Project 的 locale resources 或 app-owned formatter 產生，不進 package。

### 8.2 Transaction 與 API

- Issue create 的 Notification 與 issue row 在同一 transaction 建立。
- Reassignment 的 Notification 與 issue update 在同一 transaction 建立。
- Read APIs 使用 Project 自己的 permission/scopes，採 table-derived 命名
  `notifications:read/write`（見 §16 命名決策修正），並從
  current principal 解析 recipient ID。
- Project 使用同一套 shared frontend bell，但提供自己的 API callbacks、route resolver 與 i18n。

這個 consumer 的驗收重點不是畫面相同，而是 package 沒有依賴 Approve 的 model、route、event
type 或 transaction shape。

---

## 9. Template Scaffold

`appspine-app-template` 必須包含：

- backend dependency `@appspine/notification`
- 標準 `notification.prisma` 與 User relation
- schema drift check script 與 pre-commit wiring
- app-local NotificationsModule/Controller 範例，使用 template 的 permission/scope naming
- frontend notification data source adapter 與 shared bell wiring
- empty-state i18n keys
- agent guide/conventions 中的通知使用方式、idempotency/transaction 規則與禁止事項

Template 不產生示範通知、不 seed fake rows，也不加入任何 domain-specific producer。Fresh fork 的
bell 初始顯示空狀態，應能通過 auth/rbac/M2M E2E 與 backend/frontend build。

本計畫不把 template 變更 replay 到所有既有 apps。Approve 與 Project 是明確 consumer；其他 app
只有在出現真實 notification use case 時才依 template-sync 流程導入。

---

## 10. Security、Privacy 與 Operability

### 10.1 Authorization

- HTTP client 不得傳入任意 recipient ID 來讀或改通知。
- Controller 從 `resolveActingUserId()` 取得 current principal，M2M scope 與 app permission 仍必須
  同時通過。
- 不屬於 current recipient 的 notification 對 read/archive mutation 一律回 Not Found。

### 10.2 Content policy

- Notification title/body 只存使用者完成工作所需的最小 snapshot。
- 不存 access token、secret、完整表單 payload、附件內容或不必要的個資。
- Deep link 使用 app-local relative path，不接受外部 URL，降低 open redirect 風險。
- Notification 不是 audit record；若通知被刪除或日後套用 retention，不影響法遵證據。

### 10.3 Observability

Phase 1 至少提供結構化資訊：

- create/reuse existing notification 的 debug-level 計數或測試 hook，不記 title/body。
- validation、schema drift 與 ownership failure 可被 consumer log/error pipeline 捕捉。
- 不在 log 記錄 notification body、secret 或完整 user profile。

Phase 1 沒有 background worker，因此不新增 delivery metrics、retry dashboard 或 dead-letter operation。

---

## 11. Release 與 Rollout 順序

### 11.1 Framework release

1. 在 `appspine` monorepo 完成 backend package、frontend subpath、unit tests、typecheck、build、Biome。
2. 建立 changesets：新 `@appspine/notification` 初始版本，以及 `frontend-shell` 新 subpath 的 minor
   bump。
3. **發布前取得使用者明確確認**；不得只因 task 已做到此步就自行 publish。
4. 由既有 Release CI 發布 GitHub Packages，確認 consumer 能解析實際版本。

### 11.2 Consumer rollout

順序固定：

```text
framework packages published
  -> Approve migration and regression proof
  -> Project second-consumer proof
  -> appspine-app-template scaffold and fresh-fork proof
  -> cross-repo contract audit
```

若 Approve 發現 package contract 缺口，先在 framework 修正並發 patch，再繼續 Project；不得在
Approve 寫 local workaround。若 Project 發現 Approve-specific abstraction，同樣回到 package 修正，
不以 Project local fork 掩蓋。

### 11.3 General adoption gate

只有以下全部成立，041 才能標記 completed：

- Framework backend/frontend package tests、typecheck、build、Biome 全綠。
- Approve migration/backfill、backend/frontend tests 與 golden-path E2E 全綠。
- Project assignment policy、negative cases與 golden-path E2E 全綠。
- Template fresh-fork build 與 auth/rbac/M2M E2E 全綠。
- 三個 consumer 的 schema drift check 與 pre-commit hook 實際執行成功。
- Consumer 全部解析已發布的正式 package version，沒有 `link:`、`file:` 或 workspace-local shortcut。
- Knowledge、data dictionary、template-sync 與執行證據已同步。

通過 gate 只代表 Phase 1 app-local capability 可供其他 app 採用，不代表 Phase 2 external delivery
已獲准或已設計完成。

---

## 12. 驗證矩陣

| 範圍 | 必要驗證 |
|---|---|
| `@appspine/notification` | idempotent first-write-wins、transaction client、notifyMany、pagination、unread、ownership mutation、schema drift unit tests |
| `frontend-shell/notification` | polling cleanup/overlap、initial hydration、badge cap、loading/empty/error/retry、mark-read navigation、responsive、light/dark、i18n、keyboard/ARIA、typecheck/build |
| Approve | legacy backfill、row/count parity、transaction rollback、duplicate retry、cross-user mutation 失敗、approve golden path、production UX screenshot matrix |
| Project | create assignment、reassignment、no-op/self/unassign negative cases、transaction rollback、cross-user mutation 失敗、project golden path、production UX screenshot matrix |
| Template | schema drift、backend/frontend typecheck/build、auth/rbac/M2M E2E、fresh-fork smoke、empty/error/mobile/theme visual QA |
| Cross-repo | published version resolution、package export、schema/API contract parity、knowledge lint、`git diff --check` |

任何測試使用 sleep/polling 時必須採 bounded wait；不得留下無 timeout 的 polling 或 flaky fixed delay。

---

## 13. 主要風險與控制

1. **抽象只適合 Approve**  
   控制：Project 是 release gate；Project 需要 local workaround 即視為 package contract 未完成。

2. **抽取後破壞 transaction atomicity**  
   控制：caller-provided tx 是必要 contract；兩個 consumer 都做 rollback negative test。

3. **Domain-event retry 產生重複通知**  
   控制：caller-provided idempotency key、DB unique、first-write-wins 行為測試。

4. **Approve migration 遺失或誤判 read state**  
   控制：disposable DB dry run、row/count parity；舊 read timestamp 只能以 createdAt 近似並明確記錄。

5. **Shared frontend 綁死 Approve endpoint/route/i18n**  
   控制：callback interface；Project 第二 consumer；package source 禁止 import consumer alias。

6. **Notification 變成 PII 或 audit dump**  
   控制：最小 snapshot、content policy、禁止 secrets/full payload、audit responsibility 明確分離。

7. **未實作 delivery 卻提前承諾 email delivered**  
   控制：041 完全不建立 Delivery model/channel；Phase 2 另開正式 plan。

8. **版本發布與 consumer lockfile 不一致**  
   控制：package range、workspace override、lockfile 與實際 resolved version 一起驗收。

9. **Shared UI 只完成陽春 happy path**  
   控制：§6.1 是 release blocker；component tests 加上三個真實 dashboard 的 desktop/mobile、light/dark、
   zh-TW/en screenshot matrix，未處理 loading/empty/error/long-content/focus/overflow 不得通過。

---

## 14. 後續計畫觸發條件

041 完成後，以下需求各自需要新 decision plan：

- External Delivery：第一個真實 email/Teams/Slack/webhook use case 出現。
- Preferences/Digest：產品需要 opt-out、quiet hours 或 batch delivery。
- Retention：通知量或資料治理要求需要 purge/archive policy。
- Central Notification App：踩到跨 app inbox/search/audit/digest/ops 的任一明確需求。
- Realtime Transport：30 秒 polling 無法滿足具體 SLA，且有可量化的即時性需求。

中央化若啟動，必須先解決跨 app stable principal key。現有 app-local user ID 不可直接當作全域身份。

---

## 15. 完成定義

041 的完成定義是：appspine 擁有一套已發布、由 Approve 與 Project 實際使用、由 template
scaffold、具備 transaction/idempotency/ownership/schema-drift contract 與 §6.1 production-grade UX
的 app-local 通知能力，且所有變更通過 §11.3 與 §12 的驗證。

這個完成定義不包含任何 external delivery 或中央 Notification app。執行狀態以
[log.md](../log.md) checkbox 與執行證據為準。

---

## 16. 完成後 review 修正與命名決策修正（2026-08-05）

041 完成並發布（§4 執行紀錄記載的四個 repo commit）後，對四個 repo 的實際變更做了一輪獨立
code review（appspine 框架、Approve、Project、template 各一個 agent，逐檔讀取完整 diff 並實測
行為），共發現 13 項確認問題，涵蓋 transaction 邊界、輸入驗證、schema drift 檢查範圍、共用
UI 的導航/輪詢競態、Project 的並發重複通知、通知內容 i18n、issue 刪除孤兒通知等。全部已修正
並在對應 repo 個別驗證（typecheck/test/build/biome，Approve 與 Project 另補 migration
dry-run 與 DB 層探針腳本）。詳細清單見四個 repo 對應 commit 的變更說明；不在此重複列出。

### 16.1 命名決策修正：notification API scope

**原決策（T-15840，已作廢）**：Approve 用 `approve-notifications:read/write`，Project 用
`project-notifications:read/write`，template 用 `app-notifications:read/write`，即
`<app-name>-notifications:*` 命名慣例。

**問題**：`@appspine/metadata-schema` 的 `MetaService.deriveScopes()` 是以 Prisma **db table
名稱**（`${model.dbTable}:read/write/*`）自動推導 API-key 可授權 scope 清單，且 API-key 建立
UI 只能勾選這份自動推導清單。`<app-name>-notifications:*` 這個命名慣例不在該清單中，也沒有
任何 alias/prefix hook 可以讓它出現，導致三個 consumer 的 notification scope 事實上無法透過
標準 UI 授權，只能授予萬用 `*`——這在三個 consumer 各自的 review 中被獨立發現為同一個跨
repo 缺口。

**新決策（2026-08-05 定案）**：notification API scope 統一改為與其他所有 module 一致的
table-derived 命名，不再使用 `<app-name>-` 前綴：

- Approve：`approval_notifications:read/write`（對應 `@@map("approval_notifications")`）
- Project：`notifications:read/write`（對應 `@@map("notifications")`）
- template：`notifications:read/write`（對應 `@@map("notifications")`）

選擇「統一改名」而非在 `@appspine/metadata-schema` 加 alias/prefix hook：table-derived 命名
是框架內所有其他 module 已經在用的既有慣例，notification 特立獨行才是例外；改名讓
notification scope 直接可被既有 API-key UI 授權，不需要框架新增特殊機制，範圍更小、風險更低。

**影響**：三個 consumer 的 controller `@Scopes(...)` 字串、data-dictionary、docs/agent-guide.md
notification 章節、`appspine-app-template/scripts/scaffold-init.mjs`（不再需要按 app 名稱重寫
notification scope 前綴，因為新命名不含 app 名稱）都需同步更新。§7.2、§8.2 已據此修正；
template 的 `app-notifications:*` 提及（§9 若有）視為已作廢，一併更新為
`notifications:read/write`。

### 16.2 框架套件版本

本輪修正發布 `@appspine/notification`（minor）、`@appspine/frontend-shell`（patch）、
`@appspine/common`（patch）。三個 consumer 需升級到新版本後，schema drift checker 才能真正
啟用 model-scoped 的 `@@index`/`@updatedAt` 檢查（新增的 `notificationTableName` 第三參數）；
在新版本發布前，三個 consumer 暫時退回不帶第三參數的呼叫，並在程式碼註解中記錄這是已知、
會在升版後關閉的暫時性缺口。
