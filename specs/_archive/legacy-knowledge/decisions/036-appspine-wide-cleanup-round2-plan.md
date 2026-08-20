---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-31
updated: 2026-08-03
---

# 036 - 共用套件與全部業務 App 程式清理、優化與重構（第二輪）- 系統設計計畫

> 狀態：待確認事項已全部定案（見第 7 節，CI Keycloak 方案已選定方案一），task breakdown 已建立於
> `_archive/dev_docs-20260803/framework/036-task-breakdown.md`（T-12800–12870，15 個 task），待執行。規劃過程經
> Opus 獨立審查修正，詳見第 6 節審查記錄。
> 動機：029（共用套件與全部業務 App 清理，第一輪）於 2026-07-20 定案、42/42 已完成；之後陸續
> 完成 030（drive）、031（mcp-gateway 跨 app 存取）、032/033（master-data 主檔）、035
> （OIDC-only auth 遷移）；034（自動佈署）已定案可排執行，但尚未開工（0/14，見 `034-task-
> breakdown.md`），不屬於本文件承接範圍。035 執行完後的事後安全審查（`Z27-oidc-migration-
> post-completion-review.md`，8 個平行 agent，涵蓋 `@appspine/auth`／`frontend-shell`／
> `e2e-kit`、8 個業務 app 與 `appspine-app-template`、`dev-infra`）範圍**只鎖定 auth/OIDC**，
> 過程中「順路撞見」幾個非 auth 的清理項目，先記成 `Z28-post-035-cleanup-candidates.md`（狀態：
> 記錄，未定案，暫緩，且明確聲明不是全庫稽核）。**本文件承接 Z28 §1「值得現在處理」的全部四項
> 候選並升格為正式計畫，另外補做一次 Z28 未涵蓋範圍的稽核**，比照 Z23→031、Z03→034 的既有
> 升格先例。Z28 §2「可以再等」的三項（scaffold-init.mjs 的風格警告、dev_docs Z-series 累積、
> package.json 版本標記風格不一致）狀態未變，不在本文件範圍內，若之後要處理需另外評估。Z28
> 已封存，不再獨立存在。
> **範圍：`appspine/packages/*`（12 個共用套件）+ 全部 8 個業務 app（wiki/calendar/drive/
> chat/project/approve/mcp-gateway/master-data）+ `appspine-app-template` 同步落差，不含新
> 業務功能、不含 Prisma schema 變更、不重開 OIDC/auth 安全性本身（Z27 已收尾）。**
> 盤點方法：Z28 §4 的小範圍審查（2026-07-31）+ 本輪 2 個獨立唯讀 Explore agent 平行審查（029/
> 002 文件格式慣例比對、appspine/packages 與跨 app 重複樣式補查），初版整理後**再經 1 個 Opus
> 獨立審查**（逐一 grep/md5 交叉核實文件內每一項具體數字與宣稱），抓出呼叫點算少、檔案清單
> 算漏、待確認事項其實已有答案、工作包間平行執行敘述互相矛盾等問題並修正——方法比照 029 當時
> 「盤點 + Opus 二次審查」的流程。修正細節與審查方法侷限見第 6 節。

---

## 1. 背景

029 完成後，appspine 又新增了一個業務 app（master-data，032/033）、一輪跨 app agent 存取機制
（031），並在 2026-07-30 完成了 035（廢止 local auth，統一 OIDC）。035 收尾後的事後審查（Z27）
用 8 個平行 agent 逐一讀過 `@appspine/auth` 等核心套件、8 個業務 app 與 template 的 auth 相關
程式碼、`dev-infra` 的 Keycloak 設定，修復了多項真實的 auth/OIDC 缺陷，但審查範圍刻意侷限在
「跟 auth 有關的路徑」——過程中「順路撞見」的非 auth 問題只被記錄下來（Z28），沒有被系統性地
擴大追查。同時，029 本身也在第 6 節（盤點方法侷限）明講：它是一次性的橫向盤點，029 完成後
appspine 又持續開發了近半年，從未再做過第二次全庫清理。

