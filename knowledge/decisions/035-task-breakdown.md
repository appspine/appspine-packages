---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-07-30
updated: 2026-08-05
---

# 035 - 廢止 Local Auth，統一以 OIDC 為身份來源 Task Breakdown

> 狀態：**已全數完成（21/21，2026-07-30）**——Group A~D 全數完成並已逐一 commit、e2e 驗證通過；
> T-12630（`apps/org`）執行中途經使用者指示改為刪除（已由 `apps/master-data` 取代），未依原計畫
> 切換成 OIDC，詳見該 task 本文；T-12660 的框架文件收尾（含本檔案的完成狀態回填）已完成。
>
> 依照 `_archive/dev_docs-20260803/framework/035-oidc-only-auth-plan.md`（2026-07-30 建立並全數拍板，含
> Opus 獨立審查後的修正）執行，**必須與該 plan 併讀**。
>
> 複雜度標記：**S** = 半天內、**M** = 1–2 天、**L** = 3 天以上。

---

## 1. 執行原則

- **範圍**：只做 plan §3「做」列出的項目——`@appspine/auth` 套件改動、開發用 Keycloak、前端
  OIDC 登入流程、9 個既有 App 切換、退場清除、`appspine-app-template` 同步。**不擴大**到
  plan §3「明確不做」的範圍（正式環境 IdP 選型、Enterprise-Managed Authorization/ID-JAG、跟
  `apps/org` 的雙向同步）。
- **Pilot-first**：Group C（前端 OIDC 流程）跟 Group D（App 逐一切換）都先在**一個 pilot App**
  做完整驗證，確認可行後才把模式套用到其餘 App——不要一次對 9 個 App 同時展開，這是 plan §4.4
  已經記錄的執行順序考量。
- **執行順序不完全等於 Group 字母順序**：T-12645（拿掉 `bcrypt`/`JWT_SECRET` 基礎設施）雖然
  編號落在 Group D 的 checkbox 清單裡，但依賴的是 9 個 App 全部完成，實際會晚於整個 Group D；
  T-12650（template 同步）依賴改成 T-12502/T-12550，實際會早於 Group D 大部分 task 完成——
  兩者都是 Opus 審查後的順序修正，執行時以每個 task 自己列的「依賴」為準，不要照 Group 字母
  或 task 編號大小假設執行順序。
- **`@appspine/auth` 是共用套件，`@appspine/frontend-shell` 也是**：Group A 的改動會影響全部
  9 個 App 的後端，T-12550 對 `@appspine/frontend-shell` 的改動會影響全部 9 個 App 的前端。
  發版後要留意 `framework/Z10-mcp-server-transitive-version-mismatch.md`／`Z07` 記錄過的
  「共用套件版本 cascade」問題——每個 App 的 `package.json` 對這兩個套件的版本要跟著這次改動
  一起升級，不要只改一個 App。
- **coding 慣例（依 002）**：程式碼/註解/commit message 一律英文、Conventional Commits、禁止
  `git add -A`、禁止 `--no-verify`，commit 前 `tsc --noEmit` + `biome check` 必過；Prisma model
  變更必附 `///` 文件註解、migrate 明確帶 `--name`。
- **前端品質不可打折**：Group C 的登入頁改動是使用者第一個接觸點，loading/error 狀態、
  en + zh-TW i18n 要齊備，必須在瀏覽器裡實際跑過驗證，不接受只靠型別檢查就算完成。
- **計畫外問題處理**：執行中若發現 plan 未預期的新問題，依既有慣例另開 `Z0x-...` 記錄文件，
  不要順手擴大範圍或改動不在本計畫範圍內的共用套件。

---

## 2. Task Breakdown

### A. 套件層：`@appspine/auth` + 執行風險補強（plan §2、§3、§4.2、§4.7）

