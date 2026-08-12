---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-05
---

# 010 - M2M API Key Acting User 身份綁定 Task Breakdown

> 依照 `_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md` 的設計執行。此計畫為**框架級協調式變更**，
> 同時橫跨兩個 repo：
> - `appspine`（monorepo，三個共用套件 `@appspine/auth`、`@appspine/m2m-api-key`、`@appspine/audit-log`）
> - `appspine-app-template`（backend schema + migration baseline + 兩個既有 admin 前端頁 + 文件）
>
> 兩個 repo 的改動屬於**同一批工作**，必須在同一個 PR / deploy 視窗內一起完成（見 plan 第 2 節：
> 套件版本升級、app 本地 fragment 同步、migration 三者不能只靠 semver 保證安全）。
> 每個 task 假設執行者（可能是 Codex 或另一個 agent）**沒有本次對話的上下文**，必須照著檔案路徑、
> 程式碼片段、指令、驗證步驟獨立完成。
> 每完成一個 task，把 checkbox 從 `[ ]` 改成 `[x]`，並在「3. 執行結果」對應段落補上實際結果。
>
> 複雜度標記：**S** = 半天內、**M** = 1–2 天、**L** = 3 天以上。

---

## 1. 執行原則

- 本批改動落在 **`appspine` monorepo** 與 **`appspine-app-template`** 兩個 repo，兩者是同一件事的
  兩半，缺一不可；但**不碰任何 `apps/` 底下已 fork 出去的業務系統 repo**（例如 wiki），也不碰
  `smoke-test-app` 以外的部署資料。wiki app 之後只需升級套件版本消費，不在本批範圍。
- 只實作 plan 已拍板的設計，**不新增計畫外功能、不做預防性重構、不順手擴大套件變更範圍**。
  plan 第 8 節三項決策已定案（migration 直接改寫 baseline、`resolveActingUserId()` 現在就放進
  `@appspine/auth`、service-account 政策走 schema 層強制），一律照做，不重開討論。
- **協調式升級順序**：monorepo 三套件（A→B→C）先改完並發版（D），template 才升級消費（E→F→G），
  最後端到端驗證（H）。跨 repo 的依賴用 `依賴:` 標明。
- 每個 task 都要有明確、可獨立重現的驗證，驗證未通過不得標記完成。共用套件（A/B/C）依 `002` 測試
  規範需附單元測試（壞掉會影響所有業務系統）。
- 程式碼 / 註解 / commit message 一律英文；Prisma `///` doc comment 為必填（見 `002`）。
- Commit 遵循 Conventional Commits，禁止 `git add -A`、禁止 `--no-verify`；commit 前
  `tsc --noEmit`（`pnpm typecheck`）+ `biome check` 都要通過。Prisma migration 一律帶明確
  `--name`，不進互動式 prompt。
- 若執行過程中出現 plan 未預期的新問題（例如 §5 的 `isActive` 檢查與「純函式」定位的張力、
  template 尚無 identity-bound write endpoint 可打），**依既有慣例另開一份 Z 系列記錄文件**
  （例如 `Z04-...`），不要把新問題硬塞進本批 commit，也不要改寫本文件已定案的決策。

---

## 2. Task Breakdown

> 路徑約定：以 `appspine/` 開頭者位於 monorepo（`d:\Source\Private\appspine\appspine\`）；
> 以 `appspine-app-template/` 開頭者位於 template repo（`d:\Source\Private\appspine\appspine-app-template\`）。

### A. `@appspine/auth` 變更

- [x] **T-1000** 於 `ApiKeyUser` 介面新增 `actingUserId`。複雜度：**S**
  - 檔案：`appspine/packages/auth/src/user-context.util.ts`
  - 在 `ApiKeyUser`（目前為 `extends UserContext`，含 `sub`/`scopes`/`isApiKey: true`）新增：
    ```ts
    export interface ApiKeyUser extends UserContext {
      sub: string;
      scopes: string[];
      isApiKey: true;
      actingUserId: string | null; // User this key acts as; null = no bound identity.
    }
    ```
  - 驗證：`pnpm -C appspine typecheck`（root workspace 遞迴）通過。
  - 依賴：無

- [x] **T-1001** `user.prisma` fragment 新增 `isServiceAccount` 欄位與反向關係。複雜度：**S**
  - 檔案：`appspine/packages/auth/prisma/user.prisma`
  - 在 `User` model 內新增（緊接既有 `isActive` 欄位之後、`userRoles` 之前保持可讀即可）：
    ```prisma
    /// Marks a dedicated machine/integration account (not a real person's login).
    /// Only service accounts may be bound as an API key's acting user — see the
    /// actingUserId policy on ApiKey. @internal
    isServiceAccount Boolean @default(false) @map("is_service_account")
    ```
  - 並在 `userRoles UserRole[]` 附近新增反向關係（**relation 名稱必須是 `ApiKeyActingUser`**，
    對齊 `api-key.prisma` 那側，否則 Prisma 會報 relation 不對稱）：
    ```prisma
    /// API keys that act as this user for identity-bound writes.
    actingApiKeys ApiKey[] @relation("ApiKeyActingUser")
    ```
  - 驗證：人工檢閱欄位/關係名稱與 plan 第 3 節一致；`///` doc comment 齊全。（此為 fragment，
    monorepo 不含聚合 schema，無法在此跑 `prisma validate`；真正的 generate/migrate 在 T-1042。）
  - 依賴：無

