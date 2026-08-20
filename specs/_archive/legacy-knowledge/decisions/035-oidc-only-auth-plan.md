---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-30
updated: 2026-08-03
---

# 035 - 廢止 Local Auth，統一以 OIDC 為身份來源 - 系統設計計畫

> 狀態：**已執行完成（2026-07-30）**，詳見 `035-task-breakdown.md`。
> 2026-07-30 從 `future_plans/Z26-mcp-spec-2026-07-28-watch.md` §5.1.1 的討論中拍板獨立出來，
> 第 2、3 節是最初就定案的方向，第 4 節原本是待確認事項，逐項討論後已於同日全數拍板（見各子節
> 的「已拍板」標記），保留討論脈絡供之後回顧決策理由。
>
> **執行後修正**：本文原本假設 `apps/org` 是 9 個待切換 App 之一（見下方「1. 背景與定位」與
> §4.3 的 client 列表），實際執行 T-12630 時使用者中途指示改為刪除 `apps/org`（已由
> `apps/master-data` 取代），因此最終是 8 個 App 切換 + `apps/org` 刪除，不是 9 個 App 都切換
> 成 OIDC。下方「1. 背景與定位」等處描述的「9 個 App」是規劃當下的現況快照，不逐一回頭改寫，
> 以此處為準。

---

## 1. 背景與定位