- [x] **T-12500** JIT provisioning：`buildOidcJwtUser` 找不到本地 User 時自動建立
  （不設白名單，見 plan §4.2）。複雜度：**M**。
  - `appspine/packages/auth/src/jwt-verifier.service.ts`：`buildOidcJwtUser` 目前找不到
    `user` 就丟 `UnauthorizedException`（第 35-37 行）；改成呼叫 `UsersService` 建立新
    `User`（`email`/`name` 取自 OIDC token claim），套用跟 `UsersService.create()` 沒傳
    `roleIds` 時相同的預設角色邏輯（`SYSTEM_USER_ROLE`）。**不加 email 網域白名單**——OIDC
    token 驗證通過即視為 IdP 已確認身份，appspine 端不重複把關（實際把關落在 T-12530 的
    per-client realm 存取限制）。
  - 併發處理：`UsersService.create()` 目前是先 `findUnique` 查重、查到就丟
    `ConflictException`（不是靠 Prisma 的 `P2002` unique violation）——JIT provisioning 呼叫
    這個方法時要 catch 住 `ConflictException`，再重新 `findByEmail` 一次拿到別的並發請求剛建好
    的那筆，不要假設會收到 `P2002`。
  - 驗證：單元測試涵蓋「本地無 User → 自動建立且套用預設角色」「同 email 併發登入 → 其中一個
    請求撞到 `ConflictException` 後改走查詢、不拋未預期例外」「本地已有 User → 沿用既有邏輯
    不受影響」。
  - 依賴：無

- [x] **T-12502** 修正 `seed.ts` 移除密碼寫入（template + 9 個 App 同步，plan §4.6/§4.7 已拍板，
  Opus 審查發現原規劃遺漏）。複雜度：**M**。
  - `appspine-app-template/backend/prisma/seed.ts` 與 9 個 App 各自的副本：目前都會
    `bcrypt.hash(SEED_USER_PASSWORD, 12)` 並寫回 `password` 欄位——這是 Group D「資料庫砍掉
    重建」這個決定能不能成立的前提，不修這裡的話 reseed 會馬上重新產生一筆 bcrypt hash。
  - 移除密碼雜湊/寫入邏輯，`SEED_USER_PASSWORD` 環境變數與其在各 App `.env`/`.env.example`
    的宣告一併移除（seed user 改成不帶密碼建立，走跟 4.7.1 一樣的「password 選填」）。
  - **必須在任何一個 App 執行 Group D 的資料庫重建步驟之前完成**——這是 T-12560/T-12570~
    T-12640 的前置依賴，不是可以晚點補的細節。
  - 驗證：每個 App `pnpm prisma:seed` 成功執行、產生的 seed user 不帶密碼、`tsc --noEmit`
    通過。
  - 依賴：無（可與 T-12500 平行，但必須先於 Group D 任何一個 task）

- [x] **T-12505** `users.controller.ts`／`user.dto.ts` 的 `password` 改為選填 + 同步 service
  account 建立腳本（plan §4.7.1/§4.7.3 已拍板，Opus 審查發現原規劃遺漏）。複雜度：**M**。
  - `appspine/packages/auth/src/users/users.controller.ts` 的 `POST /users` 與
    `users/dto/user.dto.ts` 的 `createUserSchema`：`password` 從必填改為選填（呼應
    `User.password` 本來就是 `String?`）。這條端點是 `UsersService.create()` 的第二個呼叫端，
    T-12510 移除密碼必填邏輯時若沒改到這裡會編譯不過。
  - 盤點 `apps/calendar` 的 `provision-service-account.mjs`，以及其他 App 是否有等效的
    service account 建立腳本（目前只確認 calendar 有，其餘 8 個 App 須逐一確認）——這類腳本
    會用 `JWT_SECRET` 簽 admin token、呼叫 `POST /users` 並帶密碼建立 `isServiceAccount`
    帳號。改成不帶密碼呼叫。**Service account 不經過 OIDC 登入**（只透過
    `@appspine/m2m-api-key` 的 `ApiKey.actingUserId` 被使用），JIT provisioning 對它們沒有
    意義，不需要額外設計新機制。
  - 驗證：`tsc --noEmit`／`biome check` 全過；`POST /users` 不帶 `password` 呼叫成功建立
    使用者；找到的 service account 建立腳本重新執行成功。
  - 依賴：無（可與 T-12500 平行）

