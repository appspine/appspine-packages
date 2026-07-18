# Domain Events i18n Key List

Canonical key list for the `domainEvents.*` namespace and the `enums.DomainEventOperation.*` /
`enums.DomainEventDeliveryStatus.*` value labels consumed by the shared components in
`components/admin/domain-events-table.tsx`, `domain-event-detail-panel.tsx`,
`domain-event-deliveries-panel.tsx`, and `domain-event-catalog-table.tsx` (dev_docs 028 §3.4).

Each app copies this list into its own `messages/{en,zh-TW}.json` — there is no shared i18n
package, matching the existing convention every other shared admin component (`UsersTable`,
`RolesTable`, `ApiKeysTable`) already follows: the component takes a `t` function, the app owns
the translation file.

## Why this document, not `check:enum-i18n`

`DomainEventOperation` and `DomainEventDeliveryStatus` are `@appspine/domain-events`' own `const`
objects (`packages/domain-events/src/types.ts`), not a Prisma enum generated from the app's own
schema. `check:enum-i18n` only walks the app's Prisma DMMF, so it has no way to know these two
values exist and will never flag a missing translation for them. This document is the only
enforcement mechanism — copy the full key set below, don't rely on the check script to catch a
gap here.

`apps/approve` already ships the `domainEvents.*` and `enums.DomainEventOperation`/
`DomainEventDeliveryStatus` keys below (predates this document); the `catalog.*` subtree is new
in dev_docs 028 (the catalog endpoint didn't exist before T-11210) and must be added there too
when T-11230 lands.

## `domainEvents.*`

| Key | en | zh-TW |
| --- | --- | --- |
| `title` | Domain Events | 領域事件 |
| `subtitle` | Inspect transaction-bound event records, delivery state, and dead-letter actions. | 檢視交易綁定的事件記錄、投遞狀態與死信操作。 |
| `empty` | No domain events found. | 找不到領域事件。 |
| `pageInfo` | Page {page} of {totalPages} ({total} total) | 第 {page} 頁,共 {totalPages} 頁(共 {total} 筆) |
| `attempts` | {count} attempts | {count} 次嘗試 |
| `filters.eventType` | Event type | 事件類型 |
| `filters.aggregateId` | Aggregate ID | Aggregate ID |
| `filters.createdFrom` | Created from | 建立起日 |
| `filters.createdTo` | Created to | 建立迄日 |
| `columns.seq` | Seq | Seq |
| `columns.event` | Event | 事件 |
| `columns.operation` | Operation | 操作 |
| `columns.aggregate` | Aggregate | Aggregate |
| `columns.changedFields` | Changed fields | 變更欄位 |
| `columns.deliveries` | Deliveries | 投遞 |
| `columns.createdAt` | Created | 建立時間 |
| `columns.handler` | Handler | Handler |
| `columns.status` | Status | 狀態 |
| `columns.attempts` | Attempts | 嘗試次數 |
| `columns.nextAttemptAt` | Next attempt | 下次嘗試 |
| `columns.lastError` | Last error | 最後錯誤 |
| `columns.actions` | Actions | 操作 |
| `actions.retry` | Retry | 重試 |
| `actions.ignore` | Ignore | 忽略 |
| `error.title` | Unable to load domain events | 無法載入領域事件 |
| `detail.back` | Back to events | 回到事件列表 |
| `detail.title` | Domain event #{seq} | 領域事件 #{seq} |
| `detail.before` | Before | 變更前 |
| `detail.after` | After | 變更後 |
| `detail.metadata` | Metadata | Metadata |

### `catalog.*` (new — `DomainEventCatalogTable`, T-11210's `GET /domain-events/catalog`)

| Key | en | zh-TW |
| --- | --- | --- |
| `catalog.title` | Domain Events Catalog | 領域事件目錄 |
| `catalog.subtitle` | Code-registered subscriptions and their delivery stats over the last {days} days. | 程式碼註冊的訂閱,以及最近 {days} 天的投遞統計。 |
| `catalog.columns.key` | Key | Key |
| `catalog.columns.eventTypes` | Event types | 事件類型 |
| `catalog.columns.description` | Description | 說明 |
| `catalog.columns.total` | Total | 總計 |
| `catalog.columns.processed` | Processed | 已處理 |
| `catalog.columns.deadLetter` | Dead letter | 死信 |
| `catalog.columns.lastStatus` | Last status | 最後狀態 |
| `catalog.columns.lastAttemptAt` | Last attempt | 最後嘗試時間 |
| `catalog.columns.handlerKey` | Handler key | Handler key |
| `catalog.emptySubscribers` | No code-registered subscriptions found. | 目前沒有程式碼註冊的訂閱。 |
| `catalog.neverFired` | Never fired | 尚未觸發過 |
| `catalog.dataDrivenTitle` | Data-driven deliveries | 資料驅動的投遞 |
| `catalog.dataDrivenSubtitle` | Handler keys resolved at runtime (e.g. webhook subscriptions) — not code-registered, so they have no description. | 執行期才解析出來的 handler key(例如 webhook 訂閱)——不是程式碼註冊的訂閱,所以沒有說明文字。 |
| `catalog.emptyDataDriven` | No data-driven deliveries in this window. | 這段時間內沒有資料驅動的投遞紀錄。 |

## `enums.DomainEventOperation.*` / `enums.DomainEventDeliveryStatus.*`

Flat dotted keys inside the app's existing `enums` namespace (same convention as every other
Prisma-enum label in that namespace) — these two are not Prisma enums, but the flat key shape is
identical, so `renderEnumLabel`/`enumLabel(tEnums, name, value)` doesn't need a special case.

| Key | en | zh-TW |
| --- | --- | --- |
| `DomainEventOperation.CREATE` | Create | 建立 |
| `DomainEventOperation.UPDATE` | Update | 更新 |
| `DomainEventOperation.DELETE` | Delete | 刪除 |
| `DomainEventDeliveryStatus.PENDING` | Pending | 待處理 |
| `DomainEventDeliveryStatus.PROCESSING` | Processing | 處理中 |
| `DomainEventDeliveryStatus.PROCESSED` | Processed | 已處理 |
| `DomainEventDeliveryStatus.DEAD_LETTER` | Dead letter | 死信 |
| `DomainEventDeliveryStatus.IGNORED` | Ignored | 已忽略 |
