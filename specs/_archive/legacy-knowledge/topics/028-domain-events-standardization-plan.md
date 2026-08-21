---
type: topic
scope: cross-repo
status: active
created: 2026-07-18
updated: 2026-08-03
supersedes: null
superseded_by: null
---

# 028 - Domain Events 標準化：宣告式訂閱、內省 API、共用 Admin - 系統設計計畫

> 狀態：已完成（13/13 task，見 `028-task-breakdown.md`）。
>
> 範圍：`@appspine/domain-events` 套件本身（新增 decorator/內省 API/共用 admin module）、
> `@appspine/frontend-shell`（新增共用管理頁元件）、六個已採用 domain events 的業務 app
> （`apps/approve`／`wiki`／`calendar`／`chat`／`drive`／`project`）改用新機制、
> `appspine-app-template` 回填、`_archive/dev_docs-20260803/framework/002-app-dev-conventions.md` 補慣例。
>
> 來源：`026-domain-events-approve-plan.md`、`027-domain-events-rollout-plan.md`、
> `_archive/dev_docs-20260803/domain-events/Z20-domain-events-outbox.md` §8/§14/§15。026/027 完成後套件核心
> 與最小垂直切片模式已在六個 app 間驗證穩定，本計畫是 Z20 §15「Eventually each app should
> expose an admin page...This can live in `@appspine/frontend-shell` patterns once the
> backend model stabilizes」的兌現，加上使用者提出的三個新目標：**agent 容易定義、
> 系統執行順暢、人類容易監督**。

---

## 1. 背景

026/027 執行後留下一個明確的落差：

- **訂閱是完全 imperative 的**：`registry.on(eventType, handler)` 散落在各 app 的
  `domain-events.module.ts` 裡，沒有任何標準化的宣告位置、沒有強制的「這個訂閱是為了
  什麼」說明，也沒有任何方法可以查詢「目前登記了什麼」——`DomainEventRegistry` 完全是
  記憶體內的私有結構。
- **只有 `apps/approve` 有 admin 可視性**：其餘五個 app（wiki/calendar/chat/drive/
  project）採最小垂直切片，完全沒有辦法在不看程式碼、不查資料庫的情況下知道「這個
  app 定義了哪些事件、事件發生後怎麼處理的、有沒有失敗的 delivery」。
- **`apps/approve` 的 admin UI 是自製的**：因為 026 執行時套件核心還沒有機會在第二個
  app 上驗證，admin API/UI 依 G6 邊界留在 app-local。現在核心已經在六個 app 間驗證穩定，
  Z20 §15 當初就預告了「一旦 backend model 穩定，這塊可以收斂進 `@appspine/frontend-shell`
  的共用元件」——026 執行當下的條件現在成立了。

`@appspine/mcp-server` 的 `@McpTool()` 機制已經是這三個目標的成功先例：agent 在 method
上宣告 `@McpTool({ name, description, inputSchema, requiredScopes })`（`description`
必填）、module 呼叫一次 `registerMcpToolsFromInstance()` 自動掃描註冊、
`McpToolRegistry.getCatalogSnapshot()` 讓外部（含發現服務、人類）不用看程式碼就能查詢
目前有哪些 tool。本計畫把同一套手法對稱地套到 domain events 的訂閱機制上。

## 2. 決策摘要

1. **只標準化「code-registered」訂閱，不動「data-driven」路由**：Z20 §8 已經把這條線
   畫得很清楚——code-registered 訂閱是「開發時決策」（該不該通知、通知誰，是商業邏輯，
   要型別檢查、要 code review、要跟著 handler 一起部署），data-driven 路由（`apps/approve`
   的 `WebhookSubscription` 表）是「維運時決策」（admin 要不要在 UI 上開關某個 webhook）。
   `@DomainEventSubscriber` decorator 只標準化前者；`registerPrefix()`／
   `registerHandlerKeyContributor()` 這兩個給資料驅動路由用的擴充點維持現狀，不裝飾器化
   ——硬要讓動態路由也「宣告式」等於重新發明 Z20 §8 明確拒絕過的規則引擎。
