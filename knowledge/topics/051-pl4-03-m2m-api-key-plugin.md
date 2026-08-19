---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-03 — 遷移 `m2m-api-key` plugin（4A）

> Task：`PL4-03`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 依賴：[PL4-02](051-pl4-02-rbac-plugin.md)、[PL1-11](051-pl1-plugin-platform-core.md)（`authentication-strategy-registry` / `principal-context`）。  
> Changeset：`.changeset/051-phase4-m2m-api-key-plugin.md`。  

---

## 1. 任務目標與交付範圍

`@appspine/m2m-api-key` 是 Phase 4 第三個遷移的標準業務 capability 套件（4A 第三項）。本 task 將其升級為符合 `appspine.plugin/v1` 規範的正式 Capability Plugin，實作 Machine Authentication Strategy 並向 host strategy registry 註冊、建立 `ScopeMatcherService` 與公開 `SCOPE_MATCHER` 穩定注入 Token、完成 backend、frontend、prisma、permissions 四大 facets 宣告、建立過渡期 `@Global()` 相容性橋接與退場規劃、標註並收斂 `JwtOrApiKeyGuard` 作為跨插件組裝機制、補齊 classic/node10 模組解析 shim，並建立包含 OIDC+Machine 共存、acting-user、rate-limit、expired/inactive/revoked key、scope 比對、legacy parity 等完整測試矩陣。

### 1.1 核心交付物

1. **Machine Authentication Strategy（`ApiKeyMachineStrategy`）**：
   - 實作 `@appspine/plugin-host-nest` 的 `AuthenticationStrategy` 介面（`id: 'api-key'`, `kind: 'machine'`）。
   - 於 `ApiKeysModule.onModuleInit()` 自動向 host 之 `AuthenticationStrategyRegistry` 註冊。
   - **嚴格 Fail-Closed**：
     - 未帶 `x-api-key` header 時回傳 `null`（允許 host fall-through 嘗試其他 strategy 如 OIDC）。
     - 帶有 header 但格式不符（未以 `an_live_` 開頭）、金鑰不存在、已停用（`isActive: false`）、已過期（`expiresAt <= now`）均拋出 `UnauthorizedException('Invalid API key')`（阻止 fall-through 至較弱 strategy）。
     - 若未注入 `RBAC_POLICY` provider 則 fail-closed 拋出 `UnauthorizedException` 並記錄錯誤日誌。
     - Rate limit 超限時拋出 `HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS)` 並設置 `Retry-After` header。
   - 支援 Service Account acting-user 綁定（僅對 active 帳號綁定 `actingUserId`，其餘為 `null`）與 `lastUsedAt` 異步更新。

2. **Scope Matcher Service 與 Token（`SCOPE_MATCHER`）**：
   - 實作 `@appspine/plugin-api` 定義之 `ScopeMatcherPort`（`matches(scopes: string[], required: string): boolean`）。
   - 於 `ApiKeysModule` 綁定並匯出 `SCOPE_MATCHER` token（`Symbol.for('appspine.scope-matcher')`），讓下游 capability（如 `@appspine/metadata-schema` 與 `@appspine/mcp-server`）以中立 token 注入 scope matcher，消除對 `@appspine/m2m-api-key` 具體 guard/controller 的直接耦合。

3. **Manifest 與 Facets 宣告（`appspine.plugin.json` & `src/plugin.ts`）**：
   - 宣告 `provides: ["appspine.machine-auth-provider", "appspine.scope-matcher"]`。
   - 宣告 `requires: ["appspine.identity-store", "appspine.prisma", "appspine.principal-context", "appspine.authentication-strategy-registry"]` 與 `optionalRequires: ["appspine.audit-sink", "appspine.rbac-policy"]`。
   - 宣告完整 4 大 Facets：
     - `backend`: `modulePath: "./dist/api-keys.module.js"`, `exportName: "ApiKeysModule"`, `global: true`（過渡期相容橋接）, `controllerRoutes: ["api-keys"]`, `providerTokens: ["appspine.scope-matcher"]`。
     - `frontend`: 貢獻 `adminPages` (`api-keys`), `navigationItems` (`api-keys`), `i18nNamespace: "apiKeys"`, `clientEntry: "./dist/frontend.js"`。
     - `prisma`: `owns: ["ApiKey"]`，`augments: [{ targetModel: "User", field: "actingApiKeys", owner: "identity-core" }]`，`schemaFragment: "prisma/api-key.prisma"`, `schemaDigest: "sha256:e35d38ae46d2a8700bc78623dd2acfbb395c7cc60ec0bee1805d2694dedb6bb1"`。
     - `permissions`: 宣告 `m2m:api-key:create`, `m2m:api-key:update`, `m2m:api-key:delete`, `m2m:api-key:read`。

