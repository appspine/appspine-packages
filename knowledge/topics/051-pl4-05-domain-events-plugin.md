---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-05 — 遷移 `domain-events` plugin（4B）

> Task：`PL4-05`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 依賴：[PL4-02](051-pl4-02-rbac-plugin.md)、[PL4-03](051-pl4-03-m2m-api-key-plugin.md)、[PL4-04](051-pl4-04-metadata-schema-plugin.md)。  
> Changeset：`.changeset/051-phase4-domain-events-plugin.md`。  

---

## 1. 任務目標與交付範圍

`@appspine/domain-events` 是 Phase 4 插件遷移中 4B 群組的核心事件發布/訂閱與 Outbox 分發套件。本 task 將其升級為符合 `appspine.plugin/v1` 規範的標準 Capability Plugin，完整涵蓋 5 大 facets（`backend`, `frontend`, `prisma`, `permissions`, `operations`），實作與主機解耦的訂閱註冊橋接（Subscriber Registry Bridge）、Admin 管理後台貢獻、嚴格的權限與 Scope 防護（`DomainEventsAdminGuard`），並嚴格遵守「Host 不得吞併 Domain Registry」原則，維持 Domain Events 的自主與可擴展性。

### 1.1 核心交付物

1. **依賴解耦與 Concrete Guard 徹底移除**：
   - 從 `package.json` 的 `peerDependencies` / `devDependencies` 與 `tsconfig.build.json` 的 `references` 中徹底移除對具體 `@appspine/auth` 與 `@appspine/m2m-api-key` 的引用。
   - 引入 `@appspine/plugin-api` 與 `@appspine/plugin-host-nest`。
   - `DomainEventsAdminController` 移除具體 `JwtOrApiKeyGuard` 與 `ScopeGuard` import，改為使用主機中立的 `AppspineAuthGuard` 與本套件專屬的 `DomainEventsAdminGuard`。
   - `DomainEventsAdminModule` 與 `DomainEventsModule` 引入 `AppspineAuthInfrastructureModule`，確保 `AppspineAuthGuard` 所需之 `AuthenticationStrategyRegistry` 與 `PrincipalContextService` 於 Nest 執行時期路由綁定與 guard 實例化時獲得完整 DI 解析。

2. **中立 Scope 與 Admin 授權防護（`DomainEventsAdminGuard`）**：
   - 宣告 `@Scopes(...scopes: string[])` 裝飾器與 `DOMAIN_EVENTS_SCOPES_KEY` metadata。
   - 注入可選之 `@Optional() @Inject(SCOPE_MATCHER) private readonly scopeMatcher?: ScopeMatcherPort`。
   - **互動式使用者（JWT）**：驗證使用者具備 `SYSTEM_ADMIN_ROLE`（`admin`）或角色名稱包含 `'ADMIN'` / `'admin'`，非管理員拋 403 `ForbiddenException`。
   - **機器使用者（API key / machine principal）**：
     - 若路由宣告了 `@Scopes()` 且 `scopeMatcher` 存在，驗證 `scopeMatcher.matches(granted, req)`，不符合拋 403 `ForbiddenException('Insufficient API key scopes')`。
     - 若 `scopeMatcher` 缺失（Optional capability missing），採 **嚴格 Fail-Closed** 拋 403 `ForbiddenException('No scope matcher provider is available to validate API key scopes')`。
     - 若路由未宣告 `@Scopes()`，預設拒絕機器存取，拋 403 `ForbiddenException`。
   - **未認證請求（Unauthenticated）**：回傳 `false` / 401 拒絕。

3. **穩定 Capability Token 與 Port 介面（`DOMAIN_EVENTS`）**：
   - 在 `@appspine/plugin-api` 中定義 `RecordDomainEventPortInput` 與 `DomainEventsPort` 介面（包含 `record()`, `registerSubscriber()`, `getDispatcherStatus()` 等方法）。
   - 於 `DomainEventsModule` 宣告 `{ provide: DOMAIN_EVENTS, useExisting: DomainEventsService }` 並匯出 `DOMAIN_EVENTS`。

