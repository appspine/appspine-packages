---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# 010 - M2M API Key Acting User 身份綁定 - 系統設計計畫

> 狀態：已完成（24/24 全做完）
> 動機來源：`_archive/dev_docs-20260803/app-wiki/011-wiki-app-plan.md` 第 6、7、14 節在設計 wiki 的 MCP write
> tool 時發現此缺口，經 opus 二次審查後拍板方向；本文件把該決策從 011 抽出來，
> 獨立成一份框架級變更計畫。

---

## 1. 背景與問題

appspine 的 M2M API Key（`@appspine/m2m-api-key`）驗證通過後，
`ApiKeyGuard`（`packages/m2m-api-key/src/api-key.guard.ts`）把
`request.user.sub` 設成 `apiKey.id`，不是任何 `User.id`：

```ts
request.user = {
  sub: apiKey.id,
  ...buildUserContext([apiKey.role]),
  scopes: apiKey.scopes,
  isApiKey: true,
};
```

對純讀取沒有影響（讀取只需要 `permissionPolicy`/`permissions`/`scopes`）。但任何
「寫入且需要真實使用者身份」的場景都會卡住，典型情境：

1. **建立資料時要填 `createdById`**：業務 model 常見 `createdById String` 硬性
   FK 指到 `User`（例如 wiki 的 `WikiPage.createdById`），`apiKey.id` 塞不進去。
2. **資料驅動的細粒度授權**：某些權限不是靠系統 RBAC 的 Permission/Scope 就能
   表達完，而是資料庫裡「這個 user 是不是這筆資料的成員/擁有者」（例如 wiki 的
   `WikiSpaceMember` 用 `userId` 查 OWNER/EDITOR/VIEWER）。API Key 沒有可查的
   `userId`，這一層直接卡死。

這不是 wiki 專屬問題——任何 app 只要有「M2M 呼叫端要建資料、且該資料有
`createdBy` 類 FK 或資料驅動授權」，都會遇到同樣的坑。現在（appspine 只有
template、還沒有任何 app 真正上線）是修的最低風險時機。

`ApiKey` 這個 Prisma model 定義（`api-key.prisma`）在 fork 當下會複製進每個 app
自己的 schema、之後獨立可編輯；但簽發/管理 key 的 `ApiKeysController` /
`ApiKeysService`（含 `CreateApiKeyDto`）是從 `@appspine/m2m-api-key` npm 套件
import 進來的，app 端不能單方面改它的邏輯——因此純 app-local 的欄位擴充無法被
官方簽發流程使用，必須從共用套件下手。

---

## 2. 決策：新增 `actingUserId` 綁定

`ApiKey` 可選擇性綁定一個 `actingUserId`（FK 到 `User`）。有綁定的 Key 在做
「需要身份」的寫入時，其有效身份 = 該綁定的 User；沒綁定的 Key 只能做純讀取或
不涉及身份的操作，若被拿去呼叫需要身份的 write，一律 fail-closed 回 403。

> **不是單純的「新增欄位 = non-breaking minor bump」**：`api-key.prisma` /
> `user.prisma` 這兩個 fragment 是 fork 當下複製進每個 app、之後各自獨立的檔案，
> 不是純 npm 套件邏輯。單純 `pnpm update` 只會把新版 `ApiKeysService`/
> `ApiKeyGuard` 的程式碼換掉，但 app 本地的 Prisma schema 還沒有 `actingUserId`
> 這個欄位——新版程式碼一讀寫這個欄位就會直接對著缺欄位的 Prisma client 炸掉。
> 這是一次**協調式變更**：套件版本升級、app 本地 `api-key.prisma`/`user.prisma`
> 手動同步欄位、跑 migration，三者要在同一個 PR/deploy 視窗內一起完成，不能只靠
> semver 保證安全。**這個「fragment 型共用套件變更需要協調式升級」的教訓本身也
> 值得記錄下來**，之後補進 `_archive/dev_docs-20260803/framework/003-shared-package-reuse-plan.md`。

---

## 3. `appspine` monorepo 變更

### `@appspine/auth`