本次盤點目的：

1. 把 Z28 已經摸清楚範圍、風險可控的機械式修復項目正式排入執行序列。
2. 補做 Z28 明確聲明「沒涵蓋」的範圍——非 auth 相關的跨 app 重複邏輯、`appspine/packages` 內部
   的重複/死碼、029 之後新加入的 app（master-data）是否也累積了類似的技術債。
3. 確認 CI `e2e.yml` 的 Keycloak service 缺口該用哪個方案解決，即使本輪不一定能做完。

## 2. 盤點結果總覽

> 優先度採兩個軸線（比照 029 §2 的原則）：**風險軸**（放著不動，實際會不會出事：曾經真的
> 導致開機崩潰，還是純粹外觀/型別層級、不影響執行期行為）與**成本軸**（修起來貴不貴、牽動
> 範圍多廣）。這兩軸不永遠同向——`@nestjs/jwt` 死依賴便宜且零風險，不因為便宜就排進高優先；
> 反過來 `frontend-shell` 型別缺口雖然不影響執行期行為，但牽動 9 個 repo 共 45 個呼叫點，
> 修起來的範圍成本不小，仍需要正視。以下依實際風險/成本分軸列出。

### 🔴 高優先（有真實開機崩潰紀錄）

| 發現 | 位置 | 說明 |
|---|---|---|
| `@appspine/*` 套件版本/overrides 對齊 | 9 個 repo 的 `pnpm-workspace.yaml` | Z27 審查中 chat、project、approve 都撞過 `UnknownDependenciesException`（class-identity 不一致的 DI 崩潰）；master-data 先前也發生過同類崩潰（Z27 §2.4）。根因是 `pnpm-workspace.yaml` 的 `overrides:` 覆蓋不完整——只有 `apps/drive` 覆蓋全部 8 個套件，其餘 8 個 repo 只覆蓋 2-3 個。但覆蓋範圍不是唯一因子：master-data 屬於「3 個套件」的中間覆蓋層級也照樣崩潰過，代表 overrides 不完整是**必要但非充分**的風險因子，實際觸發時機還跟個別套件的連動 bump 順序有關，不能簡化成「覆蓋越少風險越高」的線性關係。`apps/drive` 的完整 overrides 應推廣為範本，但 drive 自己的版本也已過時（見工作包 A 說明），不能原封不動照抄。 |

### 🟡 中優先