2. **共用 admin module 收回進 `@appspine/domain-events` 套件本身**：推翻 026 G6 當時
   「admin API/UI 留 app-local」的決定。理由：G6 那時候的前提是「核心還沒在第二個 app
   驗證過」，現在已經在六個 app 間驗證穩定，繼續讓五個 app 各自零可視性、只有 approve
   自製一份，不符合「人類容易監督」的目標，也違反「不要因為還沒驗證就抽取」原則的
   反面——已經驗證過的東西继续不收斂，一樣是欠技術債。套件維持不含任何 app 專屬事件
   常數／handler 邏輯的原則不變，admin module 只操作 `DomainEvent`/`DomainEventDelivery`
   的通用欄位與 `DomainEventRegistry` 的內省資料，不知道任何 app 專屬的事件語意。
3. **Admin module 比照 `metadata-schema` 先例，直接出帶 guard 的 controller**：monorepo
   已有明確先例——`@appspine/metadata-schema` 的 `MetaController` 就是套件直接
   `@UseGuards(JwtOrApiKeyGuard, ScopeGuard)` + `@Scopes('metadata:read')`，直接依賴
   `@appspine/m2m-api-key`；`@appspine/mcp-server` 同。本套件的 admin controller 照做：
   `JwtOrApiKeyGuard` + `PermissionGuard` + `ScopeGuard`（002 guard chain 順序），
   `@RequirePermissions("DOMAIN_EVENTS_READ")`／`"DOMAIN_EVENTS_WRITE"`——rbac 的
   `RequirePermissions` 接受純字串（不是 app 的 Prisma enum），所以套件寫死字串即可。
   **關鍵預設行為**：在還沒定義這兩個 Permission enum 值的 app 裡（wiki/calendar/chat/
   drive/project 目前都沒有），`PermissionGuard` 的 ADMIN bypass 讓 ADMIN 角色照常通過、
   `READ_ALL` policy 通過 `_READ`，其他人 403——等於天然的「預設 admin-only」，app 想開放
   細粒度授權時再自行加 enum 值 + migration + i18n（見 §4）。scope 字串
   `domain-events:read`/`domain-events:write` 與 approve 現況一致。早先草稿的
   `forRoot({ guards })` 動態注入設計已放棄——沒有先例、多一層自創機制、且解決的是
   不存在的問題。
4. **前端管理頁走 021 的既有收斂模式**：比照 `@appspine/frontend-shell` 現有的
   `UsersTable`/`RolesTable`/`ApiKeysTable` 分工——套件（實質上會是 frontend-shell）
   提供純表格/detail/action 的展示元件，各 app 自己的 `page.tsx` 負責資料抓取（呼叫自己
   app 的 admin API）與 server actions，不是整頁搬過去。
5. **`apps/approve` 既有 admin UI 用「汰換」處理，其餘五個 app 用「補上」處理**：approve
   已經有一整套自製的 admin API/controller/service/前端頁面在正式使用中，這批換成套件
   共用版本時要注意行為零回歸（分頁、篩選、retry/ignore 動作、i18n 都要對得上現況）；
   其餘五個 app 目前完全沒有 admin UI，是從零新增,風險低很多。
6. **`registry.describe()` 只能完整描述 code-registered 訂閱**：data-driven 路由
   （prefix/contributor）本質上無法在啟動時就列舉出所有可能的 handler key（`webhook.post:`
   後面接的 subscription id 是執行期才知道的），`describe()` 只回報「這個 app 有註冊
   `webhook.post:` 前綴 resolver、有註冊 N 個 handler-key contributor」這種存在性資訊，
   不假裝能完整列舉。要看實際訂閱了誰，還是要查 `apps/approve` 的 `WebhookSubscription`
   admin API（這塊不變）。

