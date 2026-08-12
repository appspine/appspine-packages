---
type: decision
scope: cross-repo
status: completed
created: 2026-08-04
updated: 2026-08-06
supersedes: null
superseded_by: null
---

# 040 - OIDC Token 跨 App 重放缺口修復（`azp` 驗證強化）- 系統設計計畫

> 狀態：**已完成（48/48，2026-08-04）**。完整執行與驗收證據見
> [log.md](../log.md)。本計畫源自
> [[Z30-mcp-auth-migration-feasibility]] §6 風險第 14 點在 2026-08-04 的實測發現——與 MCP／
> Z30 本身無關，是 035（OIDC-only Auth）遺留的既有安全缺口，獨立開一個正式編號計畫處理。
>
> **2026-08-04 獨立 Opus 覆核後已重寫**：初版對修復位置、傳播機制、App 數量與跨 App 依賴盤點
> 都有事實錯誤，其中「修復位置」屬阻斷級——初版若照做，8 個 App 的 REST API 完全不會被修到，
> 只有 chat 的 WebSocket 會被修好。完整覆核記錄見 §7。

## 1. 問題

appspine **8 個業務 App**（`approve`／`calendar`／`chat`／`drive`／`master-data`／
`mcp-gateway`／`project`／`wiki`）+ `appspine-app-template` 共用 `@appspine/auth` 驗證 OIDC
access token，但驗證邏輯只檢查 `audience`，**不檢查 `azp`（authorized party）**。Keycloak 的
realm 設定會把使用者持有 client role 的所有 client 都放進 token 的 `aud` 陣列，而
`jsonwebtoken` 對陣列 `aud` 採「任一相符即通過」的語意。結果是：**任何一個 App 簽發的
token，只要使用者對其他 App 也有存取權，就能通過其他 App 的 audience 驗證**。

### 1.1 實測證據（2026-08-04，Keycloak 26.2 獨立容器）

以 `dev-user`（對全部 9 個 client 皆有存取權）向 `chat` client 取 token：

```
azp: chat
aud: chat,calendar,template,master-data,approve,mcp-gateway,wiki,project,drive,account
```

再以 wiki 實際使用的 `jsonwebtoken@9.0.3` 驗證：

```js
jwt.verify(token, key, { algorithms: ['RS256'], issuer, audience: 'wiki' })
// 對 azp=chat 的 token 仍然驗證通過
```

### 1.2 兩條獨立的驗證路徑——都受影響，但不共用同一個函式

初版誤以為 REST 與 WebSocket 共用 `verifyOidcSignature()`。實查後兩者是**完全獨立**的兩份簽章
驗證實作，唯一的匯流點是 `buildOidcJwtUser()`：

| 路徑 | 進入點 | 驗簽者 | 是否經過 `verifyOidcSignature()` |
| --- | --- | --- | --- |
| REST（8 個 App 全部 API） | `JwtAuthGuard` → `AuthGuard('jwt-oidc')` → [`strategies/oidc.strategy.ts`](../../packages/auth/src/strategies/oidc.strategy.ts) | **passport-jwt 自己** | 否 |
| WebSocket（僅 chat） | ``chat.gateway.ts`` → `verifyJwtToken()` | [`verifyOidcSignature()`](../../packages/auth/src/jwt-verifier.service.ts) | 是 |

`OidcStrategy.validate()` 只做一件事：把 passport-jwt 驗過簽的 payload 直接交給
`buildOidcJwtUser()`，`verifyOidcSignature()` 完全沒被呼叫。但**兩條路徑的 audience 比對用的
是同一份 `jsonwebtoken`**（`passport-jwt@4.0.1` 內部呼叫的正是 `jsonwebtoken`），語意完全相同
——所以 **REST 路徑同樣有漏洞**，而且 REST 才是主要攻擊面（見 §1.3）。

### 1.3 具體攻擊路徑：問題集中在 `chat`

逐一檢查 8 個前端的 next-auth `session` callback，**只有 `chat` 把 `accessToken` 放進
瀏覽器可讀的 session**（`apps/chat/frontend/src/auth.ts`）——因為 chat 的 WebSocket handshake
與附件下載需要在瀏覽器端取得 token。其餘 7 個 App 與 template **刻意不暴露**（例如
`apps/wiki/frontend/src/auth.ts` 明確註解：「putting the Keycloak access token here would
hand out a live backend bearer credential to client-side JS」）。