- `user-context.util.ts` 的 `ApiKeyUser` 介面新增 `actingUserId: string | null`。
- `user.prisma` fragment：
  - `User` model 新增反向關係 `actingApiKeys ApiKey[]`（Prisma 雙向關聯必填欄位）。
  - `User` model 新增 `isServiceAccount Boolean @default(false)
    @map("is_service_account")` 欄位——標記這個帳號是專門給 M2M 整合用的服務
    帳號，非真人登入用。用來支撐第 4 節「`actingUserId` 只能綁 service-account」
    政策的 schema 層強制。
- `users/dto/user.dto.ts` 的 `createUserSchema`/`updateUserSchema` 新增
  `isServiceAccount: z.boolean().optional()`；`users.service.ts` 的
  `create()`/`update()` 同步寫入。
- 新增並 export 一個 `resolveActingUserId(user: JwtUser | ApiKeyUser): string`
  pure function（設計見第 5 節）：JWT 使用者直接回傳 `user.sub`；API Key 使用者
  回傳 `user.actingUserId`，若為 `null`、或綁定的 User `isActive === false`，
  丟 `ForbiddenException`。**決策：現在就放進 `@appspine/auth`**，不等第二個
  app 出現才升級——這批變更本來就已經在動 `@appspine/auth`，這個函式零業務
  耦合、純操作套件自己定義的 `JwtUser`/`ApiKeyUser` 型別，順手一起發掉比之後
  從 wiki 搬遷更省事。

### `@appspine/m2m-api-key`

- `api-key.prisma` 新增：
  ```prisma
  /// User this key acts as for identity-bound writes (createdById, ownership checks).
  /// Must be a dedicated service-account user, never a real employee's personal
  /// account — see policy note below. Null = no bound identity; endpoints
  /// requiring a real user must reject such calls.
  /// onDelete: Restrict — deleting a bound user is blocked; unbind or deactivate
  /// the key first. (In practice Users are never hard-deleted in this framework,
  /// only soft-disabled via `isActive`; Restrict is defense-in-depth, not the
  /// primary safeguard — see the isActive check in §5.)
  actingUserId String? @map("acting_user_id")
  actingUser   User?   @relation("ApiKeyActingUser", fields: [actingUserId], references: [id], onDelete: Restrict)
  ```
- `CreateApiKeyDto` / `UpdateApiKeyDto` 新增可選欄位 `actingUserId?: string`
  （建立/更新時驗證該 user 存在，且 `isServiceAccount === true`，否則 400
  Bad Request，訊息提示「此帳號未標記為 service account，無法綁定為 API Key
  的 acting user」——見第 4 節政策）。
- `ApiKeyGuard` 組 `request.user` 時把 `actingUserId` 一併帶上。

### `@appspine/audit-log`（稽核可追溯性）

身份解析後，`createdById`/`updatedById`/資料驅動授權查詢全部收斂成
`actingUserId`，資料上會跟這個 acting user 真的登入操作長得一模一樣。既有的
`isAiOperation`/`mcpTool` 只能說「這是 AI 做的」，說不出「是哪一把 API Key
做的」。`request.user` 在 API Key 呼叫時本來就同時帶著 `sub: apiKey.id` 與
`isApiKey: true`，資料其實都在，只是還沒接進 audit log：

- `audit-log.prisma` 的 `AuditLog` model 新增 `actingApiKeyId String?`
  （比照 `ApiKey.createdBy` 既有的 snapshot 設計——不開 FK，純字串快照，
  避免又要決定一次 `onDelete` 行為）。
- `RecordAuditLogDto` 同步新增 `actingApiKeyId?: string | null`。
- 消費方（各 app）呼叫 `AuditLogService.record()` 時，`req.user.isApiKey ===
  true` 就把 `req.user.sub`（即 `apiKey.id`）帶進 `actingApiKeyId`。

### 版本與發版

三個套件同批（`@appspine/auth`、`@appspine/m2m-api-key`、`@appspine/audit-log`）
走 Changesets minor version，PR 內同時包含 schema fragment 變更說明文件（給
消費端 app 對照升級用，因為 fragment 不會隨 npm 自動同步）。

---

## 4. 政策：`actingUserId` 只能綁定專門的 service-account User（schema 層強制）

「把 acting user 加成 space/資源的 EDITOR/OWNER，跟人類協作者一樣」這個設計，
容易被誤解成「隨便掛一個真實員工帳號上去方便測試」——但那樣任何持有這把 Key
的人就能無人值守地假冒該員工寫入，是身份混淆風險。