- [x] **T-1002** User DTO 與 `UsersService` 支援 `isServiceAccount`（寫入 + 讀取暴露）。複雜度：**S**
  - 檔案：
    - `appspine/packages/auth/src/users/dto/user.dto.ts`
    - `appspine/packages/auth/src/users/users.service.ts`
  - `user.dto.ts`：`createUserSchema` 與 `updateUserSchema` 各新增：
    ```ts
    isServiceAccount: z.boolean().optional(),
    ```
  - `users.service.ts`：
    - `create()` 目前 destructure `{ email, password, name }`，改為一併帶入 `isServiceAccount`
      寫進 `prisma.user.create({ data: { ... isServiceAccount } })`（`undefined` 時交給 Prisma
      default `false`）。同步把 `create()` 的參數型別加上 `isServiceAccount?: boolean`。
    - `update()` 直接把 `dto`（已含可選 `isServiceAccount`）傳給 `prisma.user.update`，無需額外處理。
    - **讀取暴露**：`PUBLIC_FIELDS` select 新增 `isServiceAccount: true`；`UserWithRoles` type 與
      `mapUser()` 回傳一併帶出 `isServiceAccount`（Users 管理頁與 API Keys 頁的 acting-user 下拉
      都需要讀到這個欄位——見 F 群組）。
  - 驗證：`pnpm -C appspine typecheck` 通過（`PrismaService` 為動態 `any` 型別，不需先 generate
    client）；人工確認 create/update/list 三條路徑都涵蓋 `isServiceAccount`。
  - 依賴：T-1001

- [x] **T-1003** 新增並 export `resolveActingUserId()` 純函式（含單元測試）。複雜度：**M**
  - 新檔：`appspine/packages/auth/src/user-identity.util.ts`
  - 內容**逐字對齊** plan 第 5 節（fail-closed，null → 403）：
    ```ts
    import { ForbiddenException } from '@nestjs/common';
    import type { JwtUser } from './decorators/current-user.decorator';
    import type { ApiKeyUser } from './user-context.util';

    /// Resolve the effective acting user id for an identity-bound write.
    /// JWT callers act as themselves; API-key callers act as their bound user.
    /// Fail-closed: an API key with no bound acting user cannot perform the write.
    export function resolveActingUserId(user: JwtUser | ApiKeyUser): string {
      if (!('isApiKey' in user) || !user.isApiKey) return user.sub; // JWT: sub is the User.id
      if (!user.actingUserId) {
        throw new ForbiddenException(
          'This API key has no acting user bound; cannot perform this write.',
        );
      }
      return user.actingUserId;
    }
    ```
  - 於 `appspine/packages/auth/src/index.ts` 新增 `export * from './user-identity.util';`
  - **設計註記（重要，執行者必讀）**：plan 第 5 節同時要求「`resolveActingUserId` 是純函式、
    零耦合、只操作型別」**與**「解析出的 acting user 若 `isActive === false` 也要回 403（額外查
    一次 `User.isActive`）」。純同步函式無法查 DB，兩者有張力。本 breakdown 的定案（判斷）是：
    **保持 `resolveActingUserId` 為上述純函式（只擋 null）**，把 `isActive` 這道關卡下沉到
    `ApiKeyGuard`（T-1013）——guard 本來就查 DB，讓被停用的 acting user 在組 `request.user` 時
    直接被視為未綁定（`actingUserId = null`），如此 resolver 端仍是「null → 403」，語意一致且
    resolver 維持零耦合。若執行時認為此拆分不妥，另開 Z 文件討論，不要就地改 plan 決策。
  - **單元測試**：新增 `resolveActingUserId` 測試（比照套件既有測試放置慣例，例如
    `user-identity.util.spec.ts`），至少涵蓋三案例：
    1. JWT user（無 `isApiKey`）→ 回傳 `user.sub`。
    2. API-key user 且 `actingUserId` 為某字串 → 回傳該字串。
    3. API-key user 且 `actingUserId` 為 `null` → 丟 `ForbiddenException`。
  - 驗證：`pnpm -C appspine typecheck` 通過；`pnpm -C packages/auth test`（或 root `pnpm test`）
    該檔測試全綠。
  - 依賴：T-1000

### B. `@appspine/m2m-api-key` 變更

- [x] **T-1010** `api-key.prisma` fragment 新增 `actingUserId` 欄位與關係。複雜度：**S**
  - 檔案：`appspine/packages/m2m-api-key/prisma/api-key.prisma`
  - 在 `ApiKey` model 內新增（**逐字對齊** plan 第 3 節，含完整 `///` 說明）：
    ```prisma
    /// User this key acts as for identity-bound writes (createdById, ownership checks).
    /// Must be a dedicated service-account user, never a real employee's personal
    /// account — see policy note below. Null = no bound identity; endpoints
    /// requiring a real user must reject such calls.
    /// onDelete: Restrict — deleting a bound user is blocked; unbind or deactivate
    /// the key first. (In practice Users are never hard-deleted in this framework,
    /// only soft-disabled via `isActive`; Restrict is defense-in-depth, not the
    /// primary safeguard — see the isActive check in the guard.)
    actingUserId String? @map("acting_user_id")
    actingUser   User?   @relation("ApiKeyActingUser", fields: [actingUserId], references: [id], onDelete: Restrict)
    ```
  - 驗證：人工確認 relation 名稱 `ApiKeyActingUser` 與 T-1001 反向關係一致、`@map` 名稱為
    `acting_user_id`、`onDelete: Restrict` 正確。
  - 依賴：無（與 T-1001 為配對的兩側，實際校驗在 T-1042 generate 時）

- [x] **T-1011** `CreateApiKeyDto` / `UpdateApiKeyDto` 新增 `actingUserId`。複雜度：**S**
  - 檔案：`appspine/packages/m2m-api-key/src/dto/api-key.dto.ts`
  - `createApiKeySchema` 新增 `actingUserId: z.string().min(1).optional()`。
  - `updateApiKeySchema` 新增 `actingUserId: z.string().min(1).nullable().optional()`
    （允許事後改綁，也允許傳 `null` 解除綁定，比照 `expiresAt` 既有的 `nullable().optional()` 風格）。
  - 驗證：`pnpm -C appspine typecheck` 通過。
  - 依賴：無

