---
type: topic
scope: cross-repo
status: active
created: 2026-07-17
updated: 2026-08-03
supersedes: null
superseded_by: null
---

# 026 - Domain Events 與 Transaction-bound Outbox（`apps/approve` 垂直切片）- 系統設計計畫

> 狀態：**已完成（2026-07-17）**。全部 23 項 task（A–G 基礎批次 19 項 + H 抽取批次
> 4 項）已執行並驗證完畢，見 `026-task-breakdown.md`。H 組 gate review（T-10970）
> 全過後依序完成套件抽取（T-11000，`@appspine/domain-events`）、`apps/approve` 切換
> （T-11010）、第二個 app `apps/wiki` 實際採用（T-11020）、`appspine-app-template`
> 回填（T-11030）。
>
> 範圍：基礎範圍（A–G 組）**只動 `apps/approve` 一個 app**（backend schema/模組 +
> frontend admin 頁）與本文件，不涉及 `@appspine/*` 共用套件、`appspine-app-template`、
> 其他業務 app。**但書**：§11.1 的 gate review 全過後，H 組（套件抽取批次，§11.2）
> 範圍延伸至 `appspine/` monorepo（新增 `@appspine/domain-events`）與 G5 選定的第二個
> 業務 app——此範圍擴張以 gate 全過為前提，任一不過即凍結。
> 來源：`_archive/dev_docs-20260803/domain-events/Z20-domain-events-outbox.md`（2026-07-17 兩輪修訂後定案的設計），
> 本計畫涵蓋 Z20 Phase 1–3 在 approve 的落地 + gate 後的 Phase 4（套件抽取）；跨 app
> relay（Z20 Phase 5）中 webhook 路徑已含在本計畫，其餘 relay 依 §11.3 掛具名消費者
> 觸發條件。

---

## 1. 背景

Z20 已定案 appspine 的事件機制核心設計：

- 服務層**明確記錄**業務事件，與業務寫入在**同一個 Prisma 交易**內落地（transaction-bound outbox）
- 核心狀態機維持同步、事件只承載衍生副作用（Z20 §2 第二邊界規則）
- `domain_events` 是不可變事實日誌，所有佇列狀態放在 delivery rows（Z20 §5/§9）
- 訂閱以程式碼註冊（typed registry），唯一 data-driven 路由是窄的 webhook 訂閱表（Z20 §8）

選 `apps/approve` 當第一個落地場域的理由（Z20 §18）：它的 domain 天然有狀態轉移、
七條變更路徑全部已有交易包裹，而且有一個**現存的真實缺陷**可以被本機制修掉——每條路徑的
`recordAudit()` 都在 `$transaction` commit **之後**才執行
（`approval-instances.service.ts`），程序若在 commit 與 audit 寫入之間死亡，稽核紀錄
無聲遺失。這正是 outbox 要解決的失敗模式，也是本計畫的 day-one 效益。

本計畫完成後應能證明 Z20 §20 的四件事：業務寫入與事件插入原子落地、事件帶
`before`/`after`/`changedFields`、audit 縫隙被補上、一個衍生副作用（webhook）帶完整
retry/dead-letter 跑通。

## 2. 決策摘要

1. **App-local，不先建 `@appspine/domain-events`**（Z20 §4 的既定順序）：全部程式碼放
   `apps/approve/backend/src/domain-events/`，等模式在真實 domain 驗證穩定後，由後續
   計畫抽取。因此本計畫也**不做 template 回填**。
2. **事件只掛在 `ApprovalInstance` aggregate**：七個事件對應七條既有交易路徑（見 §4）。
   刻意不對 `LeaveRequest`／`ExpenseClaim` 本體發事件——它們的快照含請假/報支個資，
   等 redaction 政策在低敏感 aggregate 上驗證過再擴充。`ApprovalInstance` 的欄位
   （title/serialNo/status/version 等）敏感度低，適合當第一個 aggregate。