| 發現 | 位置 | 說明 |
|---|---|---|
| `frontend-shell` 共用表格元件型別缺口 | `appspine/packages/frontend-shell/src/components/admin/` 6 個共用元件 | `t` prop 型別 `(key: string) => string` 跟各 App 實際 scoped 翻譯函式的 literal union 型別不相容，經 Opus 逐一 grep/呼叫點盤點確認：**45 個呼叫點**（9 個 repo，含先前 Z28 §4.1 漏算的 domain-events 三個頁面 × 6 業務 App = 18 個呼叫點），共五種不同 workaround（`as any`／`as Parameters<typeof t>[0]`／具名變數轉型／domain-events 頁面的 inline cast／mcp-gateway 少數頁面的 `as never`）。另外 mcp-gateway 的 `audit-logs`／`gateway-profiles`／`vault` 三個頁面雖然也用 `as never`，但消費的是它自己的**本地元件**（`AuditLogTable`／`GatewayProfilesTable`／`VaultedKeysTable`），不是這 6 個共用元件，**不算在本項範圍內**——這 3 個本地元件是否有同樣的型別問題，留給工作包 F 或另開記錄，不預設答案。 |
| 前端共用邏輯二次收斂 | `frontend/src/lib/cookie.client.ts`、`frontend/src/scripts/theme-boot.tsx`、`frontend/src/server/api-client.ts` | 跟 admin-table 問題同一種「該進 frontend-shell 卻沒進去」模式，029 工作包 B 沒有涵蓋這三個檔案（029 涵蓋的是 `select.tsx`／`use-mobile.ts`／`layout-utils.ts`／`theme-utils.ts`／`header-breadcrumbs.tsx`／`audit-meta.ts`／`recordAudit()`／`webhook-post.handler.ts` 的 helper 部分／`use-lg.ts`，沒有這三個檔案）。經 Opus 用 md5 逐一核實：`cookie.client.ts` 在 7 個 App + template 共 8 份逐字相同（24 行），`project` 是 13 行子集變體（少了 `getClientCookie`／`deleteClientCookie`）；`theme-boot.tsx` **全部 9 個 repo 逐字相同**（120 行）；`api-client.ts` **8 個 repo + template 共 9 份逐字相同**，只有 `chat` 有 17 行差異——而這 17 行差異不是命名差異，是 Z27 §2.4 已記錄的**刻意設計**：chat 因為 WebSocket 需要在瀏覽器端直接取得 `session.accessToken`，其餘 8 個 repo 都改用伺服器端專屬的 `getAccessToken()` 避免把 token 洩漏到 client JS。這個發現已經解答了原本以為需要另外調查的開放問題（見第 7 節）。 |
| `apps/approve` backend 死碼/lint-exempted 標記異常集中 | `approval-instances.service.ts`（10 處）、其 spec（5）、`leave-requests.service.ts`（4）、`expense-claims.service.ts`（4）、`approval-enabled.service.ts`（4）、`shared/access.ts`（1），共 **28 處** `eslint-disable`／`biome-ignore`／`@deprecated`（原始盤點只列出前四個檔案共 23 處，經 Opus grep 補上後兩個檔案才湊齊 28） | 全部 8 個業務 App + template 的 `backend/src` 用同樣方法量測，**只有 approve 有任何標記，其餘 7 個 App + template 全部是 0**——這個對照已經確認，不是待驗證的假設。`approval-enabled.service.ts`（4 處）與 `shared/access.ts`（1 處）初步檢視像是 Prisma `tx` 參數泛型缺口的既有合理標記，工作包 D 判讀時應對這 5 處抱持「可能本來就 load-bearing」的預期，重點放在另外 23 處是否為兩次重寫（固定表單→動態範本→廢止重回固定表單）留下的死碼。 |
| `appspine/packages` 內部重複/死 export 未深查 | `frontend-shell`（62 檔／6539 行）、`domain-events`（27 檔／3162 行） | 兩個套件明顯是規模最大的兩個，是內部重複／死 export 最可能藏身的地方，本輪只做了粗量測（檔案數/行數），沒有深入讀過內容。全部 12 個套件的 `src/` 底下沒有任何 `TODO`/`FIXME`/`HACK`/`XXX` 標記——這是如實記錄的觀察，**不代表已經很乾淨**，只代表這個 codebase 沒有使用這類標記的習慣，需要靠實際讀碼而非關鍵字搜尋來找重複。 |

### 🟢 低優先（零執行期風險，或需要獨立設計決策）

| 發現 | 位置 | 說明 |
|---|---|---|
| `@nestjs/jwt` 死依賴殘留 | `apps/drive`、`apps/chat`、`apps/project`、`apps/approve`、`apps/mcp-gateway`、`appspine-app-template` 的 `backend/package.json` | 035 的 T-12645（拿掉 local-auth 專屬基礎設施）當時該清掉卻沒清乾淨，`apps/wiki`、`apps/calendar` 是 Z27 審查時才被抓到、已修復；六個 repo 的 `backend/src` 逐一確認無任何 `@nestjs/jwt` import，屬純殘留死依賴，移除**零執行期風險**——列低優先不是不重要，是明確跟上面 🔴 的版本對齊項風險等級不同，不該用同一種急迫度處理，只是因為修法簡單，順手跟工作包 A 一起做。 |
| CI `e2e.yml` 的 Keycloak service 缺口 | 9 個 repo（含 template）的 GitHub Actions `e2e` job | Z28 §4.4 已確認根本限制：`dev-infra` 的 realm 匯出檔只存在於 `dev-infra` 這個 repo，9 個 App 各自跑在自己的 checkout 裡拿不到，且 `services:` container 在 `actions/checkout` 之前就啟動、無法直接掛載。三個候選方案（bake 自訂 Keycloak image / checkout 後 REST 匯入 / cross-repo checkout `dev-infra`）都需要新 credential 或新 pipeline，且都要真實 CI 執行結果驗證，不是能憑空規劃完的工作，需要獨立的設計決策與 pilot 驗證。 |

