---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-31
updated: 2026-08-03
---

# Z27 - 035 OIDC-only Auth 遷移：事後多 Agent 安全審查與修復

> 狀態：**已修復並全數驗證完成**（2026-07-31）。035（廢止 local auth，統一以 OIDC 為身份來源）
> 於 2026-07-30 全數完成並收尾（見 035-task-breakdown.md）後，使用者要求對整個遷移做一次
> 獨立的事後安全審查——本文記錄審查方式、發現的問題、修復內容，以及審查過程中一次真實的
> agent 額度耗盡插曲。

## 1. 起因與審查方式

035 執行完畢、`_archive/dev_docs-20260803/framework/001-app-framework-plan.md` 與 INDEX.md 都已更新反映完成
狀態後，使用者要求「讓 opus 做深度 code review」。考量到 035 橫跨 `@appspine/auth` 共用套件、
9 個業務 App（`apps/org` 刪除）、`appspine-app-template`、`dev-infra` 共 11 個獨立 git repo，
採用 8 個平行 Opus agent 分別審查：核心套件、pilot App（`mcp-gateway`）、wiki+calendar、
drive+chat、project+approve、master-data、`appspine-app-template`、`dev-infra` Keycloak 設定。

每個 agent 被要求實際讀當前程式碼（不只讀 diff）、標註具體檔案/行號、給出「哪個情境會真的
出錯」的具體描述，而非泛泛的風格建議。8 份報告合併後，使用者選擇「全部修」而非只修
critical。

## 2. 發現的問題（依修復對象分組）

### 2.1 `@appspine/auth`（appspine 核心套件 repo）

- **`OIDC_ISSUER`/`OIDC_AUDIENCE` 未設定時驗證會靜默跳過**：`jsonwebtoken`/`passport-jwt`
  在這兩個 option 是 `undefined` 時直接不檢查該 claim。JIT provisioning 拿掉「User 必須
  已存在」這道防線後，代表只要忘了設這兩個環境變數，同一個 Keycloak realm 裡任何 client
  簽發的 token 都能通過驗證。修法：`OidcStrategy`／`JwtVerifierService` 的建構子改成在這三個
  環境變數（含 `OIDC_JWKS_URL`）任一未設定時直接丟錯，開機就炸而不是靜默通過。
- **JIT provisioning 併發保護沒有真的堵住 race**：`UsersService.create()` 原本只在
  `findUnique` pre-check 撞到既有 email 時丟 `ConflictException`；真正同時發生的兩個請求
  會在 DB unique constraint 撞到 Prisma `P2002`，未被轉換，導致登入直接 500。修法：
  `create()` 的 DB `create()` 呼叫也包一層 try/catch，把 `P2002` 轉成同一種
  `ConflictException`。
- **新增 `email_verified` 檢查**：`buildOidcJwtUser` 現在會拒絕 `email_verified === false`
  的 token（身份完全以 email claim 比對，若 IdP 未來允許未驗證信箱自助註冊，這道檢查可
  避免信箱衝突冒用既有帳號）。
- **`bcrypt` 雜湊「未被使用」的懷疑，查證後是誤判**：其中一個 agent 認為
  `UsersService.create()` 直接寫入明文密碼；實際追蹤呼叫鏈後確認 `UsersController.create()`
  在呼叫 `UsersService.create()` 之前就已經用 `bcrypt.hash()` 雜湊過（唯一呼叫端），設計
  正確、無需修改，補上一個 regression test（`users.controller.spec.ts`）保護這個行為。
- 新增/修正單元測試涵蓋以上三點，全部 28 個單元測試通過。
- 版本：`@appspine/auth` 4.0.1 → 4.0.2（patch）。

### 2.2 `@appspine/frontend-shell`／`@appspine/e2e-kit`

- `LoginButton`：`label`/`pendingLabel` 從有預設值（英文）改成必填 props，避免未來某個
  App 忘記傳入時靜默顯示英文；`onSignIn` 失敗（非 next-auth 自身的 redirect）現在會顯示
  錯誤訊息而不是靜默重置回待命狀態。版本：0.7.0 → 0.8.0（minor，因為 prop 從選填變必填）。
- `e2e-kit` 的 `auth` fixture／spec：sign-in 按鈕文字改成可設定（原本寫死英文字串）；
  JIT 使用者的 email 比對從 `RegExp`（含未跳脫特殊字元的風險，例如 `+` 標記信箱會直接丟
  regex 語法錯誤）改成純字串比對。版本：1.0.0 → 1.0.1（patch）。