- [x] **T-12510** 移除 local auth 程式碼路徑。複雜度：**S**。
  - `appspine/packages/auth/src/auth.controller.ts`：移除 `/auth/register`、`/auth/login`
    兩個端點（含 `AUTH_MODE === 'oidc'` 時丟 404 的過渡判斷——整個路徑不再存在，不需要判斷）。
  - `appspine/packages/auth/src/strategies/local.strategy.ts`：整個檔案移除。
  - `appspine/packages/auth/src/auth.module.ts`：移除 `ActiveStrategy` 的 local/oidc 二選一
    邏輯（第 18 行），固定只註冊 `OidcStrategy`。
  - `appspine/packages/auth/src/jwt-verifier.service.ts`：移除 `verifyLocalJwtToken`、
    `AUTH_MODE` 分支判斷，`verifyJwtToken` 固定走 OIDC 驗證路徑。
  - `appspine/packages/auth/src/users/users.service.ts`：`create()` 移除 `password` 必填
    參數與 bcrypt 相關邏輯（改給 T-12500 的 JIT provisioning、T-12505 的 `POST /users` 呼叫，
    兩者都不再需要密碼）。
  - 驗證：`tsc --noEmit`／`biome check`／既有單元測試（`auth.controller.spec.ts`、
    `local.strategy.spec.ts` 等隨之移除或改寫）全過。
  - 依賴：T-12500（JIT provisioning 要先能跑，才能安全拿掉「建 User 只能透過 register」這條
    唯一路徑）、T-12505（`users.controller.ts` 的 `password` 選填要先改好，不然這裡拿掉
    `UsersService.create()` 的密碼參數會讓 T-12505 那條路徑編譯不過）

- [x] **T-12515** `apps/chat` 的 `ws-jwt-verifier.service.ts` 同步 OIDC-only + JIT
  provisioning（plan §4.7.2 已拍板，Opus 審查發現原規劃遺漏）。複雜度：**M**。
  - `apps/chat/backend/src/chat/ws-jwt-verifier.service.ts` 是完全獨立於 `@appspine/auth`
    之外的平行實作（WebSocket 連線專用），有自己的 `AUTH_MODE` 分支、自己的 `JWT_SECRET`
    fallback（`process.env.JWT_SECRET ?? "dev-secret"`）、自己的「找不到 User 就丟 401」的
    `buildOidcJwtUser`——這是 T-12645（見 Group D 之後）原本要盤點「還有誰在用 JWT_SECRET」時
    會撞到的那個消費者。
  - 套用跟 T-12500/T-12510 相同的邏輯：移除 local 分支、加上 JIT provisioning、驗證通過的
    OIDC token 才能建立 WebSocket 連線。
  - 驗證：`tsc --noEmit`／`biome check` 通過；WebSocket 連線帶 OIDC access token 能成功建立、
    首次連線的使用者被 JIT 自動建立。
  - 依賴：T-12500（JIT provisioning 的邏輯要先在 `@appspine/auth` 端驗證過，這裡是同步套用同
    一套邏輯，不是重新設計）

- [x] **T-12520** `User.password` schema 欄位文件註解收尾。複雜度：**S**。
  - `appspine-app-template/backend/prisma/schema/user.prisma`：欄位本來就是 `String?`
    （nullable），更新欄位的 `///` 文件註解，說明「local auth 已廢止，此欄位保留僅供 schema
    相容，新程式碼不得寫入——實際清除各 App 資料靠 T-12502（seed.ts 不再寫入）+ Group D
    每個 App 切換 task 的資料庫重建」——**不刪欄位本身**，刪欄位是破壞性 migration，跨 9 個
    App 執行風險高，價值有限（nullable 欄位放著不影響任何查詢）。
  - 驗證：文件註解已更新、`pnpm schema:docs` 重新產生 data dictionary。
  - 依賴：T-12510

### B. 開發環境基礎設施（plan §4.3）