因此最短、最現實的攻擊路徑是：**chat 前端若被 XSS → 讀 `GET /api/auth/session` → 取得
`aud` 涵蓋全部 9 個 client 的 access token → 橫向存取該使用者在其他 7 個 App 的全部權限**。
殘餘風險受 realm `accessTokenLifespan: 300s`（chat 的 `auth.ts` 已註明）約束，但不構成防線。

對多 App 使用者（例如 `dev-admin`／`dev-user`）影響最大；單一 App 使用者（例如僅
`wiki-users` 群組成員）因其 `aud` 本來就窄，不受影響。

## 2. 修法評估

### 2.1 主修法：程式碼加驗 `azp`（採用，檢查點在 `buildOidcJwtUser()`）

**檢查點必須放在 `buildOidcJwtUser()`**（`jwt-verifier.service.ts`），這是 REST／WebSocket
兩條路徑**唯一**的匯流點，且任何未來新增的呼叫者自動被涵蓋。建議放在方法最開頭、`email`
檢查之前。同時在 `verifyOidcSignature()` 內保留同一道檢查作縱深防禦（抽成 private
`assertAuthorizedParty(payload)` 供兩處呼叫），避免未來有人把 WS 路徑改回直接消費
`verifyOidcSignature()` 的回傳值而繞過 `buildOidcJwtUser`。

檢查邏輯：`typeof payload.azp === 'string' && payload.azp === process.env.OIDC_AUDIENCE`，
**否則一律拒絕（fail closed）**——含 `azp` 缺失、非字串、空字串三種情況，理由見 §2.2。

- 已實測確認 `azp` 值等於簽發時使用的 `client_id`，且與各 App 現有的 `OIDC_AUDIENCE` 環境變數
  同值（`wiki`／`chat`／`approve`…），**不需新增環境變數**；refresh 流程用同一組
  `AUTH_KEYCLOAK_ID`／`AUTH_KEYCLOAK_SECRET` 換發，`azp` 恆等於該 App 自己的 client_id，不受
  影響。
- 單一改動點（`@appspine/auth` 一個共用套件），且**不依賴 IdP 設定**——035 §4.5 正式 IdP
  選型換成 Okta／Entra 後這道檢查依然有效（只要新 IdP 也提供等效的「token 簽給誰」claim，
  見 §2.2）。
- 合法流程不受影響：使用者透過某 App 自己的 OIDC client 登入時，`azp` 本來就等於該 App 的
  `client_id`。

### 2.2 `azp` 缺失時必須 fail closed，並修正引用的規範依據

若 `azp` 缺失、非字串或型別不符，**必須視同驗證失敗**，不可放行。理由：這是唯一的防線——若
允許「無 `azp` 則放行」當 fallback，攻擊者只需要一張沒有 `azp` 的 token 就能繞過整道檢查，
等於漏洞原封不動。

**規範依據更正**（避免計畫援引錯誤的規格要求）：`azp` 在 OpenID Connect Core 1.0 §2 定義於
**ID Token**，且為 **OPTIONAL**（「only needed when the ID Token has a single audience value
and that audience is different than the authorized party」）；§3.1.3.7 的相關驗證規則是
**SHOULD**，不是 MUST。而 appspine 後端驗的是 **access token**，OIDC Core 對 access token 內容
不做規範；真正規範 JWT access token 的是 **RFC 9068**，其要求的必填 client 識別 claim 是
**`client_id`，不是 `azp`**——`azp` 在 access token 上是 Keycloak 的實作慣例，非跨 IdP 保證。

**因此 §5 風險已新增一項**：035 §4.5 正式 IdP 選型時，須把「access token 是否帶 `azp`（或等效
的 client 識別 claim）」列為選型檢核項；若新 IdP 只提供 `client_id`，檢查邏輯需擴充為
`azp ?? client_id`，而不是放寬成缺失即通過。

### 2.3 次修法：Keycloak realm 設定同步收斂（第二階段，非阻斷）

初版把這個方案定位為「不採用」，理由是「影響整個 realm 登入行為、不易漸進驗證與回退」——
覆核後這個成本評估**過度悲觀**：

- `aud` 變寬的根因是 `roles` client scope 的 audience-resolve mapper × 各 client
  `fullScopeAllowed: true`。**但每個 appspine client 都另有自己專屬的 `oidc-audience-mapper`**
  （例如 wiki 的 `"included.client.audience": "wiki"`），關掉 `fullScopeAllowed` 不會讓 token
  失去自己的 `aud`，該 mapper 仍會保證。