## 3. 設計

### 3.0 Handler 檔案位置標準（agent 遵循的機械規則）

每個 app 的 domain events 程式碼一律遵守以下擺放規則（進 002 慣例，T-11290）：

| 內容 | 位置 | 規則 |
| --- | --- | --- |
| 事件常數 | `backend/src/domain-events/events.ts` | `as const` 物件，一個 aggregate 一個常數物件 |
| Handler class | `backend/src/domain-events/handlers/<name>.handler.ts` | 一檔一 class，class 名 `<Name>DomainEventHandler`，必掛 `@DomainEventSubscriber` |
| 接線 | `backend/src/domain-events/domain-events.module.ts` | 唯一允許出現 `registerDomainEventSubscribers()`／`registerPrefix()`／`registerHandlerKeyContributor()` 的檔案 |
| `record()` 呼叫點 | 各業務 service 內 | 必與業務寫入同一 transaction（既有規則不變） |

Agent 新增一個訂閱的標準流程就是三步：在 `events.ts` 加常數（如果是新事件）→ 在
`handlers/` 新增掛好 decorator 的 handler 檔案 → 把 handler 加進 module 的 providers
與 `registerDomainEventSubscribers()` 清單。不需要碰其他任何檔案。

### 3.1 `@DomainEventSubscriber` decorator + 自動掃描

比照 `@McpTool()`（`packages/mcp-server/src/mcp-tool.decorator.ts`）：

```ts
export interface DomainEventSubscriberOptions {
  /** One or more event types this handler subscribes to (e.g. audit-record subscribes to 7). */
  eventType: string | string[];
  /** Must be globally unique — see DomainEventRegistry.on()'s existing uniqueness rule. */
  key: string;
  /** Required. Why does this subscription exist? Shows up in the admin catalog view. */
  description: string;
}

export function DomainEventSubscriber(options: DomainEventSubscriberOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata('domain-events:subscriber', options, target);
  };
}

/** Scans instances for @DomainEventSubscriber()-decorated classes and registers them. */
export function registerDomainEventSubscribers(
  instances: DomainEventHandler[],
  registry: DomainEventRegistry,
): void {
  for (const instance of instances) {
    const options = readSubscriberOptions(instance);
    // Fail-loud enforcement (boot-time): an undecorated handler passed to the standard
    // registration path is a convention violation, not a silent skip.
    if (!options) {
      throw new Error(`${instance.constructor.name} is missing @DomainEventSubscriber`);
    }
    // The decorator's key and the class's readonly key are two declarations of the same
    // fact — validate they agree so they can't silently drift apart.
    if (options.key !== instance.key) {
      throw new Error(
        `${instance.constructor.name}: decorator key "${options.key}" != instance key "${instance.key}"`,
      );
    }
    if (!options.description.trim()) {
      throw new Error(`${instance.constructor.name}: description must not be empty`);
    }
    const eventTypes = Array.isArray(options.eventType) ? options.eventType : [options.eventType];
    for (const eventType of eventTypes) registry.on(eventType, instance);
    registry.describeSubscriber({ eventTypes, key: options.key, description: options.description });
  }
}

// 注意：class decorator 的 metadata 落在 constructor 上——必須從 instance.constructor 讀，
// 不是 Object.getPrototypeOf(instance)。@McpTool 是 method decorator、從 prototype 讀
// （mcp-tool.decorator.ts:22-24），照抄那個讀法在這裡會拿到 undefined。
function readSubscriberOptions(
  instance: DomainEventHandler,
): DomainEventSubscriberOptions | undefined {
  return Reflect.getMetadata('domain-events:subscriber', instance.constructor);
}
```

`Reflect.defineMetadata` 依賴 `reflect-metadata`——比照 `@appspine/mcp-server` 的既有做法
（host Nest app 在 bootstrap 時已載入，套件不另外宣告依賴），套件自己的 vitest 測試檔
需要自行 `import 'reflect-metadata'`。

