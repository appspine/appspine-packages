---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL0-04 — Identity／Auth Responsibility & Migration Matrix

> Task: `PL0-04`（見 [051 拆解 §4](../decisions/051-plugin-platform-engineering-task-breakdown.md#pl0-04-完成-identityauth-responsibility-與-migration-matrix)）。
> Owner（實際執行）：Claude Sonnet（G2 `architecture-contract`，文件建議 owner，無替代）。
> 依賴：[PL0-02 snapshot](051-pl0-snapshot-summary.md)、[PL0-03 分類](051-pl0-package-classification.md)。
> 依 051 計畫 §5.3、§6.3 的責任切分逐一核對現有 `packages/auth/src` 原始碼，逐項指定目標 owner；本 task
> 不改任何程式碼，只產生 inventory + migration 決策輸入。

---

## 1. 現況原始碼盤點（`packages/auth/src`）

| 現有 export/檔案 | 現況做什麼 | 具體發現 |
|---|---|---|
| `packages/auth/prisma/user.prisma`（`User` model） | provider-neutral 使用者資料 + `password` 欄位 | `User` 直接持有 `userRoles: UserRole[]`（rbac 擁有）與 `actingApiKeys: ApiKey[]`（m2m-api-key 擁有）兩個 relation；`password` 欄位在 OIDC-only 模式下未使用但仍存在 |
| `users/users.service.ts` | Users CRUD | `create()`／`resolveDefaultRoleId()` 直接執行 `this.prisma.role.findUnique({ where: { name: SYSTEM_USER_ROLE } })`——**identity CRUD 反向具體依賴 RBAC 的 `Role` Prisma model**；`updateRoles()` 直接寫 `userRoles`（RBAC 的 join table） |
| `users/users.controller.ts` | Users REST API（`POST/GET/GET:id/PATCH:id/PUT:id/roles/DELETE:id`） | `PUT :id/roles` 端點語意上屬於「指派 RBAC 角色」，不是純 identity 操作 |
| `guards/admin.guard.ts`（`AdminGuard`） | 判斷 `request.user.roleNames.includes('ADMIN')` | 依賴 JWT payload 已經帶有 `roleNames`（由下方 `buildJwtUserFromLocalUser` 產生），不直接查 DB，但語意上是「RBAC 判斷」，物理位置在 auth |
| `decorators/current-user.decorator.ts`（`CurrentUser`、`JwtPayload`、`CurrentUserPayload`） | 從 `request.user` 讀出目前使用者 | `CurrentUserPayload = JwtUser \| ApiKeyUser`——**是唯一同時理解「互動式使用者」與「機器身份」形狀的型別**，`mcp-server`、`m2m-api-key`、**`rbac`** 都直接 import 這個聯集型別（`rbac/src/roles/roles.controller.ts:2`：`AdminGuard`、`CurrentUser`、`JwtAuthGuard`）——獨立 review 核對後更正，初版遺漏 `rbac` |
| `jwt-verifier.service.ts`（`JwtVerifierService`） | OIDC JWT 驗簽、`buildOidcJwtUser`／JIT provisioning、`assertAuthorizedParty`（azp 檢查） | 內部呼叫 `UsersService.create()` 做 JIT；`buildJwtUserFromLocalUser()` 呼叫 `buildUserContext()`（見下） |
| `user-context.util.ts`（`ApiKeyUser`、`UserContext`、`RoleWithPermissions`、`buildUserContext()`） | 把多個 Role 攤平成 `{roleNames, permissionPolicy, permissions}` | 純函式但輸入形狀（`RoleWithPermissions`）直接鏡射 RBAC 的 `Role`／`RolePermission` Prisma 結構；`m2m-api-key/src/api-key.guard.ts` 也直接 import `ApiKeyUser`／`buildUserContext` |
| `strategies/oidc.strategy.ts`（`OidcStrategy`） | Passport strategy，委派給 `JwtVerifierService.buildOidcJwtUser` | 純 OIDC-specific |
| `user-identity.util.ts` | （用於 delegated 與一般流程的身份工具） | 與 `ApiKeyUser`/`UserContext` 同群組 |
| `auth-audit-log.ts`（`AUTH_AUDIT_LOG` token） | JIT provisioning 寫 audit log | 依賴 `@appspine/audit-log` 的 sink 介面（已經是 token-based，不是 concrete service） |
| `delegated/*`（`DelegatedAuthGuard`、`DelegatedJwtVerifierService`、`DelegatedPrincipalMapperService`、`DelegatedAuthModule`） | RFC 8693 delegated inbound auth（另一個 App 用 token exchange 代表使用者呼叫本 App） | 獨立子模組，`index.ts` 註解明確標示「與上面的 `AuthModule` 獨立；沒 import `DelegatedAuthModule` 的 consumer 行為不變」；內部有 `'jit'`／`'never'` 兩種 provisioning 模式，`'jit'` 路徑重用 `JwtVerifierService` 的 provisioning 邏輯 |
| `m2m-api-key/prisma/api-key.prisma`（`ApiKey.actingUserId` → `User`） | acting-user 綁定 | **更正（初版誤判，由獨立 review 抓出）**：「必須是 service-account」的 runtime 檢查**確實存在**——`m2m-api-key/src/api-keys.service.ts:151-162` 的 `assertActingUser()` 在 `create()`（:59）與 `update()`（:120）都會呼叫，非 service-account 直接 `BadRequestException`。真正的發現是：`assertActingUser()` 內部執行 `this.prisma.user.findUnique({ where: { id: actingUserId }, select: { id: true, isServiceAccount: true } })`（:152-155）——**這是 `m2m-api-key` 對 `identity-core` 未來擁有的 `User` model 的直接 Prisma 讀取**，與 `users.service.ts` 對 `Role` 的反向依賴屬於同一類問題（跨 owner 直接查表，而非透過 stable token），只是方向相反 |

## 2. 目標 Owner 矩陣

| 現有能力 | 目標 owner | 依 051 計畫條款 | 遷移備註 |
|---|---|---|---|
| `User` model（`id`／`email`／`name`／`employeeNumber`／`isActive`／`isServiceAccount`／`createdAt`／`updatedAt`） | `identity-core` | 計畫 §5.3、§6.3 表格 | provider-neutral 欄位全部搬遷，不變更欄位語意 |
| `User.password` | `identity-core` 暫時保留欄位，**不擁有驗證邏輯**；未來 `local-auth` 才擁有密碼驗證 | 計畫 §5.3「不能原封不動搬檔」「Phase 1 不得直接 drop `User.password`」 | PL0-04 結論：欄位隨 `User` 一起搬到 `identity-core`，但 `identity-core` 不得新增任何讀取/驗證 `password` 的程式碼；OIDC-only 現況下此欄位已是死欄位，移除留給另立的 migration 計畫 |
| `User.userRoles` → `UserRole` relation | 由 **RBAC augmentation** 表達，不由 `identity-core` 直接擁有 relation 宣告 | 計畫 §5.3「RBAC／API key 對 User 的反向 relation 由 Prisma augmentation contribution 表達」 | `identity-core` 的 `user.prisma` 片段**不得**再宣告 `userRoles UserRole[]`；改由 `rbac` 的 Prisma augmentation 在組裝時對 `User` 增加此欄位（PL2-06 composer 實作，PL0-06 先出 fixture） |
| `User.actingApiKeys` → `ApiKey` relation | 由 **m2m-api-key augmentation** 表達 | 同上 | 同上，`identity-core` 不擁有此 relation 宣告 |
| Users CRUD（`create/findAll/findById/update/remove`） | `identity-core` | 計畫 §6.3 表格「Users CRUD」 | 搬遷時移除 `resolveDefaultRoleId()` 對 `prisma.role` 的直接查詢；改為呼叫 host 提供的 `IDENTITY_STORE`／`create()` 時透過 stable token 取得「預設角色」，或改為 `identity-core` 只接受呼叫端已經解析好的 `roleIds`（呼叫端由 preset／app-local wiring 決定要不要指派 `rbac` 的預設角色）。**具體 API 設計留給 PL1-10**，PL0-04 的結論是「不得繼續在 `identity-core` 內對 `Role` 表下 Prisma query」 |
| `PUT /users/:id/roles`（`updateRoles`） | 拆到 `rbac` 擁有的端點（例如 `PUT /rbac/users/:id/roles`），或改為 `rbac` 提供 service，`identity-core` 只透過 stable token 呼叫 | 計畫 §6.1「跨插件只 import contract、DTO、token，不 import concrete service」 | 現況端點路徑／行為在 PL3 遷移 Users Admin UI 前必須維持相容（見計畫 §12 回滾策略），API 路徑異動需要 changeset + deprecation |
| `AdminGuard` | **保留在 `identity-core`**（讀取已經由 auth provider 填好的 `roleNames`，不直接查 RBAC DB） | 計畫 §6.3「業務插件只讀取中立的 `PRINCIPAL_CONTEXT`」 | `AdminGuard` 本身不查 DB，只讀 request-scoped `roleNames`，符合「中立讀取」條件，可留在 identity-core／host 層，不需要搬進 `rbac` |
| `CurrentUser`／`JwtPayload`／`CurrentUserPayload`／`ApiKeyUser` | **host（`plugin-host-nest`）擁有的 `PRINCIPAL_CONTEXT` 型別** | 計畫 §4.2、§6.1「解析完成的 request identity 由 `appspine.principal-context` 對其餘插件提供」 | 這是 PL0-04 最重要的發現：目前 `mcp-server`、`m2m-api-key`、**`rbac`** 都直接 import `auth` 套件的型別，形成隱性耦合；Phase 1（PL1-11）必須把這組型別移到 host-owned `PRINCIPAL_CONTEXT` contract，`identity-core`／`oidc-auth`／`m2m-api-key` 各自產生符合此 contract 的 principal，不再互相 import 對方型別 |
| **（獨立 review 新增）拆分後 `rbac`／`m2m-api-key` 對 `identity-core`／`oidc-auth` 的殘留具體依賴** | 需在 Phase 1 逐一改為 stable token；**目前矩陣的 owner 指派本身會製造新的具體依賴，需要明確追蹤** | 計畫 §6.3「業務插件只讀取中立的 `PRINCIPAL_CONTEXT`／`IDENTITY_STORE`」 | 完整核對 `packages/rbac/src`、`packages/m2m-api-key/src` 對 `@appspine/auth` 的 import：`rbac/src/guards/permission.guard.ts:1`、`rbac/src/roles/roles.service.ts:1`（`SYSTEM_ADMIN_ROLE`）、`rbac/src/roles/roles.controller.ts:2`（`AdminGuard`、`CurrentUser`、`JwtAuthGuard`）、`m2m-api-key/src/api-key.guard.ts:2`（`ApiKeyUser`、`buildUserContext`）、`m2m-api-key/src/api-keys.controller.ts:2`（`AdminGuard`、`CurrentUser`）、`m2m-api-key/src/guards/jwt-or-api-key.guard.ts:1`（`JwtAuthGuard`）。依本表其餘列的 owner 指派，`SYSTEM_ADMIN_ROLE`／`AdminGuard`→`identity-core`，`JwtAuthGuard`→`oidc-auth`，`CurrentUser`→host `PRINCIPAL_CONTEXT`，`ApiKeyUser`／`buildUserContext`→`rbac`（`m2m-api-key` 這一項屬於 self-import，不算跨插件）。也就是說 `rbac` 會對 `identity-core`（`AdminGuard`、`SYSTEM_ADMIN_ROLE`）與 host `PRINCIPAL_CONTEXT`（`CurrentUser`）產生具體依賴，`m2m-api-key` 會對 `identity-core`、`oidc-auth`（`JwtAuthGuard`）與 host `PRINCIPAL_CONTEXT` 產生具體依賴。這**不是**新問題（現況已是如此，只是換了套件名字），但 PL0-04 初版沒有把這個「拆分不會自動消除耦合，只是換位置」的結論寫出來；PL1-10／PL1-11 執行時必須把這些 import 也改成透過 `IDENTITY_STORE`／`PRINCIPAL_CONTEXT`／`AUTHENTICATION_STRATEGY_REGISTRY` token，不能只搬 `auth` 自己的程式碼、放著 `rbac`／`m2m-api-key` 的具體 import 不動 |
| `buildUserContext()`／`UserContext`／`RoleWithPermissions` | **`rbac`**（邏輯是攤平 Role/Permission，屬於 RBAC policy 計算，不是 identity 職責） | 計畫 §6.3「`identity-core` 不依賴...RBAC/API-key concrete implementation」 | 目前物理位置在 `auth/src/user-context.util.ts`，但輸入輸出都是 RBAC 形狀；搬到 `rbac` 後，`oidc-auth`／`m2m-api-key` 透過 stable token（例如 `appspine.rbac-policy`，見 [PL0-03 §3](051-pl0-package-classification.md)）取得攤平結果，不直接 import 函式 |
| JWKS／RS256 驗簽、`OidcStrategy`、`assertAuthorizedParty`（azp 檢查） | `oidc-auth` | 計畫 §5.3、§6.3 | 純 OIDC-specific，無需修改邏輯，只搬檔案 |
| `buildOidcJwtUser`／`mapVerifiedIdentityToLocalPrincipal`／JIT provisioning（`provisionOidcUser`） | `oidc-auth`（呼叫 `identity-core` 的 `IDENTITY_STORE` token 建立/查詢 User，不直接 import `UsersService`） | 計畫 §4.2「業務插件只讀取中立的 `IDENTITY_STORE`」 | 現況 `JwtVerifierService` 直接建構並呼叫 `UsersService`（同 package 內具體依賴）；拆分後改為透過 `IDENTITY_STORE` token 呼叫，行為不變 |
| `findLocalPrincipalByVerifiedEmail`（給 delegated 流程用的唯讀查詢） | **`oidc-auth` compatibility adapter**；底層只能呼叫 `IDENTITY_STORE`，不得直接查 `User` | 計畫 §6.3 | Phase 1 新路徑以 issuer+subject 查 `OidcIdentity`；email lookup 只保留在 §4 expand/transition 的一次性 legacy linking fallback，cutover 後停用，不進 `identity-core` public API |
| `delegated/*`（`DelegatedAuthGuard`、`DelegatedJwtVerifierService`、`DelegatedPrincipalMapperService`、`DelegatedAuthModule`、delegated `'jit'`/`'never'` provisioning） | `oidc-auth`（因為驗證的是另一個 appspine App 簽發、同一 Keycloak realm 的 OIDC token，屬於 OIDC-specific 能力，不是通用 identity） | 計畫未逐字列出 delegated 的目標 package；PL0-04 依「驗證邏輯是 OIDC/JWT-specific」原則歸類到 `oidc-auth` | 若未來要支援「delegated 但上游不是 OIDC」的情境，需要另立 ADR；PL0-04 範圍內先合併進 `oidc-auth` |
| `acting-user`（`ApiKey.actingUserId` → `User`） | `m2m-api-key` 擁有 `ApiKey` model 與 relation 宣告；`User` 端的反向 relation 由 m2m-api-key 的 Prisma augmentation 表達（同 `userRoles` 模式） | 計畫 §5.3 | 「acting user 必須是 service-account」的 runtime 檢查**已存在**（`api-keys.service.ts:151-162` 的 `assertActingUser()`）；遷移重點不是「補檢查」，而是把 `assertActingUser()` 內的 `this.prisma.user.findUnique(...)` 直接查表改成呼叫 `identity-core` 的 `IDENTITY_STORE` token（見 §1 更正說明） |
| `service-account`（`User.isServiceAccount`） | `identity-core` 擁有欄位；**是否只有 service-account 才能被綁為 acting user 的檢查**由 `m2m-api-key` 在建立/更新 `ApiKey.actingUserId` 時呼叫 `IDENTITY_STORE` 驗證 | 計畫 §6.3 | 檢查邏輯已存在（見上一列），遷移只需把直接 Prisma 查詢換成 `IDENTITY_STORE` token 呼叫，不改變檢查行為本身 |
| `AUTH_AUDIT_LOG` token | 維持 token-based（不變） | 計畫 §6.1「host-owned singleton 才使用 peer dependency」 | 已符合目標模式，不需遷移，`oidc-auth`／`identity-core` JIT provisioning 沿用相同 token |

## 3. `@appspine/auth` 相容 facade（PL1-13 執行，本 task 只定義範圍）

`packages/auth/src/index.ts` 目前有 14 個 `export *` 陳述式（`grep -n "^export" packages/auth/src/index.ts | wc -l`
= 14；經獨立 review 核對，初版文字「24 個 export」是錯誤計數，已更正為描述 `export *` 陳述式數量而非
展開後的具體 symbol 數，避免每次原始碼變動就要重新精確計數具體 symbol 才能維持文件正確）需要在相容
facade 階段全部有明確去向：

| Export | Phase 1 後的去向 |
|---|---|
| `AuthController`、`AuthModule`、`SYSTEM_ADMIN_ROLE`、`SYSTEM_USER_ROLE` | facade re-export `oidc-auth` 的 `OidcAuthModule`／`oidcAuthPlugin()`（`SYSTEM_ADMIN_ROLE`／`SYSTEM_USER_ROLE` 常數本身不含 provider-specific 邏輯，隨 `identity-core` 一起搬，facade re-export） |
| `CurrentUser`、`JwtPayload`、`CurrentUserPayload` | facade re-export host `PRINCIPAL_CONTEXT` 對應型別 |
| `DelegatedAuthGuard` 等 `delegated/*` 全部 export | facade re-export `oidc-auth` 的 delegated 子模組 |
| `AdminGuard`、`JwtAuthGuard` | facade re-export `identity-core`（`AdminGuard`）／`oidc-auth`（`JwtAuthGuard`，因為它掛載的是 OIDC passport strategy） |
| `JwtVerifierService`、`OidcStrategy` | facade re-export `oidc-auth` |
| `user-context.util` 全部 export（`ApiKeyUser`、`UserContext`、`buildUserContext`…） | facade re-export `rbac` |
| `user-identity.util` 全部 export | facade re-export host `PRINCIPAL_CONTEXT` helper；實際 owner 固定為 `plugin-host-nest`。目前唯一 export `resolveActingUserId()` 同時理解 JWT 與 API-key principal，不能放進 `identity-core` 或 `oidc-auth` |
| `createUserSchema`／`updateUserSchema`／`updateRolesSchema`／`CreateUserDto`／`UpdateUserDto`／`UpdateRolesDto`（`users/dto/user.dto.ts`，**更正**：初版誤寫成不存在的 `UserDto`，實際 export 清單見左欄） | facade re-export `identity-core` |
| `UsersController`、`UsersService` | facade re-export `identity-core` |
| `./prisma/user.prisma` subpath | facade re-export `identity-core` 的 schema fragment（或直接標記 deprecated，改推薦直接依賴 `identity-core`） |

此表格是 PL1-13「舊 export 都有保留或明確 migration 結論」驗收條件的 Phase 0 版本輸入；PL1-13 執行時需要重新核對彼時的實際 export 清單（可能因 Phase 1 其他 task 已新增/移除 export）。

## 4. 資料 Migration、Downgrade 與 Rollback（G0 凍結）

### 4.1 Expand／transition／cutover

1. **Expand**：`identity-core` 接管既有 `User` table 的 schema ownership，但 table/column 名稱、primary key、
   `password` 欄位與既有資料均不改；這一步是 package ownership 移動，不是資料搬表。
2. **新增 external identity**：由 `oidc-auth` 擁有 `OidcIdentity`，至少包含 `issuer`、`subject`、`userId`，
   並以 `(issuer, subject)` unique。不得以 email 作 unique external identity key。
3. **Legacy linking transition**：登入先查 `(issuer, subject)`；沒有 mapping 時，僅在 token 的 email 已驗證且
   恰好命中一個 active legacy User 時，於同一 transaction 建立 `OidcIdentity → User` mapping 並寫 audit。
   零筆或多筆命中一律 fail closed，不得猜測。
4. **Cutover**：所有 active OIDC 使用者完成 mapping、catalog/metric 顯示 legacy fallback 連續一個 release
   window 為零後，才可停用 email fallback；`User.email` 仍是 profile/contact 資料，不再是 identity key。

### 4.2 Downgrade

- transition window 內舊 `@appspine/auth` facade 與既有 `User` 欄位保持可用；舊版本會忽略新增的
  `OidcIdentity` table。
- downgrade 不刪除 `OidcIdentity`、不移除 `(issuer, subject)` mapping、不回寫或清空 `password`；若回到
  legacy email lookup，必須在 catalog/health 明示 compatibility mode。
- 已經出現同 email 對應多個 issuer/subject 的帳號不得自動合併；downgrade 前由 operator 審查並明確核准。

### 4.3 Rollback

- 若 Phase 1 migration 或 strategy bridge 失敗，切回 legacy `AuthModule` facade wiring；保留新 table 與
  mapping 供修復後重試，不執行 destructive down migration。
- Prisma migration 只允許 additive expand；drop column/table、delete User、delete permission/role relation
  都不屬於 rollback。真正移除只能另立 major migration 計畫。
- public API rollback 由 `@appspine/auth` compatibility exports 完成；資料 rollback 與 package rollback 分開，
  避免套件降版造成資料遺失。

## 5. 驗證（對照 051 拆解 §4 PL0-04 驗收條件）

- **「`identity-core` 無 OIDC/password/RBAC/API-key concrete dependency」**：§2 矩陣明確排除 `identity-core`
  擁有 `userRoles`／`actingApiKeys` relation 宣告、`Role` Prisma 查詢、`buildUserContext`／`ApiKeyUser` 型別；
  這些全部指派給 `rbac`／`m2m-api-key`／host。
- **「Phase 1 不 drop `password`」**：§2 明確標註 `password` 隨 `User` 搬遷但不新增讀取邏輯，不刪除欄位。
- **「`oidc-auth` 與未來 `local-auth` 的互斥及 issuer+subject identity 有測試案例」**：新增
  [`fixtures/051-identity-boundary/cases.json`](../../fixtures/051-identity-boundary/cases.json) 與
  [`scripts/051-pl0-identity-contract-check.mjs`](../../scripts/051-pl0-identity-contract-check.mjs)。測試固定以下
  contract：email 改變不改變 external identity；相同 subject、不同 issuer 必須是不同 identity；相同 email、
  不同 subject 也必須是不同 identity；issuer/subject 缺一即拒絕；同時安裝 `oidc-auth`／`local-auth` 必須
  解出 conflict。這些是 PL1-12 正式 persistence/strategy tests 的最低相容門檻。

```bash
node scripts/051-pl0-identity-contract-check.mjs
# 6 identity contract checks run, 0 failed
```

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL0-04 |
| Actual agent | Claude Sonnet 5（G2 `architecture-contract`，文件建議 owner） |
| Required class | G2；Sol（G3）審 identity/security/schema——本 session 無獨立 Sol provider，依使用者核准的替代方式由 Claude Sonnet 自行完成，Gate G0 統一由獨立 review agent 覆核 |
| Independent reviewer | Claude Opus（general-purpose agent，2026-08-18，Gate G0 blind-spot audit）——發現本文件初版三處錯誤：(1) 誤判 acting-user service-account 檢查不存在（實際存在於 `api-keys.service.ts:151-162`，真正的發現應是該處對 `User` 的直接 Prisma 讀取）；(2) `CurrentUser`／`ApiKeyUser` 型別的具體依賴清單漏列 `rbac`；(3) `packages/auth/src/index.ts` export 數量誤植為 24、`UserDto` 不存在。三處均已於本次修訂更正，見 §1／§2／§3 內文標註「更正」處 |
| Tools | repo read（Read/Grep），無程式碼變更 |
| Evidence | 本文件 §1 逐檔案核對 `packages/auth/src/**`、`packages/rbac/prisma/role.prisma`、`packages/m2m-api-key/prisma/api-key.prisma`；§4 凍結 migration/downgrade/rollback；§5 的 6 個 identity contract checks 覆蓋 issuer+subject 與 provider conflict |
| 已知風險 | 現有 runtime 仍是 email-keyed，Phase 1 必須依 §4 additive migration 修正；`m2m-api-key` 對未來 `identity-core` `User` model 的直接 Prisma 讀取，以及 `rbac`／`m2m-api-key` 對拆分後 packages 的殘留 concrete import，必須在 PL1-10／PL1-11／PL1-12 改為 frozen stable tokens。這些是已指派 owner 的 implementation work，不是未決 owner |
| Rollback | 刪除本文件；不影響任何 runtime 或已發布 package |