3. **Fan-out 在業務交易內完成**（對 Z20 §9 的一個細化）：`record()` 在同一個 tx 內
   同時插入事件列**與**其 delivery rows。理由：不可變事件表沒有 status 欄位，dispatcher
   無法廉價辨識「哪些事件還沒展開」；交易內展開讓 delivery rows 本身就是 outbox 佇列，
   dispatcher 退化成純 delivery claim loop。接受的代價：之後才新增的 webhook 訂閱
   不會回溯套用到已存在的事件（v1 接受，不做 replay 工具）。
4. **Dispatcher v1 手刻 claim loop（Z20 §9 build-vs-adopt 拍板）**：in-process NestJS
   interval worker。理由：(a) approve 目前單副本部署，單 worker 順序處理天然成立；
   (b) 即使採 graphile-worker，delivery 帳本（冪等/可觀測）仍要自己維護，省下的程式碼
   有限；(c) 不為 v1 引入新依賴與一套外部管理的 DB schema。**升級路徑**：若 claim loop
   的邊界案例（多副本、吞吐、排程）開始增生，改採 graphile-worker，屆時 delivery rows
   設計不變、只換取件機制。
5. **Audit 縫隙修法**：七條路徑的 `recordAudit()` 呼叫移除，改由 `audit-record` handler
   從事件產生 `AuditLog` 列。取捨：audit 列從「commit 後立即」變成「commit 後數秒內」
   （eventual），換得 loss-proof；`AuditMeta`（`isAiOperation`/`mcpTool`/
   `actingApiKeyId`）在 `record()` 時寫進事件 `metadata`，handler 原樣轉錄，欄位語意
   與現行一致。其餘模組（如 `comment()` 與 leave/expense 自身的 CRUD audit）**不變**。
6. **`webhook.post` 是驗證 retry/dead-letter 的旗艦 handler**：`notification.create`
   類 in-DB 副作用幾乎不會失敗，驗證不了重試機制；外部 HTTP 才會。既有的交易內通知
   **維持原樣不遷移**（它本身已是 transaction-bound，Z20 §18 已定調為 optional）。

## 3. 資料模型

新增 `apps/approve/backend/prisma/schema/domain-events.prisma`（多檔 schema folder
既有慣例；所有 model/enum 依 Z13 慣例附 `///` 註解，通過 `check:schema-docs`）：

```prisma
/// Immutable business fact log (transaction-bound outbox, dev_docs 026).
/// INSERT-only — never UPDATE; all processing state lives on DomainEventDelivery.
model DomainEvent {
  id            String   @id @default(cuid())
  /// Monotonic dispatch order; cuid is unsortable, createdAt collides in-millisecond.
  seq           BigInt   @unique @default(autoincrement())
  /// Business object type, e.g. "ApprovalInstance".
  aggregateType String   @map("aggregate_type")
  aggregateId   String   @map("aggregate_id")
  /// Semantic event, e.g. "submitted", "rejected" — values from code constants.
  eventType     String   @map("event_type")
  operation     DomainEventOperation
  /// Payload shape version; bump when a migration changes before/after shape.
  schemaVersion Int      @default(1) @map("schema_version")
  actorUserId   String?  @map("actor_user_id")
  /// Request-level correlation id.
  correlationId String?  @map("correlation_id")
  /// Workflow-level correlation id (X-Appspine-Workflow-Id convention).
  workflowId    String?  @map("workflow_id")
  before        Json?
  after         Json?
  changedFields String[] @map("changed_fields")
  /// Free-form context, incl. audit meta (isAiOperation/mcpTool/actingApiKeyId).
  metadata      Json?
  createdAt     DateTime @default(now()) @map("created_at")

  deliveries DomainEventDelivery[]

  @@index([aggregateType, aggregateId])
  @@index([eventType])
  @@index([workflowId])
  @@map("domain_events")
}

/// Technical operation kind for a DomainEvent.
enum DomainEventOperation {
  CREATE
  UPDATE
  DELETE
}

/// Per-handler processing state for one DomainEvent (the only queue ledger).
model DomainEventDelivery {
  id            String                    @id @default(cuid())
  eventId       String                    @map("event_id")
  event         DomainEvent               @relation(fields: [eventId], references: [id])
  /// Stable handler identity, e.g. "audit-record", "webhook.post:<subscriptionId>".
  handlerKey    String                    @map("handler_key")
  status        DomainEventDeliveryStatus @default(PENDING)
  attempts      Int                       @default(0)
  nextAttemptAt DateTime?                 @map("next_attempt_at")
  lockedAt      DateTime?                 @map("locked_at")
  lockedBy      String?                   @map("locked_by")
  lastError     String?                   @map("last_error")
  processedAt   DateTime?                 @map("processed_at")
  createdAt     DateTime                  @default(now()) @map("created_at")

  @@unique([eventId, handlerKey])
  @@index([status, nextAttemptAt])
  @@map("domain_event_deliveries")
}

/// Processing state of one delivery. Retry = back to PENDING with a future
/// nextAttemptAt (attempts preserved); there is no separate FAILED state.
enum DomainEventDeliveryStatus {
  PENDING
  PROCESSING
  PROCESSED
  DEAD_LETTER
  IGNORED
}

/// Admin-configured outbound webhook (the only data-driven routing, Z20 §8).
model WebhookSubscription {
  id         String   @id @default(cuid())
  name       String
  url        String
  /// HMAC-SHA256 signing secret; shown once at creation, stored encrypted.
  secret     String
  /// Event types this webhook receives, e.g. ["submitted", "rejected"].
  eventTypes String[] @map("event_types")
  enabled    Boolean  @default(true)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("webhook_subscriptions")
}
```

