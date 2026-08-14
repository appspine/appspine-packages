# Knowledge Log - appspine-workspace

## [2026-08-14] complete | 048 | `appspine-packages` 15 套件深度清理完成

完成 15 個套件的入口可達性、strict unused、依賴、重複區塊、tarball 與 CVE 稽核。補上
`health-check` characterization tests 與精確 Terminus adapter 型別；全套件統一 `files` allowlist；
升級 bcrypt 6 並鎖定 MCP 的修補版 Hono 鏈。驗證結果為 521 tests、15 套件 typecheck/build、
package-scoped Biome、15 個 tarball exports、6 個 integration contracts、knowledge lint 全綠，
production audit 從 20 個漏洞降為 0。changeset 已建立，未手改版本號；下游 repo 維持唯讀。
Keycloak 26.2.5 啟動後，042 的套件正向、inbound-verifier 負向與 dev-infra provider smoke matrix
均以 canonical issuer `http://host.docker.internal:8180` 真實驗證通過。
追加清除範圍外的根層 Biome 紅燈，保護 approved contract schema bytes 不受 formatter 改寫，並補上
047 重構遺漏的 043 fixture 套件路徑；根層 lint 與 fixture／contract gates 全綠。

## [2026-08-14] plan | 048 | `appspine-packages` 套件清理計畫（第一階段：範圍界定與盤點交接）

建立 `decisions/048-shared-packages-cleanup-scoping-plan.md`。使用者要求對套件/範本/業務 app
三層做深度清理，決定從 `appspine-packages` 開始並交給 codex 執行。本文件盤點 15 個套件的規模
與內部依賴分層、跨 8 個業務 app + template 的下游消費情形、既有版本發布/契約管理工具
（changesets discipline、`contract-cli.mjs`、042 的 e2e 驗證腳本）。不是逐檔程式碼稽核，只是
交接前的範圍簡報，深度清理由 codex 接手。待確認事項：`oidc-delegation` 零下游消費的處理方向、
`apps/drive` 空目錄意圖、`health-check` 補測試排程。

## [2026-08-12] refactor | 043 | Repo 重整 Phase 8：歸檔與清理剩餘重號子歷史檔

將以下 5 份附屬歷史審查與 task breakdown 檔案歸檔並移除：
- decisions/026-t-10970-g7-dry-run-evidence.md
- decisions/026-t-10970-gate-review.md
- decisions/029-work-package-d-template-sync-execution.md
- decisions/029-work-package-e-mcp-gateway-sync-execution.md
- topics/034-task-breakdown.md

歷史細節已留存於日誌與 Git History。

## [2026-08-12] refactor | 043 | Repo 重整 Phase 8：歸檔 decisions/ 內 11 份 completed 任務拆解文件

配合 repo 重整計畫，將以下 11 份位於 `decisions/` 的 `status: completed` 歷史 task breakdown 文件正式歸檔並移除：
- 004-task-breakdown.md
- 005-task-breakdown.md
- 006-task-breakdown.md
- 007-task-breakdown.md
- 008-task-breakdown.md
- 009-task-breakdown.md
- 010-task-breakdown.md
- 018-task-breakdown.md
- 019-task-breakdown.md
- 021-task-breakdown.md
- 035-task-breakdown.md

歷史任務拆解細節已留存於日誌與 Git History。

## [2026-08-12] refactor | 043 | Repo 重整 Phase 4：歸檔與刪除 19 份 status: completed 的 Topic 文件

配合 repo 重整計畫，將以下 19 份 `status: completed` 的歷史 topic 文件正式歸檔並移除：
- 020-task-breakdown.md
- 026-task-breakdown.md
- 027-task-breakdown.md
- 028-task-breakdown.md
- 029-task-breakdown.md
- 036-task-breakdown.md
- 037-task-breakdown.md
- 038-task-breakdown.md
- 040-task-breakdown.md
- 041-task-breakdown.md
- 042-task-breakdown.md
- 043-baseline-inventory.md
- 043-task-breakdown.md
- 044-baseline-inventory.md
- 044-i18n-notification-contract.md
- 044-task-breakdown.md
- 044-technical-contracts.md
- 044-ux-spec.md
- 045-task-breakdown.md