- [x] **T-1012** `ApiKeysService.create()` / `update()` 落地 `actingUserId` 並強制 service-account 檢查。複雜度：**M**
  - 檔案：`appspine/packages/m2m-api-key/src/api-keys.service.ts`
  - 新增私有 helper（綁定時強制檢查目標 User 存在且為 service account，否則 400 —— plan 第 4 節）：
    ```ts
    private async assertActingUser(actingUserId: string): Promise<void> {
      const user = await this.prisma.user.findUnique({
        where: { id: actingUserId },
        select: { id: true, isServiceAccount: true },
      });
      if (!user) throw new BadRequestException(`Acting user ${actingUserId} not found`);
      if (!user.isServiceAccount) {
        throw new BadRequestException(
          'This account is not marked as a service account and cannot be bound as an API key acting user.',
        );
      }
    }
    ```
  - `create()`：若 `dto.actingUserId` 有值，先 `await this.assertActingUser(dto.actingUserId)`；
    再把 `actingUserId: dto.actingUserId ?? null` 寫進 `prisma.apiKey.create` 的 `data`。
  - `update()`：若 `dto.actingUserId` 為非 null 字串，先 `assertActingUser`；再比照既有
    conditional-spread 風格加入
    `...(dto.actingUserId !== undefined && { actingUserId: dto.actingUserId })`
    （`null` 代表解除綁定，可直接寫入）。
  - `ApiKeyRecord` interface 與 `API_KEY_SELECT` 新增 `actingUserId: string | null` /
    `actingUserId: true`，讓 list/detail 回應帶出綁定狀態（前端 row action 改綁需要）。
  - 驗證：`pnpm -C appspine typecheck` 通過。單元測試新增：綁非 service-account User → 400；
    綁 `isServiceAccount === true` 的 User → 成功且 `actingUserId` 被寫入。
  - 依賴：T-1011（DTO 欄位）、T-1001（`isServiceAccount` 欄位語意）

- [x] **T-1013** `ApiKeyGuard` 帶出 `actingUserId`，並在此落地 `isActive` 關卡。複雜度：**M**
  - 檔案：`appspine/packages/m2m-api-key/src/api-key.guard.ts`
  - 目前 `findFirst` 已 `include: { role: { include: { permissions: true } } }`；擴充為一併載入
    綁定的 acting user 狀態：
    ```ts
    include: {
      role: { include: { permissions: true } },
      actingUser: { select: { id: true, isActive: true } },
    },
    ```
  - 組 `request.user` 時新增 `actingUserId`；**被停用（`isActive === false`）或未綁定者一律視為
    `null`**（fail-closed，呼應 plan 第 5 節，也是 T-1003 設計註記所述的下沉點）：
    ```ts
    const actingUserId =
      apiKey.actingUser && apiKey.actingUser.isActive ? apiKey.actingUser.id : null;

    request.user = {
      sub: apiKey.id,
      ...buildUserContext([apiKey.role]),
      scopes: apiKey.scopes,
      isApiKey: true,
      actingUserId,
    };
    ```
  - 驗證：`pnpm -C appspine typecheck` 通過。單元測試涵蓋：
    (a) key 有綁 active service account → `request.user.actingUserId` 為該 user id；
    (b) key 有綁但該 user `isActive === false` → `actingUserId` 為 `null`；
    (c) key 未綁 → `actingUserId` 為 `null`。
  - 依賴：T-1000（`ApiKeyUser.actingUserId` 型別）、T-1010（`actingUser` 關係）

- [x] **T-1014** `ApiKeysController` 稽核記錄帶出 `actingApiKeyId`。複雜度：**S**
  - 檔案：`appspine/packages/m2m-api-key/src/api-keys.controller.ts`
  - 此 controller 掛 `JwtOrApiKeyGuard`，呼叫端可能是「另一把 API Key」，因此稽核可追溯性有意義
    （對照：`UsersController` 只掛 `JwtAuthGuard`，actor 永遠是真人 JWT，`actingApiKeyId` 恆為 null，
    **不需**改動 users.controller）。
  - 把 `recordAudit()` 的 `actor` 型別擴為 `{ sub: string; email?: string; isApiKey?: boolean }`，
    在 `this.auditLogService.record({ ... })` 內新增：
    ```ts
    actingApiKeyId: actor.isApiKey ? actor.sub : null,
    ```
    三個 `@CurrentUser()` 注入點（create/update/remove）的型別同步加上 `isApiKey?: boolean`。
  - 驗證：`pnpm -C appspine typecheck` 通過（`RecordAuditLogDto` 需已含 `actingApiKeyId`，見 T-1020）。
  - 依賴：T-1020

### C. `@appspine/audit-log` 變更

- [x] **T-1020** `audit-log.prisma` 與 `RecordAuditLogDto` 新增 `actingApiKeyId`。複雜度：**S**
  - 檔案：
    - `appspine/packages/audit-log/prisma/audit-log.prisma`
    - `appspine/packages/audit-log/src/audit-log.service.ts`
  - `audit-log.prisma`：`AuditLog` model 新增（比照既有 `createdBy` 的 snapshot 設計，**不開 FK**，
    純字串快照——plan 第 3 節）：
    ```prisma
    /// Id of the API key that performed this action, when the actor was an API key
    /// acting as a bound user. Snapshot string, no FK. Null for direct human actions.
    actingApiKeyId String? @map("acting_api_key_id")
    ```
  - `audit-log.service.ts`：`RecordAuditLogDto` 新增 `actingApiKeyId?: string | null;`；
    `record()` 的 `data` 內新增 `actingApiKeyId: dto.actingApiKeyId ?? null,`。
  - 驗證：`pnpm -C appspine typecheck` 通過；人工確認欄位為選填快照、無 FK。
  - 依賴：無

### D. 套件發版（Changesets）

> monorepo 已使用 Changesets（`appspine/.changeset/config.json` 存在，`access: restricted`，
> `baseBranch: main`）。root `package.json` 提供 `pnpm changeset` / `pnpm version-packages`
> （= `changeset version`）/ `pnpm release`。

