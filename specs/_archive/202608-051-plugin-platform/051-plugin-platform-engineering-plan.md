---
type: decision
scope: appspine-packages
status: approved
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 - `appspine-packages` 插件平台與工程化計畫

> 狀態：**使用者已於 2026-08-18 核准設計方向，尚未開始實作。**
> 本計畫把目前的 `@appspine/*`「可發布共用套件」演進為「可安裝、可組合、可驗證、可診斷的
> 建置期插件平台」。第一階段不追求從遠端下載並熱載入任意程式碼，也不允許執行期自動修改
> Prisma schema 或 Next.js routes。
>
> 本計畫承接 [003 共用套件重用盤點](003-shared-package-reuse-plan.md)、
> [020 框架收斂計畫](020-framework-consolidation-plan.md) 與
> [048 套件清理計畫](048-shared-packages-cleanup-scoping-plan.md) 已建立的套件、發布、測試與清理成果；
> 不取代既有 integration capability／binding contract 治理。現有 OIDC-only `@appspine/auth` 將在
> 過渡期改名為 `@appspine/oidc-auth`；若未來需要帳密登入，另建互斥的 `@appspine/local-auth`，不把
> 兩種驗證模式混回同一插件。
>
> 執行工作包、依賴 DAG、agent 指派與 phase gate 見
> [051-plugin-platform-engineering-task-breakdown.md](051-plugin-platform-engineering-task-breakdown.md)。

---

## 1. 問題與決策摘要

### 1.1 現況

`appspine-packages` 已具備 15 個獨立發布套件、pnpm workspace、Changesets、GitHub Packages、CI、
integration contracts、consumer fixtures 與 knowledge lint。部分套件也已建立成熟的擴充模式：

- `@appspine/domain-events` 有 handler registry、subscriber metadata 與 catalog introspection。
- `@appspine/mcp-server` 有 tool registry、decorator registration 與 catalog snapshot。
- `@appspine/oidc-delegation`、`@appspine/master-data-client` 已採 NestJS Dynamic Module。
- `@appspine/frontend-shell` 已使用 subpath exports 分隔 notification 與 server 能力。

但消費端仍需在 `AppModule`、Next.js routes、navigation、Prisma schema、環境變數與權限設定中逐項
手工接線。套件本身沒有一致的 manifest、runtime capability contract、相依解析、衝突檢查、安裝／
移除流程、插件 lockfile 或跨插件診斷。因此目前是「套件化框架」，還不是插件平台。

### 1.2 核心決策

採用以下模型：

> **npm 套件安裝 + 顯式設定 + 建置期組裝 + 啟動時驗證 + 執行期 registry 擴充。**

具體決策如下：

1. 插件來源必須明列於 `appspine.plugins.json` declarative inventory；程式化 wiring 才放
   `appspine.config.ts`。不得在 production 自動掃描整個 `node_modules`。
2. NestJS module、Next.js route/navigation 與 Prisma schema 都在 build 前組裝；第一階段不支援
   hot install、hot unload 或遠端任意程式碼載入。
3. package version 與 plugin API version 分開治理；相容性由 manifest 與 host validator 檢查。
4. capability 間只透過穩定介面與 injection token 耦合，不直接依賴另一插件的 concrete service。
5. 現有套件先增加 `./plugin` entry point；第一階段不大規模改名、不拆 repo、不一次移除舊 API。
   唯一已核准的命名調整是把 OIDC-only `@appspine/auth` 改為 `@appspine/oidc-auth`，並保留舊套件
   一個 major transition window。
6. `appspine-app-template` 最終只組裝一個 preset 與 app-local plugins，不再逐一手工匯入所有共用
   module。
7. 官方 capability plugin 預設讓邏輯插件與 npm package 一對一，以 subpath 隔離 backend、frontend、
   plugin runtime 與 Prisma facets；只有明確的 bundle／module-format／peer／發布衝突才拆多 package，
   manifest、catalog 與 lockfile 仍呈現為同一個可理解的安裝單位。
8. 設定分成 CLI 管理的 declarative plugin inventory、App 管理的 TypeScript runtime wiring，以及
   deployment 注入的 secrets；三者不得互相複製責任。
9. 禁止 route、provider token、permission、schema 或 UI slot 靜默覆蓋；所有替換都必須顯式宣告。
10. 現有 `auth` 不直接整包改名；先把 provider-neutral identity 能力與 OIDC-specific 能力分界，再以
    compatibility package 維持既有 consumer。

## 2. 目標與非目標

### 2.1 目標

- 安裝插件後，只需更新 declarative inventory，必要時補一個 typed runtime config stub，不再手改五到
  六個分散接線點。
- 在 install、build 或 bootstrap 階段提早發現缺少 capability、版本不相容、循環依賴、重複 ID、
  schema 衝突、權限衝突與環境變數缺漏。
- 從 manifest 自動產生插件 catalog、相容性矩陣、權限／env 文件及診斷資訊。
- 保持 NestJS DI、TypeScript 型別、Next.js 靜態建置、Prisma migration review 與 tree shaking。
- 允許 App 提供 app-local plugin，且使用與正式 `@appspine/*` 插件相同的 contract 與 testkit。
- 保持現有 Changesets 獨立版本發布方式，增加 canary 與 clean-consumer compatibility gate。
- 支援明確宣告的 singleton／multi-instance 插件，不把 realm、tenant 或 destination 偷塞進全域 env。
- 讓安裝、停用、升級、降級與移除在 Prisma、permission 與 background worker 層都有可預測語意。

### 2.2 非目標

- 不建立可在 production 從網路下載並執行未知 JavaScript 的插件市場。
- 不支援不停機更換 NestJS controller/provider 或 Next.js page bundle。
- 不讓插件在啟動時自行執行 destructive database migration。
- 不把所有純函式庫都包裝成插件。
- 不在第一階段導入微服務拆分、Module Federation 或另一套業務 workflow engine。
- 不把 integration capability／binding contracts 合併進 plugin manifest；前者描述跨 App wire
  contract，後者描述單一 App 內的安裝與組裝需求，兩者只互相引用。

## 3. 套件角色與目標目錄

### 3.1 套件角色

| 角色 | 現有／預計套件 | 說明 |
|---|---|---|
| Foundation SDK | `common`、`integration-contracts`、`e2e-kit` | 純函式、型別、測試與跨 App contract；不註冊 App capability |
| UI SDK / slot host | `frontend-shell` | 提供 UI primitives、slots 與 renderer；不是單一業務插件 |
| Identity capability | 新增 `identity-core`；現有 `auth` 拆出並改名 `oidc-auth` | 前者擁有 provider-neutral User／principal；後者只擁有 OIDC-specific verification 與 mapping |
| Capability plugin | `rbac`、`m2m-api-key`、`audit-log`、`health-check`、`metadata-schema`、`mcp-server`、`domain-events`、`notification` | 對 App 貢獻 controller、provider、worker、route、permission 或 schema |
| Connector / adapter | `oidc-delegation`、`master-data-client` | 連接外部 identity／master-data 能力；可選配 |
| Platform core | 新增 `plugin-api`、`plugin-host-nest`、`plugin-cli`、`plugin-testkit` | 定義、組裝、驗證與測試插件 |
| Preset | 新增 `preset-standard` | 描述 template 的標準插件集合與預設關係，不包含 App 業務邏輯 |