- [x] **T-12530** 新增共用 dev Keycloak docker-compose（repo 根目錄 `dev-infra/`，realm/client
  命名慣例見 plan §4.3 已拍板）。複雜度：**L**（原估 M，Opus 審查後發現 mapper／存取限制的
  設定工作量比原估重）。
  - 新增 `dev-infra/docker-compose.yml`，內含 Keycloak service + 一個預先匯入的 dev realm
    （`docker run` 掛載 realm export JSON，避免每個開發者手動點過 admin console）。Realm 名稱
    固定為 `appspine-dev`；9 個 App 各自登記一個 OIDC client，client ID 直接用 App 資料夾名稱
    （`wiki`／`calendar`／`drive`／`chat`／`project`／`approve`／`mcp-gateway`／`org`／
    `master-data`）。
  - **每個 client 設定 audience mapper + email/profile mapper**（plan §4.3 補充，Opus 審查
    發現原規劃遺漏）：Keycloak 預設不會把 client ID 放進 access token 的 `aud`，`email` 也
    不會出現在 access token 裡，兩者都要手動加 mapper。沒設的話 `jwt-verifier.service.ts` 的
    `verifyOidcSignature`（檢查 audience）跟 `buildOidcJwtUser`（讀 email claim）會讓 9 個
    App 全部 401。
  - **每個 client 設定 group/role-based 存取限制**（plan §4.2 釐清，Opus 審查發現原規劃
    遺漏）：JIT provisioning 不設白名單（T-12500）的前提是「把關交給 IdP」，這句話要這裡設定
    了才成立——沒設的話任何 Keycloak 使用者都能自動在全部 9 個 App 拿到帳號。
  - dev realm 內預建至少 2-3 個測試使用者（不同角色，且分屬不同 client 存取群組，才能驗證
    上面的存取限制真的有生效），供 Group C/D 驗證用。
  - 撰寫 `dev-infra/README.md`：怎麼啟動、怎麼確認 Keycloak 已就緒（health check）、
    `OIDC_JWKS_URL`/`OIDC_ISSUER`/`OIDC_AUDIENCE` 對應到 `appspine-dev` realm 的值、9 個
    client ID 對照表、mapper 與存取限制的設定方式（供之後新增 App 時參照）。這份文件是
    Group D 每個 App README 指標行的連結目標，內容要完整。
  - 驗證：`docker compose up` 後能開啟 Keycloak admin console、dev realm 與測試使用者存在、
    能用 Keycloak 內建的 OIDC playground 或 `curl` 手動走一次 Authorization Code flow 拿到
    token，token 內容含正確的 `aud`/`email`；用一個沒被授權存取某 client 的測試使用者嘗試對
    該 client 拿 token，確認被拒絕。
  - 依賴：無（可與 Group A 平行）

### C. 前端：OIDC 登入流程（plan §4.1 已拍板：`next-auth`）

- [x] **T-12540** `apps/mcp-gateway` 前端 OIDC 登入流程 PoC（`next-auth`）。複雜度：**L**
  （Opus 審查後確認範圍比原估更廣，見下方修正）。依賴 T-12530（要有 dev Keycloak 可對接）。
  - `apps/mcp-gateway/frontend/src/app/(external)/login/page.tsx` 的 email/password 表單，
    換成 `next-auth` 的 OIDC provider 設定（導向 Keycloak 登入頁 → callback route 換 token →
    httpOnly cookie session）。
  - **範圍修正（plan §4.1 已更正）**：`next-auth` 管的是它自己的 session，**不會**自動處理
    upstream Keycloak access token 的 refresh，要自己寫 `jwt` callback 把 access token 取出來
    存住；後端 `OidcStrategy` 要驗證的是這個 Keycloak access token（Bearer），不是 next-auth
    的 session cookie，兩者要串起來。除了 `login/page.tsx`，以下檔案都要跟著調整：
    `server/auth-cookie.ts`、`api-client.ts`（呼叫後端 API 時要帶 Keycloak access token，不是
    session cookie）、`server/auth-actions.ts`、`middleware.ts`（現有 `AUTH_COOKIE_NAME` 判斷
    要換成 next-auth 的 session 判斷）。
  - 這是全新的工程工作（目前後端 `OidcStrategy` 只驗證已拿到手的 token，前端完全沒有取得
    token 的流程），第一次接 `next-auth` 到現有 Next.js App Router 專案結構、且要串接兩層
    token（next-auth session + Keycloak access token），預期會需要來回調整。
  - 驗證：在瀏覽器實際走一次「未登入 → 導去 Keycloak → 輸入 dev realm 測試帳密 → 回跳
    pilot App → 已登入且能看到依角色顯示的畫面 → 呼叫任一後端 API 成功（確認 access token
    有正確帶到 Authorization header）」，loading/error 狀態（例如 Keycloak 端登入失敗、token
    交換失敗）都要有清楚呈現，en + zh-TW i18n 齊備。
  - 依賴：T-12500（JIT provisioning）、T-12530（dev Keycloak）

- [x] **T-12550** 把 T-12540 的登入流程加進**既有的** `@appspine/frontend-shell`（不是新建
  套件——login 頁本來就在用它的 `useTranslations`）。複雜度：**M**。
  - 只有在 T-12540 於 `apps/mcp-gateway` 驗證穩定後才進行——**不要在驗證前就先抽象化**（plan
    §4.1 已拍板的執行原則）。
  - 抽出的元件/hook 讓其餘 8 個 App 在 Group D 可以直接重用，不用各自重刻一份。
  - 驗證：`apps/mcp-gateway` 換用抽出的共用元件後行為不變（回歸驗證），`tsc --noEmit`／
    `biome check` 通過。
  - 依賴：T-12540

