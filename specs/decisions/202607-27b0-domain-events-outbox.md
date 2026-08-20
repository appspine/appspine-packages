---
type: decision
status: completed
title: 027b0 - 引入 PostgreSQL 事務性發送箱 (Outbox) 保障事件一致性
---

# 027b0 - 引入 PostgreSQL 事務性發送箱 (Outbox) 保障事件一致性

## Context (背景與動機)

在多個業務系統中，當資料發生異動（例如：新增審批單或變更任務狀態）時，系統需要觸發異步副作用（如發送郵件或推送 WebSocket 訊息）。

如果我們在業務交易 (Transaction) 進行中直接呼叫外部訊息佇列（如 Redis、RabbitMQ 或 Webhook API），會面臨以下一致性挑戰：
1. **發送成功但交易回滾**：訊息已被發送給消費者，但本地資料庫交易回滾，導致消費者處理了不存在的「髒數據」。
2. **交易成功但發送失敗**：本地資料儲存成功，但因網路抖動或佇列宕機導致訊息發送失敗，使衍生副作用（例如通知）永久丟失。

為了解決這類分散式事務一致性漏洞，我們需要設計強一致性的事件發送機制。

## Decision (決策細節)

我們拍板採用 **PostgreSQL 事務性發送箱 (Transactional Outbox)** 模式：

1. **同交易寫入**：
   - 業務資料的變更與領域事件 (`DomainEvent`) 的寫入，必須封裝在同一個 Prisma 數據庫交易中。
2. **異步 Relayer (Dispatcher)**：
   - 引入背景 Dispatcher Worker，定期掃描發送箱資料表，並透過樂觀鎖機制（標記 `PROCESSING`）搶佔待發送事件，發送給本地訂閱者 (Subscriber) 或外部 Webhook。
3. **退避重試與死信**：
   - 失敗事件支援指數退避 (Exponential Backoff) 延遲重試，重試耗盡後轉入 `FAILED` 狀態供人工審計。

## Consequences (影響與 Trade-offs)

### 優點
- **強一致性保證**：保證了業務寫入與事件發布的強一致性，徹底解決了訊息丟失與髒訊息問題。
- **無外部佇列依賴**：開發期無需引入額外的訊息佇列服務，完全依賴 PostgreSQL 原生 ACID 事務，降低維護複雜性。

### 缺點 / 折衷
- 發送箱的寫入與輪詢會給 PostgreSQL 資料庫增加少許 I/O 壓力。對於目前的讀寫負載，此開銷在資料庫的承受範圍之內，換取強一致性是完全值得的。
