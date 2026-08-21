---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL0-03 — Package/Plugin/Facet Classification & Naming Registry

> Task: `PL0-03`（見 [051 拆解 §4](../decisions/051-plugin-platform-engineering-task-breakdown.md#pl0-03-固定-packageplugin-facet-分類與-naming-registry)）。
> Owner（實際執行）：Claude Sonnet（文件建議 owner，本 task 未替代）。
> 依賴：[PL0-02 snapshot](051-pl0-snapshot-summary.md)。
> 本文件是治理 registry：後續 Phase 新增／變更 package、plugin ID、capability 名稱或 facet 前，先在此
> 登記，避免不同 task 各自發明不同 contract（見 051 拆解 §10.2「manifest v1／stable token 未經 G0/G1
> 凍結前，不得讓多個 capability 自行發明不同 contract」）。

---

## 1. 22 個 Package 的分類（15 現有 + 7 預計新增）

分類沿用 [051 計畫 §3.1](../decisions/051-plugin-platform-engineering-plan.md) 的角色表，加入
「是否為可安裝 plugin」與「plugin ID」欄位作為 registry 依據。

### 1.1 現有 15 個 package

| Package | 角色 | 是否為 plugin | Plugin ID | 備註 |
|---|---|---|---|---|
| `@appspine/common` | Foundation SDK | 否 | — | 純函式、Prisma 基礎 module；不得包裝成可啟停 capability |
| `@appspine/integration-contracts` | Foundation SDK | 否 | — | 跨 App contract 型別，無 NestJS/Prisma 依賴 |
| `@appspine/e2e-kit` | Foundation SDK | 否 | — | 測試工具 |
| `@appspine/frontend-shell` | UI SDK / slot host | 否 | — | Shell + slot renderer；Phase 3 後不得反向依賴 capability plugin |
| `@appspine/auth` | Identity capability（transition-only） | 是（相容 facade，Phase 1 後） | `auth`（deprecated 別名，見 §3） | 過渡期 re-export `identity-core` + `oidc-auth`；不承接新功能 |
| `@appspine/rbac` | Capability plugin | 是 | `rbac` | |
| `@appspine/m2m-api-key` | Capability plugin | 是 | `m2m-api-key` | |
| `@appspine/audit-log` | Capability plugin（試點 1） | 是 | `audit-log` | |
| `@appspine/health-check` | Capability plugin（試點 0） | 是 | `health-check` | |
| `@appspine/metadata-schema` | Capability plugin | 是 | `metadata-schema` | |
| `@appspine/mcp-server` | Capability plugin | 是 | `mcp-server` | |
| `@appspine/domain-events` | Capability plugin | 是 | `domain-events` | |
| `@appspine/notification` | Capability plugin | 是 | `notification` | |
| `@appspine/oidc-delegation` | Connector / adapter | 是 | `oidc-delegation` | optional，非 preset 必要 |
| `@appspine/master-data-client` | Connector / adapter | 是（`cardinality: multiple`） | `master-data-client` | 多 instance |

### 1.2 預計新增 7 個 package（Phase 1/2）

| Package | 角色 | 是否為 plugin | Plugin ID | 首次出現 task |
|---|---|---|---|---|
| `@appspine/plugin-api` | Platform core | 否 | — | PL1-01 |
| `@appspine/plugin-host-nest` | Platform core | 否 | — | PL1-03 |
| `@appspine/plugin-testkit` | Platform core | 否 | — | PL1-02 |
| `@appspine/plugin-cli` | Platform core | 否 | — | PL2-01 |
| `@appspine/preset-standard` | Preset | 否（是 catalog entry，非 capability plugin） | — | PL2-08 |
| `@appspine/identity-core` | Identity capability | 是 | `identity-core` | PL1-10 |
| `@appspine/oidc-auth` | Identity capability | 是 | `oidc-auth` | PL1-12 |

`未來 @appspine/local-auth`（尚未核准立項，見 051 計畫 §6.3）預留 plugin ID `local-auth`，與 `oidc-auth`
互斥（v1 manifest `conflicts`）。

## 2. Facet 定義（固定，不得逐插件自訂新 facet 名稱）

沿用 [051 計畫 §3.3 / §4.1](../decisions/051-plugin-platform-engineering-plan.md) 的 5 個 facet，本文件
不新增：

| Facet ID | 典型貢獻 | 載入時機 |
|---|---|---|
| `backend` | Nest module、controller、provider、guard、worker | backend build／bootstrap |
| `frontend` | navigation、admin slot、i18n、React entry | frontend codegen／build |
| `prisma` | owned model、enum、augmentation、schema digest | schema composition |
| `permissions` | stable permission definitions 與 reconciliation policy | install／deploy reconciliation |
| `operations` | health、catalog、metric、shutdown hook | bootstrap／runtime |

facet 的 subpath 命名規則：`@appspine/<plugin-id>/<facet>`（例如 `@appspine/rbac/backend`、
`@appspine/rbac/frontend`、`@appspine/rbac/plugin`）；`plugin` 本身不是 facet，是 §4.1 定義的 runtime
factory 入口，與 5 個 facet 並列但語意不同（manifest 指向 runtime factory，不是資料 facet）。

### 2.1 與既有 subpath export 的協調（獨立 review 發現，補充）

[PL0-02 snapshot](051-pl0-snapshot-summary.md#2-package-exportslocal-dependencies) 更正後確認 8 個
package 已經有 subpath export，本節逐一核對是否與上述 facet 命名規則衝突：

| 既有 subpath | Package | 與 facet 規則的關係 |
|---|---|---|
| `./prisma/*.prisma` | `audit-log`、`auth`、`m2m-api-key`、`rbac` | **相容**：語意上等同未來 `prisma` facet 的 schema fragment 位置；PL2-06 composer 實作時可直接沿用此 subpath，不需要遷移成 `./prisma`（facet 名）與 `./prisma/xxx.prisma`（實際檔案）刻意分兩層 |
| `./testing` | `domain-events`、`notification`、`oidc-delegation` | **G0 裁定為非 facet 的 reserved test-support subpath**：可繼續提供 package-specific fake／fixture；`plugin-testkit`（PL1-02）只提供跨插件共用 harness，不強迫廢棄既有 `./testing`。此名稱不得放進 production manifest 的 `facets` |
| `./admin`（`domain-events`） | `domain-events` | **G0 裁定為既有 backend compatibility entry**：目前內容是 Nest admin module/controller，不是 frontend facet；PL1-06 建立 `./backend` 時保留 `./admin` re-export 至少一個 transition window，不能把它誤接到 frontend generator |
| `./notification`、`./server`（`frontend-shell`） | `frontend-shell` | **UI SDK 自有 subpath，不是 plugin facet**：`frontend-shell` 不是 capability plugin，因此不套用 `@appspine/<plugin-id>/<facet>` 規則；[051 計畫 §3.2](../decisions/051-plugin-platform-engineering-plan.md) 已核准 Notification UI 最終搬到 `@appspine/notification/frontend`，屆時以 compatibility re-export 維持 transition window |

結論：五個 plugin facet 名稱維持封閉集合；`./testing`、`domain-events/./admin` 與 UI SDK subpath 的分類已在
上表凍結，均不會被 loader 當成第六種 facet。後續 task 只能依上表做 compatibility bridge，不能重新打開
名稱歸屬或在旁邊發明新 facet。

## 3. Capability 命名 Registry

capability 名稱使用 `appspine.<kebab-case>`，與 package/plugin ID 分離（可提供多個 capability）。
以下是 Phase 0 已知需要凍結的 capability 名稱，沿用 [051 計畫 §4.2](../decisions/051-plugin-platform-engineering-plan.md)：

| Capability | Provider（規劃） | 說明 |
|---|---|---|
| `appspine.prisma` | `common`（host-owned singleton） | Prisma client 存取 |
| `appspine.audit-sink` | `audit-log` | 稽核寫入介面 |
| `appspine.identity-store` | `identity-core` | provider-neutral User／principal store |
| `appspine.interactive-auth-provider` | `oidc-auth`（未來 `local-auth`，互斥） | 互動式登入 provider |
| `appspine.machine-auth-provider` | `m2m-api-key` | 機器身份 provider |
| `appspine.authentication-strategy-registry` | `plugin-host-nest`（host-owned） | strategy 註冊表 |
| `appspine.principal-context` | `plugin-host-nest`（host-owned，由 auth provider 填入） | 解析後 request identity |
| `appspine.scope-matcher` | `m2m-api-key` | API key scope 比對 |
| `appspine.domain-events` | `domain-events` | domain event dispatch/subscribe |
| `appspine.notification-inbox` | `notification` | in-app 通知 |
| `appspine.mcp-tools` | `mcp-server` | MCP tool registry |
| `appspine.rbac-policy` | `rbac` | 角色／權限查詢（PL0-03 新增，計畫文字未明列但 PL4-02 需要穩定 token） |
| `appspine.metadata-schema` | `metadata-schema` | DMMF-derived schema introspection |
| `appspine.master-data-client` | `master-data-client`（multi-instance） | master-data sync/cache |
| `appspine.identity-delegation` | `oidc-delegation` | RFC 8693 token exchange |
| `appspine.delegated-identity-verifier` | `oidc-auth` | 驗證由其他 App delegate 進來的 OIDC identity；與 outbound `appspine.identity-delegation` 明確分開 |
| `appspine.health-indicator` | `health-check` | 健康檢查貢獻（獨立 review 發現：[PL0-05 fixture](051-pl0-manifest-fixtures.md) 已經在用但本表初版漏登記，補上） |

新增 capability 一律先在本表登記再實作；同一 capability 不得由兩個非 `replaces` 關係的插件同時
`provides`（合法替換規則見 [051 計畫 §4.5](../decisions/051-plugin-platform-engineering-plan.md)：僅
app-local plugin 可用精確 `replaces` 指向 plugin/facet/contribution ID，並通過 contract compatibility
test；本文件不重複定義，只沿用）。

**G0 最終裁定**：inbound delegated verification 固定命名為
`appspine.delegated-identity-verifier`，owner 是 `oidc-auth`；outbound RFC 8693 token exchange 維持
`appspine.identity-delegation`，owner 是 `oidc-delegation`。兩者方向、owner 與 token 語意不同，不合併。
[PL0-05 的 `oidc-auth-interactive-provider.json`](../../fixtures/051-manifest-v1/positive/oidc-auth-interactive-provider.json)
已同步使用 registry 名稱；Phase 1 不得再另創第三個同義 capability。

## 4. Namespace 規則

| Namespace | 格式 | 範例 |
|---|---|---|
| Route（backend） | `/api/<plugin-id>/...` 或既有 `/admin/<plugin-id>/...`（沿用現有 REST 慣例，不強制改變 URL 版本） | `/admin/rbac/roles` |
| Route（frontend admin page） | `/(admin)/<plugin-id>` | `/(admin)/roles` |
| Provider token | `Symbol.for("appspine.<capability-name>")` | `Symbol.for("appspine.audit-sink")` |
| Permission ID | `<plugin-id>:<resource>:<action>`（immutable，PL0-06 permission fixtures 沿用） | `rbac:role:create` |
| Worker / background job name | `appspine.<plugin-id>.<worker-name>` | `appspine.notification.digest-sender` |
| Multi-instance token/config/health/metric | `appspine.<plugin-id>#<instanceId>` | `appspine.master-data-client#hr-master-data` |
| i18n namespace | `<plugin-id>` | `rbac`、`notification` |
| Prisma model owner comment（generated schema） | `// owner: <plugin-id>` | 供 PL2-06 composer 產生 |

## 5. Reserved Names（不得被 capability plugin 佔用）

- Plugin ID 不得與 Foundation／Platform core package 的目錄名稱相同：
  `common`、`integration-contracts`、`e2e-kit`、`frontend-shell`、`plugin-api`、`plugin-host-nest`、
  `plugin-cli`、`plugin-testkit`、`preset-standard`。
- 保留字首 `host`、`appspine`、`platform` 不得作為 plugin ID 或 capability 的第二段（例如禁止
  `appspine.host.*`、`appspine.appspine.*`）。
- `auth` 保留給 transition-only 相容套件，Phase 1 之後不得有新插件重新使用 `auth` 作為 plugin ID。
- `local-auth` 保留給 §1.2 所述未來計畫，目前不得被其他插件使用。

## 6. 驗證

- 對照 [PL0-02 snapshot](051-pl0-snapshot-summary.md) 的 `packages` 欄位：目前 15 個 package 名稱與
  §1.1 表格一致，Foundation package（`common`、`integration-contracts`、`e2e-kit`、`frontend-shell`）
  在 §1.1 均標記「否」，不會被 Phase 1 manifest 誤判為可啟停 capability。
- `master-data-client` 是唯一目前已知需要 `cardinality: multiple` 的既有 package；§1.1／§3 已標註，
  避免 PL4-08 才重新爭論。
- 同一 logical plugin（例如未來若 `rbac` 因 bundle 過重拆成 `@appspine/rbac` +
  `@appspine/rbac-frontend`）展開時，仍以單一 plugin ID `rbac` 呈現於 catalog；本文件的 plugin ID
  registry 是「邏輯插件」層級，不是「npm package」層級，故拆分不需要新登記 plugin ID，只需在該插件
  manifest 的 facet package 欄位列出額外 artifact。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL0-03 |
| Actual agent | Claude Sonnet 5（G2 `architecture-contract`，文件建議 owner，無替代） |
| Required class | G2 `architecture-contract` |
| Independent reviewer | Claude Opus（general-purpose agent，2026-08-18，Gate G0 blind-spot audit）與 Codex G0 follow-up review——發現本文件初版建立在「目前無 subpath export」的錯誤前提上（見 §2.1），且 PL0-05 fixture 用了兩個本表未登記的 capability 名稱；`appspine.health-indicator` 已補登記，inbound delegated verification 已於 G0 follow-up 凍結為 `appspine.delegated-identity-verifier` |
| Tools | repo read（Read/Grep），無程式碼變更 |
| Evidence | 與 [PL0-02 snapshot](051-pl0-snapshot-summary.md)、[051 計畫 §3～4](../decisions/051-plugin-platform-engineering-plan.md) 交叉核對；獨立 review 覆核後修正/補登記處見上一列 |
| 已知風險 | capability 命名（尤其 `appspine.rbac-policy`）是 PL0-03 新增推導，非計畫原文逐字列出；既有非 facet subpath 的 compatibility/deprecation 實作尚待後續 task，但其分類與 owner 已在 §2.1 凍結；PL1-02／PL1-04／PL1-06／PL1-11／PL1-12 實作時需確認與此表一致，如需修改必須先回來更新本文件 |
| Rollback | 刪除本文件；不影響任何 runtime 或已發布 package |