- appspine 的 RBAC 完全來自各 App 本地 DB（`buildOidcJwtUser` → `user.userRoles`），**沒有
  任何程式讀取 token 的 `realm_access`／`resource_access`**，關閉 `fullScopeAllowed` 不影響
  現有授權邏輯。
- Keycloak per-client 存取限制本來就是在 authentication flow 用 role condition 擋，不依賴
  token 內的 role claim。
- realm 是版本控管的單一 JSON 檔案，可逐 client 修改、逐 client 回退，並非不可漸進操作。

**定位為主修法完成後的第二階段（可選但建議）**：讓 `aud` 在 IdP 層就變窄，作為程式碼檢查之外
的縱深防禦，且能提前暴露「換 IdP 後 `aud` 語意是否改變」這類問題。**不阻塞本計畫的主修法先行
交付**，可另開 task 追蹤，不納入本計畫的完成條件。

## 3. 範圍

### 3.1 程式碼與測試

- 修改 `appspine/packages/auth/src/jwt-verifier.service.ts`：`buildOidcJwtUser()` 開頭新增
  `azp` 檢查（主檢查點）；`verifyOidcSignature()` 內同步檢查（縱深防禦），兩處共用抽出的
  `assertAuthorizedParty(payload)`。
- 補齊測試，至少涵蓋：
  - `jwt-verifier.service.spec.ts`：`azp` 相符／不符／缺失／空字串／非字串五種情境。
  - `oidc.strategy.spec.ts`：REST 路徑的 `azp` 相符／不符測試（初版完全遺漏這個檔案）。
  - chat 的 WebSocket gateway 測試：至少一個 `azp` 不符被拒絕的案例。
  - `azp` 相符但 `aud` 不含自己 → 仍須拒絕（確認新檢查是 **AND** 邏輯，不是取代既有 audience
    檢查）。
- **會直接打斷的既有測試**（實查已確認，須在同一輪修正，不可誤判為回歸）：
  `jwt-verifier.service.spec.ts` 內 5 處 `jwt.sign`／`buildOidcJwtUser` 直呼未帶 `azp`；
  `oidc.strategy.spec.ts` 的 payload fixture 同樣未帶 `azp`。
- 新增 `azp` 拒絕事件的伺服器端日誌（`logger.warn`，記錄期望與實際的 `azp` 值，不記 token
  本體、不記 email 以外的 PII）——初版完全沒有這條，會讓這道安全控制被觸發時毫無可觀測性。

### 3.2 傳播（更正：不是 template propagation 流程）

`@appspine/auth` 是**已發版 npm 套件**（`appspine/packages/auth/package.json`，目前
`5.0.0`），不在 `appspine-app-template` 內，`list-template-changes.mjs` 不會列出這次改動，
初版寫的 template replay 流程不適用。實際流程：

1. 在 `appspine` monorepo 內改 code + 補測試 + 建立 changeset（`appspine/.changeset/`）。
2. push 到 main，觸發 Release CI（`changesets/action@v1`）自動發版；用 `gh run list` 確認發版
   結果，不需手動 `pnpm publish`（參考既有慣例）。
3. **逐 repo 在同一個 commit 內同時改三處**：`backend/package.json` 的版本 range、
   `pnpm-workspace.yaml` 的精確版本 override、`pnpm-lock.yaml`——三者缺一，新版不會真的生效
   （各 repo 的 `pnpm-workspace.yaml` 對 `@appspine/auth` 有精確版本 override，光改
   `package.json` 的 `^5.0.0` range 不會拉到新版）。
4. `docs/template-sync.md` 只在 template repo 自身有檔案異動時才需回填；本次若 template 只是
   bump 依賴版本，回填內容應如實寫成「`@appspine/auth` 版本 bump」，比照各 repo 既有的
   package-bump 記錄寫法，不得虛構 replay 紀錄。
5. **版號決策**：此修法會拒絕先前接受的 token，屬行為破壞性變更，需先定案是 minor（`5.1.0`）
   還是 major（`6.0.0`）——選 major 會連帶影響 9 個消費端 repo 的 range 寫法，需一併規劃。

傳播對象：`appspine-app-template` + 8 個業務 App，共 **9 個消費端 repo**；加上 `appspine`
套件 repo 本身，**共 10 個 repo**。

### 3.3 已盤點、確認不受影響的相鄰認證路徑（不在範圍，但已排除遺漏風險）