純 SDK 不應為了「形式一致」而成為插件。只有對 host 貢獻 runtime 或 build-time capability 的套件
才需要 plugin manifest。

### 3.2 第一階段目錄

```text
packages/
  plugin-api/
  plugin-host-nest/
  plugin-cli/
  plugin-testkit/
  preset-standard/
  identity-core/
    appspine.plugin.json
    src/plugin.ts
  oidc-auth/
    appspine.plugin.json
    src/plugin.ts
  auth/
    # transition-only compatibility package
  health-check/
    appspine.plugin.json
    src/plugin.ts
  audit-log/
    appspine.plugin.json
    src/plugin.ts
```

既有 capability package 增加 `./plugin` subpath export；舊有 root exports 保留一個 major transition
window。不要先把套件全部改名為 `plugin-*`，避免沒有行為收益的大規模 consumer churn。

### 3.3 邏輯插件與 artifact facets

「插件」是使用者看到的安裝／設定／診斷單位；「npm package」是發布 artifact，兩者不強制一對一。
manifest 可宣告下列 facets：

| Facet | 典型貢獻 | 載入時機 |
|---|---|---|
| `backend` | Nest module、controller、provider、guard、worker | backend build／bootstrap |
| `frontend` | navigation、admin slot、i18n、React entry | frontend codegen／build |
| `prisma` | owned model、enum、augmentation、schema digest | schema composition |
| `permissions` | stable permission definitions 與 reconciliation policy | install／deploy reconciliation |
| `operations` | health、catalog、metric、shutdown hook | bootstrap／runtime |

官方 capability plugin 的**預設**是把 backend、frontend、plugin runtime 與 Prisma facets 放在同一個
npm package，以公開 subpath 隔離，例如 `@appspine/rbac/backend`、`@appspine/rbac/frontend`、
`@appspine/rbac/plugin` 與 `@appspine/rbac/prisma/role.prisma`。不得把 backend 與 frontend 全部塞回 root
barrel；consumer 只能載入自己需要的 facet。

只有在 frontend bundle 很重、module format 無法安全共存、peer dependency 交集不存在，或發布週期確實
需要獨立時，才例外拆成 `@appspine/<capability>-frontend`。即使拆成多 package，仍由同一 manifest
bundle 綁定相容版本；Catalog 與 lockfile 必須顯示邏輯 plugin ID、facet package、各自版本與 digest，
不能只顯示 aggregator 而隱藏實際執行 artifact。

現有 `frontend-shell` capability-specific UI 依下列 ownership 遷移：

| 現有 UI | 目標 owner／subpath |
|---|---|
| Users Admin | `@appspine/identity-core/frontend` |
| OIDC Login UI | `@appspine/oidc-auth/frontend` |
| Roles Admin | `@appspine/rbac/frontend` |
| API Keys Admin | `@appspine/m2m-api-key/frontend` |
| Domain Events Admin | `@appspine/domain-events/frontend` |
| Notification Bell／Inbox | `@appspine/notification/frontend` |

`frontend-shell` 最終只保留 Dashboard Shell、navigation/slot renderer、i18n infrastructure、通用 hooks
以及 Button、Dialog、Table、DatePicker 等 capability-neutral primitives。依賴方向固定為 feature frontend
facet 可以依賴 `frontend-shell`，但 `frontend-shell` 不得反向依賴任何 capability plugin。

## 4. 插件契約

### 4.1 雙層契約

每個插件由兩個入口組成：

1. **Serializable manifest**：`appspine.plugin.json`，讓 CLI 不執行插件程式碼就能檢查版本、依賴、
   config、Prisma、frontend 與 permission contributions。
2. **Runtime factory**：`@appspine/<name>/plugin`，回傳經 `definePlugin()` 驗證的 typed descriptor 與
   NestJS Dynamic Module factory。

manifest 第一版至少包含：

```ts
interface PluginManifestV1 {
  schemaVersion: "appspine.plugin/v1";
  id: string;
  displayName: string;
  cardinality: "singleton" | "multiple";
  distribution?: "official" | "app-local"; // replaces 存在時必填 app-local；loader 另驗 provenance
  engine: {
    appspinePluginApi: string;
    node: string;
    frameworks?: Record<string, string>;
  };
  provides: string[];
  requires: string[];
  optionalRequires?: string[];
  conflicts?: string[];
  replaces?: ReplacementDeclaration[];
  configSchema?: ConfigSchemaReference;
  environment?: EnvironmentContribution[];
  optionalFailurePolicy?: {
    isolationBoundary: "instance";
    degradedBehavior: {
      readiness: "degraded";
      catalog: "degraded";
      alert: "required";
    };
  };
  facets: {
    backend?: BackendFacetContribution;
    frontend?: FrontendFacetContribution;
    prisma?: PrismaFacetContribution;
    permissions?: PermissionFacetContribution;
    operations?: OperationsFacetContribution;
  };
  integrationContracts?: ContractReference[];
}
```

package version 由 `package.json` 取得，不在兩個檔案手工維護兩份。`schemaVersion` 只描述 manifest
格式；`engine.appspinePluginApi` 描述 host contract 相容範圍；業務 integration contract 仍使用自身
的精確 SemVer + digest。`replaces` 的每一筆 declaration 必須同時提供 plugin/facet/contribution/reason；
`distribution: "app-local"` 是必要宣告但不是信任來源，loader 仍須用 inventory/package provenance 驗證。
只有具備完整 `optionalFailurePolicy` 的 plugin instance 才能在 inventory 標記 optional。

### 4.2 Capability 命名

capability 使用穩定、與 package 名稱分離的名稱，例如：

```text
appspine.prisma
appspine.audit-sink
appspine.identity-store
appspine.interactive-auth-provider
appspine.machine-auth-provider
appspine.authentication-strategy-registry
appspine.principal-context
appspine.scope-matcher
appspine.domain-events
appspine.notification-inbox
appspine.mcp-tools
```

一個插件可提供多個 capability，但不得用「安裝了某 package」代替 runtime capability 驗證。
required capability 缺失必須 fail fast；optional capability 不存在時必須有明確的降級行為，不能靠
catch-and-ignore 隱藏錯誤。