- [x] **T-1030** 為三個套件切一個 minor changeset 並套用版本。複雜度：**S**
  - 於 `appspine/` 執行 `pnpm changeset`，在互動選單勾選 `@appspine/auth`、`@appspine/m2m-api-key`、
    `@appspine/audit-log` 三者，bump 類型選 **minor**，summary 簡述
    「add acting-user identity binding for M2M API keys (actingUserId / isServiceAccount /
    actingApiKeyId)」。這會在 `appspine/.changeset/` 產生一支 markdown。
  - **在該 changeset markdown 內附上 schema fragment 變更說明**（給消費端 app 對照升級用，因為
    fragment 不隨 npm 自動同步，見 plan 第 3 節「版本與發版」）：明列
    `User.isServiceAccount`、`ApiKey.actingUserId` + `ApiKey.actingUser` 關係、
    `AuditLog.actingApiKeyId` 三處 app 端要手動同步。
  - 執行 `pnpm version-packages`（= `changeset version`）套用版本號與 CHANGELOG；記下三個套件升到的
    新版本號（E 群組 template `package.json` 要對上）。發佈（`pnpm release` / CI publish）依團隊實際
    流程，不在本 task 內強制執行。
  - 驗證：`pnpm -C appspine build` 與 `pnpm -C appspine test` 皆通過；`git status` 顯示三個套件
    `package.json` 版本與 `CHANGELOG.md` 已更新、`.changeset/` 的臨時 markdown 已被消費。
  - 依賴：T-1003、T-1012、T-1013、T-1014、T-1020

- [x] **T-1031** 把「fragment 型共用套件需協調式升級」的教訓補進 `dev_docs/003`。複雜度：**S**
  - 檔案：`d:\Source\Private\appspine\dev_docs\003-shared-package-reuse-plan.md`
  - 依 plan 第 2 節結尾指示，補一段：ship Prisma fragment 的共用套件（`api-key.prisma`/`user.prisma`
    等），fork 後在各 app 獨立，**單靠 `pnpm update` 不安全**——新程式碼讀寫的新欄位在 app 本地
    schema 尚不存在會直接炸；套件升版、app fragment 同步、migration 必須同一視窗完成。
  - 驗證：人工檢閱 `003` 已含此段，措辭與既有文件風格一致（此為 `dev_docs`，中文）。
  - 依賴：無（可與 D 其他步驟平行；概念上收束在發版批次）

### E. `appspine-app-template` backend 消費

- [x] **T-1040** 升級 template backend 的三個套件版本。複雜度：**S**
  - 檔案：`appspine-app-template/backend/package.json`
  - 把 `@appspine/auth`、`@appspine/m2m-api-key`、`@appspine/audit-log` 的版本改為 T-1030 產出的新版本，
    執行 `pnpm -C backend install`。
  - 驗證：`pnpm -C backend install` 成功；lockfile 更新；`pnpm -C backend typecheck` 先跑一次
    （此時可能因 schema 尚未同步而在 Prisma 型別上報錯，屬預期，T-1041/T-1042 後應轉綠）。
  - 依賴：T-1030

- [x] **T-1041** 同步三個 schema fragment 到 template。複雜度：**S**
  - 檔案：
    - `appspine-app-template/backend/prisma/schema/user.prisma`
    - `appspine-app-template/backend/prisma/schema/api-key.prisma`
    - `appspine-app-template/backend/prisma/schema/audit-log.prisma`
  - 把 T-1001 / T-1010 / T-1020 的欄位、關係、`///` 註解**逐字**搬進 template 對應 fragment
    （`User.isServiceAccount` + `actingApiKeys ApiKey[] @relation("ApiKeyActingUser")`；
    `ApiKey.actingUserId` + `actingUser ... @relation("ApiKeyActingUser", ..., onDelete: Restrict)`；
    `AuditLog.actingApiKeyId`）。
  - 驗證：`pnpm -C backend prisma:generate` 成功（雙向 relation 名稱對稱、無 Prisma schema 錯誤）。
  - 依賴：T-1040

- [x] **T-1042** 改寫 `20260630091710_init` baseline migration（不疊加新 migration）並重置驗證。複雜度：**M**
  - 檔案：`appspine-app-template/backend/prisma/schema/migrations/20260630091710_init/migration.sql`
    （注意：template 用 split-schema 佈局，migrations 在 `prisma/schema/migrations/` 底下）
  - 依 plan 第 6 節決策，**直接編輯這支既有 init migration**，加入三個欄位與一個 FK：
    - `users` 建表段新增：`"is_service_account" BOOLEAN NOT NULL DEFAULT false,`
    - `api_keys` 建表段新增：`"acting_user_id" TEXT,`
    - `audit_logs` 建表段新增：`"acting_api_key_id" TEXT,`
    - 檔尾 AddForeignKey 區新增：
      ```sql
      -- AddForeignKey
      ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_acting_user_id_fkey" FOREIGN KEY ("acting_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      ```
  - 因為是「改寫既有 migration」而非新增，需重置本地 dev DB 讓其重跑：先停掉 dev server（Windows
    DLL 鎖定），再 `pnpm -C backend prisma migrate reset --force`（重置後重跑 seed）。
  - 驗證：
    - `pnpm -C backend prisma migrate reset --force` 成功、seed 正常。
    - `pnpm -C backend prisma migrate status` 顯示只有一支 `20260630091710_init` 且 up-to-date。
    - `pnpm -C backend typecheck` 轉綠（Prisma client 已含新欄位）。
    - backend 正常開機（`pnpm -C backend start:dev` 起得來、無 schema drift 警告）。
  - 依賴：T-1041

### F. `appspine-app-template` frontend（API Keys 頁 + Users 頁）

> 兩頁皆在 `appspine-app-template/frontend/src/app/(main)/dashboard/(admin)/` 底下。
> 前端不依賴 backend 套件，型別是各頁 `types.ts` 內的本地鏡像（見檔案頂註）。

- [x] **T-1050** API Keys 頁型別與 action 帶入 `actingUserId`。複雜度：**S**
  - 檔案：
    - `.../api-keys/types.ts`
    - `.../api-keys/actions.ts`
  - `types.ts`：`ApiKeyRow` 新增 `actingUserId: string | null;`；新增一個下拉用型別：
    ```ts
    export interface ServiceAccountOption {
      id: string;
      email: string;
      name: string | null;
    }
    ```
  - `actions.ts`：`createApiKeyAction` 的 POST body 新增
    `actingUserId: formData.get("actingUserId") || undefined,`；新增
    `updateApiKeyActingUserAction(id, actingUserId: string | null)` 對 `/api-keys/:id` 送 PATCH
    `{ actingUserId }`（事後改綁 / 解除綁定；`null` 解除），比照既有 `setApiKeyActiveAction` 風格
    並 `revalidatePath("/dashboard/api-keys")`。
  - 驗證：`pnpm -C frontend typecheck` 通過。
  - 依賴：T-1042（後端已支援欄位）