appspine 現有 `@appspine/auth`（`appspine/packages/auth`）從設計出來就支援 `AUTH_MODE=local|oidc`
雙模式切換（見 [001-app-framework-plan.md](../topics/001-app-framework-plan.md#L43)），但實際盤點
approve / wiki / project / calendar / chat / drive / org / master-data / mcp-gateway 這 9 個
App 的 `.env` 後發現：**全部都是 `AUTH_MODE=local`，OIDC 模式從設計出來就沒有被真正啟用過**，
`OIDC_JWKS_URL`/`OIDC_ISSUER` 目前都還是 `.env.example` 裡的 `keycloak.example.com` 佔位符。

使用者觀察到：appspine 現在已經有 9 個 App，「單一 app 各自土炮 local auth」的情境已經不太存在，
討論後決定推進「廢止 local auth，統一以 OIDC 為唯一身份來源」，開發期先用 docker Keycloak 驗證
整套流程，架構單純化。完整討論脈絡見
Z26 §5.1.1 (歷史封存)。

**跟 Z26 的關係（重要，不要混淆）**：這份計畫解決的是「**真人**登入各業務 App 自己的網頁前端」
這條路徑，跟 Z26 §5.1 討論的 Enterprise-Managed Authorization（mcp-gateway 的 **agent/M2M**
存取）是完全不同的兩條通道，彼此互不相通（詳見 Z26 §5.1.3 流程圖）。但這份計畫一旦落地，appspine
會第一次真的有一個「在運作中的企業 IdP」，等於補上 Z26 §6 待確認問題 4 提到的前提——為將來若要
評估 Enterprise-Managed Authorization 鋪路，**但本計畫本身不包含 mcp-gateway 那條路徑的任何改動**。

## 2. 已拍板決策（2026-07-30）

1. **統一以 OIDC 為唯一身份來源，廢止 local auth**——移除 bcrypt 密碼、註冊/登入表單這整條
   程式碼路徑，不是保留但預設關閉。
2. **開發期用 docker Keycloak**——只是為了讓開發/測試環境有一個真的能跑的 IdP，**不是**正式
   環境 IdP 採購/選型決策（那件事留在第 4.5 節，超出本計畫範圍）。
3. **必須同時做 JIT（just-in-time）provisioning**——第一次 OIDC 登入、本地找不到對應 `User`
   時，自動建立一筆本地 `User`（而不是像現在 `buildOidcJwtUser` 那樣直接丟 401）。這是不可省略
   的但書：只換登入機制而不補這塊，onboarding 反而變成「還要 admin 手動建 User，還多了一套要接
   的 Keycloak」，兩頭都沒討好。

## 3. 範圍界定

**做**：

- `@appspine/auth` 套件本身：移除 local 專屬程式碼路徑（`/auth/register`、`/auth/login`、
  `LocalStrategy`、`UsersService.create` 的密碼邏輯），加上 JIT provisioning。
- 開發環境：新增共用 Keycloak docker 服務 + 匯入設定文件（dev realm、預建測試使用者）。
- 前端：需要一條真正的 OIDC 登入流程（目前完全沒有——見 4.1）。
- 9 個既有業務 App 逐一切換 `AUTH_MODE=oidc`、指向共用 dev Keycloak、驗證登入與 RBAC 正常。
- 退場清除（見 4.6）：既有密碼雜湊資料（現階段用資料庫砍掉重建處理）、盤點並移除
  `JWT_SECRET`／`JwtModule`／`bcrypt` 這類 local 專屬基礎設施（`apps/drive` 自己直接用
  `bcrypt` 的分享連結密碼功能不在此列，見 4.6）。
- 執行風險補強（見 4.7）：修正 `seed.ts`／`users.controller.ts`／service account 建立腳本、
  同步 `apps/chat` 獨立於 `@appspine/auth` 之外的 WebSocket JWT 驗證邏輯。
- `appspine-app-template` 的預設值同步更新，未來 fork 出的新 App 直接是 OIDC-only。

**明確不做**：

- 正式環境 IdP 採購/佈署決策（自架 Keycloak vs Okta/Entra 等商用服務）——見第 4.5 節，留給後續
  獨立計畫。
- Enterprise-Managed Authorization / ID-JAG（mcp-gateway 的 agent 存取）——這是
  Z26 (歷史封存) 持續觀察的另一個獨立議題，本計畫只是
  它未來可能用到的前提之一，不包含在這裡。
- 跟 `apps/master-data`（Enterprise Master Data，033）的雙向同步整合——JIT provisioning v1 只用
  email 比對，不查 org directory。（原文寫作時此處還是 `apps/org`；T-12630 執行中途經使用者
  指示改為刪除 `apps/org`、改由已完成整併的 `apps/master-data` 取代，此排除範圍本身不變，僅
  App 名稱隨之更新。）

## 4. 細節決策記錄（原「待確認事項」，2026-07-30 逐項拍板完成）

### 4.1 前端 OIDC 登入流程 —— 已拍板（2026-07-30）：`next-auth`（Auth.js）

查了 `appspine-app-template/frontend/src/app/(external)/login/page.tsx`，現況是一個純
email/password 表單直接呼叫 `login()` server action，**沒有任何「導去 IdP 登入頁再回跳」的
OIDC Authorization Code 流程**。後端的 `OidcStrategy` 只負責「驗證一個已經拿到手的 token」，
不負責「怎麼去 IdP 拿到這個 token」——這段前端整合是全新的工程工作，不是「拿掉密碼欄位」那麼
簡單。

**已拍板**：用 `next-auth`（Auth.js），理由是 appspine 前端是 Next.js App Router，
`next-auth` 對這個生態整合度最高，內建 OIDC provider、callback route、CSRF/PKCE 處理，能省掉
自己刻這些安全細節的工。next-auth 預設用 httpOnly cookie 管理**它自己的 session**，跟現有
`login()` server action「後端簽發、前端不碰明碼」的精神一致。

**更正（2026-07-30 Opus 審查後修正）**：原文寫「不需要另外決定 refresh 策略，next-auth 內建
處理」是錯的——next-auth 內建處理的是它自己 session 的 refresh，**upstream（Keycloak）access
token 的 refresh 要自己寫 `jwt` callback**，且後端 `OidcStrategy` 要驗證的是這個 Keycloak
access token（Bearer），不是 next-auth 的 session cookie，兩者不是同一個東西，要在 next-auth
的 callback 裡把 access token 取出來、放進呼叫後端 API 時的 Authorization header。這代表前端
整合範圍比原本設想的更廣——不只是 `login/page.tsx`，`server/auth-cookie.ts`、`api-client.ts`、
`server/auth-actions.ts`、`middleware.ts`（現有 `AUTH_COOKIE_NAME` 判斷）都要跟著調整（見
T-12540 更新後的範圍）。

**維持 pilot-first**：先在 pilot App 做出來驗證可行，再抽進**既有的** `@appspine/frontend-shell`
（T-12540 → T-12550——這個套件已經存在，login 頁本來就有在用它的 `useTranslations`，T-12550
是「加進去」不是「新建」），不要一次到位卡在還沒驗證過的抽象上。

### 4.2 JIT provisioning 預設角色與寫法 —— 已拍板（2026-07-30）：不加限制，直接建立

**已拍板**：不加 email 網域白名單這類額外限制——只要 OIDC token 驗證通過（代表 IdP 已經確認過
這個人的身份），`buildOidcJwtUser` 找不到本地 `User` 時就直接自動 `create` 一筆（`email`/`name`
取自 token claim），套用跟現有 `UsersService.create()` 沒傳 `roleIds` 時完全相同的預設邏輯
（`SYSTEM_USER_ROLE`，即 `'USER'`）。理由：身份驗證的把關本來就該在 IdP 那一層做（誰能登入
Keycloak），appspine 這端疊加白名單是重複判斷，且白名單本身需要額外維護（要跟著公司網域變化
更新），不加是更簡單、職責分工更乾淨的做法。

**釐清（2026-07-30 Opus 審查後補充）**：「把關交給 IdP」這句話要真的落地才算數——一個 realm
掛 9 個 client（見 4.3）本身不會自動限制「誰能拿到哪個 client 的 token」，如果 realm 裡沒有
設定任何 per-client 存取限制，任何一個能登入 Keycloak 的帳號都會自動在全部 9 個 App 拿到自動
建立的帳號。T-12530 建 dev realm 時要對每個 client 設定 group/role-based 存取限制（哪些
Keycloak 使用者能對哪個 client 拿到 token），這樣「不加白名單」的決定才真的是「委任給 IdP
判斷」，而不是「沒有任何人在判斷」。

### 4.3 開發用 Keycloak docker-compose 放哪裡 —— 已拍板（2026-07-30）：repo 根目錄 `dev-infra/`

`appspine-app-template` 目前每個 App 各自一份 `docker-compose.yml`（只有 postgres）。OIDC 是
「多個 App 共用同一個 IdP 才有 SSO 效果」，不適合放進單一 App 的 compose 檔。

**已拍板**：新增獨立的 `dev-infra/docker-compose.yml`（repo 根目錄，跟 `dev_docs/`、`apps/`、
`appspine/`、`appspine-app-template/` 同一層），內含 Keycloak + 預先匯入的 dev realm（測試
使用者、client 設定）。理由：獨立於任何單一 App 之外，語意上最清楚——這是跨 App 共用的開發
基礎設施，既不屬於某個業務 App 的 template 骨架，也不是 `appspine/` 那樣的 npm 套件發布流程。

**Realm/client 命名慣例 —— 已拍板（2026-07-30）**：

- Realm 名稱固定為 **`appspine-dev`**——明確標示這是開發環境用的 realm，跟未來正式環境可能
  用的 realm（例如 `appspine`）明確區分，避免哪天正式環境也接 Keycloak 時混淆。
- 每個 App 各自登記成一個 OIDC client，**client ID 直接用該 App 的資料夾名稱**（`wiki`、
  `calendar`、`drive`、`chat`、`project`、`approve`、`mcp-gateway`、`master-data`）——
  跟 appspine 既有的識別慣例一致（`VaultedAppKey.appName`、`Agent.boundAppName` 都是用裸的
  app 名稱字串當識別值，見 002「不可跨 app 外鍵，但要有一致的字串識別」慣例）。（`org` client
  已隨 `apps/org` 刪除而移除，見 T-12630、`dev-infra/README.md`；`appspine-app-template` 另有
  獨立的 `template` client，不算在 9 個 App 之列。）
- **每個 client 要設定 group/role-based 存取限制**（見 4.2 的釐清），不能只建 client 就結束。

**Token claim mapper（2026-07-30 Opus 審查後補充，原規劃遺漏）**：`jwt-verifier.service.ts` 的
`verifyOidcSignature` 會檢查 `audience`，`buildOidcJwtUser` 需要 `email` claim——但 Keycloak
預設**不會**自動把 client ID 放進 access token 的 `aud`，`email` 也預設不在 access token 裡，
兩者都要在 realm/client 設定裡手動加對應的 mapper（audience mapper、email/profile mapper）。
T-12530 匯入 dev realm 設定時，這兩個 mapper 要對每個 client 都設好，沒設的話 9 個 App 全部會
在驗證 token 時 401。

**README 文件同步 —— 已拍板（2026-07-30）**：9 個 App 的 `README.md`「本機啟動」段落各自加一行
指標，指向 `dev-infra/README.md`，提醒開發者本機啟動前要先把共用的 dev Keycloak 跑起來——避免
開發者漏掉這一步。完整說明只寫在 `dev-infra/README.md`，各 App 這行只是指標，不重複貼落落長的
啟動指令。這一步實際執行時機併入 Group D 每個 App 自己的切換 task（T-12570~T-12640），不是
T-12530 自己要做的事——T-12530 只負責建好 `dev-infra/` 本身跟它自己的 README。

### 4.4 各 App 切換順序與驗證方式 —— 已拍板（2026-07-30）：pilot 是 `apps/mcp-gateway`

**已拍板**：9 個 App 各自獨立驗證（比照 029/034「全 App 覆蓋」的執行慣例），一次一個 App 完整
跑完「切 `AUTH_MODE` → 走 4.1 的 next-auth OIDC 登入流程 → 確認 RBAC 權限正常 → 確認 JIT
provisioning 正常」再換下一個，不要一次全部切，避免問題範圍太大不好追蹤。

**Pilot App：`apps/mcp-gateway`**——使用頻率相對低、使用者介面單純（主要是 admin 管理
profile/key），驗證期間風險最小。其餘 8 個 App（wiki/calendar/drive/chat/project/approve/
org/master-data）待 pilot 驗證穩定後再依序展開，順序留給 Group D 執行時決定，不影響本節決策。

### 4.5 正式環境 IdP 選型——超出本計畫範圍，但需要記錄

開發期用 docker Keycloak 驗證整套流程可行後，正式環境要繼續自架 Keycloak（比照 034 的自架
精神），還是改用商用 IdP（Okta/Entra 等），是一個獨立的、更大的決定（牽涉授權費用、維運責任、
高可用性），留給後續獨立計畫處理，**不阻擋本計畫在開發環境的工作**。

**選型檢核項（2026-08-04，[[040-oidc-audience-azp-hardening-plan]] 風險 3 回填）**：

- **access token 是否帶 `azp` 或等效的 client 識別 claim**——`@appspine/auth`
  的 `buildOidcJwtUser()`／`verifyOidcSignature()` 現在都會 fail-closed 驗證
  `azp === OIDC_AUDIENCE`（見 040），這是攔阻「多 App 使用者的 token 被拿去橫向打其他 App」
  的唯一防線。若候選 IdP 的 access token **不提供 `azp`**，只提供 RFC 9068 定義的 `client_id`
  等效 claim，檢查邏輯需擴充為 `azp ?? client_id`——**不可**因為候選 IdP 缺 `azp` 就放寬為
  「缺失即通過」，那等於讓 040 修的漏洞原封不動地在新 IdP 上重現。若候選 IdP 兩者都不提供，
  這個防線需要在方案設計階段就找替代做法（例如改用 Token Exchange 窄化 audience），不可留到
  遷移後才發現。
- **realm／租戶層級的 audience 收斂能力**（040 plan §2.3 的第二階段，暫緩執行——見下）——
  是否能設定成「使用者的 token 只帶其實際登入的那個 client 的 audience」，而非目前 Keycloak
  預設把使用者有權限的全部 client 都塞進 `aud`。若候選 IdP 支援對等設定（例如 Okta 的
  authorization server 可按 client 分別建立、每個只曝露自己的 audience），選型時應優先考慮，
  因為這能把 `azp` 檢查從「必要的縱深防禦」降級為「多一層保險」，而非唯一防線。

**040 plan §2.3 的 realm `fullScopeAllowed` 收斂決策（T-15760，2026-08-04）**：不另開新的
`Z0x` 追蹤文件，併入本節（4.5）的 IdP 選型檢核項一併處理——這個收斂本質上是「換到支援更精細
audience 控制的 IdP／realm 設定」的一個特例，跟上面兩項選型檢核項是同一個決策脈絡，分開追蹤
只會製造重複文件。目前狀態：**已評估、暫不執行**——040 的 `azp` 程式碼修法已經把漏洞本身堵住，
realm 設定收斂只是縱深防禦的加強，不影響 040 的完成判準，留到正式 IdP 選型時一併決定。

### 4.6 Local auth 退場清除範圍 —— 已拍板（2026-07-30）：資料 + 基礎設施一併清除

原本第 3 節「做」只列了移除 `/auth/register`、`/auth/login` 等程式碼路徑（T-12510），
`User.password` 欄位原規劃是「保留欄位不刪、僅補文件註解」——這個決定不夠徹底：一旦
OIDC-only，舊的 bcrypt 密碼雜湊永遠不會再被讀取，留著只是沒清除的殘留敏感資料，沒有實質效益，
跟「架構單純化」的初衷有落差。

**已拍板**：退場清除範圍擴大為「資料 + 基礎設施一併清除」：

1. **既有密碼雜湊資料：整個資料庫砍掉重建，不寫資料清除遷移腳本**——appspine 目前 9 個 App
   全部都還沒有正式上線（034 正式環境部署仍是「待執行」），資料庫裡沒有真實使用者資料需要
   保留，直接砍掉重建（`prisma migrate reset` 或等效操作）比寫一支「`UPDATE users SET
   password = NULL`」這類一次性遷移腳本更簡單、風險更低（不用擔心腳本寫錯誤傷其他欄位），
   天然保證不留任何 bcrypt hash。**這個做法僅適用於目前這個「尚未正式上線、無需保留真實資料」
   的階段**——035 之後如果正式環境已經有真實使用者資料，同樣的退場清除就不能再用這個做法，要
   回到謹慎的資料遷移腳本。
   > **修正（2026-07-30 Opus 審查後發現）**：這個結論原本不成立——`prisma/seed.ts`（template
   > 及 9 個 App 各自的副本）本身會 `bcrypt.hash(SEED_USER_PASSWORD, 12)` 並寫回 `password`
   > 欄位，資料庫重建後 reseed 一次，馬上又產生一筆新的 bcrypt hash，不是「天然保證不留」。
   > **必須先修正 seed.ts、拿掉密碼寫入與 `SEED_USER_PASSWORD`**，DB 重建才真的乾淨——見 4.7。
2. **盤點 `JWT_SECRET`／`JwtModule.register()`／`bcrypt` 依賴是否還有其他消費者**——這組東西
   目前是 local 模式簽發/驗證 token 用的，local auth 移除後可能整個變成死代碼，但要先確認
   `@appspine/auth` 內部或消費端 App 沒有把同一個 `JwtService`/`JWT_SECRET` 挪去做其他用途
   （例如某個 App 自己額外簽發過其他種類的 token）。**沒有其他用途就一併移除**，不要留著沒人
   用的設定。
   > **補充（2026-07-30 Opus 審查後發現，證實原本的擔心是對的）**：
   > - `apps/drive` 的分享連結密碼功能（`shares.service.ts`）**直接**用 `bcrypt`，跟 local
   >   auth 完全無關——移除 `@appspine/auth` 的 `bcrypt` 依賴**不得**影響 `apps/drive` 自己
   >   直接宣告的 `bcrypt` 依賴，這是兩件事。
   > - 多個 App 的 `seed.ts` 是**透過 `@appspine/auth` 的遞移依賴**才拿得到 `bcrypt`（自己的
   >   `package.json` 沒有直接宣告）——移除前必須先確認全部 9 個 App 的 `seed.ts` 都已經不再
   >   需要 `bcrypt`（見 4.7 的 seed.ts 修正），否則會讓還沒修好的 App 建置直接失敗。
   > - 另外還有 `main.ts` 的 production guard（`authMode === "local" && JWT_SECRET`）、
   >   `jwt-secret.util.ts` 裡 `'unused-under-oidc-mode'` 那個分支，原規劃沒列到，一併納入
   >   盤點範圍。

### 4.7 執行風險補強（2026-07-30，Opus 獨立審查後發現，全數已拍板納入 task breakdown）

原規劃只看了 `@appspine/auth` 套件本身，沒有通讀消費端程式碼，遺漏了幾個會讓計畫實際執行到
一半失敗的地方。逐一記錄：

1. **`users.controller.ts` 的 `POST /users`（admin 建立使用者用）是 `UsersService.create()`
   的第二個呼叫端**，`user.dto.ts` 的 `createUserSchema` 目前 `password` 是必填——T-12510
   原本只列 `auth.controller.ts`／`users.service.ts`，沒改到這裡會編譯不過。**已拍板**：
   `password` 改為完全選填（呼應 schema 本來就是 `String?`），這條端點繼續保留給 admin 手動
   建立特殊帳號（例如 4.7.3 的 service account）用，只是不再要求密碼。
2. **`apps/chat` 有一份完全獨立於 `@appspine/auth` 之外的平行實作**——
   `ws-jwt-verifier.service.ts`（WebSocket 專用），自己的 `AUTH_MODE` 分支、自己的
   `JWT_SECRET` fallback、自己的「找不到 User 就丟 401」，**沒有 JIT provisioning**。這正是
   4.6 第 2 點原本要盤點但沒盤到的「其他消費者」。**已拍板**：這份程式碼要同步套用跟
   `jwt-verifier.service.ts` 一樣的 OIDC-only + JIT provisioning 邏輯，不能讓 chat 的
   WebSocket 連線路徑單獨留在舊的行為上。
3. **Service account 建立路徑會被切斷**——`apps/calendar` 的 `provision-service-account.mjs`
   （其他 App 是否有等效腳本待 task 執行時盤點）會用 `JWT_SECRET` 簽 admin token、呼叫
   `POST /users` 並帶密碼建立 `isServiceAccount` 帳號。這類帳號本來就不是真人、從來不會走
   OIDC 互動登入（只透過 `@appspine/m2m-api-key` 的 `ApiKey.actingUserId` 被使用），JIT
   provisioning 邏輯對它們完全沒有意義。**已拍板**：呼應第 1 點的「`password` 改選填」，
   service account 建立腳本改成不帶密碼呼叫 `POST /users`，不需要額外設計一套新機制。
4. **seed.ts 寫回密碼**——見 4.6 第 1 點的修正說明，template 與全部 9 個 App 的 `seed.ts`
   要先拿掉密碼寫入與 `SEED_USER_PASSWORD`，才能讓 DB 重建（4.6）跟移除 `bcrypt` 依賴（4.6
   第 2 點）這兩個決定真的成立。

## 5. 與 Task Breakdown 的關係

`035-task-breakdown.md`（T-12500–12660，共 21 項）已依本文件第 2、3、4 節全部拍板的範圍建立
（含 4.7 的執行風險補強），沒有任何 task 卡在待確認事項上，可直接依 Group A → B → C → D
（pilot 先行）→ E 的順序執行。

> **附帶記錄（2026-07-30 Opus 審查時順帶發現，非本計畫範圍）**：`_archive/dev_docs-20260803/app-master-data/
> 033-task-breakdown.md` 的 task ID 區間跟 `034-coolify-github-deployment-plan.md` 有重疊，
> 且 `dev_docs/INDEX.md` 的編號規劃表沒有 033 這一列——這是既有問題，跟 035 無關，不在本計畫
> 處理範圍內，記錄於此供之後另開文件處理。