互動式登入與機器身份必須分開命名：`oidc-auth`／未來 `local-auth` 提供
`appspine.interactive-auth-provider`，`m2m-api-key` 提供 `appspine.machine-auth-provider`。兩者可同時存在，
並向 host-owned authentication strategy registry 註冊；解析完成的 request identity 由
`appspine.principal-context` 對其餘插件提供，不能讓 consumer 自己猜測 JWT 或 API key 的具體型別。

### 4.3 Host 組裝 API

目標使用方式：

```ts
// appspine.config.ts
import inventory from "./appspine.plugins.json";

export default defineAppspineConfig({
  inventory,
  runtime: {
    oidc: { issuer: env.OIDC_ISSUER },
  },
});
```

```ts
// backend/src/app.module.ts
const appspine = createGeneratedAppspineModule(appspineConfig);

@Module({
  imports: [appspine.module, BusinessModules],
})
export class AppModule {}
```

`createGeneratedAppspineModule()` 在 Nest bootstrap 前完成：

1. schema 與 config validation；
2. duplicate ID、engine range 與 conflicts 檢查；
3. provides／requires 解算；
4. dependency cycle 檢查與 deterministic topological sort；
5. Dynamic Module imports/providers/exports 組裝；
6. plugin catalog、health 與 redacted config diagnostics 建立。

### 4.4 Singleton 與 multi-instance

manifest 的 `id` 表示插件型別，App inventory 的 `instanceId` 表示安裝實例：

```json
{
  "plugin": "@appspine/master-data-client",
  "instanceId": "hr-master-data",
  "enabled": true,
  "configRef": "masterData.hr"
}
```

- `cardinality: singleton` 的插件最多一個 enabled instance；例如 `identity-core`、`rbac`。
- `cardinality: multiple` 可有多個具名 instance；例如 master-data connector、webhook destination。
- provider token、metric、worker、health 與 config path 都必須包含 instance identity，避免碰撞。
- `instanceId` 必須穩定；改名視同 migration，不能默默建立第二份 state。
- OIDC v1 先維持一個互動式 provider instance；多 realm 需求必須先定義 account linking 與 issuer／subject
  identity key，不能只把 `OIDC_ISSUER` 改成陣列。

### 4.5 Override、替換與排序

- route、provider token、permission、Prisma symbol、worker name 與 singleton capability 重複時一律報錯。
- 合法替換必須在 app-local plugin 使用 `replaces` 指向精確 plugin/facet/contribution ID，並通過 contract
  compatibility test；不得依 Nest provider registration order 靜默覆蓋。
- UI slot ordering 使用 deterministic `before`／`after` dependency；只有無相依關係時才以 numeric
  priority + plugin ID 作穩定排序。
- preset 必須展開成完整 resolution graph；App override 不能讓 catalog 只顯示 preset 名稱而看不到
  實際來源。
- 第一版不支援任意 controller method patching；需要變更行為時使用公開 extension point、替換完整
  contribution，或 fork 成 app-local plugin。

## 5. Backend、Frontend 與資料模型邊界

### 5.1 NestJS backend

- 可設定插件統一提供同步與非同步 factory，命名採 `plugin()`／`pluginAsync()`，內部可繼續使用
  Nest `forRoot()`／`forRootAsync()`。
- 第一階段只讓 host registry、config 與必要的 request context 成為 global infrastructure。
- 現有 `AuthModule` 在相容期保留，目標 API 改為 `OidcAuthModule`／`oidcAuthPlugin()`；它與
  `RbacModule`、`ApiKeysModule` 等 capability module 逐步移除 `@Global()`。app-local feature 必須
  顯式 import capability bridge module 或注入穩定 token。
- host 提供 authentication strategy registry 與 principal context bridge；OIDC、未來 local auth、API key
  各自註冊 strategy，不讓業務 controller 組裝 `JwtOrApiKeyGuard` 類型的 provider-specific chain。
- controller route、provider token、worker name 與 health indicator 必須可被 catalog introspect。
- lifecycle 第一版僅定義 `validate`、`register`、`ready`、`shutdown`；不承諾 hot unload。

### 5.2 Next.js frontend

Next.js route 與 client/server component boundary 採 build-time code generation：

- 插件 manifest 宣告 navigation item、dashboard slot、admin page、i18n namespace 與所需 permission。
- CLI 產生 `.appspine/generated/frontend/*`；該目錄不得人工修改。
- route adapter 只引用 package 的公開 subpath export，不複製插件 component 原始碼。
- frontend facet 必須標註 client／server boundary 與 React／Next peer range；generator 禁止把 server-only
  entry 引入 client bundle。
- capability-specific Admin UI、login UI、notification UI 與其 API adapter 由 capability package 擁有；
  一般業務 page 仍由各 App 擁有，不因本次整理變成插件 page。
- `frontend-shell` 提供 slot contract 與 renderer，不直接知道所有 capability plugin。
- root barrel 逐步收斂成 `core`、`admin`、`notification`、`server` 等 subpath，減少 client bundle 與
  accidental public API。

第一階段不使用 runtime Module Federation；需要重新安裝或啟停 frontend plugin 時必須重新 build。

### 5.3 Prisma schema 與 migration

沿用現有 package 發布 Prisma fragment 的方向，增加 deterministic composer：

1. CLI 讀取已啟用插件的 manifest 與 schema fragment。
2. 區分 `owns`（擁有 model／enum）與 `augments`（在其他插件 model 增加 relation field／index）貢獻，
   驗證 model、enum、table、index、relation、augmentation target 與 migration namespace 衝突。
3. 產生 `.appspine/generated/schema.prisma` 與包含 source digest 的 schema lock。
4. App owner 使用產生結果建立、審查並提交 migration。
5. CI 驗證 generated schema 與 lock 沒有 drift。

插件安裝不得自動套用 production migration。插件移除預設只移除 runtime wiring，不自動刪除資料表；
資料清除必須透過另一個明確、可審查的 migration。

目前 `auth/prisma/user.prisma` 的 `User` 同時包含 provider-specific `password` 欄位，並直接引用 RBAC 的
`UserRole` 與 API key 的 `ApiKey` relation。拆分 `identity-core` 時不能原封不動搬檔：

- `identity-core` 擁有 provider-neutral `User` 與 principal identity；不擁有密碼驗證邏輯。
- OIDC identity 以 issuer + subject 為穩定外部 key；若需要新 `OidcIdentity` model，由 `oidc-auth` 擁有。
- 未來 `local-auth` 應擁有獨立 `LocalCredential` model，不重新使用 `User.password` 作為跨 provider 欄位。
- RBAC／API key 對 User 的反向 relation 由 Prisma augmentation contribution 表達，避免
  `identity-core` 反向依賴可選插件。
- 現有欄位與資料如何遷移、相容與回滾，必須先有 migration fixture；Phase 1 不得直接 drop
  `User.password`。

### 5.4 Permission reconciliation