**決策：schema 層強制，不只靠文件/管理流程約束。** `User` 新增
`isServiceAccount Boolean` 欄位（見第 3 節 `@appspine/auth`），
`ApiKeysService.create()`/`update()` 綁定 `actingUserId` 時強制檢查該 User 的
`isServiceAccount === true`，不符合直接拒絕（見第 3 節 `@appspine/m2m-api-key`）。

理由：能建立/管理 API Key、User 的本來就只有 ADMIN，是內部高信任操作，濫用
門檻本來不低；但這批變更本來就已經在動 `@appspine/auth`（User model）與
`@appspine/m2m-api-key`（`ApiKeysService`），加這個欄位與檢查是順手完成的
低成本項目，不需要另外擴大套件變更範圍，卻能把「身份混淆」這個風險從「靠人
記得」變成「系統擋」，值得直接做。

User 管理頁需要能勾選/顯示 `isServiceAccount`——見第 6 節 template frontend
變更。

---

## 5. 消費端（各 app）用法：fail-closed 的單一身份解析關卡

「null → 403」這個檢查不能是「各 app 各自順手加」，必須是每個 write service
method 開頭第一行都會呼叫、無法繞過的單一函式：

```ts
function resolveActingUserId(user: JwtUser | ApiKeyUser): string {
  if (!('isApiKey' in user) || !user.isApiKey) return user.sub; // JWT：sub 就是 User.id
  if (!user.actingUserId) {
    throw new ForbiddenException('This API key has no acting user bound; cannot perform this write.');
  }
  return user.actingUserId;
}
```

且解析出來的 acting user 若 `isActive === false`（帳號已被停用），一樣要視為
未綁定、回 403——單靠 FK 存在與否不夠，`onDelete: Restrict` 只防「刪除」，防不了
「軟停用」這條路徑，這點要在 resolver 裡一併檢查（額外查一次 `User.isActive`）。

**決策：`resolveActingUserId()` 直接 export 自 `@appspine/auth`**（見第 3 節），
不放 wiki app 本地——因為它不含任何 app 專屬商業邏輯，純粹操作
`@appspine/auth` 已定義的 `JwtUser`/`ApiKeyUser` 型別；這次的 schema 變更本來
就已經在動 `@appspine/auth`，順手把這個零耦合的 pure function 一起發掉，比讓
第一個消費者（wiki）先手刻一份、之後再搬遷更省事。這是不比照 002「升級進共用
套件的判斷準則」（通常等第二個消費者出現才升級）的例外情況，例外理由：安全性
關卡（漏檢查 = 身份混淆或直接炸 FK）+ 零耦合 + 反正同批已經要動這個套件。

wiki app 呼叫方式：`import { resolveActingUserId } from '@appspine/auth'`，
每個 write service method 開頭第一行呼叫，取得的 userId 直接餵給
`createdById`/`WikiSpaceMember` 查詢。

---

## 6. `appspine-app-template` 變更

Template 已經內建一整套 API Key 管理功能（backend module 已 wiring 進
`app.module.ts`；**frontend 也已經有現成的管理頁面**：
`frontend/src/app/(main)/dashboard/(admin)/api-keys/`），每個 fork 出去的 app
都會帶著這份。因此 `actingUserId` 的相關改動要落在 template，而不是 wiki
app-local，未來所有 app 才能直接受益，不用每個 app 各自重造一次。

### Backend

- `backend/prisma/schema/api-key.prisma`、`user.prisma`、`audit-log.prisma`
  同步第 3 節的欄位變更（`actingUserId`、`isServiceAccount`、
  `actingApiKeyId`）。
- `backend/package.json` 把 `@appspine/auth`/`@appspine/m2m-api-key`/
  `@appspine/audit-log` 升到新版本。
- **Migration 決策：直接改寫 template 現有的 `20260630091710_init` baseline**
  （不疊加新 migration）——理由：除了驗證用的 `smoke-test-app` 之外，還沒有
  真正的 app 從這個 baseline 部署過，改了不影響任何人；template 概念上是
  「一次性骨架」，保持只有一支 init migration 比較乾淨，避免新 fork 出去的
  app 得跑兩支 migration 才有完整欄位這種不必要的歷史包袱。

### Frontend

**API Keys 管理頁**（`frontend/src/app/(main)/dashboard/(admin)/api-keys/`）：