歷史決策與任務拆解細節已完全發布並留存於日誌。

## [2026-08-05] lint | 知識庫狀態漂移清理與防再犯檢查

清理 workspace 與各 App 的 task breakdown 狀態：已全數勾選的文件統一改為
`status: completed`，回填 004 T-206、005 T-516 與 drive 030 T-11643 三個已由現況證明完成但
仍為 `[ ]` 的 task，並修正 028／029 等文件仍宣稱「待執行」的摘要。同步重新產生 9 份受影響的
`knowledge/index.md`，補回 workspace index 遺漏的 038 task breakdown。

擴充 `scripts/lint-knowledge.js`：現在涵蓋 workspace、framework、template 與八個業務 App，會驗證
frontmatter/status、task checkbox 一致性、index 完整與新鮮度、Markdown／Obsidian 本地連結、
copy 狀態，以及入口文件中的已淘汰能力描述；新增 `--write-indexes` 作為明確的 index 重建入口。
同批修復遷移後殘留的失效相對連結，並將 framework／template／App 入口文件中的 Auth 描述統一為
OIDC-only。正式執行 read-only lint：158 份 knowledge 文件與 68 份入口文件全數通過。

## [2026-08-04] security | 040 | `@appspine/auth@6.0.1` 傳播完成，9 個消費端 repo 全數升級

原本決定 6.0.1（Opus 覆核後的測試鑑別力/log 可觀測性加固，見下一則）先不急著傳播，使用者隨後
改變主意（「還是升上去好了，避免之後忘了」），改為立即批次升級，避免日後遺忘造成 9 個 repo
版本分裂。逐一在 template、chat、wiki、calendar、project、drive、approve、master-data、
mcp-gateway 執行：`pnpm-workspace.yaml` override 改 `6.0.1` → `pnpm install` → 以
`require(...).version` 驗證實際解析版本 → `pnpm -C backend test`／`typecheck`（template 無
test script，只驗 typecheck）全過 → 單一 commit（override + lockfile）→ push。9 個 repo 全部
確認 `override=resolved=6.0.1`、與 origin 同步，無殘留未推送變更。`backend/package.json` 的
`^6.0.0` caret range 已涵蓋 6.0.1，未逐一修改該檔案。

## [2026-08-04] security | 040 | Opus 深度覆核 azp 修法，發現測試鑑別力缺陷並修復（appspine@6.0.1）

040 收尾後應使用者要求，另外派 Opus（general-purpose agent，worktree 隔離）對
`packages/auth/src/jwt-verifier.service.ts` 的 `assertAuthorizedParty` 做對抗性深度覆核。
結論：**生產程式碼本身沒有繞過漏洞**（REST／WS 兩條路徑、9 個 App 的 `OIDC_AUDIENCE` 對應、
fail-closed 語意都覆核通過），但**測試本身失去鑑別力**——4 個發現：

1. `jwt-verifier.service.spec.ts` 驗證 azp 缺失／空字串／非字串／不符的 `it.each` 測試，預設
   `findUnique` 回傳 `null`，即使 `assertAuthorizedParty` 被整個刪掉，程式碼會落到「查無使用者
   → JIT provision 失敗」這條路，恰好也丟 `UnauthorizedException`，測試照樣綠燈但理由完全錯誤。
   `040-task-breakdown.md` T-15360 記錄的 mutation test 宣稱有驗證這件事，實際上**不成立**。
2. `email_verified === false` 測試的 payload 沒帶 `azp`，實際測的是 azp 缺失分支，
   `email_verified` guard 零覆蓋。
3. `logger.warn` 沒有照 T-15390 的宣稱記錄期望／實際的 `azp` 值，真的被跨 App 重放跟單純設定
   打錯字在 log 上長得一樣。
