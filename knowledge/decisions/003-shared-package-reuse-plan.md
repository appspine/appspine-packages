---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-01
updated: 2026-08-03
---

# 003 - @appspine/* 共用套件重用盤點

> 落實 `001` 文件「後續待辦事項」第 3 項：在實作 `@appspine/*` 套件前，先評估能從既有 `auranest` 專案搬多少過來，而不是從零寫。
> 盤點範圍：`auranest/packages/@auranest/backend-core`（這次只看 backend-core；`frontend-core`、`ui`、`e2e-kit` 留待之後另開文件）。
> 狀態：盤點完成，八個套件（`common`/`auth`/`rbac`/`m2m-api-key`/`audit-log`/`health-check`/`metadata-schema`/`mcp-server`）全部實作完成並 commit。剩下 001「後續待辦事項」第 3 項真正的尾段：把 `appspine-app-template` 接上這些套件，見文末「下一步建議」。

## 盤點方法

逐一讀過 `backend-core/src/` 底下每個模組的原始碼，判斷三種結果：

- **直接搬**：邏輯跟 appspine 的架構決策（001/002 文件）一致，原樣搬過去即可。
- **小改搬**：核心邏輯可用，但有幾處跟 auranest 自己的拓樸耦合，需要調整。
- **不採用**：建立在「AuraNest V2 中心化 Admin Center」這個 appspine 明確不採用的拓樸上，或者跟 001 的設計決策衝突。

## 不採用清單（連同理由）

| 來源 | 不採用理由 |
|---|---|
| `auth/jwks-cache.service.ts`、`auth/guards/jwt.guard.ts`（`JwtAuthGuard`） | 驗證的是 AuraNest 自家 Admin Center 簽發的 JWT（讀 `ADMIN_JWKS_URL`/`ADMIN_JWT_ISSUER`）。appspine 沒有中心化身份服務，`AUTH_MODE=oidc` 模式接的是外部既有 Keycloak（見 001「身份/權限細節」），不是自建的 admin app。 |
| `internal-provisioning/`（含 `InternalApiKeyGuard`） | 整套是「中心 Admin Center 推送使用者資料到各業務系統」的 idempotent upsert API，依賴 `User.globalUserId` 概念。appspine 各系統各自管理使用者，沒有這個推送流程；`appspine-app-template` 目前的 `User` model 也已經沒有 `globalUserId` 欄位，間接印證了這個判斷。 |
| `audit-emitter/`（`AuditEmitterService`，靠 `pg-boss` 推到 `aggregated-audit-log` 佇列） | 這是把稽核事件集中送到中心服務的機制。001 明確寫「現階段各系統各自獨立儲存，不集中收集，集中收集機制留待未來另外設計」，跟此刻範圍衝突。 |
| `mcp/auto/`（`CrudToolFactory`、`CrudExecutor`、`input-schema.builder.ts`） | 這是「Prisma model 自動產生 5 個 CRUD MCP tool」的機制。001 明確寫「MCP tool 產生方式：By app 自行產生...不強制自動產生 tool」，跟既有決策衝突。不是技術上不能用，是**設計上刻意不採用**——之後若想要選用性提供，可以另開評估，但不該是 `@appspine/mcp-server` 的預設行為。 |

## 直接可搬 / 小改可搬清單

### `@appspine/auth`

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `auth/strategies/local.strategy.ts` | 直接搬 | passport-jwt + `JWT_SECRET` + HS256，對應 `AUTH_MODE=local`。 |
| `auth/strategies/oidc.strategy.ts` | 小改搬 | passport-jwt + `jwks-rsa`，驗證外部 Keycloak token，模式上完全對得上 `AUTH_MODE=oidc`。但原檔已自己標註 TODO：`permissionPolicy`/`permissions` 目前固定回傳 `DENY_ALL`/`[]`（OIDC token 沒辦法內嵌 app 層權限）。appspine 版要決定這個缺口怎麼補，見下方「待釐清問題」。 |
| `auth/auth.controller.ts`（`register`/`login`） | 小改搬 | bcrypt + `JwtService.sign()` 簽發本地 JWT，正是 `AUTH_MODE=local` 需要的流程。但 `me` endpoint 掛的是 `JwtAuthGuard`（給 `ADMIN_JWKS_URL` token 用），跟 `login`/`register` 簽出來的 HS256 token 對不起來——這是 auranest 既有的潛在 bug，appspine 版要重新接成 `LocalStrategy`/`OidcStrategy` 對應的 guard，不要照搬。 |
| `auth/user-context.util.ts`（`buildUserContext`、`RoleWithPermissions`、`UserContext`、`ApiKeyUser`） | 直接搬 | RBAC 權限模型攤平邏輯（多角色取最寬鬆 policy、union permissions），002 文件的 `PermissionGuard` OR 邏輯就是建立在這個結果上，是 `@appspine/auth` 跟 `@appspine/rbac` 的共用基礎。 |
| `auth/decorators/current-user.decorator.ts`、`auth/dto/auth.dto.ts` | 直接搬 | |