- `_components/create-api-key-dialog.tsx`：目前欄位為 `name`/`roleId`/
  `scopes`（checkbox 清單）/`rateLimit`/`expiresAt`，新增一個「Acting User
  (optional)」的 `Select`，資料來源列出**已標記 `isServiceAccount` 的 User**
  （不是全部 User 都能選，呼應第 4 節政策——避免 UI 上就能選到真人帳號）。
- `actions.ts`（`createApiKeyAction`）：把 `actingUserId` 從 formData 帶進
  後端呼叫。
- `types.ts`：型別補 `actingUserId`。
- `_components/api-key-row-actions.tsx`：支援事後編輯/改綁——建立時沒綁的 Key，
  之後要能補綁。
- `messages/en.json` + `zh-TW.json`：補齊對應翻譯 key（`apiKeys.actingUser` 等）。

**Users 管理頁**（`frontend/src/app/(main)/dashboard/(admin)/users/`）：

- `_components/create-user-dialog.tsx`：新增「Service Account」的 `Checkbox`
  （`isServiceAccount`），勾選後可考慮同步隱藏/停用密碼欄位（service account
  不該真的用密碼登入，但 v1 先不強制，只加欄位本身）。
- `_components/user-row-actions.tsx`（或對應的 edit dialog）：支援事後編輯
  `isServiceAccount`。
- `actions.ts` / `types.ts`：同步補欄位。
- `messages/en.json` + `zh-TW.json`：補齊對應翻譯 key（`users.isServiceAccount` 等）。

### 文件

- `docs/agent-guide.md`「Shared Framework Packages」段落，`M2M API Key`
  條目補一句提到 acting-user identity binding，讓之後 fork 這個 template 的人
  一眼就知道有這個機制、以及第 4 節的 service-account only 政策。

---

## 7. 高階執行順序（供後續 task-breakdown 展開）

```
appspine monorepo：
  1. @appspine/auth：ApiKeyUser.actingUserId、user.prisma 反向關係、
     User.isServiceAccount、CreateUserDto/UpdateUserDto、
     resolveActingUserId()（export）
  2. @appspine/m2m-api-key：api-key.prisma 欄位、DTO、ApiKeyGuard、
     ApiKeysService 的 isServiceAccount 檢查
  3. @appspine/audit-log：audit-log.prisma actingApiKeyId、RecordAuditLogDto
  4. 三個套件同批 Changesets 發版

appspine-app-template：
  5. backend：升級套件版本、同步三個 schema fragment、改寫
     `20260630091710_init` baseline migration（不疊加新 migration）
  6. backend：驗證 prisma generate / migrate / 開機正常
  7. frontend：api-keys 頁（create-api-key-dialog.tsx 等 4 個檔案）+ users 頁
     （create-user-dialog.tsx 等，isServiceAccount 欄位）+ i18n
  8. docs/agent-guide.md 補充說明
  9. 端到端驗證：
     - 建一個 service account User（`isServiceAccount = true`）
     - 建一把綁定該 service account 的 Key、一把沒綁的 Key
     - 嘗試把 Key 綁到一個非 service-account 的 User，確認 400 被擋
     - 實際打 API 確認 fail-closed 行為正確（比照 Z02 fork validation 的
       驗證風格）

→ 完成並驗證後，_archive/dev_docs-20260803/app-wiki/011-wiki-app-plan.md 才開始 fork + 實作
  （wiki 只需升級套件版本消費，不用再處理框架層變更）
```

---

## 8. 決策記錄

本文件原本列出的 3 個待決事項已全部拍板，決策內容已回填進對應章節，不再單獨
保留「待決事項」清單：

| 決策點 | 結論 | 詳見 |
|---|---|---|
| Template init migration 策略 | 直接改寫 `20260630091710_init` baseline，不疊加新 migration | 第 6 節 |
| `resolveActingUserId()` 放置位置 | 現在就 export 自 `@appspine/auth`，不等第二個 app | 第 5 節 |
| service-account 政策強制力 | schema 層強制（`User.isServiceAccount` + `ApiKeysService` 檢查） | 第 3、4 節 |

若之後執行過程中出現新的待決問題，比照既有慣例另開一份 Z 系列記錄文件或在此
補一個新的「待決事項」段落，不要混進已拍板的決策裡。