App 端的 handler class 從：

```ts
@Injectable()
export class AuditRecordDomainEventHandler {
  readonly key = "audit-record";
  async handle(input) { ... }
}
```

變成：

```ts
@Injectable()
@DomainEventSubscriber({
  eventType: Object.values(ApprovalInstanceEvents),
  key: "audit-record",
  description: "Writes an AuditLog row for every ApprovalInstance lifecycle event.",
})
export class AuditRecordDomainEventHandler implements DomainEventHandler {
  readonly key = "audit-record";
  async handle(input) { ... }
}
```

`domain-events.module.ts` 的 provider factory 從一條條手動 `registry.on(...)` 呼叫，
變成一次 `registerDomainEventSubscribers([auditRecordHandler, ...], registry)`——比照
`registerMcpToolsFromInstance(this, registry)` 仍是一行呼叫，不是全自動 DI-wide 掃描
（維持 NestJS 慣例：provider 明確列在 module 裡，不做隱式全域掃描）。

### 3.2 `DomainEventRegistry` 內省 API

```ts
export type DomainEventSubscriberDescriptor = {
  eventTypes: string[];
  key: string;
  description: string;
};

class DomainEventRegistry {
  // ...既有 API 不變...
  describeSubscriber(descriptor: DomainEventSubscriberDescriptor): void; // 內部使用，registerDomainEventSubscribers() 呼叫
  describe(): {
    subscribers: DomainEventSubscriberDescriptor[];
    dataDrivenPrefixes: string[]; // 存在性資訊，不展開實際 handler key
    hasHandlerKeyContributors: boolean;
  };
}
```

### 3.3 共用 Admin Module（收回進 `@appspine/domain-events`）

新增一個獨立的 NestJS module（例如 `packages/domain-events/src/admin/domain-events-admin.module.ts`），
內容大致是把 `apps/approve` 現有的 `domain-events-admin.service.ts`/`.controller.ts` 通用化：

- `GET /domain-events/catalog`（新增）：回傳 `registry.describe()` 的訂閱目錄 **join**
  每個 handler key 的 delivery 統計（total/processed/dead-letter/最近一次狀態與時間，
  DB 端 `groupBy` + `DISTINCT ON`，複用 approve webhook deliverySummary 已驗證的查詢
  模式）——「定義了什麼」與「實際跑得如何」在同一個回應裡，這是人類監督的核心畫面。
  **Join 方向明確規範**（避免實作者自行猜測）：以 `describe()` 的 code-registered
  訂閱為主列（LEFT JOIN 統計，沒有 delivery 的訂閱也要顯示、統計為零）；DB 中存在
  但 `describe()` 沒有條目的 handler key（即 data-driven key，如 approve 的
  `webhook.post:<id>`）**另列一組「data-driven deliveries」區塊**呈現其統計——不能
  因為沒有 describe() 條目就讓 approve 流量最大的 handler 在監督畫面上隱形。
  **統計時間界限**：預設只統計最近 30 天的 delivery（catalog 是每次載入都跑的查詢，
  無界的全表 groupBy 會隨資料成長劣化；`(handlerKey, createdAt)` 索引同時服務這個
  時間過濾）。
  **路由順序陷阱**：`catalog` 路由必須宣告在 `/:id` 之前，否則會被 `:id` 攔截
  （T-10920 當年 webhooks controller 犯過同一類錯，執行時要有對應測試）。
- `GET /domain-events`（分頁 + eventType/aggregateId/日期篩選）
- `GET /domain-events/:id`（含 deliveries）
- `POST /domain-events/deliveries/:id/retry`／`/ignore`（沿用既有的 atomic guard——
  `status: { not: PROCESSING }`——避免跟 dispatcher 競態）