- permission 使用不可變、namespaced ID；display name／description 可變，但不能作為資料庫 identity。
- 安裝與升級透過顯式 reconciliation command 產生 plan，再由 deploy step 套用；application bootstrap
  不做無審核的大量刪改。
- rename 必須宣告 alias／migration；remove 預設把 permission 標為 orphaned/retired，保留既有 audit
  關聯，不自動刪除 RolePermission。
- downgrade 必須能辨識「目前資料使用較新 permission/schema」並停止，而不是假裝成功。
- permission contribution、reconciliation result 與 digest 納入 plugin lock／catalog；前端 visibility
  只作 UX，backend guard 仍是授權真相來源。

## 6. 依賴反轉與相容性

### 6.1 穩定 token

目前 capability package 間仍有 concrete imports，例如 auth 使用 audit service、MCP 使用 API-key scope
matcher。遷移時由 `plugin-api` 或更小的 capability contract package 定義 token 與最小介面：

```ts
export const AUDIT_SINK = Symbol.for("appspine.audit-sink");
export const IDENTITY_STORE = Symbol.for("appspine.identity-store");
export const AUTHENTICATION_STRATEGIES = Symbol.for("appspine.authentication-strategies");
export const PRINCIPAL_CONTEXT = Symbol.for("appspine.principal-context");
export const SCOPE_MATCHER = Symbol.for("appspine.scope-matcher");
```

規則如下：

- 跨插件只 import contract、DTO、token，不 import concrete service 或 internal path。
- runtime requirement 同時出現在 manifest `requires`；package dependency 與 runtime capability
  requirement 不可互相取代。
- host-owned singleton（Nest、React、Prisma client 等）才使用 peer dependency；插件私有實作依賴使用
  normal dependency。
- 新增 architecture lint，檢查 source imports、`package.json` 與 manifest requirements 一致。
- 禁止 foundation 反向依賴 capability plugin，禁止跨插件 internal import，禁止 dependency cycle。

### 6.2 版本策略

- package 版本繼續由 Changesets 獨立管理。
- manifest schema `v1` 只在格式破壞時升版。
- `appspinePluginApi` 使用 SemVer range；host 必須拒絕不相容插件。
- manifest 另宣告實際使用到的 NestJS、Prisma、Next.js、React 與 Node range；resolver 對 host-owned
  singleton peers 取交集，無交集時在 install/build 階段失敗。
- capability contract 的破壞性變更必須提升提供者 major，並同步更新依賴插件的 requirement。
- `preset-standard` 鎖定一組已驗證版本，template 可依 preset 更新 PR 統一升級。
- 建立 `canary` channel，先通過 template clean install／build／test，才進 stable release。

### 6.3 Identity 與 authentication provider 邊界

現有 `@appspine/auth` 同時混合 provider-neutral identity、OIDC verification、user administration 與
歷史 local credential 欄位；不能只把整個 package 改名。Phase 1 採以下責任切分：

| 套件／能力 | 擁有責任 | 不擁有 |
|---|---|---|
| `@appspine/identity-core` | User／service-account model、principal DTO/context contract、Users CRUD、provider-neutral identity store | JWKS、password verification、RBAC role model |
| `@appspine/oidc-auth` | OIDC/JWT/JWKS strategy、issuer/subject mapping、OIDC JIT adapter | 通用 User ownership、local credential |
| 未來 `@appspine/local-auth` | password credential、MFA、reset/recovery、lockout 與對應 audit | OIDC/JWKS、通用 User ownership |
| `@appspine/m2m-api-key` | machine authentication strategy、scope 與 acting-user binding | interactive login provider |
| `@appspine/auth` 相容套件 | 在 transition window re-export／bridge `identity-core` + `oidc-auth` 舊 public API 與 Prisma path | 新功能與永久 ownership |

`oidc-auth` 與未來的 `local-auth` 都提供唯一的 `appspine.interactive-auth-provider`，v1 manifest 宣告彼此
conflicts；同一 App 同時啟用時 fail fast。這項互斥限制已核准，`preset-standard` 第一版固定選擇
`oidc-auth`。若未來需要雙登入來源，必須另立 identity-broker／account-linking 計畫，至少定義 issuer +
subject、email 變更、帳號合併、login selector、session 與 audit 語意，不能只刪除 conflicts。

interactive provider 與 `m2m-api-key` 的 machine provider 可以同時存在；兩者向 host-owned strategy
registry 註冊。RBAC、audit、domain-events 與業務插件只讀取中立的 `PRINCIPAL_CONTEXT`／
`IDENTITY_STORE`，不直接 import OIDC、local-auth 或 API-key concrete service。`AdminGuard`、
`CurrentUser`、acting-user resolver、delegated inbound auth 等現有 exports 在 Phase 0 responsibility
inventory 中逐一指定 owner，不能只依目前檔案位置判定。

### 6.4 Framework 與 module-format compatibility

- backend facet 第一階段維持 Node 22 + CommonJS 相容輸出；frontend facet 使用 ESM。若同一邏輯插件
  有兩種格式，必須透過明確 facet exports 隔離，禁止 consumer import `dist/*` 猜入口。
- package `exports` 必須按 facet 提供 types 與 runtime target；若導入 conditional exports，需以實際
  Node、Nest build、Next server/client 與 clean-consumer matrix 驗證。
- plugin host 不在 production 任意 dynamic-import package name；generated composition module 使用靜態
  imports，讓 bundler、TypeScript 與 security review 看得到執行邊界。
- NestJS、Prisma、Next.js、React 等 host singleton 的 peer range 由 manifest + `package.json` 雙重驗證；
  兩者不一致視為 CI error。
- 同 package 的 React／Next peers 可對純 backend consumer 標為 optional，但啟用 frontend facet 時，plugin
  validator 必須把它們提升為 required 並驗證版本；不能因 package manager 沒報 unmet peer 就視為相容。
- module-format 或 framework major 遷移必須走 canary + template 真實 tarball 測試，不與 identity 拆分或
  plugin API major 在同一 release 一次進行。

## 7. CLI、lockfile 與操作體驗

第一版 CLI：

```text
appspine plugin add <package>
appspine plugin remove <id>
appspine plugin list
appspine plugin validate
appspine plugin build
appspine plugin doctor
```

設定與解析狀態的唯一真相分工：

| 檔案／來源 | Owner | 內容 |
|---|---|---|
| `appspine.plugins.json` | CLI + human-reviewed diff | plugin package、instance ID、enabled、preset 與非敏感 config reference |
| `appspine.config.ts` | App developer | factory、class/token override、程式化 adapter；不重複列出 package version |
| env／deployment secret provider | Operator | issuer、credential、key、endpoint secret 等 runtime values |
| `pnpm-lock.yaml` | pnpm | package version、tarball resolution 與 integrity 的唯一真相 |
| `appspine.plugin-lock.json` | plugin resolver | 展開後 capability/facet graph、manifest/schema/permission/generated artifact digest |

