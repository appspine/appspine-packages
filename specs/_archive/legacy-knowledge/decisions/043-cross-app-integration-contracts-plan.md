---
type: decision
scope: cross-repo
status: completed
created: 2026-08-07
updated: 2026-08-07
supersedes: null
superseded_by: null
---

# 043 - 跨 App Integration Contract 機制計畫

> 本文件是已完成的 plan，目標是讓跨 App 整合契約能被人與 AI Agent 穩定查找、建立、編輯、驗證與實作。043 定義 contract 的治理、schema、版本與工具；可靠 outbox／delivery 能力沿用並擴充既有 `@appspine/domain-events`，不建立第二套 dispatcher，也不預先決定 message broker。

工作分解：[log.md](../log.md)。相關實例：[[Z31-document-governance-workflow-plan]]。平台身分委派能力：[[042-oidc-delegation-package-plan]]。既有可靠事件能力：[[027-domain-events-rollout-plan]] 與 [[002-app-dev-conventions#Domain Events 使用慣例]]。

## 1. 問題

目前跨 App 計畫通常在單一文件中描述流程、payload、權限與重試規則。當不同 App 開始實作時，容易出現：

- 同一個互動的 request、event 與錯誤語意分散在多份文件。
- 只有流程示意，沒有可直接實作與測試的契約。
- AI Agent 找不到「誰提供什麼、誰消費什麼、目前哪個版本有效」。
- API、webhook、Domain Event 與資料庫 outbox 的責任邊界不清楚。

## 2. 目標

建立一個以「跨 App 互動」為單位的 Integration Contract 機制，讓每一份契約都具備：

- 唯一識別名稱與穩定位置。
- interaction-specific roles（provider／callers 或 producer／consumers）與方向。
- 可驗證的 schema、版本與相容性規則。
- 認證、授權、冪等、重試、錯誤與可觀測性要求。
- 明確的狀態、生命週期與驗收案例。
- 可由 AI Agent 依索引查找、建立草案、更新版本與檢查引用。

## 3. 非目標

- 第一階段不建立集中式跨 App 業務管理服務。
- 第一階段不要求所有互動都改成事件。
- 不以泛用事件匯流排取代需要同步結果的 Command API。
- 不在本文件決定特定 broker、雲端服務或部署拓撲。
- 不讓 integration contract 取代各 App 的 domain model 與本地權限規則。

## 4. 互動模型

跨 App 互動先分成三種：

| 類型 | 語意 | Maintainer | Required reviewer | 適用情境 |
| --- | --- | --- | --- | --- |
| Command | 請另一個 App 執行一個動作 | API provider | callers | Wiki 要求 Approve 建立異動申請 |
| Event | 通知其他 App 某件事已發生 | event producer | consumers | Approve 通知 Wiki 申請已核准 |
| Query | 查詢另一個 App 的目前狀態 | API provider | callers | 查詢申請狀態或待核准事項 |

傳輸方式是實作選擇，不是互動模型本身：Command 可以使用 HTTP API，Event 可以使用 webhook、relay 或 message broker，Query 通常使用 API。

Command／Query 使用 `provider`／`callers`；Event 使用 `producer`／`consumers`。不得為了統一 frontmatter 而把 API caller 誤稱為 contract owner。

### 4.1 整合流程總覽

```mermaid
flowchart LR
    Caller[Caller App<br/>例如 Wiki]
    CallerDB[(Caller DB)]
    Command[Command API]
    Provider[Provider App<br/>例如 Approve]
    ProviderDB[(Provider DB)]
    Outbox[(Transactional Outbox)]
    Relay[@appspine/domain-events<br/>Dispatcher / Transport Adapter]
    EventBus[(Event Bus<br/>或 Webhook Transport)]
    Subscriber[Event Consumer<br/>例如 Wiki / Notification]
    SubscriberDB[(Consumer DB / Side Effect)]
    Query[Query API]

    Caller -->|Command request| Command
    Command --> Provider
    Provider -->|建立本地資料| ProviderDB
    Provider -->|同一 transaction| Outbox
    Outbox --> Relay
    Relay --> EventBus
    EventBus --> Subscriber
    Subscriber -->|冪等處理| SubscriberDB
    Caller --> Query
    Query --> Provider

    Capability[Capability Definition<br/>schema / semantics / version]
    Binding[Integration Binding<br/>participants / auth / transport / retry]
    Binding -.pins version + digest.-> Capability
    Capability -.schema.-> Command
    Capability -.schema.-> EventBus
    Capability -.schema.-> Query
    Binding -.delivery policy.-> Relay
```

> 圖中 Command／Query 段落使用 `Caller`／`Provider` 節點名稱，對應第 4 節定義的 `provider`／`callers` 角色；只有 Event 段落（`Relay` → `EventBus` → `Subscriber`）代表 `producer`／`consumers` 語意，避免把 API caller 誤稱為 producer/consumer。

在 Z31 中，Wiki → Approve 是 Command；Approve 核准後透過 outbox 與 relay 發出事件，再由 Wiki 執行 revision 發布。Approve transaction 不直接同步呼叫 Wiki。

## 5. Contract 的最小單位

Contract 分成「capability definition」與「integration binding」兩層，避免同一 API／Event 因 consumer 增加而複製 schema。

Capability definition 定義 provider／producer 擁有的穩定能力與 schema：

```text
approve.submit-knowledge-document-change
approve.get-knowledge-document-change-request-status
approve.knowledge-document-change-approved
```

Integration binding 定義一對參與者如何使用該 capability：

```text
wiki-to-approve.submit-knowledge-document-change
wiki-to-approve.get-knowledge-document-change-request-status
approve-to-wiki.knowledge-document-change-approved
approve-to-notification.knowledge-document-change-approved
```

`contract_kind: capability` 擁有 request／response 或 Event payload schema；`contract_kind: binding` 必須引用一個精確 capability version，只補充 caller／consumer、transport、authentication、endpoint、filter、retry 與 App-local rollout，不得複製或改寫 capability schema。

一份 capability contract 至少記錄：

- `contract_id`、SemVer `version`、`status` 與 immutable content digest
- `contract_kind: capability`
- `interaction` 與依互動類型使用的 `provider`／`callers` 或 `producer`／`consumers`
- 業務目的與觸發條件
- request、response 或 event envelope schema
- 認證、授權與 acting identity 規則
- idempotency、timeout、retry、duplicate 與 ordering 語意
- HTTP status／Event delivery outcome 的 retryable／terminal 分類
- 錯誤分類與 consumer 應採取的處理
- data ownership、敏感資料與不可傳遞欄位
- correlation、trace、audit 與 request/event ID 規則
- 驗收案例與實作連結

一份 binding contract 至少記錄：

- `contract_id`、SemVer `version`、`status` 與 digest
- `contract_kind: binding`
- `capability_ref` 的 contract ID、精確 SemVer 與 digest
- source／destination App、transport、endpoint 與 environment-independent destination key
- authentication、expected source identity、retry／terminal policy 與 rollout status
- producer／provider maintainer 與 caller／consumer required reviewers

## 6. 建議的文件結構

Contract 應與架構決策、業務流程分離，集中放在明確的 contract 目錄：

```text
knowledge/
├─ decisions/                  # 為什麼採用這套機制
├─ contracts/                  # 可直接實作的跨 App 契約
│  ├─ index.md                 # Agent 查找入口，由 contract-cli.mjs index 維護
│  ├─ capabilities/
│  │  └─ approve.submit-knowledge-document-change/
│  │     └─ versions/
│  │        └─ 1.0.0/
│  │           ├─ contract.md
│  │           ├─ openapi.yaml
│  │           └─ schemas/
│  └─ bindings/
│     └─ wiki-to-approve.submit-knowledge-document-change/
│        └─ versions/
│           └─ 1.0.0/
│              └─ binding.md
└─ topics/                     # 業務流程與背景說明
```

workspace 的 `knowledge/contracts/` 是 canonical contract 的唯一正式來源。各 App 仍應建立自己的 `knowledge/contracts/`，但只保存受治理的 local view，不是另一份可以自由修改的完整副本：

```text
workspace/knowledge/contracts/       # canonical contract，唯一正式版本
apps/wiki/knowledge/contracts/       # Wiki 參與的 caller／consumer views
apps/approve/knowledge/contracts/    # Approve 參與的 provider／producer views
```

App-local view 分成不可手改的 generated snapshot 與人工維護的 implementation notes：

```text
knowledge/contracts/<contract-id>/
├─ _generated/
│  ├─ contract-ref.json       # contract_id、version、digest、canonical source
│  ├─ openapi.yaml            # Command／Query 才有
│  └─ schemas/                # App build／validator 可直接使用的版本快照
└─ implementation.md          # 本 App 的 wiring、outbox／handler、測試與部署說明

backend/src/generated/integration-contracts/<contract-id>/
├─ manifest.ts                # contract_id、version、digest
├─ types.ts
└─ validators.ts
```

`contract-cli.mjs sync-views` 只覆寫 knowledge `_generated/`，不得改動 `implementation.md`；`generate-runtime` 只依 pinned snapshot 產生 backend 可編譯並隨 production image 進入 `dist` 的 types／validators，不在 runtime 讀取 `knowledge/`。App CI 只依賴 repo 內已提交的 generated snapshot 與 runtime artifact，不在 build 時跨 repo 或連線 workspace；workspace integration CI 則比對 snapshot、runtime manifest 與 canonical `contract_id`、version、digest，避免漂移。完整 schema、跨 App 語意與版本政策仍以 workspace canonical contract 為準。

跨 repo 同步採 manifest-driven change set：`sync-views --dry-run` 先列出 canonical commit、精確目標 repo／路徑與預期 digest；`--apply` 逐 repo 寫入但不 commit，任何 repo 失敗即停止並輸出已改／未改清單。各 repo 以獨立 commit／PR 落地，workspace index 保存 canonical commit → App commit mapping；沒有「跨 repo 原子 commit」的假象。

**未決問題：跨 repo 檔案存取機制。** `contract-cli.mjs index`（掃描 App-local `_generated/contract-ref.json`）與 `sync-views`（讀寫 App repo 檔案）目前假設 workspace、`appspine/`、`appspine-app-template/`、`apps/wiki/`、`apps/approve/` 在執行當下同時存在於同一個檔案系統路徑下。這在單一開發機上用 sibling checkout 慣例可以成立，但這些是各自獨立的 git repo（非 submodule），CI job 預設只 checkout 觸發它的那個 repo，全新 clone 的機器上也不會自動具備其他 repo。動工前必須在 T-17300 選定並記錄其中一種做法：

1. 建立顯式的 multi-repo checkout 慣例／工具（CI 內以多個 checkout step 或 manifest-based repo 工具取得指定 App repo 的指定 ref），workspace CI 明確宣告依賴哪些 App repo。
2. 反轉方向：不由 workspace push 進 App repo，改由每個 App CI 主動 pull canonical 特定版本、自行產生 PR，`sync-views` 只在 App repo 內執行。
3. 明確限定跨 repo 指令只能在人工於本機備妥全部 sibling checkout 後執行，CI 不自動觸發，純粹是本機工具。

三者對 T-17530／T-17550 的 CI 設計與 index 即時性有實質差異，選定前不應開始編碼 CLI 的跨 repo 部分。同一個問題也影響 digest 演算法共用：`@appspine/integration-contracts`（`appspine/` repo）提供 canonical JSON／manifest digest helper，但 `contract-cli.mjs`（workspace repo）計算 contract version digest需要用同一套演算法，而此時該 package 通常尚未發布到 registry（發布是 T-17910／T-17920 的人工 gate）。workspace 開發期間如何取得這份演算法（透過選定的 checkout 機制 import 未發布程式碼、或在 workspace 內維護一份輕量實作並以固定 test vectors 與 package 保持同步）必須一併寫進 T-17310 的驗收範圍。

在目前 workspace 尚未建立 `knowledge/contracts/` 前，Z31 可先在自己的計畫文件中列出 contract 清單；043 定案後再搬移，不應讓 contract 只存在 Mermaid 或段落中的非結構化描述。

## 7. 讓 AI Agent 容易查找與編輯

每份 contract 使用固定 frontmatter：

```yaml
---
type: integration-contract
contract_kind: capability
contract_id: approve.submit-knowledge-document-change
version: 1.0.0
status: draft
interaction: command
transport: http
provider: approve
callers:
  - wiki
maintainer: approve
required_reviewers:
  - wiki
created: 2026-08-07
updated: 2026-08-07
---
```

Binding frontmatter 另外固定引用 immutable capability：

```yaml
---
type: integration-contract
contract_kind: binding
contract_id: wiki-to-approve.submit-knowledge-document-change
version: 1.0.0
status: draft
interaction: command
capability_ref:
  contract_id: approve.submit-knowledge-document-change
  version: 1.0.0
  digest: sha256:...
source_app: wiki
destination_app: approve
transport: http
maintainer: approve
required_reviewers:
  - wiki
---
```

緊急停用／恢復投遞（kill switch）刻意不做成這份 frontmatter 的欄位：canonical binding 內容受 digest 保護、`APPROVED` 後不可原地修改，任何會改變 hash 的欄位變動都必須升版。Kill switch 需要「不升版、立即生效、可由 on-call 直接操作」，因此是 App-local runtime 狀態，不是 contract 內容，見第 8.7 節。

文件正文固定使用以下標題，讓 Agent 可以依標題與 frontmatter 定位內容：

```text
# <contract name>
## Purpose
## Participants and ownership
## Trigger and business semantics
## Request / response or event schema
## Authentication and authorization
## Idempotency and retry
## Errors and failure handling
## Observability and audit
## Compatibility and versioning
## Acceptance scenarios
## Open decisions
```

每份 contract artifact 只描述一個 capability definition 或一個 point-to-point binding；流程總覽透過 `[[wikilinks]]` 引用它。Agent 修改 contract 時，必須依 `contract_kind`／互動類型同步檢查 capability reference、provider／callers 或 producer／consumers、相關決策與實作連結。

Agent 不應手工拼出目錄與 frontmatter；第一階段 CLI 至少提供：

```text
node scripts/contract-cli.mjs init
node scripts/contract-cli.mjs validate
node scripts/contract-cli.mjs diff
node scripts/contract-cli.mjs index
node scripts/contract-cli.mjs sync-views
node scripts/contract-cli.mjs generate-runtime
node scripts/contract-cli.mjs check-compatibility
```

`init` 依 `interaction`／`contract_kind` 產生正確的角色欄位與範本；`validate` 檢查 Markdown、JSON Schema、OpenAPI、資料分類與引用；`diff`／`check-compatibility` 判斷版本升級需求；`sync-views` 只更新 App-local `_generated/`；`generate-runtime` 將 pinned schema 轉成 App backend 可編譯的 types／validators。

## 8. Reliable delivery baseline

043 不建立 `@appspine/integration-relay`。跨 App Event 沿用 `@appspine/domain-events` 的 transaction-bound outbox、dispatcher、retry／backoff、dead-letter、stale-lock recovery 與 `postDomainEventWebhook()`；043 只擴充 external envelope、inbound verification、contract validation 與 consumer receipt 規則。

不論最後採 HTTP webhook 或 message broker，跨 App Event 的最低要求是：

1. producer 在自己的資料庫 transaction 內寫入 outbox。
2. `@appspine/domain-events` dispatcher 從 outbox 發布，具備 retry、backoff 與 dead-letter 狀態。
3. consumer 先完成 raw-body／signature／schema verification，再以 event ID 寫入 receipt／inbox；receipt、業務狀態更新與下一段 local outbox 必須位於同一個 transaction boundary。
4. event payload 不包含 access token、API key 或不必要的機密資料。
5. event 具備 envelope version、capability ID／version、binding ID／version、source App、occurred-at、correlation ID 與 aggregate identity。
6. consumer 可安全重播；不可依賴事件只送達一次。
7. HTTP webhook receiver 必須使用共用 verifier 檢查 raw body HMAC、timestamp freshness、constant-time signature comparison、允許的 source／contract、secret key ID 與 rotation window。
8. destination 必須來自 server-side allowlist／admin-owned subscription，不接受 event payload 或 caller 任意提供 URL；避免 SSRF。
9. contract 必須定義 HTTP status／delivery outcome 的 retryable 與 terminal 分類。

`@appspine/domain-events` 應補上與 outbound helper 對稱的 `verifyDomainEventWebhook()`、verification options 與測試 fixture；App 不自行複製 HMAC／timestamp／replay 驗證程式碼。

### 8.1 Webhook Protocol v2

第一階段的新跨 App binding 一律使用 Webhook Protocol v2；既有 v1 sender／receiver 採「先 dual-read、再 v2-write、最後移除 v1」遷移，且必須在 pilot `VERIFIED` 前記錄 v1 sunset date。

必要 headers：

```text
X-Appspine-Webhook-Version: 2
X-Appspine-Key-Id
X-Appspine-Event-Id
X-Appspine-Capability-Id
X-Appspine-Capability-Version
X-Appspine-Binding-Id
X-Appspine-Binding-Version
X-Appspine-Timestamp
X-Appspine-Signature: sha256=<hex>
```

HMAC-SHA256 的 canonical input 為：

```text
v2\n
<UPPERCASE_METHOD>\n
<PATH_AND_QUERY>\n
<TIMESTAMP>\n
<EVENT_ID>\n
<CAPABILITY_ID>\n
<CAPABILITY_VERSION>\n
<BINDING_ID>\n
<BINDING_VERSION>\n
<SHA256_RAW_BODY>
```

`TIMESTAMP` 使用 UTC RFC 3339；`PATH_AND_QUERY` 使用實際送出的 HTTP request-target（包含原始 percent-encoding 與 query，不含 scheme／host），sender 與 receiver 不得各自重新排序或 decode／encode。Body digest 對收到的 raw bytes 計算，JSON parse 前必須先完成 signature verification。

`PATH_AND_QUERY` 納入簽章隱含假設 sender 與 receiver 之間不存在會重寫路徑、正規化 query string 或改變大小寫的 reverse proxy／API gateway；若目標部署環境存在這類中介層，該 binding 必須改用固定路徑常數或改採不含 path 的簽章輸入，並在 rollout 前以實際網路路徑驗證簽章可重現，不能只在單元測試環境驗證。

Verifier 先依 destination binding 與 `keyId` 解析 per-destination secret、expected source App、允許的 capability／binding version；再以 constant-time comparison 驗證 signature，檢查 timestamp freshness、body size／content type，最後比對 header、envelope 與 key configuration。`sourceApp` 只是被比對的宣告值，不能作為信任來源。Rotation 使用 current／previous key overlap window，過期 key 一律拒絕。

Destination policy 第一階段預設 code／environment allowlist；admin-managed subscription 仍必須受 allowlist 約束。Production 僅允許 HTTPS、禁止 redirects，DNS resolve 後拒絕 loopback、private、link-local、multicast、unspecified 與 cloud metadata addresses，連線時需防 DNS rebinding（固定已驗證 IP 或經受控 egress proxy）。URL 不得從 event payload、Command body 或 caller 任意輸入。

### 8.2 External Event envelope

既有 `DomainEventRecord` 是 App-local outbox record；external envelope 是跨 App wire contract。Common envelope builder 可以只有一個，但 contract-specific payload builder 必然是 app-local。Payload 必須在 business transaction 內、寫入 outbox 前完成 schema validation 與凍結；dispatcher 不得在稍後依當時最新版程式重新推導 payload：

```text
business state
  -> contract-specific buildPayload()
  -> validate pinned payload schema
  -> DomainEventsService.record(integration = frozen contract metadata + payload)
  -> commit business state + outbox together
  -> DomainEventRecord
  -> buildIntegrationEventEnvelope()
  -> validate envelope + frozen payload digest
  -> postDomainEventWebhook()
```

`DomainEvent`／`DomainEventRecord` 新增 optional integration fields；純 App-local event 全部可為 `null`：

```text
integrationCapabilityId
integrationCapabilityVersion
integrationBindingId
integrationBindingVersion
integrationEnvelopeVersion
integrationSourceApp
integrationPayload
integrationPayloadDigest
```

`integrationSourceApp` 由 server configuration 注入，不接受 request／event payload 指定。`integrationPayloadDigest` 對 RFC 8785 canonical JSON 或本計畫定案的等價 deterministic encoding 計算 SHA-256。Package 的 Prisma model pattern、schema drift checker、types、testing fixtures 與所有 App migration 必須同步升級。

External envelope 至少包含：

```text
eventId
eventType
capabilityId
capabilityVersion
bindingId
bindingVersion
envelopeVersion
sourceApp
occurredAt
aggregateType
aggregateId
correlationId
actor（可選且受 data classification 約束）
payload
```

`@appspine/integration-contracts` 擁有 envelope type／schema／validator；`@appspine/domain-events` 依賴前者並擁有 common envelope builder、outbox 與 transport，避免反向依賴。App-local contract module 擁有 `buildPayload()`，但只能把已驗證 payload 交給 `record()`，不能自行組 envelope。Envelope 不直接暴露 App-local `before`／`after`，除非 capability contract 明確定義為 payload 且通過資料分類檢查。

### 8.3 Delivery outcome taxonomy

`@appspine/domain-events` 新增明確 error taxonomy：

```text
DomainEventIgnoredError     -> IGNORED
DomainEventTerminalError    -> DEAD_LETTER immediately
DomainEventRetryableError   -> PENDING + backoff；超過 max attempts 後 DEAD_LETTER
```

共用 webhook transport 預設 mapping：

- `2xx`：`PROCESSED`。
- `409` 且回應為驗證後的標準 `event_already_processed`：視為 `PROCESSED`；其他 `409` 為 terminal。標準回應 body 固定為 `{ "status": "already_processed", "eventId": "<與 request 相同的 X-Appspine-Event-Id>" }`，由 `@appspine/integration-contracts` 提供對應 JSON Schema；`eventId` 不吻合視為一般 terminal `409`，不得只憑 HTTP status code 判斷。
- `400／401／403／404／410／422`：terminal。
- network／timeout、`408／425／429／5xx`：retryable。
- `Retry-After` 僅對 retryable outcome 生效，且受 package 的最大 backoff 上限約束。

Contract 可在安全範圍內收緊 mapping，但不能把 authentication／schema failure 改成無限 retry。Response body 不直接寫入 `lastError`；只保存 bounded、redacted category、HTTP status、contract ID 與 attempt metadata，不保存 raw body／header／URL secret。

### 8.4 Command reliability baseline

Command API 不必強制轉成 Event，但每份 contract 必須定義：

- 穩定 idempotency key、唯一約束與「相同 key 不同 payload」的 `409` 語意。
- request timeout 後的 uncertain outcome，以及 caller 用哪個 Query／status endpoint reconciliation。
- `201`／`202`／`409`／`422`／`429`／`5xx` 等 response 的 retryable／terminal 分類。
- caller 的 `PENDING`／`FAILED`／`CONFIRMED` handoff 狀態與恢復方式。
- retry 不得重複建立業務資料、通知、audit 或後續 Event。

### 8.5 Data classification enforcement

JSON Schema property 使用 `x-appspine-data-classification` 標註 `PUBLIC`、`INTERNAL`、`PERSONAL`、`SENSITIVE` 或 `SECRET`。`contract-cli.mjs validate` 必須拒絕跨 App payload 中的 `SECRET`，並要求 `PERSONAL`／`SENSITIVE` 欄位明確定義傳遞目的、log／audit redaction 與保存期限。既有 key-name heuristic redaction 只保留為縱深防禦，不能取代 schema classification。

所有 payload leaf property 必須有 classification；`additionalProperties: true` 與未受 schema 約束的自由物件預設禁止。需要 dictionary 時，`additionalProperties` 必須引用具有 classification 的 value schema。Custom keyword 由 `@appspine/integration-contracts` validator plugin 與 `contract-cli.mjs validate` 強制執行，不能依賴一般 JSON Schema validator 忽略 unknown keyword 的預設行為。

### 8.6 Consumer receipt／inbox

共用 package 提供 consumer receipt Prisma model pattern、drift checker 與 transaction helper；各 App 擁有 migration history：

```text
IntegrationEventReceipt
  id
  sourceApp
  eventId
  capabilityId
  capabilityVersion
  bindingId
  bindingVersion
  payloadDigest
  processedAt
  createdAt

UNIQUE(sourceApp, eventId)
```

Raw-body HMAC、freshness、source binding 與 schema verification 在開啟 DB transaction 前完成。Transaction 內原子執行 receipt insert、App-local business state change，以及必要的下一段 local outbox write；duplicate unique conflict 讀取既有 receipt，若 digest／contract 不同則拒絕並告警。若後續是外部 side effect，不得在 receipt transaction 內直接呼叫，必須以 local outbox chaining 可靠執行。

### 8.7 Binding 投遞 kill switch

Binding 的緊急停用／恢復是 App-local 操作狀態，不進入 canonical contract、不影響 digest、不需要新版本：

- Producer／dispatcher 端：`@appspine/domain-events` 既有 admin 能力擴充「依 `bindingId` 暫停／恢復投遞」，暫停後 dispatcher 直接將該 binding 的待送事件轉為 `PENDING`（不消耗 retry 次數），恢復後才繼續投遞。
- Consumer／inbound verifier 端：webhook receiver 依 `bindingId` 檢查是否被本地標記為暫停接收，暫停中一律回應會被歸類為 retryable 的狀態（例如 `503`），不得回應會導致 producer 判定為 terminal 的狀態碼，避免對方 dead-letter 掉合法事件。
- 兩者都是各 App 自己資料庫或設定內的旗標，透過既有 admin 介面／指令操作，不經 `contract-cli.mjs`、不寫回 `knowledge/contracts/`。
- `generate-runtime` 產生的 manifest 只包含 contract 版本資訊，不包含也不快取即時的暫停狀態；App 執行期查詢一律以自己的 runtime 狀態為準。
- 誰有權限操作、暫停後多久生效、如何驗證已停止投遞，屬於各 App 的 on-call runbook，由 043 提供機制，不在 043 規定流程。

## 9. Z31 作為第一個 pilot

Z31 先建立三份 capability definitions：

1. `approve.submit-knowledge-document-change`：Approve 提供建立申請的 Command API。
2. `approve.get-knowledge-document-change-request-status`：Approve 提供依 `changeRequestId` 或 idempotency key reconciliation 的 Query API。
3. `approve.knowledge-document-change-approved`：Approve 發布「指定申請與 revision 已核准」的 Event definition。

再建立三份 point-to-point bindings：

1. `wiki-to-approve.submit-knowledge-document-change`。
2. `wiki-to-approve.get-knowledge-document-change-request-status`。
3. `approve-to-wiki.knowledge-document-change-approved`。

Wiki 以 delegated token 呼叫 Command；若 timeout 或 response 遺失，進入 `SUBMISSION_PENDING` 並使用 Query 收斂結果。Approve 核准後發布事實 Event，Wiki 消費後依自己的 invariant 冪等發布 revision。事件不使用 `publish-*` 祈使命名，也不把 Wiki 發布操作偽裝成 Event。未來 Notification 訂閱同一 Event definition 時，只新增 binding，不複製 payload schema。

Z31 的 contract 應驗證 043 的完整能力：schema、delegated identity、outbox、冪等、重試、版本、稽核與 Agent 可查找性。

## 10. 版本與生命週期

```text
canonical: DRAFT → REVIEW → APPROVED → DEPRECATED
App local: NOT_STARTED → IMPLEMENTING → IMPLEMENTED → VERIFIED
```

事故應變的緊急暫停／恢復投遞不是這兩條 lifecycle 的一部分，也不進入 canonical `status`：它是純 App-local runtime 狀態，見第 8.7 節。混用會破壞不可變性——若把暫停做成 canonical binding 內容的欄位，任何暫停／恢復都會改變該 binding 版本的檔案內容與 digest，等同違反本節「`APPROVED` 後的內容不得原地修改」；因此暫停永遠不能經由修改 `DRAFT／REVIEW／APPROVED／DEPRECATED` 或建立新版本來達成，`DEPRECATED` 僅代表該 binding 已終止不再使用，不可借用來表示暫時停止投遞。

`contract_id` 在各 major version 間保持穩定，版本採 SemVer。Major version 放在獨立、不可變的 version directory；`APPROVED` 後的內容不得原地修改，任何內容變更都建立新版本：

- patch：文字澄清或不改變驗證結果的修正。
- minor：符合所選 compatibility profile 的向後相容擴充。
- major：移除／改名欄位、縮窄可接受值、改變授權、錯誤或狀態語意等 breaking change。

每份 capability 必須選擇 compatibility profile，不能只靠「optional field」判斷：

| Profile | 適用 | Minor compatibility 要求 |
| --- | --- | --- |
| `strict` | 高敏感 Command／Event | 任何會改變 wire validation 的結構異動都升 major |
| `tolerant-reader` | Event、Command／Query response | 舊 consumer 忽略未知 optional field；不得新增 required field；enum 擴充需 consumer 有 unknown fallback |
| `provider-compatible` | Command／Query request | 新 provider 必須接受舊 request；新增 optional field不能成為舊 caller 的必要條件 |

OpenAPI／JSON Schema compatibility check 必須依 request、response、Event producer／consumer 方向分別執行。使用 `tolerant-reader` 時，consumer runtime validator 只抽取已知欄位，不因未知、已由 producer schema 驗證且分類過的 optional field 失敗；若 consumer 要求 `additionalProperties: false`，則該 capability 自動視為 `strict`。Enum 新值、format 收緊、maximum／minimum 收緊、授權 scope 與錯誤語意變化都必須納入 breaking-change 判斷。

`knowledge/contracts/index.json` 對每個 `contract_id` 記錄「latest approved version」與「所有仍在支援期限內的 major version 清單」，不只是單一 latest 指標；每個列出的 major version 附 `deprecated_at`、`support_until` 與依賴它的 App 清單（由 CLI 掃描各 App-local `_generated/contract-ref.json` 回填，不手工維護）。App-local view 必須 pin 精確 SemVer 與 digest，不得依賴浮動 `latest`。舊 major version 必須有 deprecation date、支援期限與仍使用它的 App 清單。

Capability 與 binding 各自版本化。Binding 必須 pin capability 的精確 version／digest；capability 發布新版本不會讓既有 binding 自動漂移，升級 binding 時必須產生新 binding version 並由雙方 review。Endpoint destination key、authentication、retry 或 filter 變更只升 binding version，不改 capability schema version。Digest 對排序後的 canonical manifest（列出 contract Markdown、OpenAPI、JSON Schema 與其 SHA-256）計算，避免檔案列舉順序造成不同結果。

Contract release 的 `DRAFT／REVIEW／APPROVED／DEPRECATED` 是 canonical 狀態；`IMPLEMENTED／VERIFIED` 改為各 App local view 的 implementation status，避免一個 consumer 完成就把全域 contract 誤標成已實作。

## 11. 決策狀態

### 已定案

- workspace 的 `knowledge/contracts/` 保存 canonical contract；各 App 保存受治理的 local view。
- Contract 分成 capability definition 與 point-to-point integration binding；schema 只由 capability 擁有，binding 以精確 version／digest 引用。
- Contract schema 採 Markdown + JSON Schema；HTTP Command／Query 使用 OpenAPI，未來 broker transport 再評估 AsyncAPI。
- 使用獨立 `contract-cli.mjs` 維護 contract，不與一般 knowledge index 共用產生流程；index 只是 CLI 的一個 subcommand。
- 建立共用 `@appspine/integration-contracts` package，提供 Event envelope 的 type、schema 與 validator。
- 第一階段 Event transport 沿用 `@appspine/domain-events` 的 outbox／dispatcher 與已認證 webhook；不建立重疊的 `@appspine/integration-relay`，message broker 保留為未來 adapter。
- Event 由 producer 維護、consumers review；Command／Query 由 API provider 維護、callers review；Workspace 提供 governance tooling。
- Event payload 採全域禁止清單加 contract-specific classification，contract 不得放寬基線。
- Contract 採 SemVer；approved version immutable，App-local view pin 精確 version 與 digest。
- Integration payload 與 contract metadata 在 business transaction 內驗證並凍結進 outbox；dispatcher 不重新推導 payload。
- 新 binding 使用 Webhook Protocol v2；source identity 綁定 key configuration，destination 受 SSRF-safe allowlist 控制。
- Consumer receipt、業務更新與下一段 local outbox 共用 transaction；外部 side effect 使用 outbox chaining。
- Compatibility 依 `strict`／`tolerant-reader`／`provider-compatible` profile 與資料流方向檢查。

### 已定案、待落地

1. `@appspine/integration-contracts` 放在 `appspine` shared packages monorepo，沿用既有 package build、changeset、registry 與 consumer fixture 流程；package 提供共通 Event envelope 的 types、JSON Schema、validator 與資料分類 vocabulary。各業務 contract 的 Markdown、OpenAPI 與 JSON Schema 仍由 workspace canonical `knowledge/contracts/` 管理。
2. `contract-cli.mjs` 由 workspace script 執行，以同一份掃描結果產生 `knowledge/contracts/index.md` 與 `knowledge/contracts/index.json`，並提供 `init`、`validate`、`diff`、`check-compatibility`、`index`、`sync-views`、`generate-runtime` commands。CI 驗證 contract ID、SemVer、digest、互動角色、local view 引用與索引新鮮度。
3. JSON Schema 固定採 Draft 2020-12，OpenAPI 固定採 3.1.x；CI 驗證 schema、執行 backward-compatibility／breaking-change check。Breaking change 必須升 major version並經 maintainer／required reviewers 核准；共用 package 只管理 Event envelope，不管理所有業務 schema。
4. 擴充 `@appspine/domain-events` 的 Prisma pattern、types、drift checker 與 fixtures，加入 optional frozen integration fields；common envelope builder 只包裝已凍結 payload。App-local capability module 負責 `buildPayload()`，在 `record()` 前完成 pinned schema validation。
5. 實作 Webhook Protocol v2 outbound／inbound helper、key rotation、source binding、freshness、typed retryable／terminal error、bounded redacted error 與 SSRF-safe destination policy；既有 v1 採 dual-read → v2-write → sunset 遷移。
6. 提供 `IntegrationEventReceipt` Prisma pattern、drift checker 與 transaction helper；App 自行持有 migration，consumer endpoint 實作 receipt／business state／local outbox 原子化。
7. `contract-cli.mjs sync-views` 根據 workspace canonical contract 更新各 App local view 的 `_generated/`；`generate-runtime` 產生 backend `types.ts`／`validators.ts`／manifest。跨 repo 操作先 dry-run、逐 repo apply、以獨立 PR 與 commit mapping 落地。
8. Z31 建立三份 capability definitions 與三份 bindings：submit Command、status Query、approved Event，以及對應 Wiki／Approve bindings。全部完成 Markdown、OpenAPI／JSON Schema、auth、idempotency、reconciliation、retry／error semantics、ownership 與 acceptance scenarios。

## 12. 第一階段完成定義

- 有標準 contract frontmatter、目錄與查找入口。
- Agent 可以依 `contract_id` 找到 latest approved version，App 則 pin 精確 SemVer 與 digest。
- `contract-cli.mjs` 可以建立、驗證、比較、索引、同步 local views、產生 runtime artifacts，並產生 provider／caller 或 producer／consumer 的實作與測試 checklist。
- Z31 的三份 capability definitions 與三份 bindings 已分離、互相引用並可獨立驗收。
- 至少一條 Event flow 以 `@appspine/domain-events` 完成 transaction-time payload freeze、outbox、common envelope build、Webhook Protocol v2、typed retry／terminal handling、dead-letter、inbound verification 與 consumer receipt／idempotency。
- 至少一條 Command flow 驗證 idempotency conflict、timeout uncertain outcome、reconciliation 與 retry classification。
- Common envelope builder 不含業務 mapping；App-local `buildPayload()` 的結果在 outbox transaction 前驗證、凍結，重送不因程式升級改變 payload。
- App production artifact 包含 pinned contract types／validators／manifest，runtime 不依賴 workspace 或 `knowledge/` 目錄。
- Contract 變更可由 CI 檢查 definition／binding 引用、版本、digest、interaction-specific roles、data classification 與 directional breaking compatibility。
- Webhook v2 驗證 source/key／contract 綁定、freshness、replay、SSRF policy 與 v1 sunset；security tests 覆蓋跨 endpoint／跨 contract replay。
- Approved version 不可原地修改；deprecation 與 App-local implementation status 可被索引查詢。