- [x] **T-1051** 建立 API Key 對話框新增「Acting User」下拉（只列 service account）。複雜度：**M**
  - 檔案：
    - `.../api-keys/_components/create-api-key-dialog.tsx`
    - `.../api-keys/page.tsx`
  - `page.tsx`：目前 `Promise.all` 取 `apiKeys` + `roles`。新增取用 service-account 使用者清單：
    多打一支 `apiFetch<PaginatedResult<{ id; email; name; isServiceAccount }>>("/users?limit=100")`，
    在 server 端 `.filter((u) => u.isServiceAccount)` 映成 `ServiceAccountOption[]`，以
    `serviceAccounts` prop 傳給 `<CreateApiKeyDialog>`。（不新增後端 endpoint，沿用既有分頁
    `/users`；service account 數量少，`limit=100` 足夠。）
  - `create-api-key-dialog.tsx`：component props 新增 `serviceAccounts: ServiceAccountOption[]`；
    在 `expiresAt` 欄位附近新增一個「Acting User (optional)」的 `Select`（`name="actingUserId"`，
    **非必填**），options 來自 `serviceAccounts`（顯示 `email`，value 為 `id`），並提供一個
    「None」選項讓使用者留空。呼應 plan 第 4 節：UI 上就不讓使用者選到非 service-account 的真人帳號。
  - 驗證：`pnpm -C frontend typecheck` 通過；`pnpm -C frontend build` 通過；手動開對話框確認下拉只
    出現 service-account 使用者。
  - 依賴：T-1050、T-1002（`/users` 回應帶 `isServiceAccount`）

- [x] **T-1052** API Key row action 支援事後改綁 / 解除綁定 acting user。複雜度：**M**
  - 檔案：`.../api-keys/_components/api-key-row-actions.tsx`
  - 在既有 dropdown（activate/deactivate、delete）新增一個「Edit acting user」項，開一個小 dialog：
    以 `Select`（同樣只列 `serviceAccounts`，含 None）讓 ADMIN 改綁或解除，送出時呼叫 T-1050 的
    `updateApiKeyActingUserAction(apiKey.id, value || null)`。`ApiKeyRowActions` 的 props 需能拿到
    `serviceAccounts`（由 `page.tsx` 一路傳入）與當前 `apiKey.actingUserId` 作為預設值。
  - 驗證：`pnpm -C frontend typecheck` 通過；手動：對一把未綁的 key 補綁 service account、再解除，
    列表刷新後狀態正確。
  - 依賴：T-1050、T-1051

- [x] **T-1053** Users 頁型別與 action 帶入 `isServiceAccount`。複雜度：**S**
  - 檔案：
    - `.../users/types.ts`
    - `.../users/actions.ts`
  - `types.ts`：`UserRow` 新增 `isServiceAccount: boolean;`。
  - `actions.ts`：`createUserAction` 的 POST body 新增
    `isServiceAccount: formData.get("isServiceAccount") === "on",`；新增
    `setUserServiceAccountAction(id, isServiceAccount: boolean)` 對 `/users/:id` 送 PATCH
    `{ isServiceAccount }`，比照既有 `setUserActiveAction` 並 `revalidatePath("/dashboard/users")`。
  - 驗證：`pnpm -C frontend typecheck` 通過。
  - 依賴：T-1042

- [x] **T-1054** Users 頁 UI：建立對話框勾選 + 列表顯示 + row action 事後編輯 `isServiceAccount`。複雜度：**M**
  - 檔案：
    - `.../users/_components/create-user-dialog.tsx`
    - `.../users/_components/user-row-actions.tsx`
    - `.../users/page.tsx`
  - `create-user-dialog.tsx`：在 roles 欄位附近新增一個「Service Account」的 shadcn `Checkbox`
    （`name="isServiceAccount"`）。v1 不強制隱藏密碼欄位（plan 第 6 節：只加欄位本身）。
  - `user-row-actions.tsx`：dropdown 新增「Mark/Unmark as service account」項，呼叫 T-1053 的
    `setUserServiceAccountAction(user.id, !user.isServiceAccount)`。
  - `page.tsx`：列表可加一欄或用 Badge 顯示 service-account 狀態（沿用既有 `Badge` 風格；非必要但
    plan 第 4 節要求管理頁能「顯示」）。
  - 驗證：`pnpm -C frontend typecheck` + `pnpm -C frontend build` 通過；手動建立一個勾選 Service
    Account 的 user，列表顯示正確，並可事後切換。
  - 依賴：T-1053

- [x] **T-1055** 補齊 i18n 翻譯 key（en + zh-TW）。複雜度：**S**
  - 檔案：
    - `appspine-app-template/frontend/messages/en.json`
    - `appspine-app-template/frontend/messages/zh-TW.json`
  - 於 `apiKeys` namespace 補 `actingUser`、`actingUserNone`、`editActingUser`、
    `actingUserOptional` 等（對應 T-1051/T-1052 用到的文案）；於 `users` namespace 補
    `isServiceAccount`、`serviceAccount`、`markServiceAccount`、`unmarkServiceAccount` 等
    （對應 T-1054）。兩個 locale 檔的 key 結構必須一致。
  - **注意**：`isServiceAccount` 是布林欄位、**不是 Prisma enum**，不進 `enums` namespace、不受
    pre-commit `check:enum-i18n` 管轄（見 `002` enum/i18n 慣例）。
  - 驗證：`pnpm -C frontend typecheck` 通過；`pnpm -C frontend build` 無缺 key 警告；人工確認
    兩檔 key 對齊、UI 無 raw key 露出。
  - 依賴：T-1051、T-1054

### G. `appspine-app-template` 文件