### `@appspine/rbac`

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `auth/guards/permission.guard.ts`、`auth/decorators/require-permissions.decorator.ts` | 直接搬 | `PermissionGuard` 的 OR 邏輯（ADMIN bypass → ALLOW_ALL → READ_ALL+`*_READ` → 命中 permissions）跟 002 文件「API 設計規範」寫的完全一致。 |
| `roles/`（service/controller/dto） | 直接搬 | 標準 CRUD + 系統角色保護（不可刪、ADMIN 權限走 guard bypass 不可手動設定）。 |
| Prisma schema 片段（`Role`/`Permission`/`RolePermission`） | 小改搬 | 見下方「實作時的修正」第 4 點，跟 `@appspine/auth` 的 `User` 片段要一起處理。 |

> `auth/guards/admin.guard.ts`、`users/`（service/controller/dto）已改放進 `@appspine/auth`，原因見下方「實作時的修正」第 1、2 點。

### 實作時的修正

實際動手寫 `@appspine/auth` 時，發現原本的套件切法會造成循環依賴，做了以下調整：

1. **`users/` 搬進 `@appspine/auth`，不放 `@appspine/rbac`**：`AuthController.register`/`login` 需要 `UsersService`（建立使用者、依 email 查使用者+角色簽 JWT）。如果 `UsersService` 留在 `@appspine/rbac`，而 `@appspine/rbac` 又依賴 `@appspine/auth` 的 `user-context.util`，會形成 `auth → rbac → auth` 的循環套件依賴。User 身份本來就是 auth 範疇的東西（這個 schema 裡沒有獨立的「員工」實體，`User` 就是登入主體），所以整個搬進 `@appspine/auth`，`@appspine/rbac` 只留 Role/Permission 管理。
2. **`AdminGuard` 同理搬進 `@appspine/auth`**：`UsersController` 需要它做 ADMIN-only 保護，而它只依賴 `SYSTEM_ADMIN_ROLE` 常數，不需要 Role/Permission CRUD，搬過去沒有額外耦合。
3. **`me` endpoint guard**：已照「已決定事項」第 1 點實作——新增 `JwtAuthGuard`（`packages/auth/src/guards/jwt-auth.guard.ts`），在模組載入時依 `AUTH_MODE` 決定要 `extends AuthGuard('jwt-local')` 還是 `AuthGuard('jwt-oidc')`，取代原本接錯的 `ADMIN_JWKS_URL` guard。`register`/`login` 也加了 `AUTH_MODE=oidc` 時回 404 的保護，避免在 OIDC 部署下產生用不到的本地密碼資料。
4. **Prisma schema 片段：✅ 已完成**（三個套件都做完後一次處理）。原本以為 `@appspine/auth`（`User`）+ `@appspine/rbac`（`Role`/`RolePermission`/`UserRole`）兩個一起處理就夠，但寫 `RolesService` 時發現 `Role` 在原始 schema 裡還有一個 `apiKeys ApiKey[]` 反向關聯欄位，要等 `@appspine/m2m-api-key` 的 `ApiKey` model 也存在才能定案（Prisma multi-file schema 允許關聯跨檔案，但同一個 model 的所有欄位必須宣告在同一個檔案裡，不能事後從別的套件「擴充」）。三個套件都做完後，補上 `packages/auth/prisma/user.prisma`、`packages/rbac/prisma/role.prisma`、`packages/m2m-api-key/prisma/api-key.prisma`，透過 `package.json#exports` 暴露（仿照 `@auranest/backend-core` 的 `"./prisma/base.prisma"` 寫法），並在 scratch 目錄組起來跑過 `prisma validate`/`prisma generate` 確認三個片段的跨檔案關聯（`User.userRoles`/`Role.apiKeys`/`RolePermission.role` 等）沒接錯。`appspine-app-template/backend/prisma/schema/base.prisma` 目前還沒換成從套件複製，這部分等之後實際接線（001「後續待辦事項」第 3 項的剩餘範圍）再處理。
5. **稽核紀錄呼叫先拿掉**：原本 `UsersController`/`RolesController`/`ApiKeysController` 每個寫入操作都會呼叫 `AuditLogService`/`AuditEmitterService`。因為 `@appspine/audit-log` 還沒蓋（依下一步建議排在 `@appspine/m2m-api-key` 之後），`@appspine/auth`/`@appspine/rbac`/`@appspine/m2m-api-key` 的 controller 暫時沒有稽核紀錄。等 `@appspine/audit-log` 存在後要回來補上（`AuditEmitterService`／集中佇列那部分仍然不採用，只補本地 `AuditLogService.record()`）。
6. **`ApiKeysService.validateScopes()` 改成格式檢查，不查 `MetaService`**：原檔會呼叫 `MetaService.getAvailableScopes()` 對照真實的 scope catalog（`appspine-app-template` 目前的 CRUD 模組對應出的 `resource:read`/`resource:write`/`resource:*`），但 `MetaService` 屬於還沒蓋的 `@appspine/metadata-schema`，而且 auranest 原本是用 `forwardRef(() => MetaModule)` 處理這個耦合——兩個都還在蓋的套件互相 `forwardRef` 太脆弱。改成只驗證格式（`^[a-z0-9_-]+:(read|write|\*)$` 或裸 `*`），等 `@appspine/metadata-schema` 存在後再把目錄比對接回去。