CLI 不直接以脆弱的文字替換修改任意 TypeScript；`plugin add/remove` 修改 declarative inventory。若插件需要
程式化 wiring，CLI 產生有明確 TODO 的 typed stub 或回報人工步驟，由 App developer review 後加入
`appspine.config.ts`。build-time validation 只要求 secret key 宣告完整，不要求取得 production secret
值；實際值與格式在 bootstrap 階段驗證。

`plugin add` 必須：

1. 讀取 manifest，但不執行未核准的 lifecycle code；
2. 檢查 engine、dependency、conflict 與來源 allowlist；
3. 更新 package dependency 與 `appspine.plugins.json`，必要時產生 typed config stub；
4. 產生 Prisma、frontend、permission 與 env artifacts；
5. 更新 `appspine.plugin-lock.json`；
6. 執行 plugin validation 與 consumer typecheck。

plugin lockfile 不複製 pnpm 已管理的 tarball resolution；只引用解析到的 package name/version，並記錄
manifest digest、facet packages、instance resolution、schema／permission digest、capability graph 與
generated artifact digest。禁止記錄 secret 或實際環境變數值。CI 必須同時比對兩個 lockfiles，避免
package 升級後 plugin resolution 沒有重建。

`plugin doctor` 至少回報：

- enabled／disabled／failed plugins；
- API compatibility 與 unresolved requirements；
- duplicate route、permission、model、table 與 provider token；
- generated artifact drift；
- 缺少的必填 env key（只顯示名稱，不顯示值）；
- package 與 manifest digest 不一致；
- preset 與實際解析版本偏移。

## 8. 工程化基線

### 8.1 標準 package contract

所有新舊套件逐步統一：

- `build`、`typecheck`、`test`、`lint`、`pack:check` scripts；
- `files` allowlist、明確 `exports`、`types`、Node engine 與 package metadata；
- public subpath contract，不讓 consumer import `dist/*` 或 `src/*`；
- `publint`、types resolution 與 clean-consumer compile；
- 每個 public API 變更都有 changeset；
- manifest schema validation 與生成文件 freshness gate。

### 8.2 建置圖

目前 fresh checkout 必須先 build 所有 package，其他 package 才能從 `dist/*.d.ts` typecheck。第一階段
將 internal dependency graph 正式化：

- 使用 TypeScript project references／`tsc -b` 或等價的明確 build graph；
- 先保證 dependency correctness，再評估 Turbo／Nx 等 cache scheduler，避免用 cache 隱藏錯誤依賴；
- CI 保留 full-workspace gate，另增加 affected-package 快速回饋；
- graph validator 比對 TypeScript references、package dependencies 與 plugin requirements。

### 8.3 測試金字塔

每個 capability plugin 至少有：

1. package unit tests；
2. manifest schema／dependency contract tests；
3. plugin-host Nest integration test；
4. Prisma／frontend generated artifact golden test（若有 contribution）；
5. isolated clean-consumer install、typecheck、build 與 pack test；
6. `appspine-app-template` preset acceptance test。

security-sensitive 插件另測 unknown capability、duplicate token、upscope、missing config、tampered digest 與
fail-closed 行為。multi-instance 插件另測 instance isolation／rename；有 override 的插件另測 replaces
compatibility 與 deterministic ordering；有 state contribution 的插件另測 install／upgrade／downgrade／
disable／remove plan。不能只驗證 happy path。

### 8.4 CI 與發布 gate

PR gate 順序：

```text
format/lint
→ manifest + dependency graph validation
→ framework/peer/module-format compatibility
→ build graph
→ typecheck + unit/contract tests
→ pack validation
→ clean-consumer matrix
→ generated artifact + permission/plugin lock drift
→ knowledge lint
```

release PR 除既有 Changesets 外，還要產生 plugin compatibility report；stable publish 前由 template 使用
真實 registry tarball 驗證，不得只靠 workspace symlink。

## 9. 安全性與可觀測性

- production 只允許 config 與 lockfile 明列、來源 scope 受信任、digest 相符的插件。
- 第一版只有 `@appspine/*` 官方插件與 repo 內 app-local plugins 進入 allowlist；第三方插件市場、簽章
  信任鏈與外部發布者 onboarding 另案處理。
- 每個官方插件必須有 owner／CODEOWNERS、security classification、support status、deprecation date 與
  incident contact；無 owner 插件不得進 `preset-standard`。
- manifest parsing 不執行 package code；只有通過 validation 的 runtime entry 才交給 Nest 組裝。
- config diagnostics 必須依宣告做 secret redaction。
- 插件不得透過 install lifecycle script 執行 migration 或外部管理操作。
- catalog 提供 plugin ID、package version、API version、狀態、provides/requires、health、啟動耗時與錯誤
  摘要，但不曝露 secret。
- log、metric 與 tracing 統一帶 `plugin.id`、`plugin.version`；背景 worker 與外部 delivery 另帶
  correlation ID。
- App 可提供 `/admin/plugins` 或內部診斷 endpoint，但必須沿用既有 admin guard／RBAC，不能公開匿名
  catalog 的敏感 config。
- inventory 對每個 instance 宣告 `required` 或 `optional`。required 插件 validate/register/ready 失敗時
  App 啟動失敗；optional 插件只有在 manifest 已定義隔離邊界與 degraded behavior 時才能停用後繼續，
  並必須讓 readiness、catalog 與 alert 明確呈現 degraded，禁止 catch-and-ignore。
- shutdown 依 dependency graph 反向執行並有 timeout；worker、subscription、timer 與外部連線必須由
  plugin lifecycle 登記，避免測試／deploy 時留下背景工作。

## 10. 分階段實作計畫

### Phase 0：ADR 核准與基線修正

範圍：

- 本計畫的建置期插件模型、命名與非目標已核准；實作開始時把核准內容轉成 manifest schema 與
  architecture tests。
- 修正 README 套件 catalog 與 CI 套件數註解的現況漂移。
- 產生現有 15 套件的 public API、dependency graph、consumer 與 direct-import baseline。
- 完成 `@appspine/auth` responsibility inventory，逐一決定 User schema／CRUD、admin guard、current-user、
  JIT、delegated inbound auth、acting-user、password 欄位與 Prisma relations 的目標 owner。
- 定義 manifest JSON Schema、facets、cardinality、capability naming、override、required/optional failure、
  package template 與 deprecation policy。
- 固定 declarative inventory／TypeScript runtime config／secrets／pnpm lock／plugin lock 的唯一真相邊界。
- 產生 Prisma owns/augments 與 permission lifecycle fixtures，先驗證 identity/RBAC/API-key 關係可組裝。

