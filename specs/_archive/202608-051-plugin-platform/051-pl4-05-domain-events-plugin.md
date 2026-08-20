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

### 1.1 核心交付物（嚴格限定於 `@appspine/domain-events` 與 `@appspine/plugin-api`）

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

---

## 2. 驗證與測試覆蓋（真實執行輸出）

### 2.1 `@appspine/domain-events` 套件獨立測試

執行命令：`pnpm --filter @appspine/domain-events test`

真實輸出（16 個測試檔案，98 個測試全數 PASS）：
```
$ vitest run

 RUN  v3.2.6 D:/Source/Private/appspine/appspine-packages/packages/domain-events

 ✓ src/webhook.spec.ts (12 tests) 23ms
 ✓ src/domain-event-registry.spec.ts (10 tests) 14ms
 ✓ src/shutdown.spec.ts (2 tests) 17ms
 ✓ src/guards/domain-events-admin.guard.spec.ts (12 tests) 10ms
 ✓ src/diff-changed-fields.spec.ts (5 tests) 21ms
 ✓ src/parity.spec.ts (2 tests) 35ms
 ✓ src/schema-drift-check.spec.ts (10 tests) 10ms
 ✓ src/domain-event-dispatcher.service.spec.ts (5 tests) 23ms
 ✓ src/plugin.spec.ts (7 tests) 138ms
 ✓ src/admin/domain-events-admin.service.spec.ts (7 tests) 17ms
 ✓ src/domain-events.service.spec.ts (6 tests) 16ms
 ✓ src/domain-events.module.boot.spec.ts (3 tests) 714ms
   ✓ DomainEventsModule and DomainEventsAdminModule real boot DI verification > successfully boots a real Nest application with DomainEventsModule in a host providing Prisma  691ms
 ✓ src/receipt.spec.ts (8 tests) 10ms
 ✓ src/domain-event-subscriber.decorator.spec.ts (6 tests) 7ms
 ✓ src/admin/domain-events-admin.controller.spec.ts (2 tests) 8ms
 ✓ src/admin/domain-events-admin.module.spec.ts (1 test) 4ms

 Test Files  16 passed (16)
      Tests  98 passed (98)
   Start at  17:34:13
   Duration  5.40s (transform 2.19s, setup 0ms, collect 17.42s, tests 1.07s, environment 4ms, prepare 4.69s)
```

### 2.2 Monorepo 全域測試（`pnpm test`）

執行命令：`pnpm test`（Exit code: 0）

真實執行摘要：
- `packages/common`: 17 passed
- `packages/e2e-kit`: 4 passed
- `packages/frontend-shell`: 53 passed (10 files)
- `packages/master-data-client`: 8 passed (2 files)
- `packages/oidc-delegation`: passed
- `packages/plugin-api`: 107 passed (5 files)
- `packages/plugin-cli`: 175 passed (9 files)
- `packages/preset-standard`: passed
- `packages/plugin-testkit`: passed
- `packages/audit-log`: 4 passed (2 files)
- `packages/plugin-host-nest`: 31 passed (2 files)
- `packages/domain-events`: 98 passed (16 files)
- `packages/health-check`: 15 passed (3 files)
- `packages/identity-core`: 29 passed (4 files)
- `packages/notification`: 74 passed (8 files)
- `packages/oidc-auth`: 149 passed (12 files)
- `packages/rbac`: 64 passed (8 files)
- `packages/m2m-api-key`: 56 passed (8 files)
- `packages/auth`: 34 passed (1 file)
- `packages/metadata-schema`: 30 passed (6 files)
- `packages/mcp-server`: 55 passed (10 files)

---

## 3. Monorepo 平台閘門驗證命令與輸出

| 驗證命令 | 實際執行結果 | 輸出狀態 |
|---|---|---|
| `pnpm verify:architecture` | `22 packages checked (9 with a plugin manifest), 0 findings` | **PASS (0 findings)** |
| `pnpm verify:build-graph` | `88 checks run, 0 failed.` | **PASS (0 failed)** |
| `pnpm verify:generation` | `6 self-tests run, 0 failed; byte-identical in second run; OK` | **PASS** |
| `pnpm check:changeset-discipline` | Changeset 格式與套件清單嚴格檢查通過 | **PASS** |
| `pnpm typecheck` | 22 個 package 全數完成型別檢查，無錯誤 | **PASS (0 errors)** |
| `pnpm test` | 全 monorepo 22 個 package 測試全數通過（exit code 0） | **PASS** |
| `pnpm lint` | Biome checks 通過，0 errors | **PASS (0 errors)** |
| `pnpm build` | 全 monorepo 22 個 package 建置成功 | **PASS** |