> 本輪盤點方法（Z28 既有審查 + 本次 2 個唯讀 Explore agent）沒有專門做安全誤設掃描，因此**不是
> 「確認沒有」，而是「這次沒有專門找」**——跟 029 §6 對 `JWT_SECRET` fallback 發現方式的說明
> 一致，不宣稱本輪盤點涵蓋安全掃描。

## 3. 非目標

- 不新增任何業務功能。
- 不做 Prisma schema 變更。
- 不重開 OIDC/auth 安全性本身——Z27 已完整審查並修復完成（2026-07-31），本輪不重複驗證那個
  範圍。**例外**：工作包 C 收斂 `api-client.ts` 時會直接碰到 chat 的 `session.accessToken`
  例外（Z27 §2.4 記錄的刻意設計），這不是重開安全審查，而是收斂共用邏輯時**必須保留**這個
  既有的安全設計決策，不能因為追求一致性把它一併抹平。
- 不做效能 profiling、跨套件整合測試（除工作包 A 版本對齊本身需要的 boot smoke test，見工作包
  A 說明）、CVE/依賴安全性掃描、系統性 secret/authz 掃描、Prisma migration drift 檢查——跟
  029 §6 列出的五項既有排除項一致，狀況未變，這些仍然是「留給下次盤點」的範圍，不是本輪疏漏。
- 工作包 E（CI Keycloak 缺口）本輪只做到方案選定與 pilot 驗證，**不承諾這一輪就把 9 個 repo
  全部接上**——如果 pilot 驗證後發現工作量明顯超出「準正式計畫」的量級，比照 Z03→034 的先例
  另外切一個獨立編號計畫（037），不勉強塞進本文件收尾。

## 4. 工作包

> 執行順序見第 5 節。**工作包 A 與工作包 B/C 不能平行**——兩者都會改動全部 9 個 repo 的
> `frontend/package.json` 與 lockfile（A 是版本對齊，B/C 是消費新發布的 `frontend-shell`），
> 平行執行會互相踩檔案，必須依序進行。工作包 D、F 可與 A 或 B/C 平行（不同 repo／唯讀稽核為
> 主，沒有鎖檔衝突）。工作包 E 風險與不確定性最高，放最後。

### 工作包 A｜死依賴清除 + 套件版本/overrides 對齊

- 移除 `apps/drive`、`apps/chat`、`apps/project`、`apps/approve`、`apps/mcp-gateway`、
  `appspine-app-template` 六個 repo 的 `@nestjs/jwt` 依賴（`backend/package.json` 刪除該行 +
  重新產生 lockfile）。零執行期風險，可獨立於本工作包其餘項目先做。
- 把 `apps/drive` 的 `pnpm-workspace.yaml overrides:` 區塊（覆蓋全部 8 個 `@appspine/*` 套件）
  當範本，推廣到其餘 8 個 repo（wiki/calendar/chat/project/approve/mcp-gateway/master-data/
  template）——但 **drive 自己的版本先要修正**：`apps/drive/backend/package.json` 內還有一份
  重複的 `pnpm.overrides` 區塊，跟 workspace 層級的版本沒有同步（含過時的
  `@appspine/health-check: 0.1.2`，最新已發布 `0.1.3`），這份重複區塊本身就是 Z28 §2「可以
  再等」清單裡提過的落差，本輪順手一併修掉，避免拿一個已經漂移的「範本」去推廣。