### `@appspine/m2m-api-key`

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `api-keys/`（`ApiKeyGuard`/`ApiKeysService`/`ApiKeysController`/`ApiKeyRateLimiter`/dto） | 直接搬 | scope 格式就是 `resource:action`（如 `users:read`），跟 001「M2M API Key 使用情境」的設計完全一致；`ApiKeysService.validateScopes()` 已經是對照 `MetaService.getAvailableScopes()` 做驗證，呼應 001「scope 粒度與 MCP Server 暴露的 tool 對齊」。 |
| `auth/guards/scope.guard.ts`、`auth/guards/jwt-or-api-key.guard.ts`、`auth/decorators/scopes.decorator.ts` | 直接搬 | Guard chain 順序（API Key 優先 → fallback JWT → Scope 只限制 API Key 呼叫者）跟 002 文件一致。`jwt-or-api-key.guard.ts` 內部用的 `JwtAuthGuard` 要換成 appspine 版的（見上方 `@appspine/auth` 那一條）。 |
| `ApiKey` 的 Prisma model | 小改搬 | 同樣走 schema 片段匯出模式。 |

### `@appspine/audit-log`（✅ 已完成）

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `audit-log/audit-log.service.ts` | 直接搬 | 寫本地 `audit_logs` 表，正是 001 講的「現階段各系統各自獨立儲存」。 |
| `audit-emitter/` | 不採用 | 見上方「不採用清單」。 |
| Prisma schema 片段（`AuditLog`/`AuditAction`） | 直接搬 | 跟其他三個套件不同，`AuditLog` 沒有任何跨 model 關聯，沒有 schema 片段的循環依賴問題，直接連同套件一起匯出（`prisma/audit-log.prisma`），不用像 auth/rbac/m2m-api-key 那樣延後。 |

### `@appspine/metadata-schema`（✅ 已完成）

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `meta/meta.service.ts` | 直接搬 | 從 `Prisma.dmmf.datamodel` 讀 model/enum/欄位 + `///` 文件註解，`@internal` 標籤排除內部 model，`getAvailableScopes()` 衍生 scope catalog——跟 001「Metadata Schema API」規劃幾乎一致。`Prisma` 改從 `@appspine/common` 匯入（重用它既有的動態解析消費端 `@prisma/client` 的邏輯，不用自己再寫一次）。 |
| build-time / runtime 共用轉換邏輯 | 已完成 | 新增 `renderDataDictionary(meta: SchemaMeta): string`，從 `appspine-app-template/backend/scripts/gen-data-dictionary.ts` 原本自己重複實作的 DMMF 轉換邏輯抽出來，改吃 `MetaService.buildMeta()` 回傳的 `SchemaMeta`。`gen-data-dictionary.ts` 之後應該改成呼叫這個函式（這次還沒動那支腳本，留到實際接線 `appspine-app-template` 時再換）。 |
| `meta/meta.controller.ts` | 小改搬 | 兩處跟原檔不同：①路徑改成 `GET /metadata/schema`（auranest 原本是 `/meta/schema`，但 001 文件明確寫的是 `/metadata/schema`，照文件走）。②guard 從單純 `AdminGuard` 改成 `JwtOrApiKeyGuard` + `ScopeGuard` + `@Scopes('metadata:read')`——001「AI 整合細節」講這個 endpoint 是給「沒有 repo 存取權的外部 agent」用 M2M API Key 查的，純 `AdminGuard` 會把所有 API Key 呼叫者都擋在外面（除非那把 key 綁的 Role 剛好是 ADMIN，但 M2M Key 走的是 scope 不是角色），不符合設計意圖。 |

