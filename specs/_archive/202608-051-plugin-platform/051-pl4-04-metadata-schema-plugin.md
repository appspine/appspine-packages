---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-04 — 遷移 `metadata-schema` plugin（4B）

> Task：`PL4-04`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 依賴：[PL4-03](051-pl4-03-m2m-api-key-plugin.md)。  
> Changeset：`.changeset/051-phase4-metadata-schema-plugin.md`。  

---

## 1. 任務目標與交付範圍

`@appspine/metadata-schema` 是 Phase 4 插件遷移中 4B 群組的第一個套件。本 task 將其升級為符合 `appspine.plugin/v1` 規範的標準 Capability Plugin，徹底消除對 `@appspine/m2m-api-key` 具體 guard/controller 的直接耦合，實作主機中立的 `AppspineAuthGuard` 與 `MetadataScopeGuard`（以 `@appspine/plugin-api` 中之 `SCOPE_MATCHER` 注入 token 進行 scope 驗證），綁定並匯出 `METADATA_SCHEMA` token，宣告 backend 與 permissions facets，提供 classic/node10 模組解析相容性 shim，並補齊包含 DMMF/scope derivation、Missing Optional Capability（Fail-Closed）、Schema Drift 自適應與極端情況、Authorization Negative Tests 以及 NestJS 應用真實開機（`createNestApplication() + app.init()`）DI 依賴解析測試等完整測試矩陣。

### 1.1 核心交付物

1. **依賴解耦與 M2M Guard Concrete Chain 消除**：
   - 從 `package.json` 的 `dependencies` 與 `tsconfig.build.json` 的 `references` 中徹底移除 `@appspine/m2m-api-key`。
   - 引入 `@appspine/plugin-api` 與 `@appspine/plugin-host-nest`。
   - `MetaController` 移除具體 `JwtOrApiKeyGuard` 與 `ScopeGuard` import，改為使用主機中立的 `AppspineAuthGuard` 與 `MetadataScopeGuard`。
   - `MetaModule` 引入 `AppspineAuthInfrastructureModule`，確保 `AppspineAuthGuard` 所需之 `AuthenticationStrategyRegistry` 與 `PrincipalContextService` 於 Nest 執行時期路由綁定與 guard 實例化時獲得完整 DI 解析。

2. **中立 Scope 授權防護（`MetadataScopeGuard`）**：
   - 注入可選之 `@Optional() @Inject(SCOPE_MATCHER) private readonly scopeMatcher?: ScopeMatcherPort`。
   - **互動式使用者（JWT）**：直接放行存取架構與 scope 目錄。
   - **機器使用者（API key / machine principal）**：
     - 若 `scopeMatcher` 存在，驗證 `scopeMatcher.matches(scopes, 'metadata:read')`，不符合拋 403 `ForbiddenException('Insufficient API key scopes')`。
     - 若 `scopeMatcher` 缺失（Optional capability missing），採 **嚴格 Fail-Closed** 拋 403 `ForbiddenException('No scope matcher provider is available to validate API key scopes')`，確保未經 scope 比對器核可的機器請求不會被放行。
   - **未認證請求（Unauthenticated）**：回傳 `false` / 401 拒絕。

3. **穩定 Capability Token 綁定（`METADATA_SCHEMA`）**：
   - 在 `@appspine/plugin-api` 中定義 `MetadataSchemaPort` 介面（`buildMeta(): unknown`）。
   - 於 `MetaModule` 宣告 `{ provide: METADATA_SCHEMA, useExisting: MetaService }` 並匯出 `METADATA_SCHEMA`。

4. **Manifest 與 Facets 宣告（`appspine.plugin.json` & `src/plugin.ts`）**：
   - 宣告 `provides: ["appspine.metadata-schema"]`。
   - 宣告 `requires: ["appspine.prisma"]` 與 `optionalRequires: ["appspine.scope-matcher"]`。
   - 宣告 `backend` facet：`modulePath: "./dist/meta.module.js"`, `exportName: "MetaModule"`, `controllerRoutes: ["metadata"]`, `providerTokens: ["appspine.metadata-schema"]`。
   - 宣告 `permissions` facet：`definitions: ["metadata:schema:read"]`。

5. **Classic / Node10 Module Resolution Shim**：
   - 提供 `packages/metadata-schema/plugin.js` 與 `packages/metadata-schema/plugin.d.ts` 轉發 `./dist/plugin`。

---

## 2. 驗證與測試覆蓋

本 task 建立了多維度且完整的測試套件（6 個測試檔案，30 個單元與合約測試全數 PASS）：