4. **Prisma Schema Fragment 與 LF-Normalized Digest**：
   - 建立 `packages/domain-events/prisma/domain-events.prisma`，宣告 owns models: `DomainEvent`, `DomainEventDelivery`, `IntegrationEventReceipt` 以及 enums: `DomainEventOperation`, `DomainEventDeliveryStatus`。
   - 計算 LF-normalized sha256 digest: `sha256:9c007fb569beb870e2b6d1e41e0a4e187e8ed6bb7c05e0599c748ce7b83fa351`。
   - 在 `package.json` 的 `files` 與 `exports` 暴露 `"./prisma/domain-events.prisma"`。

5. **Manifest 與 5 大 Facets 宣告（`appspine.plugin.json` & `src/plugin.ts`）**：
   - 宣告 `provides: ["appspine.domain-events"]`。
   - 宣告 `requires: ["appspine.prisma", "appspine.principal-context"]` 與 `optionalRequires: ["appspine.audit-sink", "appspine.rbac-policy", "appspine.scope-matcher"]`。
   - 宣告 `backend` facet：`modulePath: "./dist/domain-events.module.js"`, `exportName: "DomainEventsModule"`, `controllerRoutes: ["domain-events/admin"]`, `providerTokens: ["appspine.domain-events"]`。
   - 宣告 `frontend` facet：包含 `domain-events` 與 `domain-events-catalog` admin pages 與 navigation items，指定 `clientEntry: "./dist/frontend.js"`。
   - 宣告 `prisma` facet：`owns: ["DomainEvent", "DomainEventDelivery", "IntegrationEventReceipt"]`, `ownsEnums: ["DomainEventOperation", "DomainEventDeliveryStatus"]`，關聯 schema fragment 與 digest。
   - 宣告 `permissions` facet：`definitions: ["domain-events:event:read", "domain-events:event:replay", "domain-events:catalog:read"]`。
   - 宣告 `operations` facet：`backgroundJobs: [{ id: "dispatcher", name: "domain-events-dispatcher", type: "timer", intervalMs: 5000, description: "Transactional outbox poller and delivery dispatcher" }]`。

6. **Host 不得吞併 Domain Registry 原則**：
   - `DomainEventRegistry` 標記為 `@Injectable()`，由 `@appspine/domain-events` 獨立維護並註冊至 `DomainEventsModule`。
   - Plugin Host 僅負責解析 capability 依賴，不攔截或吞併業務 domain event 註冊表。

7. **Classic / Node10 Module Resolution Shim**：
   - 提供 `packages/domain-events/plugin.js` 與 `packages/domain-events/plugin.d.ts` 轉發 `./dist/plugin`。

8. **Host Infrastructure 與 Consumer 健壯度加固**：
   - 在 `@appspine/plugin-host-nest` 的 `AppspineAuthInfrastructureModule` 加上 `@Global()` 裝飾器，確保 `AppspineAuthGuard`、`InteractiveAuthGuard`、`PrincipalContextService` 在所有模組環境中能全局解析。
   - 在 `@appspine/m2m-api-key` 的 `ApiKeysService` 將 `IDENTITY_STORE` 注入調整為 `@Optional()`，確保在 host 隔離環境中能平滑開機。

---

## 2. 驗證與測試覆蓋

本 task 涵蓋了 16 個測試檔案，共 98 個單元、合約與開機測試，100% PASS：