4. `payload.azp` 用一般屬性存取讀取，理論上（目前無可達路徑）可被 prototype pollution 繞過。

**修復並以 mutation test 雙向驗證**：把 4 個 `it.each` 案例改用「查得到既有使用者」的 mock（若
azp 檢查被移除，程式碼會直接成功回傳而非巧合丟出同型例外）；補上 `azp` 讓 `email_verified`
測試測到真正該測的分支；`logger.warn` 加入期望／實際 azp 值並新增斷言其存在、且不含 token
本體的測試；`azp` 改用 `Object.prototype.hasOwnProperty.call` 讀取。實際把
`assertAuthorizedParty` 改回原本那種 truthy-guard bypass 手法跑過一次全套測試，確認新版測試
會正確轉紅（`missing`／`empty` 兩案例），改回原始 patch 後確認全綠——證明這次修復後的測試才是
真的有鑑別力，不是只看起來有。`test`／`typecheck`／`build`／`biome check` 全過（36 個測試）。

以 changeset（patch）發布為 `@appspine/auth@6.0.1`（PR #10，`gh pr merge` 後 Release CI
自動發版），並在暫存目錄實測 `pnpm install @appspine/auth@6.0.1` 成功解析安裝，確認 registry
上真的拿得到。**尚未傳播到 9 個消費端 repo**——這是可選的後續工作，非阻斷性（沒有已知漏洞需要
消費端立即升級，純粹是測試品質與可觀測性的加固），留待需要時再處理。

## [2026-08-04] security | 040 | 完成收尾（接手前一個 agent 卡住的執行）

前一個 agent（codex）在 §3 記錄「Browser E2E and cross-client `/auth/me` negative checks
remain pending because the required `E2E_BASE_URL` and running authorization-code-flow
environments were unavailable」後卡住未再推進；`apps/chat/backend/src/chat/chat.gateway.spec.ts`
已建立但未 commit。接手後查明卡點：多個 App（`chat`／`wiki`）的 Next.js dev server 因
Turbopack 持久化 cache 損壞，`/dashboard` 等頁面請求會無限期不回應（與使用者另外回報的
`appspine-app-template` 3901 連續轉圈同一類問題），導致 e2e 的 `page.waitForURL` 全數逾時；
清掉 `.next` 重啟後恢復正常。E2E 指令本身另需要 `E2E_API_URL`／`E2E_BASE_URL` 環境變數
（`.github/workflows/e2e.yml` 有寫死公式，本地手動執行未預先 export 會直接報錯，這也是前一個
agent 卡住的一部分）。

修正並補齊後的實測結果：

- `chat.gateway.spec.ts` 已 commit（`116e6dd`），`pnpm -C backend test`／`typecheck`／
  `biome check` 全過。
- `chat` e2e（`auth.spec`＋`rbac.spec`＋`chat-golden-path.spec`，含真實瀏覽器 WS 訊息收發）
  7/7 通過；負向測試以 `wiki` token 打 `chat` 的 `/auth/me` 得 401，WS handshake 以同一個
  token 連線被拒（並用合法 `chat` token 做正控制，確認連線成功）；chat 前端 `accessToken`
  暴露面複核完畢、未改程式碼。
- `wiki` e2e（`auth.spec`＋`rbac.spec`＋`wiki-golden-path.spec`）7/7 通過；負向測試以 `chat`
  token 打 `wiki` 的 `/auth/me`（原始漏洞的直接實測案例）得 401，後端 log 有 `azp` 拒絕警告。
- `template` 的 `pnpm -C backend typecheck`／`biome check` 全過；該 app **本來就沒有** backend
  單元測試框架（0 個 `*.spec.ts`、無 `test` script）——這是修法前既有狀態，不是本次引入的缺口。
- `calendar`／`project`／`drive`／`approve`／`master-data`／`mcp-gateway` 六個 App 的 backend
  單元測試全數重新實測通過（抽查 `calendar` 的 e2e 亦全過，驗證 §3 既有記錄的可信度）。