- 發版時一併確認 `@appspine/domain-events`／`@appspine/m2m-api-key`／`@appspine/rbac`／
  `@appspine/mcp-server`／`@appspine/metadata-schema` 全數用 `workspace:*` 正確連動重新
  發版，解掉下面 2.4 節記錄的版本卡死問題。

### 2.3 `dev-infra`（Keycloak realm 設定）

- **Direct-grant（ROPC，`grant_type=password`）完全沒有存取限制**：README 原本記錄的
  per-client 存取限制（`<client>.access` 角色 + conditional-deny flow）只掛在 browser
  flow 上；9 個 client 全部 `directAccessGrantsEnabled: true`，且 client secret／測試帳密
  都寫在同一份公開 README 裡，代表任何一個測試身分都能用 ROPC 對任何一個 App 拿到合法
  token。修法：比照 browser flow 的做法，替每個 client 複製一份 `direct-grant-<client>`
  flow，一樣掛 `CONDITIONAL` 的 `conditional-user-role`（negate）+ `deny-access-authenticator`
  ——但順序跟 browser flow **相反**：必須放在 Username Validation／Password 驗證**之後**，
  而不是之前。原因：browser flow 是互動式登入的多次 HTTP 往返，Keycloak 會在使用者送出
  帳密後重新評估同一個 flow，所以 conditional 區塊放在表單**之前**也能生效；direct grant
  是單一次 atomic request，沒有這種重新評估機制，若條件判斷放在帳密驗證之前，使用者根本
  還沒被解析出來，條件永遠判定「不適用」而直接放行——這個順序差異是在同一台實機上先後
  試兩種順序、實際用 curl 驗證出來的，不是憑空推論。
  - 順帶清掉：`org` client 刪除後遺留的空 `org-users` group；`template` client 的 flow
    子節點還沿用「複製自 master-data」時期的舊命名（例如
    `browser-template master-data-access-check`），改回一致的 `template-access-check`；
    補上先前沒有的 `template-users` group（跟其他 8 個 client 對稱）。
  - 全部改動透過 `docker compose down -v && up` 完整重匯入 + 直接對 realm 打 ROPC 驗證
    allow/deny 通過後才 commit（`dev-infra/README.md` 已補上這段順序差異的說明）。

### 2.4 逐一 App 修復

除了下方列出的 App 專屬問題，**每個 App 都套用了同一組修復**（對照 `apps/mcp-gateway` 的
pilot 修復，逐一 boot + e2e 驗證後 commit）：

1. **`GET /api/auth/session` 會把 Keycloak access token 洩漏給任何同源 JS（含 XSS）**：
   next-auth 的 `session()` callback 回傳值就是這個公開端點的回應內容；原本把
   `accessToken`/`error` 直接掛在 session 上，等於把一個對後端 API 有效的 bearer credential
   交給前端 JS。修法：`session()` callback 不再帶這兩個欄位，改用新增的 `getAccessToken()`
   （透過 `next-auth/jwt` 的 `getToken()` 直接讀 `AUTH_SECRET` 加密過的 cookie，繞過
   `session` callback、也就不會出現在這個公開端點）給 server-only 程式碼使用。
   - **例外：`apps/chat`**。因為瀏覽器端 JS 需要直接對後端開 WebSocket
     （`use-chat-socket.ts`）與直接 fetch（`chat-api.ts`），沒有 server-only 的路徑可用，
     也沒有 middleware 可以代理，這個 App 的 `session()` callback **刻意保留**
     `accessToken`，並在 `auth.ts` 留下明確註解說明原因、殘留風險（受 dev-infra realm
     `accessTokenLifespan=300s` 限制）。
2. **`pages.error` 未設定**：`AccessDenied`（Keycloak 拒絕存取）、`CallbackRouteError`
   等錯誤類別會落到 next-auth 內建、未在地化的英文錯誤頁，而非各 App 自己的
   `/login?error=` 處理。修法：`pages: { signIn: "/login", error: "/login" }`。