注意事項：

- `seq` 是 `BigInt`——API 回應與前端序列化要走字串（`JSON.stringify` 不支援 BigInt），
  DTO 層明確轉型。
- 冪等鍵 `@@unique([eventId, handlerKey])` 是結構性保證；handler 內部冪等仍需覆蓋
  兩種 constraint 管不到的情況——DB 外部效果（webhook POST 成功但回應遺失）與
  stale-lock 回收後的重複執行（Z20 §11）。
- schema 變更後重跑 data-dictionary 產生器（`docs/data-dictionary.md` 不可手改）。

## 4. 事件記錄 API 與接線點

新模組 `backend/src/domain-events/`：`DomainEventsService.record(tx, input)` +
`diffChangedFields(before, after)` + typed registry + dispatcher + handlers。

事件型別用 `as const` 常數（Z20 §19-4，自由字串的 typo 會讓訂閱靜默失配）：

```ts
export const ApprovalInstanceEvents = {
  Submitted: "submitted",
  StepApproved: "step_approved",
  Approved: "approved",
  Rejected: "rejected",
  Withdrawn: "withdrawn",
  AddSigned: "add_signed",
  TransferSigned: "transfer_signed",
} as const;
```

七個接線點全部在 `approval-instances.service.ts` **既有交易內**，`before`/`after` 為
`ApprovalInstance` 列快照：

| eventType         | 接線點（既有交易）                      | operation |
|-------------------|-----------------------------------------|-----------|
| `submitted`       | `submit()`                              | CREATE    |
| `step_approved`   | `approve()`（含 step 是否完成的 metadata）| UPDATE    |
| `approved`        | `finalizeApproved()`                    | UPDATE    |
| `rejected`        | `reject()`                              | UPDATE    |
| `withdrawn`       | `withdraw()`                            | UPDATE    |
| `add_signed`      | `addSign()`                             | UPDATE    |
| `transfer_signed` | `transferSign()`                        | UPDATE    |

`record()` 在同一 tx 內：插入事件列 → 查 registry 與 enabled `WebhookSubscription`
→ 插入對應 delivery rows（§2 決策 3）。零訂閱者的事件仍會落地（純事實日誌）。

**不動的東西（再次明確）**：`submit()`／`tryAdvanceStep`／`activateNextStep` 的同步
狀態機推進、Z15 的原子 version lock、交易內的 `approvalNotification` 寫入——全部原樣。

## 5. Dispatcher

`DomainEventDispatcherService`：NestJS interval worker（in-process，隨 backend 啟動）。

- **取件**：`$queryRaw` 走 `FOR UPDATE SKIP LOCKED`（`nextSerialNo()` 先例），條件
  `status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now())`，
  依所屬事件的 `seq` 升冪，批次上限 `DOMAIN_EVENTS_BATCH_SIZE`。認領時標
  `PROCESSING` + `lockedAt`/`lockedBy`（`lockedBy` = hostname+pid）。