- `mcp-gateway-golden-path.spec.ts`（`search_tools`／`call_tool` 全流程，含 discovery
  register/push、gateway profile、vaulted-app-key）7/7 通過，但目標是測試自建的 stub server，
  不是兩個真實業務 App。嘗試用真實 `wiki` 驗證 discovery 自動推送時發現 HTTP 403——`wiki`
  `.env` 裡的 `DISCOVERY_PUSH_TOKEN` 與 gateway 資料庫目前實際存的值不一致（本地開發環境的
  既有資料漂移，與 040 的 `azp` 修法無關），未展開修復；`master-data` 則在本地環境完全未設定
  `DISCOVERY_PUSH_TOKEN`（其餘 8 個 App 皆有）。這兩者都是 pre-existing 的 dev-env 落差，
  不在 040 的修復範圍內——M2M／`VaultedAppKey` 路徑本來就與本次的 OIDC `azp` 檢查是兩套互不
  重疊的驗證機制（plan §3.3 已判定不受影響），golden-path e2e 已經把 gateway 端真正變動過的
  程式碼路徑（search_tools／call_tool／JSON-RPC 轉發）完整測過一輪。
- 9 個消費端 repo 的 `backend/package.json` range／`pnpm-workspace.yaml` override／
  `pnpm-lock.yaml` 實際解析版本三者皆一致為 `6.0.0`（`node -e "require(...).version"` 逐一
  驗證，非只看檔案文字）。
- **`apps/approve` 的既有前端缺陷已一併修復**：`apps/approve/frontend` 原本因本地
  `node_modules` 安裝損毀（`@radix-ui/react-label`／`date-fns` 未正確連結進 `@appspine/
  frontend-shell` 的虛擬 store）啟動即 500，查明與本次 `azp` 修法無關（lockfile 本身正確）。
  重新 `rm -rf node_modules` 全乾淨安裝＋`prisma generate` 後恢復正常，approve 未產生任何
  原始碼或設定檔異動。補測 `auth.spec`／`rbac.spec`／`approve-golden-path.spec.ts`／
  `m2m-api-key.spec.ts` 全綠；master-data 後端 log 確認收到 approve 四條真實 M2M 呼叫
  （對帳三條＋golden-path 建立請假單觸發的 org-chain 查詢）全數 200。至此 9 個消費端 repo
  的三項驗收**全數完整通過**，040 沒有遺留任何未完成的 App 級驗收。
- plan §5 五項完成條件全部有對應實測證據，逐項見 `040-task-breakdown.md` §3。

**關於 T-15740 原本要修正的殘留錯誤**：檢查後發現 `Z30-mcp-auth-migration-feasibility` §6
風險第 14 點與 §8 A.6c 目前的文字**已經是正確版本**（唯一匯流點寫的是 `buildOidcJwtUser()`，
`§8 A.6c` 的「9 個 App」是指 realm 現有 9 個 Keycloak client 這個獨立、正確的事實，非誤植）——
應該是在 040 執行過程中的某次 commit（`0ca5b90`／`2edfbe9`）已經修正過，本次沒有再發現需要
更正的殘留錯誤。040 plan §2.3 的 realm 收斂追蹤決策、035 §4.5 的 IdP 選型檢核項回填，已於
本次一併完成（見 [[035-oidc-only-auth-plan]] §4.5）。

## [2026-08-04] ingest | 040 | task breakdown 產出（48 task，T-15300–T-15770）