### 2.1 NestJS 應用真實開機與 DI 解析測試（`meta.module.boot.spec.ts` — Remediation 新增）
- 驗證使用 `Test.createTestingModule({ imports: [MetaModule] }).compile()`、建立 Nest 應用 `moduleRef.createNestApplication()` 並執行 `await app.init()`。
- 驗證 Nest 於真實開機階段（HTTP route binding & guard instantiation）能完整解析 `AppspineAuthGuard`（注入 `AuthenticationStrategyRegistry` 與 `PrincipalContextService`）及 `MetadataScopeGuard`。
- 驗證 `MetaService` 與 `METADATA_SCHEMA` token 均成功實例化並指向同一單例。
- 驗證當 `MetaModule` 作為子模組被 Consumer 應用程式 import 時能乾淨開機。

### 2.2 Manifest 與 Plugin 合約測試（`plugin.spec.ts`）
- 驗證 `appspine.plugin.json` 與 TS `metadataSchemaManifest` 100% deep-equal。
- 驗證通過嚴格模式的 `parsePluginManifest()`（驗證 provides、requires、optionalRequires 正確性）。
- 驗證 backend facet（`controllerRoutes`, `providerTokens`）與 permissions facet 宣告。
- 驗證在 `appspine.prisma` 環境下（含與不含 optional `scope-matcher`）的 host resolution。
- 驗證 backend factory 回傳 `MetaModule` 及 `METADATA_SCHEMA` token 綁定。
- 驗證 `bootHarness` 成功啟動進入 `ready` 狀態並正確貢獻 catalog。

### 2.3 Controller、Missing Optional Capability 與 Authorization Negative 測試（`meta.controller.spec.ts`）
- **互動式使用者放行**：驗證 JWT 使用者（無論是否有 scopeMatcher）均可正常存取 `GET /metadata/schema`。
- **機器使用者正向測試**：驗證 API key 攜帶 `metadata:read`、`metadata:*`、`*` 時均可通過並讀取 schema。
- **Missing Optional Capability 測試**：驗證當 `appspine.scope-matcher` 缺失時，API key 機器請求一律 fail-closed 拋出 403 `ForbiddenException`。
- **Authorization 負向測試**：
  - 攜帶無關 scope（如 `users:read`）拋 403。
  - 攜帶寫入 scope（如 `metadata:write`）拋 403。
  - 攜帶空 scope（`[]`）或未定義 scope 拋 403。
  - 未認證呼叫者（無 user）回傳 `false` 阻擋。
- **Controller 裝飾器與委派**：驗證 `MetaController` 正確掛載 `AppspineAuthGuard` 與 `MetadataScopeGuard` 並委派至 `MetaService.buildMeta()`。

### 2.4 Schema Drift 與 DMMF 動態自適應測試（`schema-drift.spec.ts`）
- 驗證當 Prisma DMMF 動態新增 model 與 enum 時，`buildMeta()` 與 `renderDataDictionary()` 自適應更新。
- 驗證 relation（`kind: 'object'`）欄位正確被過濾，僅保留 scalar 屬性。
- 驗證含 `@internal` 註解之 model 被嚴格排除於 `availableScopes` 之外。
- 驗證無 `dbName`（回退小寫）、空 model、空 enum、多行註解標準化等極端結構之穩健性。

### 2.5 DMMF 核心解析與 I18n 測試（`meta.service.spec.ts` & `enum-i18n.test.ts`）
- 驗證從 Prisma DMMF 提取 model/field/enum 結構與 scope 推導。
- 驗證多語系 enum 翻譯 gap（missing / orphaned keys）收集邏輯。

---

## 3. 下游 Consumer 影響追蹤（Consumer Impact Analysis）

| Consumer 類型 | 現狀使用方式 | PL4-04 影響與相容保證 |
|---|---|---|
| 下游 9 個業務 App（`AppModule`） | `import { MetaModule } from "@appspine/metadata-schema";` 掛載於 `app.module.ts` | **零破壞性影響（已由真實 `app.init()` 驗證）**。`MetaModule` 內建 `AppspineAuthInfrastructureModule`，無論在 standalone 還是 consumer 組合下，`app.init()` 時皆可完整解析 `AppspineAuthGuard` 與 `MetadataScopeGuard`，對外保持公開匯出 `MetaModule` 與 `MetaController`。 |
| 下游跨外掛消費者（如 `@appspine/mcp-server` 等） | 過去需依賴具體 `MetaService` 或 `forwardRef` | **提供中立介面**。可直接使用 `@Inject(METADATA_SCHEMA)` 與 `MetadataSchemaPort` 進行依賴注入，解除具體套件耦合。 |
| 外部 Agents / Tooling | 透過 `GET /metadata/schema` 查詢 runtime schema 與 scope 目錄 | **完全相容且更安全**。JWT 使用者與具備 `metadata:read` scope 的 API key 均可正常查詢；未授權或缺 scope 比對器時嚴格 fail-closed。 |

---

## 4. 回滾策略（Rollback Plan）