### D. 各業務 App 逐一切換（plan §3、§4.4，pilot 是 `apps/mcp-gateway`）

- [x] **T-12560** `apps/mcp-gateway` 完整切換驗證（pilot）。複雜度：**M**。
  - 資料庫砍掉重建（`prisma migrate reset` 或等效操作，plan §4.6：現階段無需保留真實資料，
    比寫資料清除遷移腳本簡單——**前提是 T-12502 已經修好 seed.ts**，否則 reseed 會立刻重新
    產生一筆 bcrypt hash），`.env` 的 `AUTH_MODE` 改為 `oidc`，指向 T-12530 的 dev Keycloak
    （`appspine-dev` realm，client ID `mcp-gateway`），套用 T-12540/T-12550 的登入流程。
  - `README.md`「本機啟動」段落加一行指標，指向 `dev-infra/README.md`（plan §4.3 已拍板）。
  - 驗證：完整走一次「登入 → RBAC 權限判斷正常（不同測試使用者對應不同角色時，畫面/API
    權限符合預期）→ JIT provisioning 正常（第一次登入的測試使用者被自動建立且角色正確）→
    資料庫內不存在任何舊的 `User.password` bcrypt hash（前提是 T-12502 已完成，否則重建後
    reseed 仍會產生新的 hash，不能想當然爾）」。
  - 依賴：T-12502（seed.ts 已修正）、T-12510、T-12520、T-12550

其餘 8 個 App 逐一切換，每個 App 一個 task，複雜度各 **S**（已有 `apps/mcp-gateway` 驗證過的
模式可直接套用）。每個 task 內容一致：資料庫砍掉重建（前提同 T-12560，T-12502 已修好該 App 的
`seed.ts`）、`.env` 改 `AUTH_MODE=oidc`（`appspine-dev` realm，client ID 為該 App 資料夾
名稱）、套用 T-12550 抽出的共用登入元件、`README.md` 加一行指向 `dev-infra/README.md` 的
指標、走一次 T-12560 同樣的驗證清單，依賴 T-12560（pilot 驗證通過後才逐一展開）+ T-12502。
展開順序留給執行階段決定，不影響下方各 task 的獨立性：

- [x] **T-12570** 切換 `apps/wiki`。複雜度：**S**。依賴：T-12560、T-12502
- [x] **T-12580** 切換 `apps/calendar`。複雜度：**S**。依賴：T-12560、T-12502、T-12505
  （calendar 的 `provision-service-account.mjs` 要先同步）
- [x] **T-12590** 切換 `apps/drive`。複雜度：**S**。依賴：T-12560、T-12502
- [x] **T-12600** 切換 `apps/chat`。複雜度：**S**。依賴：T-12560、T-12502、**T-12515**
  （chat 自己的 `ws-jwt-verifier.service.ts` 要先同步好 OIDC-only + JIT，不然 WebSocket 連線
  路徑會停在舊行為）
- [x] **T-12610** 切換 `apps/project`。複雜度：**S**。依賴：T-12560、T-12502
- [x] **T-12620** 切換 `apps/approve`。複雜度：**S**。依賴：T-12560、T-12502
- [x] **T-12630** ~~切換~~ `apps/org` 已刪除，改由 `apps/master-data` 取代（使用者 2026-07-30
  執行中指示：「apps/org 已用 apps/master-data 替代」）——實際結果是刪除整個目錄與其 Keycloak
  client（見 `dev-infra/README.md`），不是切換成 OIDC。複雜度：**S**。依賴：T-12560、T-12502
- [x] **T-12640** 切換 `apps/master-data`。複雜度：**S**。依賴：T-12560、T-12502