- **執行**：依 `handlerKey` 從 registry 解析 handler；成功 → `PROCESSED` +
  `processedAt`；失敗 → 回 `PENDING`、`attempts + 1`、`lastError`、
  `nextAttemptAt = now + min(30s × 2^attempts, 1h)`；`attempts` 達
  `DOMAIN_EVENTS_MAX_ATTEMPTS`（預設 8）→ `DEAD_LETTER`。
- **Stale lock 回收**：`PROCESSING` 且 `lockedAt` 超過 5 分鐘 → 視為 worker 死亡，
  回 `PENDING` 重新可認領（handler 冪等為前提）。
- **順序保證的現實範圍**：單副本 + 單 worker → 全域依 `seq` 序處理，天然滿足
  per-aggregate 順序。SKIP LOCKED 是對未來多副本的保險，不是 v1 的順序機制；
  **per-aggregate gating 明確延後**到 approve 真的多副本部署時（風險 §9-2）。

環境變數（`.env`，依 002 不硬編碼）：

```text
DOMAIN_EVENTS_DISPATCH_INTERVAL_MS=5000
DOMAIN_EVENTS_BATCH_SIZE=20
DOMAIN_EVENTS_MAX_ATTEMPTS=8
DOMAIN_EVENTS_STALE_LOCK_MS=300000
```

## 6. Handlers（v1 兩個）

### 6.1 `audit-record`

從事件組出 `AuditLog` 列：`entityType`/`entityId` 取自 aggregate、`action` 由
`operation` 對映、`actorId` + 查 email 快照、`isAiOperation`/`mcpTool`/
`actingApiKeyId`/`workflowId` 從事件 `metadata` 原樣轉錄。寫入走 handler 自己的交易。

冪等作法：approve 自己那份 `audit-log.prisma` fragment 加一個 nullable
`sourceEventId String? @unique @map("source_event_id")` 欄位（Postgres unique 允許
多個 NULL，既有的其他 audit 寫入不帶此欄位、完全不受影響）——handler 重複執行時靠
unique 衝突跳過，結構性冪等，與 Z20 §11 的 `sourceEventId` 模式一致。這是 app 自有
schema fragment 的調整（002 慣例允許，025 T-10710 對 `success` 欄位的作法為先例），
**不是** `@appspine/audit-log` 共用套件的變更。七條路徑的既有 `recordAudit()` 呼叫
同 commit 移除。

### 6.2 `webhook.post`

- fan-out 時每個 enabled 且 `eventTypes` 含該事件的訂閱各生一列 delivery，
  `handlerKey = "webhook.post:<subscriptionId>"`——每個外部端點獨立 retry/dead-letter。
- POST JSON payload：事件全欄位（`seq` 轉字串）減去 redaction denylist；標頭帶
  `X-Appspine-Event-Id`、`X-Appspine-Event-Type`、`X-Appspine-Signature`
  （HMAC-SHA256 over body，用該訂閱的 `secret`）、`X-Appspine-Timestamp`。
- 2xx 視為成功；逾時（10s）與非 2xx 都是失敗走 retry。訂閱在執行時已被刪除／停用
  → delivery 標 `IGNORED`。
- `secret` 依 002「第三方憑證儲存慣例」應用層加密存放，明碼只在建立時顯示一次。

## 7. Admin UI（`apps/approve` frontend）

兩個 admin 頁，依 021 收斂後的 `frontend-shell` 表格/對話框慣例與本 app 既有 i18n
（`messages/` en + zh-TW）。**production-grade 標準**：真實 loading/empty/error 狀態、
分頁、瀏覽器實測，不做 skeleton 級版面。

1. **Domain Events**：事件列表（filter：eventType/aggregateId/日期）→ 事件詳情
   （before/after diff、changedFields、metadata、該事件全部 deliveries 與各自
   status/attempts/lastError）→ 對 `DEAD_LETTER` delivery 提供「Retry」
   （回 `PENDING`、`nextAttemptAt = now`）與「Ignore」（標 `IGNORED`）動作。