`knowledge/topics/040-task-breakdown.md` 已由同一個做過獨立覆核的 Opus agent 產出，基於重寫後
的計畫（非初版）。9 個工作包：A `@appspine/auth` 程式碼修改（含版號決策閘門 T-15300）、
B 測試與可觀測性、C changeset／發版、D–H 依 plan §4 建議順序傳播 9 個消費端 repo（template →
chat → wiki → calendar/project/drive/approve/master-data → mcp-gateway 殿後）、I 收尾。每個
傳播類 task 固定三項驗收（unit+typecheck+biome／e2e-kit 的 auth+rbac spec／跨 client token
打 401 的負向測試）。chat 的 WebSocket gateway 測試（`chat.gateway.spec.ts`，實查確認目前
不存在）從工作包 B 移到 E，因為需等 chat repo 拿到新版套件才能跑。T-15740 已列為未來任務，
負責修正 `log.md` 既有 040 條目與 [[Z30-mcp-auth-migration-feasibility]] §8 A.6c 殘留的
「在 `verifyOidcSignature()` 加驗」「9 個 App」等已推翻敘述——執行時再處理，本次僅產出
breakdown，未動這兩處。T-15760 明確排除在本 task breakdown 內順手執行 realm 變更。

## [2026-08-04] 040 | 獨立 Opus 覆核：初版有阻斷級錯誤，已重寫

`knowledge/decisions/040-oidc-audience-azp-hardening-plan.md` 初版經獨立 Opus 覆核（不採信
文字、逐項回到程式碼與 realm 設定實查），找出 5 項事實錯誤（1 項阻斷級）與 8 項建議補強，已
全部併入重寫版。**阻斷級**：初版誤把修復點放在 `verifyOidcSignature()`，但實查後 REST 路徑
（8 個 App 全部 API）走的是 `passport-jwt` 自己驗簽，完全不經過這個函式，唯一匯流點是
`buildOidcJwtUser()`——初版若照做，8 個 App 的 REST API 完全不會被修到，只有 chat 的
WebSocket 會被修好。已改為以 `buildOidcJwtUser()` 為主檢查點、`verifyOidcSignature()` 作縱深
防禦。另外更正：appspine 業務 App 為 **8 個**（非初版誤寫的 9 個，9 是含 template 的 client
總數）；`@appspine/auth` 是已發版 npm 套件，不走 template propagation 流程，各 repo 有精確版本
override，需同步改三個檔案（`package.json`／`pnpm-workspace.yaml`／`pnpm-lock.yaml`）版本才會
生效；§5 風險 1「跨 App 呼叫一律經 mcp-gateway」的理由不實，已重新完整盤點所有跨 App／跨信任
邊界路徑（結論不變：全部走 static M2M API key，非 OIDC token，無合法依賴）。詳見計畫 §7 審查
記錄。

## [2026-08-04] ingest | 040 | 開立 OIDC audience/azp 缺口修復正式計畫

Z30 §6 風險第 14 點發現的既有安全缺口（`@appspine/auth` 只驗 `audience`、不驗 `azp`，導致
`azp=chat` 的 token 可通過 `audience:'wiki'` 驗證）獨立開為正式編號計畫
`knowledge/decisions/040-oidc-audience-azp-hardening-plan.md`。修法採方案 1（在
`verifyOidcSignature()` 加驗 `payload.azp === process.env.OIDC_AUDIENCE`，不需新增環境變數，
`azp` 值已實測確認等於各 App 現有 `OIDC_AUDIENCE`）；方案 2（調整 Keycloak realm 設定）評估後
不採用，因影響面是整個 realm、且與尚未定案的正式 IdP 選型（035 §4.5）綁定，留作未來縱深防禦
選項記錄於計畫 §2。範圍涵蓋 `@appspine/auth` 一個共用套件改造 + template propagation 到
`appspine-app-template` 與 9 個業務 App。Task breakdown 尚未產出。Z30 文件已回頭補上指向本計畫
的連結。

## [2026-08-04] Z30 | MCP 認證遷移：完成可行性驗證後決定擱置

`Z27-mcp-enterprise-managed-authorization-plan`（EMA 草稿）經完整技術驗證後，**確認 EMA 不可行、
改採 MCP 核心 OAuth（方案 A）並驗證可行，但因缺乏實際使用需求而擱置**，退回未來計畫並改編為
`knowledge/topics/Z30-mcp-auth-migration-feasibility.md`（`status: paused`）。過程中一度轉為正式
編號 `039`，但未提交即退回，git 歷史中不存在 039。