> `@appspine/m2m-api-key` 的 `ApiKeysService.validateScopes()` 目前仍是格式檢查（見上方該套件章節），還沒接回 `MetaService.getAvailableScopes()` 的真實目錄比對——兩個套件互相依賴會循環（`metadata-schema` 已經依賴 `m2m-api-key` 拿 guard），這次沒有處理，先維持現狀。

### Prisma fragment 型套件的協調式升級教訓

`@appspine/auth`、`@appspine/m2m-api-key`、`@appspine/audit-log` 這類會 ship Prisma schema fragment 的共用套件，升級時不能只做 `pnpm update`。fork 後每個 app 的 `prisma/schema/` 片段已經是 app-local copy；若新版本程式碼開始讀寫新欄位，但 app 本地 schema 與 migration 還沒同步，執行時會直接在 Prisma client 或資料庫欄位不存在處炸掉。

因此凡是 fragment 變更（例如 `user.prisma`、`api-key.prisma`、`audit-log.prisma`）都必須用同一個部署視窗完成三件事：套件升版、app-local fragment 同步、migration 更新與驗證。套件 changelog/changeset 也應明列消費端需要手動同步的 fragment 欄位，讓各 app repo 升級時能逐項對照。

### `@appspine/mcp-server`（✅ 已完成）

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `mcp/mcp-tool.decorator.ts`（`@McpTool` + `registerMcpToolsFromInstance`）、`mcp/mcp.service.ts`、`mcp/mcp.controller.ts` | 直接搬 | 用官方 `@modelcontextprotocol/sdk` 的 Streamable HTTP transport，正是 001 講的「框架只提供基礎能力（tool 註冊機制、scope 檢查 middleware）」。`McpController` 只掛 `ApiKeyGuard`（不接受一般 JWT 使用者），呼應 001「與 M2M API Key 驗證同層接入」。 |
| `mcp/mcp-tool.registry.ts` | 小改搬 | 拿掉原本 `onModuleInit()` 注入 `CrudToolFactory`/`CrudExecutor` 自動產生「Layer 1」CRUD tool 的邏輯——那一段就是 001 明確不採用的自動產生機制。改完的 `McpToolRegistry` 沒有建構子依賴，只剩 `registerTool()`/`listTools()`/`getTool()`/`getToolCount()`，純粹是 app 自己註冊 tool 用的容器。 |
| `mcp/auto/` | 不採用 | 見上方「不採用清單」。 |

### `@appspine/health-check`

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `health/health.controller.ts` | 直接搬 | `@nestjs/terminus` + `PrismaHealthIndicator`，幾乎零修改。 |

### `@appspine/common`

`common/`（`exception.filter.ts`、`zod-validation.pipe.ts`、`pagination.ts`、`enums.ts`）、`prisma/`（`PrismaModule`/`PrismaService`）、`logging/` 這幾個沒有對應到 001 框架基本功能清單裡任何一項，是純技術共用工具。`appspine-app-template/backend/src/prisma/` 目前已經各自手刻了一份結構幾乎相同的 `PrismaModule`/`PrismaService`，之後要改成從這個套件匯入。

| 來源檔案 | 狀態 | 備註 |
|---|---|---|
| `common/filters/exception.filter.ts` | 直接搬 | 002「錯誤回應格式」的統一 JSON 結構由這裡產出；獨立成套件後，跨 app 改格式只需要 bump 版本，不用每個 app repo 手動改一輪。 |
| `common/pipes/zod-validation.pipe.ts` | 直接搬 | |
| `common/pagination.ts` | 直接搬 | `paginate()`/`toPrismaOrderBy()`/`toPrismaPage()`，對應 002「分頁慣例」。 |
| `common/enums.ts` | 直接搬 | |
| `prisma/prisma.module.ts`、`prisma/prisma.service.ts` | 直接搬 | 通用 `PrismaModule`/`PrismaService extends PrismaClient` 包裝，跟 `appspine-app-template` 現有版本結構一致。 |
| `logging/logging.module.ts` | 直接搬 | |

## 已決定事項