- 各 App 宣告的版本 range 補到目前最新已發版版本（Z28 §4.2 列出的清單）。**注意其中
  `@appspine/domain-events`（`^1.0.0` → `3.0.0`）與 `@appspine/health-check`
  （`^0.1.2` → `0.1.3`）是跨主版本／跨版號的升級**，雖然查過 CHANGELOG 確認是連動 patch
  bump、沒有實際行為變更，但這正是 §3 排除的「跨套件整合測試」風險會發生的地方——本工作包的
  驗收不能只看 `tsc --noEmit`/`biome check`，每個 repo 版本對齊完成後，必須額外跑一次 backend
  啟動的 boot smoke test（確認不拋 `UnknownDependenciesException` 等 DI 例外），作為工作包 A
  專屬、範圍明確的驗證項目，不是要補齊整合測試基礎設施。

### 工作包 B｜frontend-shell 共用表格元件型別缺口修復

- 重新設計 `appspine/packages/frontend-shell/src/components/admin/` 6 個共用元件的 `t` prop
  型別（方向：`<TKey extends string>` generic，取代目前的 `(key: string) => string`），處理
  元件內部本來就寫死呼叫 `t()` 的 key（按鈕文字等）。
- 發布 `frontend-shell` 新版本。
- 9 個 repo（8 業務 App + template）逐一更新全部 **45 個**呼叫點（含 roles/users/api-keys 頁面
  與先前遺漏的 domain-events 三個頁面），移除五種既有 workaround，bump `frontend-shell` 依賴到
  新版本。mcp-gateway 三個本地元件（AuditLogTable 等）的 `as never` 不在本工作包範圍內。

### 工作包 C｜前端共用邏輯二次收斂

> 跟工作包 B 綁在同一次 `frontend-shell` 版本發布週期一起做，避免兩次 publish/consume 循環；
> 兩者合計會改動全部 9 個 repo 的 `frontend/package.json`，因此必須排在工作包 A 完成之後（見
> 第 5 節），避免跟 A 的版本對齊互相衝突同一批檔案。

- `cookie.client.ts`、`theme-boot.tsx` 收斂進 `frontend-shell`（已確認全數逐字相同或子集
  關係），8 個 App **與 template** 改用套件版本、刪除本地複製檔。
- `api-client.ts` 收斂為 `frontend-shell` 內的 parameterized base module（8 個 repo + template
  已確認逐字相同，可直接搬；`chat` 的差異需要保留為可設定的行為，不是要消除的不一致）。
  **明確限制**：chat 的 `session.accessToken` 客戶端取得路徑是 Z27 §2.4 記錄的刻意安全設計
  （WebSocket 需要），收斂時必須讓 chat 能透過參數/設定保留這個行為，不得為了統一實作而讓 chat
  改用其他 8 個 App 的 `getAccessToken()` 路徑。

### 工作包 D｜apps/approve backend 死碼集中區清查

- 逐一檢視全部 28 處 `eslint-disable`／`biome-ignore`／`@deprecated`（六個檔案，見第 2 節列表），
  判定哪些仍 load-bearing、哪些是兩次重寫留下的死碼。`approval-enabled.service.ts`／
  `shared/access.ts` 的 5 處初步判斷像是既有合理標記，判讀時預期它們大機率保留，重點放在其餘
  23 處。
- 依判讀結果，實際清除確認可移除的項目；仍 load-bearing 的項目補上說明其原因的簡短註解（若
  原本沒有）。

### 工作包 E｜CI e2e.yml Keycloak service 缺口

- 已定案選**方案一（Bake 自訂 Keycloak image）**（見第 7 節）：把 `dev-infra` 的 realm 匯出檔
  COPY 進自訂 Keycloak image、推到 GHCR，CI 的 `services:` 直接引用；新建對應的 image 發布
  pipeline，確認所需的 registry 寫入權限（範圍侷限在 `dev-infra` 自己的發布流程）。