完成門檻：規格 review 通過；尚不改變任何 consumer runtime 行為。

### Phase 1：最小平台核心

範圍：

- 新增 `plugin-api`、`plugin-host-nest`、`plugin-testkit`。
- 完成 manifest validation、dependency resolver、cycle/conflict detection、catalog 與 diagnostics。
- 建立 package／manifest／import／framework peer graph validator，以及 authentication strategy registry。
- 建立 clean-consumer fixture，從實際 tarball 安裝 host 與測試插件。

試點順序：

1. `health-check`：驗證最小 controller/provider 與 health contribution。
2. `audit-log`：驗證 Prisma fragment、injection token 與 database capability。
3. `identity-core` + `oidc-auth`：先抽出 provider-neutral identity，再遷移 OIDC 能力；驗證 config、audit
   dependency、interactive authentication strategy、principal context、Prisma augmentations、舊
   `@appspine/auth` compatibility package 與跨插件 contract。這是一條拆分遷移線，不把原套件直接
   rename 後再二次拆分。

完成門檻：health、audit、identity/oidc 三種形狀可由單一 inventory + config 組裝；legacy module 與
plugin mode 的對外行為測試一致，且 `@appspine/auth` 現有 public exports／Prisma path 都有明確相容或
migration 結論。

### Phase 2：CLI、Prisma 與標準 Preset

範圍：

- 新增 `plugin-cli`、declarative inventory、plugin lockfile 與 deterministic code generation。
- 完成 Prisma owns/augments composer、permission reconciler、conflict detection、digest 與 drift check。
- 建立 `preset-standard`，納入 template 目前預設 capabilities。
- 將 `appspine-app-template` backend 改成 host + preset；保留 legacy wiring 的短期 escape hatch。

完成門檻：新 fork 只需 preset + app-local modules；clean checkout 可重現相同 schema、catalog 與 build。

### Phase 3：Frontend slots 與管理面

範圍：

- 定義 navigation、admin page、dashboard slot 與 i18n contributions。
- 建立 Next.js build-time generator、frontend facet／server-client boundary validation 與 generated artifact
  drift test。
- 依序把 Users、OIDC Login、Roles、API Keys、Domain Events、Notification UI 從 `frontend-shell` 遷回
  `identity-core`、`oidc-auth`、`rbac`、`m2m-api-key`、`domain-events`、`notification` 的 `./frontend`
  subpath；每批使用 changeset、舊 export compatibility re-export 與 consumer migration test。
- 收斂 `frontend-shell` subpath exports，並加入 architecture lint，禁止它反向 import capability plugin。
- 建立受 RBAC 保護的 plugin catalog／health 管理面。

完成門檻：啟停一個具有 admin page 的插件，只改 config 並重新 build，不再手改 navigation 與 route
registry；`frontend-shell` 不再擁有 capability-specific component。

### Phase 4：其餘 capability 與 connector 遷移

依依賴層級遷移：

1. `notification`；
2. `rbac`、`m2m-api-key`，並把 machine strategy 接入 host authentication registry；
3. `metadata-schema`；
4. `domain-events`；
5. `mcp-server`；
6. `oidc-delegation`、`master-data-client`。

保留 domain-event subscriber registry、MCP tool registry 與 integration contract runtime snapshot 的既有
責任；plugin host 只負責安裝與組裝，不吞併這些 domain-specific registry。

完成門檻：template 與至少一個代表性 App 完成 registry tarball 升級與 rollback rehearsal。

### Phase 5：全 App rollout 與舊 API 退場

範圍：

- 逐 App 遷移，不能一次跨全部 repo 大爆炸修改。
- 每個 App 記錄 preset version、app-local plugins、migration 狀態與 rollback 方法。
- legacy root module API 標記 deprecated；至少保留一個 major transition window。
- 所有 consumer 通過後，才另開 breaking-change 計畫移除 legacy wiring。

完成門檻：template 與全部業務 App 不再維護重複的 framework module、navigation、schema glue；舊 API
移除必須另有核准的 major release 計畫。

## 11. 風險與控制措施

| 風險 | 控制措施 |
|---|---|
| 把簡單 module 包得過度抽象 | 先以三個不同複雜度插件試點；沒有消除 consumer glue 的 abstraction 不推廣 |
| Host 成為新的 god package | `plugin-api` 保持 dependency-light；domain-specific registry 留在原套件；host 只做解算與組裝 |
| `@Global()` 移除造成大量 breakage | 雙模式過渡、behavior parity tests、逐 capability 移除，不一次完成 |
| `auth` 拆分／改名造成 consumer 或 peer range 斷裂 | `@appspine/auth` compatibility package、responsibility inventory、codemod、changeset propagation、registry tarball consumer matrix |
| identity-core 仍反向依賴 RBAC／API key schema | Prisma owns/augments contract + composition fixtures；base User 不直接擁有可選插件 relation |
| 未來同時啟用 OIDC 與 local auth 造成 principal 語意不明 | v1 interactive-provider uniqueness + explicit conflicts；需要多來源時另立 identity-broker 計畫 |
| 把 machine auth 錯當成 interactive provider 衝突 | 分開 interactive/machine capabilities，統一註冊進 host strategy registry |
| Prisma fragment 安裝／移除破壞資料 | 只生成 schema；migration 由 App owner 審查；remove 不自動 drop data |
| permission rename/remove 破壞既有角色 | immutable namespaced ID、plan-based reconciliation、alias、orphan/retired 保留政策 |
| Next.js dynamic route 與 server/client boundary 出錯 | 僅 build-time codegen；generated imports 必須走公開 subpath；template build gate |
| 同 package 的 frontend peers 污染 backend install | facet subpath + optional frontend peers；啟用 frontend facet 時由 validator 強制版本，無法共存才拆 `*-frontend` |
| UI 搬離 `frontend-shell` 造成大量 import breakage | 分批 changeset、舊 subpath compatibility re-export、codemod、template + App consumer matrix |
| CLI 修改 TypeScript 造成設定損壞 | CLI 只管理 declarative inventory；程式化 wiring 產生 typed stub 並人工 review |
| multi-instance token／worker／state 碰撞 | pluginId + stable instanceId namespace、instance isolation tests、rename migration |
| App override 依載入順序產生隱性行為 | 禁止 silent override；精確 `replaces` + compatibility test + deterministic slot ordering |
| package dependency 與 manifest requirement 漂移 | graph validator + clean-consumer tarball test |
| CJS/ESM 或 framework peer 不相容 | facet exports、manifest/package peer 雙重驗證、真實 Node/Nest/Next consumer matrix |
| preset 掩蓋實際依賴 | catalog 必須展開 preset；lockfile 記錄解析後完整 graph |
| 版本發布後才發現 consumer 不相容 | canary + template registry install + compatibility report |
| 插件機制擴大供應鏈風險 | allowlist、manifest/digest validation、禁止 production 自動掃描與遠端 hot load |
| 指定 agent／model 不可用、版本更替或實際能力不符 | 以能力級別與 phase gate 為準，不以品牌名驗收；記錄實際 agent、設定、替代原因與驗證證據 |