- **App 對 App 的直接呼叫**：`apps/approve` 有兩處直連 `apps/master-data`
  （`org-integration/org-app-client.service.ts`、`master-data-sync/master-data-reconciliation.options.ts`），
  皆使用 **static M2M API key**（`x-api-key`），非 OIDC token，doc comment 明載
  「never a JWT/human login」。
- **mcp-gateway → 各業務 App**：`VaultedAppKey`，同樣是 static M2M API key。
- **`@appspine/m2m-api-key`**：`api-key.guard.ts` 完全不解析 JWT，是 sha256 比對各 App 自己
  DB 的 `ApiKey` 資料列，天然不可跨 App 重放。
- **drive 的 WOPI token**（`wopi/wopi-token.service.ts`）：自簽 HS256、不同 secret、不驗
  `aud`，與本問題機制不同，不受影響也不需修改。
- **mcp-gateway discovery push token**：獨立的 `push-token.guard.ts`，同樣與本問題無關。

**結論：全庫沒有任何合法設計依賴「A App 的 OIDC token 可用於 B App」**——所有 App 對 App 呼叫
一律使用各自 DB 內的 static M2M API key，與本次要修的 OIDC token 驗證路徑完全獨立。

**不在範圍**：§2.3 的 realm 設定調整（第二階段，另開 task）；正式 IdP 選型（035 §4.5，獨立
計畫）；[[Z30-mcp-auth-migration-feasibility]] 本身（已擱置，待有實際使用需求才重啟）。

## 4. 建議執行順序

`appspine` 套件先行（改 code、測試、發版），之後 9 個消費端 repo 建議依此順序：

1. **`appspine-app-template`**：所有 fork 的上游、有自己的 Keycloak client 與完整 e2e，改壞
   不影響任何業務資料，適合當第一個試點。
2. **`chat`**：唯一同時經過 REST 與 WebSocket 兩條路徑的 App，一次驗證兩個修補點；也是
   §1.3 攻擊路徑實際暴露面最大的 App，優先修有實質意義。
3. **`wiki`**：e2e 覆蓋最成熟，作為第三個交叉驗證點。
4. `calendar` → `project` → `drive` → `approve` → `master-data`（approve 排在後段是因為
   §3.3 那兩條直連 master-data 的路徑需額外確認 M2M 呼叫不受影響，雖然已判斷機制無關）。
5. **`mcp-gateway` 最後**：Z30 的關聯點、也是唯一對下游做委派呼叫的 App，其餘 App 穩定後再
   驗證整條鏈。

每個 repo 一個獨立 commit，`backend/package.json`／`pnpm-workspace.yaml` override／
`pnpm-lock.yaml` 三者務必在同一個 commit 內（見 §3.2 第 3 點），確保 revert 不會留下版本不
一致的中間態。

## 5. 完成條件（已全部達成）

以下五項條件已於 2026-08-04 全部完成；逐項實測、consumer commit、package release 與回歸證據
見 [log.md](../log.md) §3「plan §5 完成條件核對」。

- `@appspine/auth` 的 `buildOidcJwtUser()`（REST 與 WebSocket 的共同匯流點）與
  `verifyOidcSignature()`（縱深防禦）皆會拒絕 `azp` 與自身 `OIDC_AUDIENCE` 不符（含缺失／
  非字串／空字串）的 token。
- 以先前的實測手法重跑一次（`chat` 簽發的 token 打 `wiki` 的 REST API，非僅 WebSocket）確認
  **改為拒絕**，且該事件在後端 log 可觀測（見 §3.1 的 `logger.warn`）。
- 每個 repo 三項驗收：
  1. `pnpm -C backend test` ＋ `pnpm -C backend typecheck` ＋ `biome check`。
  2. `@appspine/e2e-kit` 的 `auth.spec`／`rbac.spec` 綠燈（走真實瀏覽器 authorization code
     flow，是 §5 風險 2 的直接實證，不需另外設計驗證手段）；chat 額外跑 WS handshake 測試。
  3. **負向驗收**：以另一個 client（建議用 `chat`）取得的 token 打本 App 的 `/auth/me`，
     預期 **401**——這是唯一能證明「修好了」的測試，須逐 App 執行，不能只在一個 App 上驗證
     一次就外推。
- 8 個業務 App + template 的既有登入／RBAC／WebSocket 測試全數通過，未因此修法產生回歸
  （§3.1 已列出會被打斷、需同步修正的既有測試，不得誤判為回歸而回退修法）。
- 9 個消費端 repo 的 `backend/package.json`／`pnpm-workspace.yaml`／`pnpm-lock.yaml` 皆已更新
  至含此修法的 `@appspine/auth` 版本；`docs/template-sync.md` 依 §3.2 第 4 點如實回填。

