---
type: topic
scope: cross-repo
status: active
created: 2026-08-21
updated: 2026-08-21
---

# 領域事件與事務 Outbox (Domain Events & Outbox) 規格

本文件記錄 `appspine` 核心領域事件（Domain Events）機制與 PostgreSQL 事務性發送箱（Outbox）的最終設計規格與實作標準。

---

## 一、 設計原則

領域事件機制旨在保障業務資料變更與事件發布之間的一致性，遵循以下兩大核心原則：

1. **強一致性發送箱 (Transaction-bound Outbox)**：
   - 業務資料的變更與領域事件的插入，必須在**同一個資料庫交易 (Transaction) 內**提交 (Commit) 或回滾 (Rollback)。
   - 系統禁止在業務交易中直接呼叫外部訊息佇列、通知服務或 HTTP Webhook。所有異步副作用一律透過寫入資料庫 `Outbox` 資料表，再由背景發送器 (Dispatcher Worker) 異步拉取並處理。
   - 這能有效避免「資料更新成功，但事件發布失敗」或「事件已發布，但交易回滾導致髒數據」的一致性漏洞。

2. **同步核心，異步衍生 (Synchronous Core, Asynchronous Derived Effects)**：
   - 核心狀態機的轉移（例如：審核單送出、流程狀態變更）必須在交易中**同步執行**，以確保「讀取自己寫入 (Read-your-writes)」的即時一致性。
   - 領域事件僅負責處理異步的**衍生副作用**：發送郵件/通知、跨 App 數據同步 (Mirror)、觸發外部 Webhook 以及啟動獨立的 n8n/AI 工作流。

---

## 二、 數據模型與生命週期

每一個支援領域事件的 App，其資料庫中都必須宣告 `DomainEvent` 與 `EventDelivery` 兩張表：

```text
+---------------------+         +---------------------+
|     DomainEvent     |         |    EventDelivery    |
+---------------------+         +---------------------+
| id (UUID)           | 1     N | id (UUID)           |
| event_name (String) |-------->| event_id (UUID/FK)  |
| payload (JSON)      |         | subscriber_name     |
| seq (Int/BigInt)    |         | status (PENDING...) |
| created_at (Date)   |         | attempts (Int)      |
| occurred_by (UUID)  |         | last_error (Text)   |
+---------------------+         +---------------------+
```

### 2.1 遞送生命週期
背景發送器 (Dispatcher Worker) 會週期性掃描 `EventDelivery` 表中狀態為 `PENDING` 的行：
1. **Claiming (鎖定)**：Dispatcher 獲取待發送行，將狀態更新為 `PROCESSING`，並寫入鎖定標記與過期時間，防止多實例併發搶佔。
2. **Execution (執行)**：呼叫對應的本地 Handler，或執行 Webhook 呼叫。
3. **Success (成功)**：狀態更新為 `COMPLETED`。
4. **Retry (重試)**：若失敗且未達最大重試次數，退回 `PENDING` 並依據指數退避 (Exponential Backoff) 延遲下次執行時間。
5. **Dead Letter (死信)**：重試耗盡後，狀態標記為 `FAILED`，並記錄 `last_error` 供運維稽核。

---

## 三、 `@appspine/domain-events` 套件規範

共用套件 `@appspine/domain-events` 提供了聲明式的開發入口：

### 3.1 訂閱註冊 (`@EventHandler` 裝飾器)
後端服務模組可透過裝飾器聲明式地註冊訂閱：

```typescript
@Injectable()
export class ProjectNotificationSubscriber {
  @EventHandler('project.task.status_changed')
  async onTaskStatusChanged(event: TaskStatusChangedEvent) {
    // 異步發送通知邏輯
  }
}
```

### 3.2 冪等性 (Idempotency) 保證
- 每條 `EventDelivery` 都有唯一的遞送 ID。
- 訂閱者 (Subscriber) 在處理事件時，必須利用該遞送 ID 進行本地防重校驗（例如：利用資料庫唯一索引或 Redis 鎖），確保即使網路重試導致重複發送，也僅執行一次業務邏輯。