- [x] **T-12645** 盤點並移除 local auth 專屬基礎設施（`JWT_SECRET`／`JwtModule`／`bcrypt`，
  plan §4.6 已拍板；原編號 T-12525，Opus 審查後移到 Group D 之後執行）。複雜度：**S**。
  - **執行順序修正**：這個 task 必須在全部 9 個 App 都完成 T-12502（seed.ts 不再需要
    `bcrypt`）之後才能做，原規劃把它排在 T-12510 後面（Group D 之前）會導致還沒修好 seed.ts
    的 App 建置直接失敗——多個 App 的 `seed.ts` 是透過 `@appspine/auth` 的遞移依賴才拿得到
    `bcrypt`，拔掉的當下若有 App 還沒修好就會炸。
  - 盤點 `appspine/packages/auth/src/auth.module.ts` 的 `JwtModule.register()`、
    `jwt-secret.util.ts` 的 `resolveJwtSecret()`（含 `'unused-under-oidc-mode'` 分支）、
    `main.ts`（9 個 App + template）裡 `authMode === "local" && JWT_SECRET` 的 production
    guard、以及 `@appspine/auth` 的 `package.json` 裡 `bcrypt` 依賴，確認是否還有其他消費者。
  - **`apps/drive` 排除在外**：`shares.service.ts` 的分享連結密碼功能直接用 `bcrypt`，跟
    local auth 無關，不受本 task 影響——只移除 `@appspine/auth` 自己宣告的 `bcrypt` 依賴，
    不動 `apps/drive` 自己直接宣告的 `bcrypt`。
  - 沒有其他消費者：移除 `JwtModule.register()`、`jwt-secret.util.ts`、`bcrypt` 依賴；
    9 個 App 各自的 `.env`/`.env.example` 移除 `JWT_SECRET`/`JWT_EXPIRES_IN`。
  - 有其他消費者：記錄清楚是誰在用、為什麼，本 task 只移除已確認無用的部分，不動有其他用途
    的部分——若發現這類非預期的其他用途，依執行原則另開 `Z0x-...` 記錄，不擴大本 task 範圍。
  - 驗證：`tsc --noEmit`／`biome check` 全過（含 `apps/drive`，確認它的 `bcrypt` 依賴未受
    影響）；9 個 App 移除對應 env var 後仍能正常啟動（`/health` 200）。
  - 依賴：T-12570、T-12580、T-12590、T-12600、T-12610、T-12620、T-12640（8 個 App 都已切換
    完成）＋ T-12630（`apps/org` 已刪除，不再是需要等待的切換對象）——seed.ts 都已不再需要
    `bcrypt`，才能安全移除共用套件的依賴。

### E. Template 與文件收尾

- [x] **T-12650** `appspine-app-template` 同步更新。複雜度：**S**。
  - `appspine-app-template/.env.example`：`AUTH_MODE` 預設值改為 `oidc`，移除 local 專屬的
    註解/範例值。
  - `appspine-app-template/frontend/src/app/(external)/login/page.tsx`：換成 T-12550 抽出的
    共用登入元件，讓未來新 fork 的 App 直接是 OIDC-only，不需要再手動改一次。
  - `appspine-app-template/backend/prisma/seed.ts`：確認已套用 T-12502 的修正（不寫密碼）。
  - 驗證：從 template 重新 fork 一個測試用暫存 App，`AUTH_MODE=oidc` 開箱即可走登入流程（對
    dev Keycloak），驗證完刪除暫存 App。
  - **依賴修正（Opus 審查後調整，P2-11）**：改依賴 **T-12502、T-12550**，不是等 9 個 App
    全部切完——`apps/mcp-gateway` 驗證通過（T-12540）且共用元件抽出來（T-12550）當下，模式
    就已經穩定到可以同步進 template。原規劃卡在「T-12570~T-12640 全部完成」會讓 template 在
    整個 8 個 App 的 rollout 期間都是舊的，任何人這段期間 fork 新 App 都會拿到還沒切換的
    local auth 版本——沒有理由等到最後一個 App 才做，跟 Group D 的其餘 task 平行執行即可。

- [x] **T-12660** 更新 `_archive/dev_docs-20260803/framework/001-app-framework-plan.md` 與相關框架文件。
  複雜度：**S**。
  - 001 §「身份/權限細節」段落（`AUTH_MODE=local|oidc` 雙模式描述）改成反映「已廢止 local，
    OIDC-only」的現況，避免文件與程式碼不一致。
  - `dev_docs/INDEX.md` 待本計畫執行完成後重新跑 `node dev_docs/scripts/generate-index.mjs`
    產生（狀態行屆時已更新為完成，會自動反映，不需手動編輯 INDEX.md）。
  - 依賴：Group A~D 全部完成（含 T-12645）、T-12650