- Guard 比照 `metadata-schema` 先例直接掛在套件 controller 上（見決策 3），套件新增
  對 `@appspine/m2m-api-key`／`@appspine/rbac` 的依賴（用 `dependencies`，比照
  `metadata-schema`/`mcp-server` 既有慣例；連帶繼承的 peer 依賴範圍在發布閘門
  T-11225 逐 app 核對，見 Z21 教訓）。
- **套件入口隔離（關鍵包裝決定）**：admin module **絕不**進 root barrel（`index.ts`）
  ——否則 template 這類只用 `record()`/dispatcher 的消費者，`require('@appspine/domain-events')`
  時會連帶 eager-load admin controller 的整條 auth 依賴鏈，在 require 時爆掉（這個
  monorepo 已被同類問題燙過，見 `mcp.controller.ts:12-17` 的註解）。admin 以第二入口
  `@appspine/domain-events/admin` 出貨：`exports` map 加 `./admin` 條目 + root-level
  `admin.js`/`admin.d.ts` shim（比照既有 `testing.js` 的 classic-moduleResolution
  因應手法）。核心消費者（含 template）永遠不 import 它。
- **實作紀律**：套件內不能 import app 的 `@prisma/client` 型別（`Prisma.DomainEventWhereInput`
  等），where 條件比照 dispatcher 用 structural 寫法；`DomainEvent.seq` 在共用 DTO 一律
  宣告為 `string` 並於序列化時轉字串（002 BigInt 紀律）。
- **索引前提**：catalog 的 per-key 統計查詢依賴 `(handlerKey, createdAt)` 索引——目前
  只有 approve 的 schema 有（commit 67b42b4）。本計畫把它納入 `docs/prisma-model.md`
  的標準 model pattern，五個 app 與 template 各補一個 migration（見各 task）。

### 3.4 `@appspine/frontend-shell` 共用管理頁元件

比照 `components/admin/{users,roles,api-keys}-table.tsx` 的既有分工，新增：

- `DomainEventsTable`／`DomainEventDetailPanel`（事件列表 + before/after/changedFields 呈現）
- `DomainEventDeliveriesPanel`（delivery 狀態、attempts、lastError，retry/ignore 動作）
- `DomainEventCatalogTable`（呈現 catalog 端點的結果——event type、handler key、
  description、**加上每個訂閱的 delivery 統計欄**（最近狀態/成功/dead-letter 數），
  「這個訂閱是什麼、為什麼存在、最近有沒有在動、有沒有失敗」一列看完——這是
  「人類容易監督」的核心畫面）

各 app 自己的 `page.tsx`／server actions 保持 app-local（呼叫自己 app 的 admin API），
比照現有慣例。i18n 依既有共用元件手法由 app 傳入 `t` 函式。

**i18n key 的來源與歸屬（五個 app 目前零 domain-events 翻譯 key，必須明確）**：
T-11220 交付一份**標準 key 清單文件**（namespace 建議 `domainEvents.*`），涵蓋欄位
標題、retry/ignore 動作文案、以及 `DomainEventDeliveryStatus`／`DomainEventOperation`
的值標籤——注意這兩組是**套件的 const 物件**、不是各 app 的 Prisma enum，所以
`check:enum-i18n` 不會強制它們，歸屬只能靠這份文件約定（approve 目前已有的
`enums.DomainEvent*` key 沿用，不搬家）。各 app task 落地時把這份清單抄進自己的
`messages/{en,zh-TW}.json`，是明確的 task 項目，不是「i18n 齊備」四個字帶過。

### 3.5 Enforcement（規範的擋點）

「agent 容易定義」的另一半是「不遵守規範時會被擋下來」，比照 `check:schema-docs` 的
既有防再犯模式，兩層：

1. **開機 fail-loud**（套件內建，見 §3.1 的掃描 helper）：沒掛 decorator 的 handler、
   decorator key 與 class key 不一致、description 空白——都在 `registerDomainEventSubscribers()`
   直接 throw，app 啟動就爆，不會靜默漏掉。