3. **已知的 Next.js App Router 限制，記錄而非強修**：`getAccessToken()` 內做的 token
   refresh 只對「這一次 render」有效，Server Component 沒辦法把新 token 寫回 cookie，
   下一次 render 會重新 refresh 一次。目前無害是因為 dev-infra realm 的
   `revokeRefreshToken: false`（沒開 refresh token 輪替），重複使用同一個 refresh token
   不會被撤銷，只是多打了幾次 Keycloak；若未來真的開啟輪替，這裡需要一個能寫 cookie 的
   路徑（Route Handler / Server Action，不是 render）才能修——`auth.ts` 內已留下完整
   說明。
4. **`/unauthorized` 頁沒有任何驗證**（原本存在的幾個 App）：因為這個頁面在
   `(main)/` 底下但在 `dashboard/` 之外，middleware 拿掉後就沒有任何 gate。修法：加上
   `getCurrentUser()` + 未登入時導回 `/login`，同時補上 i18n（原本是寫死英文）。
5. 刪除已無用途的 `types/next-auth.d.ts`（`Session` type augmentation 只為了
   `accessToken`/`error` 這兩個欄位存在，兩者拿掉後整份檔案變成死碼）。
6. 版本：`@appspine/auth` 升到 `^4.0.2`、`@appspine/frontend-shell` 升到 `^0.8.0`；
   同時檢查（並在需要時修正）`@appspine/common`／`@appspine/rbac`／`@appspine/m2m-api-key`／
   `@appspine/mcp-server`／`@appspine/metadata-schema` 是否都對齊到各自最新已發版版本——
   `@appspine/mcp-server` 在至少 3 個 App（chat、project、approve）第一輪修復時被漏掉，
   boot 驗證時撞到跟 master-data 當初一樣的 class-identity DI crash
   （`UnknownDependenciesException`），原地補上後才修好，是本次審查中發現的一個「同一種
   bug 在多個 App 重複發生」的實例。

**App 專屬問題**：

- **`apps/calendar`：`scripts/provision-service-account.mjs` 完全失效**。這支腳本原本
  用 `JWT_SECRET`（已移除，fallback 到 `"dev-secret"`）手刻簽發 HS256 JWT 來取得 bootstrap
  admin token，但 `@appspine/auth@4.0.2` 的 `OidcStrategy` 只接受用真正 Keycloak JWKS
  驗證過的 RS256 token，HS256 token 在任何情況下都不會被接受。修法：改成對 dev Keycloak
  發一次真正的 ROPC（`grant_type=password`）請求換取合法 admin token，跟 e2e 測試已經在
  用的模式一致。**實際對已啟動的 backend 跑過這支腳本兩次（驗證冪等性）確認修好**，不只
  是型別檢查過關。
- **`apps/drive`：`(editor)` route group 完全沒有驗證**。middleware 拿掉之後，
  `/editor/files/[id]/edit` 這條路由沒有任何等同 `(main)/dashboard/layout.tsx` 的 gate，
  未登入使用者能看到頁面外殼（後端 API 仍會擋，不是資料外洩，但是體驗上的洞）。修法：
  新增 `frontend/src/app/(editor)/layout.tsx`，套用跟 dashboard 一樣的
  `getCurrentUser()` + redirect 模式。
- **`apps/chat`：WebSocket JWT 驗證是手刻的重複實作**。`ws-jwt-verifier.service.ts`
  （156 行）幾乎是 `@appspine/auth` 的 `JwtVerifierService` 的手動複製版，已經跟共用實作
  脫節（缺少 `email_verified` 檢查），還額外重新踩到一個共用套件編譯輸出早就避開的
  `jwks-rsa`/webpack interop 問題。修法：整支檔案刪除，`ChatGateway` 改成直接注入
  `@Global` `AuthModule` 匯出的 `JwtVerifierService`。同時清掉 `chat.gateway.ts` 裡
  殘留的 cookie/query 字串 fallback（`AUTH_COOKIE_NAME = "auth_token"` 等），只留下
  `use-chat-socket.ts` 真正在用的 `handshake.auth.token` 這一條路徑。**用 chat 自己的
  golden-path e2e（開頻道 + 送訊息，會真的走一次 WebSocket 連線）驗證通過**，是這次改動
  信心最高的驗證方式。