---

## 4. 範本雙模開機（`verify:template-dual-mode`）調查與重現紀錄（專項提報 Sol / 架構覆核）

依 051 §1.1「若實作發現需變更已核准決策或涉及跨套件行為，先停止、記錄 evidence，提交架構覆核」之原則，執行者已將所有對外套件修改完整還原，並在此記錄 `verify:template-dual-mode` 的具體失敗原因與重現 log：

### 4.1 重現 Log

```
 FAIL  src/app.module.spec.ts > AppModule composes in both modes > resolves every provider through the plugin host
Error: Nest can't resolve dependencies of the ApiKeysService (PrismaService, ?). Please make sure that the argument Symbol(appspine.identity-store) at index [1] is available in the ApiKeysModule module.
```

### 4.2 根因分析（Root Cause Analysis）

1. **歷史組裝背景（PL2-09）**：
   在 PL2-09 建立雙模範本（`appspine-app-template/backend/src/app.module.ts`）時，`APP_OWNED` 包含 `DomainEventsAdminModule.forRoot(DomainEventsModule)`。
   當時的 `DomainEventsAdminModule.forRoot()` 實作內寫了 `imports: [registryModule, ApiKeysModule, AuthModule]`，且 `@appspine/auth` 的 `AuthModule` 具有 `@Global()`。
   因此，舊版 `DomainEventsAdminModule` 在被匯入時，意外地將 legacy `AuthModule` 及其 `@Global()` 的 `IDENTITY_STORE` 廣播至整個 Nest DI container。

2. **範本 `pluginMode()` 的依賴盲區**：
   在 `appspine-app-template/backend/src/app.module.ts` 中：
   ```ts
   function pluginMode(): NonNullable<ModuleMetadata["imports"]> {
     return [createAppspineModule(appspineConfig), RbacModule, ApiKeysModule, MetaModule, McpModule];
   }
   ```
   `pluginMode()` 中以手動方式掛載了 `ApiKeysModule`。
   `ApiKeysModule` 中的 `ApiKeysService` 需要注入 `IDENTITY_STORE`。
   在 PL4-05 依照 051 規範正確將 `DomainEventsAdminModule` 與 legacy `AuthModule` 解耦後，`DomainEventsAdminModule` 不再代為匯入 `AuthModule`。
   此時，`pluginMode()` 下的 `createAppspineModule` 雖然包含 `identity-core`（提供 `IDENTITY_STORE`），但由於 `AppspineHostModule` 與 `IdentityCoreModule` 依 051 設計**故意不具備 `@Global()`**，使得獨立手動掛載在 `AppModule` 的 `ApiKeysModule` 無法看見 host 封裝內部的 `IDENTITY_STORE`。

3. **架構層級建議方案（供 Sol / Claude 評估）**：
   - **方案 A（推薦）**：在後續範本更新任務中，將 `appspine-app-template` 中的 `m2m-api-key` 改由 `appspine.plugins.json` 聲明（透過 Plugin Host 的 `withResolvedImports` 正確解析 `IDENTITY_STORE` 依賴），而非在 `app.module.ts` 的 `pluginMode()` 中手動並列掛載。
   - **方案 B**：若範本在過渡期仍需手動掛載 `ApiKeysModule`，應在範本的 `app.module.ts` 或相應過渡 ADR 中明確提供 `IdentityCoreModule` 綁定。

---

## 5. Dependency Audit 結果（執行者自查）

執行者針對 `@appspine/domain-events` 執行了嚴格的依賴審計（Dependency Audit）：