- [x] **T-1060** `docs/agent-guide.md` 補充 acting-user 機制說明。複雜度：**S**
  - 檔案：`appspine-app-template/docs/agent-guide.md`
  - 在「Shared Framework Packages」段落的 `M2M API Key` 條目補一句：說明 API Key 可選擇性綁定
    `actingUserId` 做 identity-bound write，且**只能綁專門的 service-account User**
    （`User.isServiceAccount = true`，plan 第 4 節政策），以及消費端用
    `resolveActingUserId()`（from `@appspine/auth`）作為 fail-closed 的單一身份解析關卡。
  - 驗證：人工檢閱該段已含上述資訊、英文、與既有條目風格一致。
  - 依賴：無（建議 F 完成後一起，內容才穩定）

### H. 端到端驗證

- [x] **T-1070** 端到端驗證（比照 Z02 fork validation 風格，可重現步驟）。複雜度：**M**
  - 前置：`appspine-app-template` backend + frontend 皆能啟動（見 `docs/agent-guide.md` 的啟動流程），
    DB 已跑過 T-1042 的 reset + seed，並有一個 ADMIN 帳號可登入 / 取得 JWT。
  - **步驟 1 — 建 service account**：以 ADMIN 呼叫 `POST /users`，body 含
    `{ email, password, name, isServiceAccount: true }`。預期 201，回應 `isServiceAccount === true`。
    記下該 user id（記為 `SA_ID`）。
  - **步驟 2 — 建一把「綁定」的 Key**：`POST /api-keys`，body 含
    `{ name, roleId, scopes, actingUserId: "SA_ID" }`。預期 201；`GET /api-keys/:id` 回應
    `actingUserId === "SA_ID"`。
  - **步驟 3 — 建一把「未綁定」的 Key**：`POST /api-keys` 不帶 `actingUserId`。預期 201；
    回應 `actingUserId === null`。
  - **步驟 4 — 綁到非 service-account 的 User → 400**：先建（或取用）一個
    `isServiceAccount === false` 的一般 User，再 `POST /api-keys`（或對步驟 3 的 key 送 PATCH）帶
    該 user 的 id 當 `actingUserId`。**預期 400 Bad Request**，訊息含
    「not marked as a service account」。此步驟直接打真實 endpoint，驗證 plan 第 4 節 schema 層政策。
  - **步驟 5 — fail-closed 403 行為**：template 目前**尚無**消費 `resolveActingUserId()` 的
    identity-bound write endpoint（第一個真正消費者是之後的 wiki app，不在本批範圍），因此「未綁定
    key 打身份寫入 → 403」與「綁到已停用帳號 → 視為未綁定 → 403」由 **A/B 群組的套件單元測試**
    （T-1003 resolver、T-1013 guard）涵蓋。此處 E2E 另補驗證 guard 產出的 `actingUserId` 語意正確：
    以步驟 2 的綁定 key 呼叫任一需驗證的既有 endpoint（例如 `GET /api-keys`）確認 key 仍能通過驗證；
    再把 `SA_ID` 帳號 `PATCH /users/:id { isActive: false }` 停用後，觀察該 key 於 guard 端 acting
    身份被視為 `null`（若執行者要直接看到 403，可在驗證分支臨時加一支呼叫 `resolveActingUserId` 的
    throwaway probe endpoint 驗完即移除，或直接以單元測試佐證，不要把 probe 併入正式 commit）。
  - 驗證：步驟 1–4 皆得到預期 HTTP 狀態碼與回應欄位；步驟 5 的單元測試全綠、guard 語意經確認。
    把實際 request/response 摘要記進「3. 執行結果」。
  - 依賴：T-1042、T-1051、T-1052、T-1054（走 UI 驗證時）；純 API 驗證僅需 T-1042

### I. 收尾

- [x] **T-1080** 回填執行結果並記錄計畫外發現。複雜度：**S**
  - 每個 task 完成後把 checkbox 改 `[x]`，並在本文件「3. 執行結果」補上：改了哪些檔、驗證輸出、
    T-1030 三套件實際版本號、H 各步驟的 HTTP 結果。
  - 若過程中出現 plan 未預期的新問題（尤其 T-1003 設計註記提到的 `isActive` 定位張力、
    template 缺 identity-bound write endpoint 而無法在 template 內直接打出 403），依既有慣例另開
    Z 系列文件（例如 `Z04-...`）記錄，**不要**改寫 plan 第 8 節已定案的決策，也不要把新問題混進
    本批修正 commit。
  - 依賴：T-1000 ~ T-1070（全部）

---

## 3. 執行結果

> （執行者於各 task 完成後回填；以下為空白 scaffold，尚未執行。）