若 metadata-schema plugin 在 consumer 端整合出現未預期問題：
1. 模組介面層面：`MetaModule`、`MetaService`、`MetaController` 公開介面與路由完全向後相容。
2. 授權防護層面：`MetadataScopeGuard` 採用中立 token，對既有 JWT 呼叫者完全放行，對 API key 依賴標準 `ScopeMatcherPort`。
3. 可透過 Git 直接 revert 本 branch (`051-pl4-04-metadata-schema-plugin`)，對其他 capability packages 無破壞性影響。

---

## 5. Dependency Audit 結果（執行者自查）

執行者針對 `@appspine/metadata-schema` 執行了完整的依賴審計（Dependency Audit）：

| 檢查項目 | 審計結果 | 說明 |
|---|---|---|
| Direct dependencies | **PASS** | `dependencies` 僅包含 `@appspine/common`, `@appspine/plugin-api`, `@appspine/plugin-host-nest`。已確認**完全無** `@appspine/m2m-api-key` 或其他業務 capability 具體套件。 |
| Cross-package concrete guard imports | **PASS** | `meta.controller.ts` 已移除 `JwtOrApiKeyGuard` 與 `ScopeGuard` import，全面改用主機中立的 `AppspineAuthGuard` 與本套件的 `MetadataScopeGuard`。 |
| TypeScript project references | **PASS** | `tsconfig.build.json` 精確參照 `common`, `plugin-api`, `plugin-host-nest`，無任何未使用的殘留 references（通過 `verify:build-graph` 88 項檢查）。 |
| Manifest capability references | **PASS** | 僅要求 `requires: ["appspine.prisma"]` 與 `optionalRequires: ["appspine.scope-matcher"]`，嚴格符合 051 規範。 |

---

## 6. Execution Log & §11 Substitution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL4-04` 遷移 `metadata-schema` plugin（4B） |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G3 (`architecture-contract`) |
| Substitution reason | 本 session 由使用者指派 Gemini 執行；原 051 計畫建議 roster 為 Sol xhigh（G3）主導、Terra 實作、Gemini 執行 dependency audit |
| Calibration & Review Remediation | 依 051 §11 執行嚴格校準以承接 G3 級別任務，並於 Review 回饋後完成實質修復：<br>1. **架構合約維護**：在 `@appspine/plugin-api` 新增 `MetadataSchemaPort` 介面，於 `MetaModule` 綁定並匯出 `METADATA_SCHEMA` 穩定 token。<br>2. **消除 Concrete Guard 依賴**：重構 `MetaController`，以 `@appspine/plugin-host-nest` 的 `AppspineAuthGuard` 與中立 `MetadataScopeGuard` 取代直接依賴 `m2m-api-key` 具體 guard。<br>3. **DI 範圍修正（Review Remediation）**：補齊 `MetaModule` 之 `imports: [AppspineAuthInfrastructureModule]`，並為 `MetaController` 建構子加入明確 `@Inject(MetaService)`，解決 `AppspineAuthGuard` 在真實 `app.init()` 執行時期 DI 解析失敗之缺陷。<br>4. **真實開機驗證（Review Remediation）**：新增 `src/meta.module.boot.spec.ts`，以 `createNestApplication() + app.init()` 驗證 Nest DI 容器於真實 HTTP route binding 階段能完整實例化所有 guard 與 controller。<br>5. **嚴格安全 Fail-Closed 與 Optional Capability 處理**：實作 `MetadataScopeGuard`，在 `scope-matcher` 缺失時對 API Key 請求嚴格 fail-closed（403），對 JWT 正常放行。<br>6. **完整性驗證矩陣**：建立包含 manifest 合約、host resolution、boot catalog、missing optional capability、authorization negative、schema drift 自適應、Nest app boot 等 30 項測試，通過 monorepo 全套 platform gates。<br>7. **自我依賴審查**：完成自主 Dependency Audit 檢查並記錄審計表，供獨立 reviewer 覆核。 |
| Independent reviewer | Sol G3 / Claude（Architecture & Contract Review） |
| Repos / Branches | `appspine-packages` (`051-pl4-04-metadata-schema-plugin`) |
| Commit SHA | `af5b4e39ce5a24ef0e9e124d78554623d23709f9` |
| Evidence | 30/30 unit & boot tests in `@appspine/metadata-schema` pass; architecture check 22 packages (9 with manifest) 0 findings; generation gate 0 findings; build graph check 88 checks pass; changeset discipline pass; lint 0 errors; typecheck 0 errors |
| 已知風險 | **API Key Scope 比對器依賴**：在未安裝 `m2m-api-key`（或任何提供 `scope-matcher` 的外掛）環境下，外部機器攜帶 API Key 請求 `GET /metadata/schema` 會被 fail-closed 拒絕（403）。此為預期之安全防護行為（已由 `missing-optional` 測試覆蓋）。 |
| 下一任務前置 | PL4-05 遷移 `domain-events` plugin（4B） |