2. **`check:domain-events-subscribers` 腳本**（各 app `backend/scripts/`，掛 pre-commit）：
   靜態檢查 `backend/src/` 內除了 `domain-events.module.ts` 之外沒有任何 `registry.on(`
   直接呼叫（防止繞過標準註冊路徑）、`handlers/` 下每個 `*.handler.ts` 都含
   `@DomainEventSubscriber` **或**明確的豁免標記。grep 級檢查即可，不用 AST——目標是
   擋住「忘了照規範」，不是完備的靜態分析。
   **豁免機制（必要，不是選配）**：prefix-resolved 的 handler（如 approve 的
   `webhook-post.handler.ts`——經 `registerPrefix()` 動態解析，決策 1 明定不掛
   decorator）在檔案頂部加一行 `// @domain-events-undecorated: <原因>` 標記，檢查腳本
   看到標記即跳過該檔。**不能用檔名豁免**：wiki 的 `webhook-post.handler.ts` 與 approve
   同名，但它是 exact-registered、必須掛 decorator——同名檔案在不同 app 的裝飾要求相反，
   只有檔內標記能正確區分。

## 4. 範圍與排除

- 不改變 `record()`／dispatcher 的核心行為，本計畫純粹是訂閱宣告方式與可視性的標準化。
- 不把 `registerPrefix()`／`registerHandlerKeyContributor()` decorator 化（見決策 1）。
- 不強制 `apps/wiki`／`calendar`／`chat`／`drive`／`project` 一定要用完整版 admin
  （catalog 唯讀端點是輕量的，這五個 app 加上去的成本很低，但若執行時發現某個 app
  沒有實際需求，可以只加 catalog、不加完整的 retry/ignore admin UI，需在執行結果說明
  理由）。
- 不在本計畫內把 approve 既有的 `WebhookSubscription` admin CRUD 收斂進套件——那是
  data-driven 路由的維運介面，跟本計畫的「訂閱宣告標準化」是不同主題，維持 app-local。
- **包含**的 schema 變更範圍：`(handlerKey, createdAt)` 索引升格為標準 model pattern
  （§3.3 索引前提），五個 app + template 各補一個 migration；除此之外不動任何 schema。
- Permission enum 值（`DOMAIN_EVENTS_READ/WRITE`）**不強制**加到五個 app——共用 admin
  的預設 ADMIN-only 行為（決策 3）對最小切片即夠用，要開放細粒度授權的 app 自行加值
  （+ migration + i18n）並在執行結果記錄。

## 5. 風險與待決事項

- **`apps/approve` 既有 admin UI 汰換的回歸風險**：這是本計畫風險最高的一個 task——
  approve 的 admin 頁面已經是正式功能，換底層要做到分頁/篩選/retry/ignore/i18n/
  `seq` 字串化全部行為一致，需要瀏覽器實測，不能只靠 API 測試腳本。
- **五個最小切片 app 的 Permission 授權粒度**：共用 admin 掛上後預設 ADMIN-only（見
  決策 3 的 bypass 行為）。各 app 是否要加 `DOMAIN_EVENTS_READ`/`DOMAIN_EVENTS_WRITE`
  enum 值（+ migration + `enums.*` i18n）開放細粒度授權，由各 app task 執行時判斷並
  記錄——不強制，ADMIN-only 對最小切片可能已經夠用。
- **decorator 的 `eventType` 與 `events.ts` 常數是引用關係、非驗證關係**：decorator
  選項參照常數（`eventType: ApprovalInstanceEvents.Submitted`），typo 會被 tsc 抓到，
  但「事件常數已刪除、decorator 忘記跟上」這類 drift 沒有額外檢查；如需要，未來可
  擴充 `check:domain-events-subscribers`，不在本批範圍。

詳細 task 拆解、複雜度標記、依賴關係見 `028-task-breakdown.md`。