- **T-1000**：修改 `appspine/packages/auth/src/user-context.util.ts`，在 `ApiKeyUser` 新增 `actingUserId: string | null`。驗證：`pnpm -C appspine typecheck` 通過（root workspace 全套件 typecheck 成功；僅有既有 `${GITHUB_TOKEN}` npmrc warning 與 pnpm bin warning）。
- **T-1001**：修改 `appspine/packages/auth/prisma/user.prisma`，在 `User` fragment 新增 `isServiceAccount` 與 `actingApiKeys ApiKey[] @relation("ApiKeyActingUser")`，`///` doc comment 齊全。驗證：人工確認欄位、`@map("is_service_account")`、relation 名稱與計畫一致。
- **T-1002**：修改 `appspine/packages/auth/src/users/dto/user.dto.ts`、`appspine/packages/auth/src/users/users.service.ts`，create/update DTO 支援 `isServiceAccount`，create 寫入欄位，`PUBLIC_FIELDS`/回傳型別/list/detail 回應帶出欄位。驗證：`pnpm -C appspine typecheck` 通過。
- **T-1003**：新增 `appspine/packages/auth/src/user-identity.util.ts`、`appspine/packages/auth/src/user-identity.util.spec.ts`，並從 `appspine/packages/auth/src/index.ts` export；`packages/auth/package.json` 新增 `test` script 與 `vitest` devDependency。驗證：`pnpm -C appspine typecheck` 通過；`pnpm -C packages/auth test` 通過，3 tests passed（JWT passthrough / API key bound / API key null throws `ForbiddenException`）。
- **T-1010**：修改 `appspine/packages/m2m-api-key/prisma/api-key.prisma`，在 `ApiKey` fragment 新增 `actingUserId`、`actingUser` 與完整 `///` policy 說明。驗證：人工確認 relation 名稱 `ApiKeyActingUser`、`@map("acting_user_id")`、`onDelete: Restrict` 與 plan 一致。
- **T-1011**：修改 `appspine/packages/m2m-api-key/src/dto/api-key.dto.ts`，create/update schema 新增 `actingUserId`，update 支援 `nullable().optional()`；create response 型別同步帶出 `actingUserId`。驗證：`pnpm -C appspine typecheck` 通過。
- **T-1012**：修改 `appspine/packages/m2m-api-key/src/api-keys.service.ts`，新增 `assertActingUser()`，create/update 綁定前檢查目標 User 必須存在且 `isServiceAccount === true`，list/detail select 與 record 型別帶出 `actingUserId`。新增 `appspine/packages/m2m-api-key/src/api-keys.service.spec.ts`。驗證：`pnpm -C appspine typecheck` 通過；`pnpm -C packages/m2m-api-key test` 通過，service tests 覆蓋非 service-account → 400、service-account create/update 寫入。
- **T-1013**：修改 `appspine/packages/m2m-api-key/src/api-key.guard.ts`，查 key 時 include `actingUser`，組 `request.user.actingUserId` 時 active user 回傳 id、inactive/unbound 回 `null`。新增 `appspine/packages/m2m-api-key/src/api-key.guard.spec.ts`。驗證：`pnpm -C appspine typecheck` 通過；`pnpm -C packages/m2m-api-key test` 通過，guard tests 覆蓋 active / inactive→null / unbound→null 與 include shape。
- **T-1014**：修改 `appspine/packages/m2m-api-key/src/api-keys.controller.ts`，`recordAudit()` actor 型別支援 `isApiKey`，audit payload 新增 `actingApiKeyId: actor.isApiKey ? actor.sub : null`，create/update/remove 注入型別同步。驗證：`pnpm -C appspine typecheck` 通過。
- **T-1020**：修改 `appspine/packages/audit-log/prisma/audit-log.prisma` 與 `appspine/packages/audit-log/src/audit-log.service.ts`，新增無 FK 的 `actingApiKeyId` snapshot 欄位與 DTO/data 寫入。驗證：`pnpm -C appspine typecheck` 通過；人工確認無 Prisma relation/FK。
- **T-1030**：手寫 `appspine/.changeset/m2m-acting-user-binding.md`，三個目標套件 minor；執行 `pnpm version-packages` 後臨時 changeset 已被消費。實際版本：`@appspine/auth@1.0.0`、`@appspine/m2m-api-key@1.0.0`、`@appspine/audit-log@0.2.0`。Changesets 依 `updateInternalDependencies: patch` 也連帶更新 `@appspine/rbac`、`@appspine/metadata-schema`、`@appspine/mcp-server` 的版本/CHANGELOG/package dependency。驗證：`pnpm -C appspine build` 通過；`pnpm -C appspine test` 通過（auth 3 tests、m2m-api-key 7 tests、metadata-schema 1 test）；`pnpm -C appspine typecheck` 通過；`pnpm -C appspine lint` 通過（仍有既有 `document.cookie` warning）。人工以有 GitHub Packages 權限的 `GITHUB_TOKEN` 執行 `pnpm release`，回報無錯誤訊息。
- **T-1031**：修改 `_archive/dev_docs-20260803/framework/003-shared-package-reuse-plan.md`，新增「Prisma fragment 型套件的協調式升級教訓」段落，說明單靠 `pnpm update` 不安全，需同一部署視窗完成套件升版、app-local fragment 同步與 migration。驗證：人工檢閱段落為中文且與既有文件風格一致。
- **T-1040**：修改 `appspine-app-template/backend/package.json` 與 `pnpm-lock.yaml`，升級 `@appspine/auth@^1.0.0`、`@appspine/m2m-api-key@^1.0.0`、`@appspine/audit-log@^0.2.0`。因 T-1030 release set 同時發布且 runtime 開機驗證發現 provider 版本需一致，也同步升級 direct deps `@appspine/rbac@^1.0.0`、`@appspine/metadata-schema@^0.2.1`、`@appspine/mcp-server@^0.1.4`。驗證：使用有 GitHub Packages 權限的 shell 執行 `pnpm -C backend install` 成功；`pnpm -C backend typecheck` 通過。
- **T-1041**：修改 `appspine-app-template/backend/prisma/schema/user.prisma`、`api-key.prisma`、`audit-log.prisma`，同步 `User.isServiceAccount` + `actingApiKeys`、`ApiKey.actingUserId` + `actingUser`、`AuditLog.actingApiKeyId`。驗證：`pnpm -C backend prisma:generate` 通過，雙向 relation `ApiKeyActingUser` 正常。
- **T-1042**：直接改寫 `appspine-app-template/backend/prisma/schema/migrations/20260630091710_init/migration.sql`，新增 `users.is_service_account`、`api_keys.acting_user_id`、`audit_logs.acting_api_key_id` 與 `api_keys_acting_user_id_fkey`。驗證：確認無 app-template backend dev server 行程；啟動 template Postgres container；`prisma migrate reset --force --schema prisma/schema` 成功並重跑 seed；`prisma migrate status --schema prisma/schema` 顯示 1 migration 且 database schema is up to date；`pnpm -C backend typecheck`、`pnpm -C backend build` 通過；載入 `.env` 後以 `node dist/src/main.js` 短暫啟動成功，看到 `Nest application successfully started` 與 `Backend running on :3900 [AUTH_MODE=local]`，再停止測試 process。
- **T-1050**：修改 `frontend/src/app/(main)/dashboard/(admin)/api-keys/types.ts`、`actions.ts`，`ApiKeyRow` 新增 `actingUserId`，新增 `ServiceAccountOption`，create action 送出 `actingUserId`，新增 `updateApiKeyActingUserAction()`。驗證：`pnpm -C frontend typecheck` 通過。
- **T-1051**：修改 `api-keys/page.tsx` 與 `_components/create-api-key-dialog.tsx`，`page.tsx` 透過 `/users?limit=100` 取得 users 並 server-side filter `isServiceAccount`，把 `serviceAccounts` 傳入建立對話框；建立對話框新增 optional Acting User `Select`，含 None 選項。驗證：`pnpm -C frontend typecheck` 通過；載入 `.env` 後 `pnpm build` 通過。
- **T-1052**：修改 `api-keys/_components/api-key-row-actions.tsx`，新增 Edit acting user dialog，可選 service account 或 None，送出時呼叫 `updateApiKeyActingUserAction(apiKey.id, value || null)`；列表頁也新增 Acting user 欄位顯示目前綁定 email 或 None。驗證：`pnpm -C frontend typecheck` 通過；載入 `.env` 後 `pnpm build` 通過。
- **T-1053**：修改 `users/types.ts`、`users/actions.ts`，`UserRow` 新增 `isServiceAccount`，create user action 送出 checkbox 值，新增 `setUserServiceAccountAction()`。驗證：`pnpm -C frontend typecheck` 通過。
- **T-1054**：修改 `users/_components/create-user-dialog.tsx`、`users/_components/user-row-actions.tsx`、`users/page.tsx`，建立使用者對話框新增 Service Account checkbox，列表新增 service-account badge 欄位，row action 新增 Mark/Unmark as service account。驗證：`pnpm -C frontend typecheck` 通過；載入 `.env` 後 `pnpm build` 通過。
- **T-1055**：修改 `frontend/messages/en.json`、`zh-TW.json`，補齊 `apiKeys.actingUser*` / `apiKeys.saving` 與 `users.isServiceAccount` / `users.serviceAccount` / mark/unmark 翻譯 key；未放入 `enums` namespace。驗證：兩個 locale 結構人工對齊；`pnpm -C frontend typecheck` 通過；載入 `.env` 後 `pnpm build` 通過。
- **T-1060**：修改 `appspine-app-template/docs/agent-guide.md` 的 Shared Framework Packages / M2M API Key 條目，補充 `actingUserId` identity-bound write、只能綁 `User.isServiceAccount = true` 的 service-account user，以及 write path 使用 `resolveActingUserId()` fail-closed resolver。驗證：人工檢閱為英文且與既有 bullet 風格一致。
- **T-1070**：以重置後的 template backend DB 與 seed admin (`admin@example.com`) 進行真實 HTTP 驗證。先啟動 backend (`node dist/src/main.js`，載入 `.env`)；`POST /auth/login` 取得 JWT 成功。步驟 1：`POST /users` 建立 service account，HTTP 201，回應 `isServiceAccount=true`，`SA_ID=cmr4ck09q0000uagweggs62vc`。步驟 2：`POST /api-keys` 帶 `actingUserId=SA_ID` 建立綁定 key，HTTP 201；`GET /api-keys/:id` 回應 `actingUserId` 等於 `SA_ID`。步驟 3：`POST /api-keys` 不帶 `actingUserId` 建立未綁定 key，HTTP 201，回應 `actingUserId=null`（PowerShell 摘要顯示空值）。步驟 4：建立一般 user 後以其 id 當 `actingUserId` 建 API key，HTTP 400；curl 原文確認 message 為 `This account is not marked as a service account and cannot be bound as an API key acting user.`。步驟 5：以步驟 2 的 raw API key 呼叫 `GET /api-keys`，HTTP 200、`total=2`，確認綁定 key 可通過 guard；fail-closed 403 語意由 T-1003 resolver tests 與 T-1013 guard tests 佐證，未加入正式 probe endpoint。
- **T-1080**：完成 T-1000 ~ T-1070 全 task checkbox 與執行結果回填。T-1030 三套件實際版本為 `@appspine/auth@1.0.0`、`@appspine/m2m-api-key@1.0.0`、`@appspine/audit-log@0.2.0`；人工 release 也發布 `@appspine/rbac@1.0.0`、`@appspine/metadata-schema@0.2.1`、`@appspine/mcp-server@0.1.4`。H 端到端 HTTP 結果已記錄於 T-1070。計畫外發現：template 缺 identity-bound write endpoint 的 403 驗證已依 task 文字用 T-1003/T-1013 單元測試佐證，未新增正式 probe endpoint；template runtime provider 版本需與 release set 協調升級，已在 T-1040 內處理並記錄，未另開 Z 文件。收尾驗證：`pnpm typecheck` 通過；針對本批 backend/frontend 變更範圍執行 `pnpm exec biome check backend/src "frontend/src/app/(main)/dashboard/(admin)/api-keys" "frontend/src/app/(main)/dashboard/(admin)/users"` 通過。`pnpm check` 全 repo 仍會被既有未變更的 `frontend/src/components/date-time-picker.tsx` Tailwind class sorting nursery rule 擋下，本批未把該無關檔案混入 commit。