- **`apps/project`／`apps/approve`／`appspine-app-template`：`AUTH_MODE` 環境變數控制的
  「建立本地帳密使用者」UI 邏輯已死但仍在生效**。`frontend/src/server/auth-mode.ts` 的
  `getAuthMode()` 對任何非精確 `"oidc"` 的值都 fallback 成 `"local"`；由於
  `main.ts` 的正式環境 local-auth guard 已在早先的 035 步驟移除，一個單純沒設
  `AUTH_MODE` 的環境會靜默用 OIDC-only backend 開機，同時仍不一致地顯示/隱藏這個建立
  帳密的對話框。`@appspine/auth` 的 `POST /users` 刻意保留 `password` 選填正是為了這個
  「特殊帳號（break-glass、service account）」情境，不是要被 `AUTH_MODE` 檔住的殘留功能
  ——問題出在「用一個沒人保證會被設定的環境變數擋」，不是這個功能本身。project／approve
  的處理方式：**刪掉 `auth-mode.ts` 跟整段條件判斷，讓對話框固定顯示**，i18n 文案改成
  正確描述「這是給特殊帳號用的，一般使用者走 IdP 登入」，不再稱為「本地帳號」。
  `appspine-app-template`（未來所有新 fork 的起點）的處理方式不同：**直接把整個對話框
  從樣板移除**，只留底層的 `createUserAction` server action 讓未來 fork 需要時自行接回
  UI——樣板預設不內建密碼建帳號功能，比每個新 App 預設都帶著這個功能更安全。
- **`apps/approve`：兩處直接讀 `session.accessToken` 的程式碼**
  （`uploadExpenseAttachmentsAction`、附件下載 proxy route）跟著改用 `getAccessToken()`；
  順便把下載 route 對未登入請求「直接把後端 401 轉發、`res.statusText` 在 HTTP/2 底下
  常是空字串」的問題，改成先短路回傳一個乾淨的 `{"message":"Unauthorized"}`。
- **`apps/master-data`：M2M API key 的 per-entity scope 檢查形同虛設**。
  `sync-export.controller.ts` 原本一個 `@Get(":entity")` handler 同時掛
  `@Scopes("org-units:read", "org-user-profiles:read", "org-delegations:read")` 三個
  scope，但 `ScopeGuard` 是 AND 語義（`required.every(...)`）——代表一把只有
  `org-units:read` 的 key 想讀自己該讀的 org-units feed，會因為沒有另外兩個 scope被 403。
  修法：拆成三支各自獨立、各自只掛一個 scope 的 route。**直接對已啟動的 backend 建立
  單一 scope 的真實 API key 驗證**：能存取自己對應的 entity（200），另外兩個回 403；
  全 scope 的 key 三個都能存取（200）——不只是讀程式碼判斷邏輯正確，是真的打過。
  - 順帶清掉 `main.ts` 裡已無效果、只是被讀出來印在開機 log 裡的 `AUTH_MODE` 變數。
- **`appspine-app-template`：fork 安全性缺口補強**（因為這是所有未來 App 的起點，這兩項
  直接在這次修，沒有延後）：
  - `e2e/test-env.ts` 原本把樣板自己的 Keycloak client（`"template"`/
    `"dev-secret-template"`）寫死當 fallback，沒有任何警示要求 fork 時必須改。修法：
    `scripts/scaffold-init.mjs` 新增一條 fork 時自動改寫規則（用新 App 名稱＋
    `dev-secret-<name>` 慣例），而不只是加註解指望有人看到。
  - `backend/prisma/schema/user.prisma` 的 `password` 欄位註解原本寫「新程式碼完全不會
    讀寫」，追查 `@appspine/auth` 原始碼後發現不完全正確（`UsersController` 仍會在
    `password` 有值時雜湊寫入，只是這是唯一呼叫端且雜湊過）；註解改成準確描述實際行為。
  - fork checklist（README 與 `scaffold-init.mjs` 的印出清單）補上原本完全沒提到的
    `AUTH_SECRET`／`AUTH_KEYCLOAK_ID`／`_SECRET`／`_ISSUER` 設定步驟——照著原本的 checklist
    走的新 fork，第一次登入會直接撞上 next-auth 的 `MissingSecret` 錯誤且毫無頭緒。

### 2.5 CI `e2e.yml`：已知缺口，記錄但未強行修復

9 個 App（含 `appspine-app-template`）的 `.github/workflows/e2e.yml` 都還在匯出
`SEED_USER_PASSWORD`／`E2E_USER_EMAIL`／`E2E_USER_PASSWORD`，並用它們推導
`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`——這些都是 local auth 時期的殘留變數，
`e2e/test-env.ts` 現在完全不讀。這部分**已清掉**（9 個 repo 各一個 `fix(ci)` commit）。