- 選一個 pilot repo 落地驗證，確認 CI 能真的跑過 Keycloak-backed 的 auth e2e。**選 pilot
  時需注意**：`apps/mcp-gateway` 雖然是 Z27 慣用的 pilot repo，但其 e2e 目前已知有一個跟本工作
  包無關的既有缺陷（Z27 §5：`gateway-profile-api-keys` 缺少 `holderIdentifier`／
  `holderDisplayName`，7/8，031 範圍的既有問題），驗收標準應設定為「Keycloak-backed 的 auth
  e2e 規格能跑過」，不是「整個 e2e 套件全線變綠」，避免把不相關的既有紅燈算成本工作包沒做完。
  Pilot 驗證通過後再評估是否本輪就推廣到其餘 8 個 repo，或另開獨立計畫（037）處理推廣。

### 工作包 F｜補充稽核

- 深讀 `appspine/packages/frontend-shell`、`appspine/packages/domain-events` 內部程式碼，找出
  內部重複邏輯或未使用的 export。
- 已確認全部 8 個業務 App + template 的 `backend/src` 死碼標記量測（`eslint-disable`／
  `biome-ignore`／`@deprecated`）只有 approve 有非零結果（見第 2 節），這項在本輪規劃階段已經
  做完，不再是待執行 task；若之後想擴大到 frontend/src 或其他標記類型，屬於另一個獨立範圍，
  非本工作包延伸。
- 順手檢查 mcp-gateway 三個本地元件（`AuditLogTable`／`GatewayProfilesTable`／
  `VaultedKeysTable`，見工作包 B 排除說明）是否有同樣的 `t` prop 型別問題，若有則記錄範圍供
  之後排入，不在本輪直接修。
- 彙整本工作包的稽核結果：若發現具體、範圍明確的新清理項，開新 `Z0x-...` 記錄文件（不在本輪
  036 範圍內直接動手修，比照既有「計畫外問題另開記錄」慣例）；若沒有發現顯著問題，直接記錄
  「已查無異常」作為本輪盤點的收尾證據。

## 5. 建議執行順序

1. 工作包 A（死依賴清除 + 版本對齊）——**必須先於工作包 B/C**，因為兩者都會改動全部 9 個 repo
   的 `frontend/package.json` 與 lockfile，同時進行會互相衝突。`@nestjs/jwt` 移除部分零風險，
   可最先做；版本對齊部分需搭配 boot smoke test 驗證（見工作包 A 說明）。
2. 工作包 B、C 同一輪處理（共用同一次 `frontend-shell` 版本發布），在工作包 A 完成之後進行。
3. 工作包 D、F 可與工作包 A 或 B/C 平行推進（不同 repo／唯讀稽核為主，沒有鎖檔衝突）。
4. 工作包 E 最後執行——需要獨立設計決策且必須用真實 CI 執行結果驗證，不適合跟其他工作包的
   節奏綁在一起，很可能延伸成獨立的 037。

## 6. 盤點方法侷限與 Opus 審查修正記錄

沿用 029 §6 的既有排除項（效能 profiling、跨套件整合測試缺口、CVE/依賴安全性掃描、系統性
secret/authz 掃描、Prisma migration/schema drift），狀況未變，這些仍不是本次盤點範圍（工作包
A 需要的 boot smoke test 是例外，範圍明確限定在該工作包本身，見 §3）。

本文件初版寫完後，比照 029 當時「盤點 + Opus 二次審查」的流程，另外派一個 Opus agent 對初版做
獨立審查（逐一用 grep/md5 核對文件內的具體數字與宣稱，而非只讀文件本身）。審查抓出並已在本版
修正的問題：

- **呼叫點/檔案清單算少**：工作包 B 的呼叫點數原本沿用 Z28 §4.1 的 30，經核實正確數字是 45
  （漏算 domain-events 三個頁面 × 6 App），且原本算進去的 mcp-gateway 3 個 `as never` 其實不是
  同一批共用元件的消費點；工作包 D 的 approve 死碼檔案清單原本只列 4 個檔案共 23 處，經核實
  應為 6 個檔案共 28 處。這跟 029 當時 `audit-meta.ts` 因路徑變體被漏算的失誤是同一類問題。