2. **Webhooks**：`WebhookSubscription` CRUD + enable/disable，secret 建立時一次性
   顯示；列表顯示每個訂閱最近 delivery 成敗概況（從 delivery 表以 handlerKey 前綴聚合）。

後端對應 admin API 皆走既有 RBAC（ADMIN role），寫入動作照常記 audit。

## 8. 明確排除的範圍

- 不動核心簽核狀態機與 Z15 鎖、不遷移交易內通知
- A–G 基礎批次不建 `@appspine/domain-events` 套件——抽取屬 gate 後的 H 組（§11.2）；
  template 回填於 H 組最後一項 task 決定
- 不做 DB-driven 訂閱規則引擎（`DomainEventSubscription` 已在 Z20 §8 廢止）
- 不對 `LeaveRequest`/`ExpenseClaim` aggregate 發事件（§2 決策 2）
- 不做 webhook 以外的跨 app relay、事件匯出 API、replay/backfill 工具（§11.3）
- 不做排程式事件壓縮/清理（retention 為待決事項 §9-1）

## 9. 風險與待決事項

1. **Retention 未定**：v1 事件全量保留。`domain_events` 是 INSERT-only，量只增不減；
   approve 的簽核頻率下短期無虞，但正式上線前要決定保留週期與壓縮策略（Z20 §16）。
2. **順序保證依賴單副本假設**（§5）：若 approve 改多副本部署，需先補 per-aggregate
   gating 或改用 graphile-worker 的 named queue，屬升級路徑、不在本計畫內，但假設
   要寫進 app 的 `docs/`，避免未來擴副本時被遺忘。
3. **Audit 語意改變**：七條路徑的 audit 列從即時變成秒級延遲。對「操作後立刻查
   audit」的使用情境有可見差異；接受理由是 loss-proof > 即時性，需在 app docs 註明。
4. **Webhook 目前沒有真實消費者**（024 n8n 方向已回滾）：驗證用本地 echo server／
   可控的失敗注入端點進行；機制先行、消費者後到是本計畫刻意的順序。
5. **`BigInt` 序列化**：`seq` 經 API/JSON 邊界一律字串化，漏掉會是 runtime error，
   測試要涵蓋。
6. **fan-out 在交易內的成本**：每次業務寫入多幾筆 INSERT 與一次 enabled 訂閱查詢
   （可 in-process 快取，TTL 短）。approve 的寫入頻率下可忽略，但列出以免未來
   高頻 aggregate 直接沿用而不評估。

## 10. 驗證方式

比照 025 §6 的立場：typecheck/lint/單元測試只保證程式碼正確，**真正的驗收是實際
操作**。

1. **原子性（正向）**：瀏覽器實際送出請假單 → 走完簽核 → 核對 `domain_events` 七類
   事件逐一出現、`seq` 嚴格遞增、`before`/`after`/`changedFields` 與畫面一致。
2. **原子性（反向）**：測試中讓 `onSubmitted()` 拋錯 → 交易回滾 → 確認**零**事件列
   與 delivery 殘留。
3. **Audit 縫隙**：確認七條路徑的 `AuditLog` 列改由 handler 產生且欄位（含
   `isAiOperation`/`actingApiKeyId`/`workflowId`）與現行完全一致；dispatcher 停機
   期間操作 → 重啟後 audit 列補齊不遺失。
4. **Retry/dead-letter 全流程**：建 webhook 訂閱指向本地 echo server → 關掉 server
   → 觸發事件 → 觀察 backoff retry 至 `DEAD_LETTER` → 開回 server → 在 admin UI
   按 Retry → 成功轉 `PROCESSED`。全程在 Domain Events 頁面可視。
5. **冪等**：手動把一筆 `PROCESSING` delivery 的 `lockedAt` 改成過期 → 確認回收後
   重複執行不產生第二筆 audit 列／webhook 收端可辨識重複（同 `X-Appspine-Event-Id`）。
6. **並發不回歸**：重跑 Z15 的並發雙重核准測試，確認加入 `record()` 後版本鎖行為
   不變、事件不重複。
7. **UI**：兩個 admin 頁瀏覽器實測（含 en/zh-TW 切換、空狀態、錯誤狀態、分頁）。

## 11. Phase 4/5 銜接：套件抽取評估標準與 relay 觸發條件