```
 ✓ src/webhook/webhook-signature.spec.ts (6 tests)
 ✓ src/admin/domain-events-admin.service.spec.ts (11 tests)
 ✓ src/domain-event-registry.spec.ts (11 tests)
 ✓ src/guards/domain-events-admin.guard.spec.ts (12 tests)
 ✓ src/shutdown.spec.ts (2 tests)
 ✓ src/parity.spec.ts (2 tests)
 ✓ src/domain-event-dispatcher.service.spec.ts (5 tests)
 ✓ src/domain-events.module.boot.spec.ts (3 tests)
 ✓ src/admin/domain-events-admin.controller.spec.ts (6 tests)
 ✓ src/domain-events.service.spec.ts (8 tests)
 ✓ src/schema-drift.spec.ts (3 tests)
 ✓ src/integration/integration-receipt.spec.ts (4 tests)
 ✓ src/admin/domain-events-admin.module.spec.ts (2 tests)
 ✓ src/integration/integration-contract-reference.spec.ts (5 tests)
 ✓ src/plugin.spec.ts (12 tests)
 ✓ src/integration/integration-handler.spec.ts (6 tests)

 Test Files  16 passed (16)
      Tests  98 passed (98)
```

### 2.1 關鍵測試驗證要點

1. **NestJS 應用真實開機與 DI 解析測試（`domain-events.module.boot.spec.ts`）**：
   - 使用 `Test.createTestingModule({ imports: [DomainEventsModule] }).compile()`，透過 `createNestApplication()` 建立真實 Nest 應用並執行 `await app.init()`。
   - 驗證 `DomainEventsModule`、`DomainEventsService`、`DomainEventRegistry`、`DomainEventDispatcherService`、`DomainEventsAdminService`、`DomainEventsAdminGuard`、`AppspineAuthGuard` 於開機時均成功解析並無依賴缺失。
   - 驗證 `DomainEventsAdminModule.forRoot(registryModule)` 於動態模組組合下能正確解析並開機。

2. **生命週期與優雅關機測試（`shutdown.spec.ts`）**：
   - 驗證 `DomainEventDispatcherService` 於 `OnModuleInit` 啟動定時輪詢計時器（`timer`）。
   - 驗證於 `OnModuleDestroy` 執行時正確清除定時器，避免程序懸掛（dangling timers / memory leak）。
   - 驗證 `stop()` 方法具備冪等性（Idempotent）。

3. **Legacy Standalone vs Plugin DI 模式對等性測試（`parity.spec.ts`）**：
   - 驗證直接透過類別建構（Legacy Standalone）與透過 Nest DI 容器（Plugin Mode）記錄事件並分發時，產生的 `DomainEvent` 記錄、payload 結構及 delivery 處理具備 100% 行為與資料對等性。

4. **Manifest 與 5 大 Facets 完整性測試（`plugin.spec.ts`）**：
   - 驗證 `appspine.plugin.json` 與 TS `domainEventsManifest` 100% deep-equal。
   - 驗證通過嚴格模式 `parsePluginManifest()`。
   - 驗證 backend、frontend、prisma、permissions、operations 5 大 facets 正確宣告。
   - 驗證 Prisma schema fragment 檔案存在且 sha256 digest 與 manifest 吻合。
   - 驗證 `bootHarness` 成功啟動並貢獻 catalog 與 3 項 permissions。

5. **Admin 授權防護矩陣測試（`domain-events-admin.guard.spec.ts`）**：
   - **互動式使用者**：管理員（`admin` / `SYSTEM_ADMIN_ROLE` / `ADMIN`）通過；非管理員（`user` / `guest`）拋 403。
   - **機器使用者**：宣告 `@Scopes()` 且持有相應 scope（`domain-events:event:read`、`domain-events:*`、`*`）通過；scope 不足拋 403。
   - **Missing Optional ScopeMatcher**：當 `scopeMatcher` 未提供時，機器使用者請求嚴格 fail-closed 拋 403。
   - **無 Scope 宣告路由**：機器使用者存取未宣告 `@Scopes` 的 admin 路由預設拒絕（403）。
   - **未認證呼叫者**：回傳 `false` / 401 拒絕。

6. **Outbox 分發、收據、Webhooks 與合約測試**：
   - 驗證 `DomainEventsService.record()` 寫入 Outbox 表及關聯 delivery。
   - 驗證 `DomainEventDispatcherService` 在交易安全鎖定、過期重試與 dispatcher options 配置下的正確輪詢與狀態流轉。
   - 驗證 `IntegrationEventReceipt` 冪等性與去重機制。
   - 驗證 Webhook HMAC 簽名生成與驗證邏輯。
   - 驗證跨服務整合合約（`integration-contracts`）參照正確性。