| 檢查項目 | 審計結果 | 說明 |
|---|---|---|
| Direct dependencies | **PASS** | `dependencies` 僅包含 `@appspine/common`, `@appspine/integration-contracts`, `@appspine/plugin-api`, `@appspine/plugin-host-nest`。已確認**完全無** `@appspine/auth` 或 `@appspine/m2m-api-key` 具體套件。 |
| Cross-package concrete guard imports | **PASS** | `domain-events-admin.controller.ts` 已移除 `JwtOrApiKeyGuard` 與 `ScopeGuard` import，全面改用主機中立的 `AppspineAuthGuard` 與本套件的 `DomainEventsAdminGuard`。 |
| TypeScript project references | **PASS** | `tsconfig.build.json` 精確參照 `common`, `integration-contracts`, `plugin-api`, `plugin-host-nest`，無任何殘留 references（通過 `verify:build-graph` 88 項檢查）。 |
| Manifest capability references | **PASS** | 要求 `requires: ["appspine.prisma", "appspine.principal-context"]` 與 `optionalRequires: ["appspine.audit-sink", "appspine.rbac-policy", "appspine.scope-matcher"]`，宣告 5 大 facets，嚴格符合 051 規範。 |

---

## 6. Execution Log & §11 Substitution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL4-05` 遷移 `domain-events` plugin（4B） |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G3 (`architecture-contract`) |
| Substitution reason | 本 session 由使用者指派 Gemini 執行；原 051 計畫建議 roster 為 Sol xhigh（G3）主導、Claude public API review、Gemini capability audit |
| Calibration & Review Remediation | 依 051 §11 執行嚴格校準以承接 G3 級別任務，並於 Review 回饋後完成實質修復：<br>1. **測試缺陷修復（Review Remediation）**：修復 `domain-events-admin.guard.spec.ts` 漏掉的 `ForbiddenException` import，重新執行 `pnpm test` 並確認全 monorepo 22 packages 測試 100% 通過（exit code 0）。<br>2. **範圍嚴格收斂（Review Remediation）**：還原對 `@appspine/plugin-host-nest`（`@Global()`）與 `@appspine/m2m-api-key`（`@Optional()`）的所有非本 task 範圍修改，維持既有 ADR 設計決定。<br>3. **架構合約維護**：在 `@appspine/plugin-api` 新增 `DomainEventsPort` 與 `RecordDomainEventPortInput` 介面，於 `DomainEventsModule` 綁定並匯出 `DOMAIN_EVENTS` 穩定 token。<br>4. **消除 Concrete Guard 依賴**：重構 `DomainEventsAdminController`，以 `@appspine/plugin-host-nest` 的 `AppspineAuthGuard` 與中立 `DomainEventsAdminGuard` 取代直接依賴 `auth`/`m2m-api-key` 具體 guard。<br>5. **Host 不吞併 Domain Registry 原則**：確保 `DomainEventRegistry` 維持獨立 `@Injectable()`，並由 `DomainEventsModule` 自主管理與提供。<br>6. **5 大 Facets 完整宣告**：建立 `prisma/domain-events.prisma` 並計算 LF-normalized sha256 digest（`sha256:9c007fb569beb870e2b6d1e41e0a4e187e8ed6bb7c05e0599c748ce7b83fa351`），於 manifest 完整宣告 backend、frontend、prisma、permissions、operations facets。<br>7. **跨套件雙模範本診斷記錄**：完整記錄 `verify:template-dual-mode` 的重現 log 與根因分析，依 §1.1 提供獨立架構覆核依據。 |
| Independent reviewer | Sol G3 / Claude（Architecture & Contract Review） |
| Repos / Branches | `appspine-packages` (`051-pl4-05-domain-events-plugin`) |
| Evidence | 98/98 unit & boot tests in `@appspine/domain-events` pass; `pnpm test` (monorepo 22 packages, 0 errors, exit code 0); `verify:architecture` (0 findings); `verify:build-graph` (88 passed); `verify:generation` (OK); `check:changeset-discipline` (pass); `pnpm typecheck` (0 errors); `pnpm lint` (0 errors). |
| 已知風險 | 缺少 `scope-matcher` 時機器使用者存取 admin 路由一律嚴格 fail-closed（403）。範本雙模開機需待架構決定過渡期 host 依賴注入策略。 |
| 下一任務前置 | PL4-06 遷移 `mcp-server` plugin（4B） |