但清掉這些變數不代表這個 job 真的能跑過：**目前完全沒有啟動 Keycloak 服務**，
auth 相關的 e2e spec 會在連線 `E2E_KEYCLOAK_ISSUER` 預設值時直接連線失敗，不是乾淨地
通過。要補上這個缺口，需要在 CI job 裡跑一個 Keycloak service，但 GitHub Actions 的
`services:` 容器是在 `actions/checkout` **之前**啟動的，沒辦法直接把這個 repo 裡的
realm 匯出檔掛進去（一般作法是把 realm 直接烤進自訂 image，或是開機後改用 Admin REST
API 匯入，而不是 `--import-realm` 這種吃檔案的方式）——這需要一次獨立、有真實 CI 環境
可以驗證的後續工作，**這次審查刻意不在沒有真實 CI run 可驗證的情況下貿然湊一個看起來
能動、實際上沒把握的版本**，只在每個 job 上留了清楚的 `KNOWN GAP` 註解說明卡在哪、要
補什麼。

## 3. 過程插曲：Agent 額度耗盡

8 個負責逐一修復 App 的 background agent 平行啟動後，全部因為帳號本月 spend limit 打滿
而中途失敗（`Agent terminated early due to an API error: You've hit your monthly spend
limit`）——這是帳號層級的用量上限，不是邏輯錯誤。檢查後發現：**8 個 App 的檔案修改都已
完整寫入各自的 working tree**（`git status` 確認），只是還沒經過 tsc/biome/測試/boot/e2e
驗證、也都還沒 commit。使用者選擇「主對話自己接手完成驗證與 commit，不再依賴
background agent」，後續 8 個 App（加上核心套件、dev-infra、pilot App 共 11 個 repo）
全部由主對話逐一：讀 diff 確認改動內容、`tsc --noEmit`、`biome check`、單元測試、
boot 兩個 process（backend + frontend）、跑一次真實 e2e suite（含真的走一次瀏覽器 OIDC
登入），確認無誤後才 commit。

## 4. 驗證總表

| Repo | 修復 commit | Boot 驗證 | e2e 結果 |
|---|---|---|---|
| `appspine`（核心套件） | `1342dbe` | 28/28 單元測試通過 | N/A（套件層） |
| `dev-infra` | `8c5a7bf` | `docker compose down -v && up` 全新匯入 | ROPC allow/deny 直接對 realm 驗證通過 |
| `apps/mcp-gateway`（pilot） | `0a54dcd`, `0ce1632` | backend+frontend 乾淨開機 | 7/8（第 8 個是 `dev_docs 031` 的 API key holder 欄位驗證失敗，跟本次改動無關，屬既有缺陷） |
| `apps/wiki` | `58356fa`, `0d19634` | 乾淨開機 | 8/8 |
| `apps/calendar` | `42032ca`, `3bed26d` | 乾淨開機 | 8/8（含 service account 腳本手動驗證） |
| `apps/drive` | `602a50b`, `8d6ea34` | 乾淨開機（含 MinIO/Collabora） | 8/8（含 editor 路由 gate 驗證） |
| `apps/chat` | `cbf1051`, `a4480ae` | 乾淨開機 | 8/8（含真實 WebSocket golden path） |
| `apps/project` | `bb7953d`, `e3ecd77` | 乾淨開機 | 8/8 |
| `apps/approve` | `f60d51b`, `b6ea05a` | 乾淨開機 | 7/7（無 golden-path spec，早先已刪除） |
| `apps/master-data` | `7512d2f`, `e38520e` | 乾淨開機 | 7/7（含 scope guard 手動驗證） |
| `appspine-app-template` | `7257afb` | 乾淨開機 | 7/7 |

## 5. 未解決事項

- **CI `e2e.yml` 的 Keycloak service 缺口**（見 2.5 節）：9 個 repo 都需要，屬於同一類
  問題，適合另開一個獨立計畫處理，不建議湊在下一次順手改。
- **`apps/mcp-gateway` 的既有 e2e 失敗**（`gateway-profile-api-keys` 缺少
  `holderIdentifier`/`holderDisplayName` 欄位）：`dev_docs 031` 範圍的既有缺陷，與本次
  035 審查無關，未在本次處理範圍內修復。