4. **過渡期 Compatibility Bridge 與 `@Global()` 退場規劃**：
   - 在 Phase 4 過渡期，`ApiKeysModule` 維持 `@Global()`（並於 manifest `facets.backend.global` 標記為 `true`）。
   - **保留理由**：下游 9 個業務 App（`appspine-app-template` + `calendar`／`chat`／`wiki`／`drive`／`master-data`／`approve`／`projects`／`mcp-gateway`）共有大量 feature controllers 使用 `@UseGuards(JwtOrApiKeyGuard, ScopeGuard)` 或 `@UseGuards(ApiKeyGuard)`，且 feature module 尚未顯式 import `ApiKeysModule`。若在 package 端直接拔除 `@Global()`，下游升級時會在 Nest bootstrap 階段因找不到 guard 拋出 `UnknownDependenciesException` 導致開機失敗。
   - **退場規劃**：符合 Gate G4 要求。此 `@Global()` 橋接將於 Phase 5 下游 App 進行 plugin mode 遷移或 codemod 補齊 feature-level wiring 後，在下一個 major release 徹底移除。

5. **收斂 `JwtOrApiKeyGuard` 作為跨插件組裝機制**：
   - 於 `JwtOrApiKeyGuard` 標註 `@deprecated`，說明跨插件請使用 `@appspine/plugin-host-nest` 提供之中立 `AppspineAuthGuard`。
   - 保留 class 以確保舊有業務 controllers 相容。

6. **Classic / Node10 Module Resolution Shim**：
   - 提供 `packages/m2m-api-key/plugin.js` 與 `packages/m2m-api-key/plugin.d.ts` 轉發 `./dist/plugin`。

---

## 2. 驗證與測試覆蓋

本 task 建立了多維度的測試套件（8 個測試檔案，56 個單元與合約測試全數 PASS）：

### 2.1 單元與 Manifest 測試（`plugin.spec.ts`）
- 驗證 `appspine.plugin.json` 與 TS `m2mApiKeyManifest` 100% deep-equal。
- 驗證通過嚴格模式的 `parsePluginManifest()`。
- 驗證 schema digest 與 `prisma/api-key.prisma` 完全一致。
- 驗證 backend（含 `global: true` 與 `providerTokens`）、frontend、prisma、permissions 4 大 facets 完整宣告。
- 驗證在 `identity-store`、`prisma`、`principal-context`、`authentication-strategy-registry` 環境下的 host resolution。
- 驗證 backend factory 回傳 `ApiKeysModule` 及公開 tokens/services 輸出。

### 2.2 Machine Auth Strategy 測試（`api-key-machine.strategy.spec.ts`）
- 驗證 strategy metadata（`id: 'api-key'`, `kind: 'machine'`）。
- 驗證 header 處理：無 header 或非 string 時回傳 `null` 放行至下一 strategy；非 `an_live_` 前綴時拋出 `UnauthorizedException`。
- 驗證 RBAC policy 依賴缺失時 fail-closed 拋出 `UnauthorizedException` 並記 error log。
- 驗證 key 查詢條件（`hashedKey`, `isActive: true`, `expiresAt` 未過期）。
- 驗證 key 不存在 / 過期 / 停用時拋出 `UnauthorizedException`。
- 驗證 Rate limit 超限時拋出 429 `HttpException` 並設定 `Retry-After` header。
- 驗證 actingUser 狀態解析（active service account 正確綁定 `actingUserId`；inactive 或無 user 時為 `null`）。
- 驗證 fire-and-forget 異步更新 `lastUsedAt`。

### 2.3 OIDC + Machine 共存測試（`coexistence.spec.ts`）
- 驗證 OIDC (`OidcInteractiveStrategy`) 與 API Key (`ApiKeyMachineStrategy`) 可同時註冊於 `AuthenticationStrategyRegistry`。
- 驗證 `AppspineAuthGuard` 同時接受 Bearer JWT 與 X-Api-Key，並將解析後的 principal 正確放入 `request.user` 與 `PrincipalContextService`。
- 驗證無憑證、無效 JWT、無效 API Key 時之阻擋行為。
- 驗證 `InteractiveAuthGuard` 僅放行 JWT、拒絕 API Key；`MachineAuthGuard` 僅放行 API Key、拒絕 JWT。

### 2.4 Scope Matcher 測試（`scope-matcher.spec.ts` & `guards/scope.guard.spec.ts`）
- 驗證 `ScopeMatcherService` 滿足 `ScopeMatcherPort`。
- 驗證 `*` 全通配、`module:*` 模組通配、`module:action` 具體比對與拒絕情境。
- 驗證 `SCOPE_MATCHER` token 綁定與一致性。
- 驗證 `ScopeGuard` fail-closed 行為（無 `@Scopes()` 裝飾時拋 403 `ForbiddenException`）。