1. **`/auth/me` 掛哪個 guard**：依 `AUTH_MODE` 動態切換——`AUTH_MODE=local` 時掛 `LocalStrategy` 對應的 guard（驗證 `login`/`register` 簽出來的 HS256 token），`AUTH_MODE=oidc` 時掛 `OidcStrategy` 對應的 guard（驗證 Keycloak RS256 token）。跟 001「`AUTH_MODE` 切換」的精神一致，同時修正 auranest 原本接錯的地方。
2. **OIDC 模式下的權限缺口**：現在就設計，不延續 auranest 的 out-of-scope。`OidcStrategy.validate()` 用 token 裡的 email 查本地 `User`/`Role` 表，把 `permissionPolicy`/`permissions` 補進 user context，邏輯跟 local 模式一致（都是查本地 RBAC 表，差別只在身份驗證方式）。
3. **`@appspine/common` 獨立成套件**：`exception.filter`、`zod-validation.pipe`、`pagination`、`enums`、`PrismaModule`/`PrismaService`、`logging` 都搬進來，跨 app 共用的規範（如 002 的錯誤回應格式）改一次、各 app bump 版本即可同步，不必每個 app repo 各自手動改。

## 下一步建議

001 文件已經點出 `RBAC 依賴 Auth`，建議依序：

1. ✅ `packages/@appspine/common` — 沒有依賴，其他套件都會用到（`PrismaModule`、`ZodValidationPipe`、`pagination` 等），最適合第一個動工
2. ✅ `packages/@appspine/auth` — 依「已決定事項」的設計動手搬，依賴 `@appspine/common`
3. ✅ `packages/@appspine/rbac` — 依賴 `@appspine/auth` 的 `user-context.util`
4. ✅ `packages/@appspine/m2m-api-key` — 依賴 `@appspine/rbac`（角色帶 scope）
5. ✅ `packages/@appspine/audit-log`、`@appspine/health-check`、`@appspine/metadata-schema` — 彼此獨立，可平行進行，且都是「直接搬」風險最低
6. ✅ `packages/@appspine/mcp-server` — 依賴 `@appspine/m2m-api-key`（`ApiKeyGuard`）跟 `@appspine/auth`（`ApiKeyUser` 型別）；`McpToolRegistry` 拿掉了自動產生 CRUD tool 的邏輯，只留 app 自行註冊用的容器

八個套件全部完成，也都發布到 GitHub Packages（`0.1.0`，`@appspine/auth` 因為下方的開機 bug 修正又補了 `0.1.1`）。

## 接線狀態（✅ 已完成）

001「後續待辦事項」第 3 項的尾段——把 `appspine-app-template` 接上這八個套件——已完成：

- `backend/package.json` 裝好全部 8 個套件（透過 `@appspine:registry=https://npm.pkg.github.com`）
- `backend/src/app.module.ts` 引入全部 Module；`main.ts` 掛上 `GlobalExceptionFilter`
- 手刻的 `backend/src/prisma/`（`PrismaModule`/`PrismaService`）整個刪掉，改用 `@appspine/common` 的版本
- `prisma/schema/base.prisma` 只剩 app 自己的 `Permission` enum；`User`/`Role`+`RolePermission`+`UserRole`/`ApiKey`/`AuditLog` 都是從套件複製進來的片段（`user.prisma`/`role.prisma`/`api-key.prisma`/`audit-log.prisma`）
- `scripts/gen-data-dictionary.ts` 改成呼叫 `@appspine/metadata-schema` 的 `renderDataDictionary()`
- 用 Docker 起一個暫時的 Postgres，實際跑過 `prisma migrate dev` + seed + `nest start`，確認 8 個 Module 全部正常初始化、所有路由都掛上去，並且實際打了 `/health`、`/auth/register`、`/auth/login`、`/auth/me`、`/users`（驗證 `AdminGuard` 403）、`/metadata/schema`（驗證 `ScopeGuard` 對 JWT 使用者放行）等 endpoint 確認真的能動，不只是 typecheck/lint 過

這次驗證也抓到一個 `@appspine/auth` 的真實 bug：`AuthModule` 原本無條件註冊 `LocalStrategy` 跟 `OidcStrategy` 兩個 provider，但 `OidcStrategy` 建構子會呼叫 `jwks-rsa` 的 `passportJwtSecret()`，這個函式如果 `jwksUri` 是空字串會直接同步丟出例外——導致 `AUTH_MODE=local`、沒設 `OIDC_JWKS_URL`（最常見的情況）時整個 app 開機就掛掉。已修正成只註冊 `AUTH_MODE` 對應的那個 strategy，並發布 `@appspine/auth@0.1.1`。