## 6. 風險處置與後續事項

1. ~~跨 App 依賴盤點~~ → **已於 §3.3 完成**，結論為無合法依賴，風險解除。
2. ~~`azp` 是否在 authorization code flow 簽發~~ → **已完成**。8 個業務 App 與 template 的
   `auth.spec`／`rbac.spec` 及跨 client 負向測試均已通過，證明實際登入 flow 與拒絕語意正常。
3. 035 §4.5 正式 IdP 選型時，須把「access token 是否帶 `azp` 或等效 claim」列為選型檢核項
   （見 §2.2）；**已回填 035 §4.5**。若新 IdP 不提供，修法需擴充為 `azp ?? client_id`，不可
   放寬為缺失即通過。這是未來 IdP 選型條件，不是 040 的未完成工作。
4. ~~版號決策~~ → **已選 major 並完成**。安全行為變更以 `@appspine/auth@6.0.0` 發布並傳播至
   8 個業務 App 與 template；後續加固版 `6.0.1` 亦已發布。
5. §2.3 的 realm `fullScopeAllowed` 收斂已評估並決定暫不執行，追蹤併入 035 §4.5；它是可選的
   IdP/realm 後續強化，不納入 040 完成條件。

## 7. 審查記錄

**第一輪（2026-08-04，Opus 獨立覆核，不採信初版文字、逐項回到程式碼與 realm 設定實查）**：
找出 5 項須修正的事實錯誤（其中 1 項阻斷級）與 8 項建議補強，全部已併入本版：

- **阻斷**：修復位置錯誤（REST 路徑不經過 `verifyOidcSignature()`，初版執行後 8 個 App 的
  REST API 完全不會被修到）→ 已改為 `buildOidcJwtUser()` 為主檢查點，`verifyOidcSignature()`
  作縱深防禦，並補上兩條路徑的架構對照表（§1.2）。
- 傳播機制錯誤（`@appspine/auth` 是已發版套件，非 template propagation 對象；各 repo 有精確
  版本 override，僅改 `package.json` range 不會生效）→ 已改寫 §3.2 為 changeset／發版／
  三檔同步更新流程。
- `azp` 缺失時的行為未定義，且被誤放進測試矩陣而非安全語意決策 → 已定案 fail closed，並更正
  引用的規範依據（`azp` 於 OIDC Core 為 ID Token 上的 SHOULD，非 access token 的 MUST；RFC
  9068 規定的 client 識別 claim 是 `client_id`）→ §2.2。
- App 數量錯誤（9 應為 8）→ 全文已更正為「8 個業務 App + template」。
- §5 風險 1 理由不實（「一律經 mcp-gateway」）→ 已重新完整盤點所有跨 App／跨信任邊界路徑
  （§3.3），確認皆為 static M2M API key，非 OIDC token，結論不變但理由改為可查核的盤點表。
- 建議補強已吸收：測試情境擴充與既有測試回歸清單（§3.1）、拒絕事件需可觀測（§3.1）、驗收
  手段具體化為 `e2e-kit` 既有工具＋負向測試（§5）、傳播分階段順序（§4）、攻擊路徑更精確定位
  到 chat（§1.3）、方案 2 從「不採用」改為「第二階段」並更正其成本評估（§2.3）、M2M 範圍
  確認寫入文件避免重複盤點（§3.3）。
- 查證後確認**原文正確、不需修改**的部分：`azp` 值等於 `client_id` 且與 `OIDC_AUDIENCE` 同值
  （含 refresh 流程不受影響）；全庫確認目前無任何 `azp` 檢查；`jsonwebtoken` 的 audience
  「任一相符即通過」語意（且 REST／WS 兩路徑共用同一份 `jsonwebtoken`）；單一 App 使用者不
  受影響；把此問題從 Z30 拆出獨立編號的判斷正確。

## 8. 參考資料

- [[Z30-mcp-auth-migration-feasibility]] §6 風險第 14 點（原始發現）
- [[035-oidc-only-auth-plan]]
- [`jwt-verifier.service.ts`](../../packages/auth/src/jwt-verifier.service.ts)
- [`strategies/oidc.strategy.ts`](../../packages/auth/src/strategies/oidc.strategy.ts)
- [OpenID Connect Core 1.0 §2（`azp` 定義）](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 9068（JWT Profile for OAuth 2.0 Access Tokens）](https://www.rfc-editor.org/rfc/rfc9068)