## 12. 回滾策略

- Phase 1～2 保留既有 Nest module exports；plugin mode 失敗可回到原本手工 `imports`。
- generated artifacts 與 lockfile 都由 source config 重建，不作為唯一真相來源。
- 每個插件遷移使用獨立 changeset，不把全部 capability 綁成單一 breaking release。
- `identity-core`／`oidc-auth` 先以新 packages + 舊 `@appspine/auth` facade 並存；所有 consumer 與 Prisma
  migration fixture 通過前，不取消舊 package 發布或 exports。
- Prisma migration 與 runtime plugin rollback 分開處理；停用插件不等於刪除資料。
- template 採 preset 前保留一個已驗證 tag；rollout 先 template、再代表性 App、最後其餘 App。
- 若 `plugin-api/v1` 試點無法同時支援 health、database 與 identity/auth-provider 三種形狀，停止
  rollout、修訂 ADR，
  不用 app-specific exception 硬撐第一版 contract。

## 13. 整體驗收條件

計畫完成必須同時滿足：

- 新增插件只需 package dependency、declarative inventory、必要的 typed runtime config 及明確 migration
  review；CLI 不需改寫任意 App TypeScript。
- 缺少 requirement、版本不相容、循環、route/schema/token 衝突可在 install/build/bootstrap 前辨識。
- singleton／multi-instance、required／optional、override/replaces 與 frontend/backend/prisma facets 均有
  deterministic validation 與 catalog representation。
- template `AppModule` 不再逐項手工匯入標準 capability modules。
- frontend navigation／admin route 與 Prisma schema 可 deterministic regeneration，CI 可偵測 drift。
- capability-specific UI 都由 capability package 的 `./frontend` facet 擁有；`frontend-shell` 只剩
  capability-neutral Shell、slot infrastructure 與通用 primitives，且無反向 capability dependency。
- 所有插件可列出來源、版本、provides/requires、health 與 redacted diagnostics。
- package tarball、public types、manifest、runtime entry 與 consumer build 均由 CI 驗證。
- legacy 與 plugin mode 在 transition window 內具 behavior parity tests。
- `identity-core` 不依賴 OIDC/local credential，也不反向依賴 RBAC/API-key concrete implementation；
  interactive 與 machine authentication 經中立 registry/context 供業務插件使用。
- permission、Prisma 與 instance state 的 install／upgrade／downgrade／disable／remove 都能產生可審查 plan。
- Changesets、integration contract validation、knowledge lint 與既有安全 gate 持續通過。
- 至少完成一次 template 和代表性 App 的升級、故障注入與 rollback rehearsal。
- 每個 Phase handoff 都記錄實際 agent／model、能力級別、角色、推理強度、替代原因與測試證據；高風險
  決策具有不同 agent 的獨立 review，且替代者符合本計畫的級別規則。

## 14. 已核准的實作決策

使用者已於 2026-08-18 核准以下實作決策，Phase 0／1 可依此展開；核准計畫不代表程式碼已完成：

1. **插件模型**：採建置期組裝、啟動時驗證，明確不做 production runtime hot load。
2. **試點範圍與命名**：採 `health-check → audit-log → oidc-auth`；現有 `auth` 改名為
   `oidc-auth`，為未來可能獨立立項的 `local-auth` 保留清楚邊界。
3. **相依注入方向**：逐步移除 capability module 的 `@Global()`，改為穩定 token + 顯式 bridge。
4. **Frontend 範圍**：Phase 3 處理 navigation/admin slots 與 login、notification 等 Shell-integrated
   capability UI；不做一般業務 page 插件化。
5. **工具選擇**：先用 TypeScript project references 修正 build graph；Turbo／Nx 留到量測後決定。
6. **舊 API 支援期**：至少保留一個 major transition window，再另開移除計畫。
7. **Identity 邊界**：不把 `auth` 原封不動改名；先拆出 provider-neutral `identity-core`，OIDC-specific
   能力才進 `oidc-auth`。未來 local credential 使用獨立 model，不由 identity-core 擁有密碼驗證。
8. **登入來源政策**：`oidc-auth` 與未來 `local-auth` 在 v1 互斥；需要共存時另立 identity-broker／
   account-linking 計畫。Interactive 與 machine authentication 則分開命名並可同時存在。
9. **Plugin facets**：官方 capability 預設同一 npm package，以 subpath 隔離 backend、frontend、Prisma、
   permission、operations facets；只有明確依賴或發布衝突才拆 artifacts，catalog／lockfile 必須完整展開。
10. **設定唯一真相**：CLI 管理 `appspine.plugins.json`，App developer 管理 `appspine.config.ts`，operator
    管理 secrets，pnpm 管 package resolution，plugin lock 只管解析 graph 與 contribution digests。
11. **多實例**：manifest 宣告 singleton/multiple，inventory 使用穩定 instance ID；所有 token、worker、
    health、metric 與 state 都必須 instance-aware。
12. **Override 政策**：禁止 silent override；合法替換使用精確 `replaces`、contract compatibility 與
    deterministic ordering。
13. **State lifecycle**：Prisma 使用 owns/augments；permission 使用 immutable ID、plan-based
    reconciliation、alias 與 orphan/retired policy；移除插件不自動刪資料。
14. **Framework／module format**：backend CJS、frontend ESM 先以 facet exports 隔離；Node、Nest、Prisma、
    Next、React ranges 與 package peers 必須一致並進 consumer matrix。
15. **治理與失敗政策**：v1 只允許官方 allowlist + app-local plugins；官方插件必須有 owner。Required
    插件失敗就中止啟動；optional 插件只有定義過 degraded behavior 才能隔離繼續。
16. **Frontend ownership**：Users、OIDC Login、Roles、API Keys、Domain Events、Notification 等
    capability-specific UI 遷回各自 package 的 `./frontend`；`frontend-shell` 只保留 Shell、slot/i18n
    infrastructure 與 capability-neutral primitives，且不得反向依賴 capability plugin。一般業務 page
    仍不納入插件化。
17. **Agent 指派與替代**：能力級別、專長角色與 phase gate 才是長期約束；文件中的品牌／model 是
    2026-08-18 的建議預設。可使用通過校準的同級或更高級 agent 替代，但不得降低高風險決策的
    獨立 review 與驗收證據。

## 15. Agent 執行、分工與替代策略

### 15.1 能力級別與專長角色