「一口氣把 Phase 4/5 做完」的正確形式，不是把抽取塞進本計畫的執行範圍（那會重演
Z20 §4 警告的過早抽象與 Z21 的版本連鎖成本），而是：**026 task breakdown 的最後
一個 task 就是 §11.1 的 gate review**——七項全過即立即立項 027（抽取計畫），中間
不留等待期；任一項不過，留在 app-local 修到過為止，不硬抽。抽取的時機由 gate
決定，不由日曆決定。

### 11.1 套件抽取評估標準（七項全過才抽）

把 Z20 §4 的抽取條件收斂成可逐項檢核、附證據的 gate：

| # | 標準 | 檢核方式 |
| --- | --- | --- |
| G1 | 原子性已實證 | §10-1（正向）與 §10-2（反向回滾）驗證通過，附測試紀錄 |
| G2 | 核心 API 已停止變動 | 026 收尾前的最後 10 個 commit 中，`record()` 簽名、registry 介面、`DomainEvent`/`DomainEventDelivery` schema 零 breaking 變更（`git log -p backend/src/domain-events/ prisma/schema/domain-events.prisma` 逐一核對） |
| G3 | 事件型別無特例分支 | ≥5 個真實事件型別上線，且 core（record/fan-out/dispatcher）沒有任何針對單一 `eventType` 寫死的條件分支——`grep` 事件常數於 core 目錄應零命中 |
| G4 | 可靠性機制實測過 | retry、dead-letter、stale-lock 回收、冪等各有至少一次真實觸發紀錄（§10-4/5 的執行證據，不是只有單元測試） |
| G5 | 第二個 app 紙上適配通過 | 挑一個真實候選（`apps/project` 的 `ProjectTask.status_changed` 或 `apps/wiki` 的 `WikiPage.published`）做 desk-check：照現有 API 寫出該 app 的 `subscriptions.ts` 與接線點草稿，**過程中不需要修改 core API 就能寫完**；草稿存檔作為證據 |
| G6 | 抽取邊界無爭議項 | 列出「進套件」（record/diff/registry/dispatcher/retry/testing helpers）與「留 app」（handlers、事件常數、worker 排程設定、Prisma schema 檔案本體）的完整檔案清單，無「不確定放哪」的項目 |
| G7 | 發布成本已評估 | 依 Z21 教訓核對 `@appspine/domain-events` 的依賴圖（尤其 `@appspine/common` cascade 影響範圍），並 dry-run 一次發布流程 |

### 11.2 抽取批次（gate 全過後直接執行，不另立計畫）

Gate 全過後**直接執行本計畫 task breakdown 的 H 組（T-11000 起）**，不另立 027：
**抽取 + 第二個 app 實際採用**綁在同一批——只抽不用等於 speculative generality，
G5 的紙上適配要在 H 組變成實測，第二個 app 跑通才算 Z20 §4「a second app could
adopt the core API without changing it immediately」真正成立。任一 gate 不過則
H 組凍結，修補後重跑 gate review。是否回填 template 依 H 組執行結果在最後一項
task 決定並記錄。

注意：H 組的範圍**超出本計畫基礎範圍**（見文件開頭範圍聲明的但書）——會動到
`appspine/` monorepo（新增 `@appspine/domain-events` 套件）與 G5 選定的第二個
app（`apps/project` 或 `apps/wiki`）。這個範圍擴張只在 gate 全過後生效。

### 11.3 Phase 5（跨 app relay）的處置

- **Webhook outbox relay：已由本計畫 §6.2 交付**。Z20 §13 列的四條 relay 路徑中，
  第一條（webhook）就是 `webhook.post` handler + `WebhookSubscription`——Phase 5
  在 v1 需要的部分不用另立計畫。
- **MCP gateway relay／事件匯出 API／central integration app：掛「具名消費者」
  觸發條件**。立項前提是出現一個叫得出名字的真實訂閱方（例如 project app 要在
  wiki 頁面發布時刷新快照、或某外部系統要訂閱 approve 完成事件），才規劃對應的
  relay 路徑。沒有消費者的整合機制是 023/024 已經回滾過兩次的失敗模式，不再重演。