### 2.5 Legacy vs Strategy Parity 測試（`parity.spec.ts`）
- 對比 `ApiKeyGuard` vs `ApiKeyMachineStrategy`：產生之 `request.user` 與 `MachinePrincipal` 結構完全一致。
- 對比 `ScopeGuard.matchScope` vs `ScopeMatcherService.matches`：比對結果完全一致。

### 2.6 CRUD 與 Guard 行為測試（`api-keys.service.spec.ts` & `api-key.guard.spec.ts`）
- 驗證 API key 建立、查詢、分頁、更新、刪除及 service account actingUser 驗證。
- 驗證 legacy `ApiKeyGuard` 之 actingUser 綁定與無 RBAC policy 時之 fail-closed。

---

## 3. 下游 Consumer 影響追蹤（Consumer Impact Analysis）

| Consumer 類型 | 現狀使用方式 | PL4-03 影響與相容保證 |
|---|---|---|
| 下游 9 個業務 App（feature controllers） | 使用 `@UseGuards(JwtOrApiKeyGuard, ScopeGuard)` 或 `@UseGuards(ApiKeyGuard)`，尚未顯式 import `ApiKeysModule` | **零破壞性影響**。`ApiKeysModule` 於 Phase 4 保留 `@Global()`（manifest 宣告 `facets.backend.global: true`），下游 App 升級時不會發生 `UnknownDependenciesException`。 |
| 下游跨外掛消費者（如 `metadata-schema`, `mcp-server`） | 過去依賴 `JwtOrApiKeyGuard` 或直接 import `m2m-api-key` guards | **提供升級路徑**。可改用中立之 `AppspineAuthGuard` / `MachineAuthGuard` 與 `@Inject(SCOPE_MATCHER)`，解耦具體外掛依賴；既有代碼仍受相容性橋接保護。 |
| 管理後台與前端 Admin Pages | 存取 `/dashboard/api-keys` 與 API key CRUD API | **零破壞性影響**。前端 facet 保持貢獻 `ApiKeysTable`，Prisma fragment 與 permissions 保持完全一致。 |

---

## 4. 回滾策略（Rollback Plan）

若 M2M API Key plugin 在 consumer 端整合出現未預期問題：
1. 既有 consumer 維持既有 import `ApiKeysModule` 與 guards，因 `@Global()` 於過渡期獲得保留，現有 feature controllers 零破壞性影響。
2. 資料庫層面：Prisma schema fragment 結構未變更（`ApiKey` 結構保持完全相容），不會造成資料庫結構或資料遺失。
3. 可透過 Git 直接 revert 本 branch (`051-pl4-03-m2m-api-key-plugin`)，對其他 capability packages 無破壞性影響。

---

## 5. Execution Log & §11 Substitution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL4-03` 遷移 `m2m-api-key` plugin（4A） |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (`implementation`) |
| Substitution reason | 本 session 由使用者指派 Gemini 執行；原 051 計畫建議 roster 為 Terra xhigh |
| Calibration | 依 051 §11 執行嚴格校準：實作 `ApiKeyMachineStrategy` 並於 module init 向 host registry 註冊、實作 `ScopeMatcherService` 並提供 `SCOPE_MATCHER` token、宣告 4 大 facets（含 backend `global: true` compatibility bridge）、驗證 Prisma schema digest、標註 `JwtOrApiKeyGuard` 為 deprecated、補充 classic 模組解析 shim。建立包含 OIDC+Machine 共存、acting-user、rate-limit、expired/inactive/revoked、scope 比對、legacy parity 完整測試套件，並通過 monorepo 全套 platform gates |
| Independent reviewer (Authentication & Security) | Sol G3 / Claude（Security & Strategy Review） |
| Repos / Branches | `appspine-packages` (`051-pl4-03-m2m-api-key-plugin`) |
| Commit SHA | 見當前 branch commit 紀錄 |
| Evidence | 56/56 unit tests in `@appspine/m2m-api-key` pass; architecture check 0 findings; generation gate 0 findings; changeset discipline pass; template dual mode pass; lint 0 errors; typecheck 0 errors |
| 已知風險 | **過渡期 `@Global()` 相容性依賴**：下游 9 個業務 App 目前有 feature controllers 依賴全域 `ApiKeyGuard`/`ScopeGuard`。本版本採用 Gate G4 核准之 Compatibility Bridge 方案暫時保留 `@Global()`，以避免下游升級開機 crash；真正移除已明確排入 Phase 5 App 遷移階段 |
| 下一任務前置 | PL4-04 遷移 `metadata-schema` plugin（4B） |