Agent 指派使用「能力級別 × 專長角色」，不把單一品牌或 model 名稱寫成永久 contract。依
[OpenAI 官方模型指南](https://developers.openai.com/api/docs/models)，目前 Codex 預設 mapping 為 Sol
處理複雜推理與 coding、Terra 平衡能力與成本、Luna 處理高量且成本敏感的工作；未來 model 行為或命名
改變時，必須重新校準，不能只依名稱沿用級別。

| 級別 | 適合工作 | 目前建議預設 | 限制 |
|---|---|---|---|
| G3：Frontier／決策 gate | 跨 package 架構、public API、security、identity、Prisma migration、破壞性相容與 release gate | `gpt-5.6-sol` 或經校準的同級 agent | 高風險決策至少需要一位 G3；不可直接由 G1／G2 單獨取代 |
| G2：Engineering lead | 邊界清楚的設計與實作、跨檔 refactor、CLI/codegen、frontend、consumer migration、整合測試 | `gpt-5.6-terra`、Claude Sonnet、Gemini 或經校準的同級 agent | 能領導一般 Phase；遇到 security、schema ownership 或 breaking contract 必須交 G3 gate |
| G1：Bounded throughput | inventory、codemod、fixture、golden file、文件、lint、版本與 drift matrix | `gpt-5.6-luna` 或經校準的同級 agent | 任務必須可機械驗證；不得成為 security、migration、public API 破壞性決策的唯一 reviewer |

同級 agent 再依專長選擇，而非假設所有模型可互換：

- `architecture-contract`：責任邊界、語意一致性、ADR 與 public API review；目前優先 Claude Sonnet。
- `repo-integration`：跨 package／跨 App inventory、遷移順序、遺漏與 rollout 協調；目前優先 Gemini。
- `implementation`：TypeScript、Nest、Next、Prisma、CLI/codegen 與測試落地；目前優先 Terra。
- `risk-gate`：security、identity、migration、determinism、相容與 release 決策；目前優先 Sol。
- `mechanical-verification`：codemod、fixture、矩陣、lint 與重複性驗證；目前優先 Luna。

Claude Sonnet 與 Gemini 在此是工作預設，不代表所有版本固定為 G2；若實際選用更強或更弱的版本，應以
校準結果調整級別。高級別可以承接低級別任務，但仍應考量成本與吞吐量。

### 15.2 Phase 建議配置

以下是預設 roster；執行時可以依 15.3 的規則換成相近等級 agent：

| Phase | Primary owner | 搭配與獨立 gate |
|---|---|---|
| Phase 0：ADR／盤點／規格凍結 | Claude Sonnet（G2，`architecture-contract`） | Sol xhigh（G3）凍結 contract；Gemini（G2）做跨 package blind-spot audit；Luna（G1）整理 inventory |
| Phase 1：核心 host 與三個試點 | Sol xhigh（G3，`risk-gate` + implementation lead） | Claude 做 API／責任邊界 review；Gemini 做 adversarial dependency review；Luna 補 fixtures／goldens |
| Phase 2：CLI／Prisma／Preset | Terra xhigh（G2，`implementation`） | Sol max（G3）審 Prisma ownership、migration 與 lockfile contract；Gemini 驗證 deterministic output／consumer flow |
| Phase 3：Frontend slots／管理面 | Claude Sonnet（G2，`architecture-contract`） | Terra high 實作 Next build、exports 與 migration；Luna 執行 import codemod、fixture 與 drift matrix |
| Phase 4A：Notification／RBAC | Terra high（G2，`implementation`） | Claude 審 permission 與 UI contract；Luna 建 migration／consumer matrix；高風險差異升級給 G3 |
| Phase 4B：M2M／Metadata／Domain Events／MCP | Sol xhigh（G3） | Gemini 做 capability/dependency audit；Claude 做 public API review；Terra 可承接已切小的實作批次 |
| Phase 4C：OIDC Delegation／Master Data | Gemini（G2，`repo-integration`） | Terra high 做 connector 整合與 negative tests；Claude 審 contract；identity/security 差異交 Sol gate |
| Phase 5：全 App rollout／舊 API 退場 | Gemini（G2，rollout coordinator） | Terra 分批遷移 App；Luna 維護版本／drift／結果矩陣；Sol（G3）做最後 breaking release gate |

推理強度預設為：Sol 使用 xhigh，高風險 architecture freeze、migration 或 release gate 才使用 max；Terra
一般實作使用 high，CLI／Prisma／codegen 可升到 xhigh；Luna 使用 medium／high 執行有明確輸入、輸出與測試的
bounded task。Claude／Gemini 使用其平台可提供、且與任務風險相稱的高推理設定；handoff 必須記錄實際值。

Phase 1、Phase 2 的 Prisma／lockfile gate、Phase 4B 與最終 breaking release gate 必須保留 G3 責任；即使沒有
Sol，也只能以已校準的同級 agent 取代。

### 15.3 替代與升級規則

替代 agent 必須同時符合：

1. 能力級別相同或更高，並具備 repo read/write、terminal、test 與必要 context 載入能力。
2. 先用該 Phase 的一個 bounded task 校準；輸出需通過既有 tests、lint、diff review 或 golden comparison。
3. lower-tier 不得直接取代 higher-tier owner／gate；若資源受限，先把工作拆成可驗證的小任務，再由 G3
   獨立整合與審查。
4. reviewer 儘量使用不同 provider／model family 與獨立 context，避免 primary owner 自我核准。
5. 品牌名只決定建議起點，最終接受與否由 phase exit criteria、consumer evidence 與風險 gate 決定。
6. 若同一 agent 連續兩次無法通過 bounded calibration／驗收，或產生無法說明的廣泛修改，立即換 agent
   或升級級別，不能靠反覆放寬 gate 讓結果通過。

### 15.4 執行節奏與 handoff

每個工作批次採 `primary → 不同 agent review → primary 修正 → mechanical full gate → 風險 owner 核准`。
每個 Phase／實作批次使用獨立 branch／worktree；多個 agent 並行時各自使用不同 working directory，不得共享
未提交的局部狀態。
後一 Phase 必須等前一 Phase exit criteria 通過，除非工作已被證明互不相依。

Phase handoff 至少包含：

- 實際 agent／model、能力級別、專長角色、推理強度、替代原因與工作範圍。
- 已完成／未完成項目，以及相對本 ADR 的偏離與核准紀錄。
- public API、manifest、schema、permission、generated artifact、migration 與 changeset 變更摘要。
- 實際執行的 commands／tests、結果，以及 clean-consumer tarball 或代表性 App 證據。
- 已知風險、rollback 方法與下一 Phase 前置條件。

## 16. 計畫文件驗證

本文件建立後執行：

```bash
node scripts/lint-knowledge.js --write-indexes
node scripts/lint-knowledge.js
git diff --check
```

這些命令只驗證 knowledge frontmatter、索引、連結、文件一致性與 whitespace；不代表 Phase 1 程式碼或
跨 App rollout 已完成。