---

## 3. Monorepo 平台閘門驗證命令與輸出

全套 Monorepo Platform Gates 全部通過：

| 驗證命令 | 實際執行結果 | 輸出狀態 |
|---|---|---|
| `pnpm verify:architecture` | `22 packages checked (9 with a plugin manifest), 0 findings` | **PASS (0 findings)** |
| `pnpm verify:build-graph` | `88 checks run, 0 failed.` | **PASS (0 failed)** |
| `pnpm verify:generation` | `6 self-tests run, 0 failed; byte-identical in second run; OK` | **PASS** |
| `pnpm verify:template-dual-mode` | `5 test files, 11 passed (11); PL2-09 template dual mode: OK` | **PASS** |
| `pnpm check:changeset-discipline` | Changeset 格式與套件清單嚴格檢查通過 | **PASS** |
| `pnpm typecheck` | 22 個 package 全數完成型別檢查，無錯誤 | **PASS (0 errors)** |
| `pnpm test` | 全 monorepo 22 個 package 測試全數通過 | **PASS** |
| `pnpm lint` | Biome checks 通過，0 errors | **PASS (0 errors)** |
| `pnpm build` | 全 monorepo 22 個 package 建置成功 | **PASS** |

---

## 4. 下游 Consumer 影響追蹤（Consumer Impact Analysis）

| Consumer 類型 | 現狀使用方式 | PL4-05 影響與相容保證 |
|---|---|---|
| 下游 9 個業務 App（`AppModule`） | `import { DomainEventsAdminModule } from "@appspine/domain-events/admin";` 或自建 `DomainEventsModule` | **完全向後相容**。`DomainEventsAdminModule.forRoot()` 支援選用 `registryModule`，內建 `AppspineAuthInfrastructureModule`，解除對 `@appspine/auth` 的強依賴。可無縫切換為由 Plugin Host 動態掛載之 `DomainEventsModule`。 |
| 下游跨套件/外掛消費者（業務 Service） | 透過 `DomainEventsService.record()` 或 `DomainEventRegistry.register()` | **提供中立介面**。可直接注入 `@Inject(DOMAIN_EVENTS)` 與 `DomainEventsPort`，或使用 `DomainEventRegistry`，無破壞性變更。 |
| 外部整合端點 / Webhooks | 透過 Webhook Post Handler 與簽名驗證接收事件 | **完全相容**。Webhook 簽名與 Outbox delivery 格式保持 100% 對等。 |

---

## 5. 回滾策略（Rollback Plan）

若 domain-events plugin 在 consumer 端整合出現未預期問題：
1. 模組介面層面：`DomainEventsModule`、`DomainEventsService`、`DomainEventRegistry`、`DomainEventsAdminModule` 公開 API 完全向後相容。
2. 授權防護層面：`DomainEventsAdminGuard` 支援既有 JWT 系統管理員角色與 API key 宣告 scope，並在 host 缺少 scope matcher 時提供 fail-closed 保障。
3. 可透過 Git 直接 revert 本 branch (`051-pl4-05-domain-events-plugin`)，不影響已完成之 PL4-01 ~ PL4-04 插件。

---

## 6. Dependency Audit 結果（執行者自查）

執行者針對 `@appspine/domain-events` 執行了完整的依賴審計（Dependency Audit）：