- **待確認事項其實已有答案**：原初版把 `api-client.ts` 的收斂方向列為待確認事項、需要額外比對
  任務，經 Opus 用 md5 核對 9 個 repo 後發現 8 個逐字相同、唯一的差異（chat）是 Z27 已記錄的
  刻意安全設計，不是未知數，本版已直接把決策寫進工作包 C，不再是開放問題。
- **優先度分軸不清**：原初版把 `@nestjs/jwt` 死依賴（零風險、純衛生）跟版本對齊（有真實開機
  崩潰紀錄）並列為同一個 🔴 高優先分類，跟 029 §2 當時特別點出的「優先度不是單一軸線」原則
  矛盾。本版把 `@nestjs/jwt` 移到 🟢，只保留版本對齊在 🔴。
- **工作包間平行執行敘述矛盾**：原初版一邊說工作包 C 可以跟工作包 A 平行，一邊又說 B/C 要跟
  A 依序進行，兩處互相矛盾；且 A 與 B/C 確實會改到同一批 `frontend/package.json`／lockfile
  檔案，不能真的平行。本版已修正為「A 必須先於 B/C」，只有 D/F 可以跟其他工作包平行。
- **CI pilot 的驗收標準未考慮已知缺陷**：工作包 E 原本沒提到 mcp-gateway 的 e2e 有跟本工作包
  無關的既有紅燈（Z27 §5 記錄的 031 範圍缺陷），驗收標準若寫「整個 e2e 套件變綠」會誤判本工作
  包沒做完，本版已修正驗收標準的措辭。
- **overrides/DI 崩潰的關聯性描述過度確定**：原初版說 mcp-gateway 也在 Z27 撞到的崩潰名單裡
  （沿用 Z28 §4.2 的措辭），但複查 Z27 原文只點名 chat/project/approve，並提到 master-data
  先前也崩潰過——而 master-data 屬於「3 個套件」覆蓋層級，不是覆蓋最少的那組，代表 overrides
  覆蓋範圍不是崩潰的唯一預測因子。本版已修正措辭，不再暗示簡單的線性因果關係。

這次 Opus 審查同樣是唯讀複核，沒有涵蓋的範圍（跟 029 §6 的既有五項排除一致）仍未涵蓋，執行
過程中若再發現盤點本身有誤差，比照既有慣例另開 `Z0x-...` 記錄，不要靜默修正本文件。

## 7. 待確認事項

1. **CI Keycloak 缺口的方案選定**：✅ 已定案，選**方案一（Bake 自訂 Keycloak image）**——把
   `dev-infra` 的 realm 匯出檔 COPY 進自訂 Keycloak image、推到 GHCR，CI 的 `services:`
   直接引用新 image。理由：最符合現有「共用套件走發布流程」的慣例（跟 `@appspine/*` 套件發布
   模式一致），且所需的新 registry 寫入權限範圍侷限在 `dev-infra` 自己的 image 發布 pipeline，
   比方案三需要一個能讀取 `dev-infra` repo、且要發給全部 9 個 repo CI 使用的新 PAT 範圍更小、
   更容易稽核。方案二（checkout 後 REST 匯入）因為沒有真正解決「realm 檔怎麼進到這次
   checkout」的根本問題，不算獨立方案，已排除。工作包 E 的 T-12850 從「選定方案」改為「落地
   方案一所需的 image 發布 pipeline + registry 權限」，範圍已明確，可直接排入 pilot 驗證
   （T-12855）。
2. **Task ID 區間**：`dev_docs/INDEX.md` 目前用到 T-12660（035）。034→035 之間留了 170 的緩衝
   （T-12330→T-12500），本輪規模預期小於一整輪業務 app 上線，緩衝抓小一點，`036-task-
   breakdown.md` 建議從 **T-12800** 起分配（緩衝 140，非嚴格比照 034→035 的 170，實際起點於
   建立 task breakdown 時再次確認 INDEX.md 當下最新使用到的編號）。