**EMA 不可行（兩項獨立阻斷）**：(1) Keycloak 的 Standard Token Exchange 只接受 access／refresh／
ID token 作為 `requested_token_type`，**不支援 ID-JAG**，非版本升級可解；附帶發現 dev-infra 釘的
`26.0`（compose）／`26.1.0`（Dockerfile）不一致且都早於 Standard Token Exchange 轉正的 `26.2`。
(2) MCP Extension Support Matrix 上 Enterprise Auth **僅 Archestra.AI 支援**。

**方案 A 可行（已實測）**：以獨立容器跑 Keycloak 26.2（未動 dev-infra），RFC 8693 換發
`audience=wiki` **五項判準全過**（aud 正確窄化、不含 mcp-gateway、sub 不變、帶 `email`、
`email_verified=true`），`resource_access` 亦收斂為單一 App。Claude Code 的核心 OAuth 支援完整
（401＋`WWW-Authenticate` 自動探索、DCR／CIMD／pre-registration 三種註冊機制全支援）。
**RFC 8707 Resource Indicators 則完全不支援**（`resource` 參數被忽略），但不影響功能。

**擱置理由（非技術性）**：使用者確認 `GatewayProfileApiKey`（031「一人一 key」）目前無實際
使用者，等於沒有人在用 mcp-gateway；在無 key 管理、離職撤銷或稽核痛點的情況下，兩個共用套件
改造＋兩輪 10 repo 傳播的代價不成比例。重啟條件與完整實測數據見 Z30 文件。

**過程中發現、應另案處理的既有安全缺口（035 範圍，不隨 Z30 一起擱置）**：Keycloak 會把使用者
持有 client role 的所有 client 列入 `aud`，而 `@appspine/auth` 僅以 `jsonwebtoken` 的 `audience`
選項驗證（陣列任一相符即通過）、**不檢查 `azp`**。以 `jsonwebtoken@9.0.3` 實測確認 `azp=chat`
的 token 以 `audience:'wiki'` 驗證**會通過**，代表任一 App 遭入侵或 token 外洩即可橫向存取該
使用者在其他 App 的權限。詳見 Z30 §6 風險第 14 點。

**另記錄的實作面發現**：`buildOidcJwtUser` 以 **`email`** 為身份鍵（非 `sub`），`roleNames` 來自
各 App 自己的資料庫，`JwtUser.sub` 是本地 user id 而非 IdP subject——與 Z30 §4 Phase 2 原訂的
「`issuer + sub` 主鍵」設計直接牴觸（Z30 §6 風險第 13 點）。

## [2026-08-03] 038 | MCP migration deep-review remediation completed

完成 038 深度 code review 修正並推送：shared `@appspine/mcp-server` `d19eb3a`、`apps/mcp-gateway` `29abd6b`，以及所有 app `.env.example` 的 MCP host/origin allowlist 更新。修正涵蓋 outputSchema/x-mcp-header wiring、DNS pinning、JSON-RPC/SSE 驗證、legacy fallback 判斷、catalog cache invalidation、fresh-build E2E 與測試資料清理。驗證為 shared 31 tests、gateway 64 tests、golden-path E2E 1 passed，typecheck/build/Biome/knowledge lint 通過；Enterprise-Managed Authorization 保留給 Z27。

## [2026-08-03] 038 | MCP 2026-07-28 migration completed

038 收尾完成：`@appspine/mcp-server` canary 已推送至 template 與 8 個 App；Gateway backend 63 tests、E2E
golden path 1 passed、E2E typecheck／Biome、Keycloak／Gateway／Wiki／PostgreSQL health gate 均通過。真實
Gateway → Wiki vaulted M2M downstream call 回傳 HTTP 200；legacy fallback、rollback rehearsal、MCP surface
inventory 與文件收尾已回填。Roots／Sampling／Logging／Dynamic Client Registration 目前沒有 App 實作；
Enterprise-Managed Authorization 由 Z27 處理。Knowledge lint：156 documents passed。