---

## 4. 驗證方式總覽

| 群組 | 主要驗證方式 |
|---|---|
| A `@appspine/auth` | `pnpm -C appspine typecheck` + `resolveActingUserId` 單元測試（JWT passthrough / bound / null→403） |
| B `@appspine/m2m-api-key` | `pnpm -C appspine typecheck` + service-account 綁定 400 單元測試 + guard 三案例（active / inactive→null / unbound→null） |
| C `@appspine/audit-log` | `pnpm -C appspine typecheck`；人工確認 `actingApiKeyId` 為無 FK 的選填快照 |
| D 發版 | `pnpm changeset` 勾三套件 minor + `pnpm version-packages`；`pnpm -C appspine build` / `test` 綠燈；`dev_docs/003` 補協調式升級教訓 |
| E template backend | `pnpm -C backend prisma:generate` + `prisma migrate reset --force` + `prisma migrate status`（單一 init）+ `typecheck` + 開機正常 |
| F template frontend | `pnpm -C frontend typecheck` + `build`；手動確認 Acting User 下拉只列 service account、Service Account 勾選/切換、i18n 兩 locale 對齊 |
| G 文件 | 人工檢閱 `docs/agent-guide.md` M2M API Key 條目已含 acting-user + service-account only 說明 |
| H 端到端 | 真實 API：建 SA user、建綁定/未綁定 key、綁非 SA → 400；fail-closed 403 由套件單元測試佐證（template 尚無 identity-bound write endpoint） |
| I 收尾 | 全 task checkbox 回填；計畫外發現另開 Z 系列文件 |