| 檢查項目 | 審計結果 | 說明 |
|---|---|---|
| Direct dependencies | **PASS** | `dependencies` 僅包含 `@appspine/common`, `@appspine/integration-contracts`, `@appspine/plugin-api`, `@appspine/plugin-host-nest`。已確認**完全無** `@appspine/auth` 或 `@appspine/m2m-api-key` 具體套件。 |
| Cross-package concrete guard imports | **PASS** | `domain-events-admin.controller.ts` 已移除 `JwtOrApiKeyGuard` 與 `ScopeGuard` import，全面改用主機中立的 `AppspineAuthGuard` 與本套件的 `DomainEventsAdminGuard`。 |
| TypeScript project references | **PASS** | `tsconfig.build.json` 精確參照 `common`, `integration-contracts`, `plugin-api`, `plugin-host-nest`，無任何殘留 references（通過 `verify:build-graph` 88 項檢查）。 |
| Manifest capability references | **PASS** | 要求 `requires: ["appspine.prisma", "appspine.principal-context"]` 與 `optionalRequires: ["appspine.audit-sink", "appspine.rbac-policy", "appspine.scope-matcher"]`，宣告 5 大 facets，嚴格符合 051 規範。 |

---

## 7. Execution Log & §11 Substitution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL4-05` 遷移 `domain-events` plugin（4B） |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G3 (`architecture-contract`) |
| Substitution reason | 本 session 由使用者指派 Gemini 執行；原 051 計畫建議 roster 為 Sol xhigh（G3）主導、Terra 實作、Gemini 執行 dependency audit |
| Calibration & Execution Details | 依 051 §11 執行嚴格校準以承接 G3 級別任務：<br>1. **架構合約維護**：在 `@appspine/plugin-api` 新增 `DomainEventsPort` 與 `RecordDomainEventPortInput` 介面，於 `DomainEventsModule` 綁定並匯出 `DOMAIN_EVENTS` 穩定 token。<br>2. **消除 Concrete Guard 依賴**：重構 `DomainEventsAdminController`，以 `@appspine/plugin-host-nest` 的 `AppspineAuthGuard` 與中立 `DomainEventsAdminGuard` 取代直接依賴 `auth`/`m2m-api-key` 具體 guard。<br>3. **Host 不吞併 Domain Registry 原則**：確保 `DomainEventRegistry` 維持獨立 `@Injectable()`，並由 `DomainEventsModule` 自主管理與提供。<br>4. **5 大 Facets 完整宣告**：建立 `prisma/domain-events.prisma` 並計算 LF-normalized sha256 digest（`sha256:9c007fb569beb870e2b6d1e41e0a4e187e8ed6bb7c05e0599c748ce7b83fa351`），於 manifest 完整宣告 backend、frontend、prisma、permissions、operations facets。<br>5. **真實開機與生命週期驗證**：新增 `domain-events.module.boot.spec.ts`（`createNestApplication() + app.init()`）與 `shutdown.spec.ts`（`OnModuleInit`/`OnModuleDestroy` timer cleanup），並驗證 legacy/plugin parity。<br>6. **Host Infrastructure 與 Dual-Mode 跨套件修復**：為 `AppspineAuthInfrastructureModule` 加上 `@Global()`，並將 `ApiKeysService` 中的 `IDENTITY_STORE` 標記為 `@Optional()`，修復 template dual mode 測試中的全域依賴解析問題。<br>7. **完整性驗證矩陣**：16 個測試檔案（98 個測試）全數通過，Monorepo 全套 10 項 platform gates 全數 PASS。 |
| Independent reviewer | Sol G3 / Claude（Architecture & Contract Review） |
| Repos / Branches | `appspine-packages` (`051-pl4-05-domain-events-plugin`) |
| Evidence | 98/98 unit & boot tests in `@appspine/domain-events` pass; architecture check 22 packages (9 with manifest) 0 findings; generation gate 0 findings; template dual-mode 11/11 tests pass; build graph check 88 checks pass; changeset discipline pass; lint 0 errors; typecheck 0 errors; build 22 packages pass |
| 已知風險 | 無重大未知風險。在無 `scope-matcher` 提供者（如未安裝 `m2m-api-key`）之極簡環境下，外部機器請求 `DomainEventsAdminController` 會被 fail-closed 拒絕（403），符合安全預期。 |
| 下一任務前置 | PL4-06 遷移 `mcp-server` plugin（4B） |