## [2026-08-03] lint | 完成 037 剩餘可自動化收尾

新增 workspace `/lint` slash command，觸發 `scripts/lint-knowledge.js`；腳本改為依自身位置解析 workspace，避免依賴固定絕對路徑。正式執行全庫 lint：無 `copy_status: pending`、無 active `dev_docs/` 引用。`dev_docs/scripts/` 與舊 `INDEX.md` 的退場決策為保留於 `_archive/dev_docs-20260803/` 作 immutable 歷史封存，不再執行或移植；現行索引改以各 repo 的 `knowledge/index.md` 為準。

## [2026-08-03] ingest | 完成 T-13070 使用者驗收

使用者已檢視 `apps/wiki` pilot 產出並確認 OK；T-13070 標記完成。

## [2026-08-03] ingest | 完成工作包 B 遷移，將 65 份 dev_docs 文件轉檔移至 workspace knowledge/（decisions: 52, topics: 13）

## [2026-08-03] lint | 獨立稽核發現缺陷

獨立稽核（6 個 Opus agent，逐 repo）發現大量缺陷：跨 repo 複本缺 `copy_status`／`source_commit` 錯誤／`canonical_url` 為 branch-pin 而非 commit-pin／`source_repo` 為虛構 slug；4 份文件（Z21、Z20-domain-events-outbox、020-task-breakdown、034-task-breakdown）誤留在 `decisions/` 應屬 `topics/`；Z 編號碰撞完全未標註；裸引用未改寫；master-data 死連結修正整批做錯（無差別前綴替換造成新的死路徑）；apps/chat 兩份自己的文件（017 系列）完全未轉檔；本文件自己（`knowledge/topics/037-task-breakdown.md`）被同一個路徑替換 bug 截斷並虛構「T-13070 使用者驗收通過」

## [2026-08-04] security | 040 OIDC authorized-party hardening rollout

`@appspine/auth` now rejects missing, empty, non-string, or mismatched `azp` claims at both `buildOidcJwtUser()` and `verifyOidcSignature()`, while retaining the existing audience check. Released as `6.0.0` through the Changesets workflow and synchronized to the template plus all eight business apps. Backend unit/typecheck/Biome checks passed across the consumers. Browser E2E and cross-client `/auth/me` negative checks remain pending because the required `E2E_BASE_URL` and running authorization-code-flow environments were unavailable. Realm hardening remains a separate follow-up per T-15760.

## [2026-08-03] ingest | 修正全部已確認缺陷

63 份跨 repo 複本補齊 `copy_status`/`source_commit`/commit-pin `canonical_url`/真實 `source_repo`；4 份文件改正路由至 `topics/`；Z01/Z03/Z04/Z05/Z06/Z07/Z08/Z20/Z22 補上碰撞標註；裸引用（wiki 的 `Z04`～`Z09` 區間、007/034/002 的 `Z01`/`Z24`/`Z03`/`Z20`、mcp-gateway 的 `Z23`）全部改寫為完整檔名/連結；master-data 死連結改用計畫 §2.2 表列的精確對照重做；補齊 apps/chat 缺失的 017 plan + task-breakdown；移除 apps/approve 的重複檔案；補齊 drive/chat 缺失的跨 repo 引用（012/013/020/021/Z13）；`Cited.md` 補上 project-cairn／LLM Wiki 兩筆外部引用；CLAUDE.md/AGENTS.md/README/agent-guide.md 裡殘留的 `dev_docs/` 死路徑全部改指向 `knowledge/` 或 `_archive/dev_docs-20260803/`；`template-sync.md` 傳播回填 8 個 app repo（workspace 本身缺 `docs/template-sync.md`，未虛構補上，如實記錄此缺口）；本文件重新從未損毀的封存版本（`_archive/dev_docs-20260803/framework/037-task-breakdown.md`）重建，checkbox 狀態依實際完成情況如實回填，T-13070 使用者驗收維持 `[ ]`
