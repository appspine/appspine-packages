---
type: decision
scope: appspine-packages
status: completed
supersedes: null
superseded_by: null
created: 2026-08-14
updated: 2026-08-14
---

# 048 - `appspine-packages` 套件清理計畫（第一階段：範圍界定與盤點交接）

> 狀態：範圍界定與深度清理均已於 2026-08-14 完成；執行結果見第 8 節。本文件第一階段
> **不是**深度程式碼稽核（不同於 029/
> 036 的規模，見第 7 節），只做了依賴圖／規模／下游消費面的結構性盤點，作為 codex 接手前的
> 範圍簡報。
> 動機：使用者提出要對套件、範本、業務 app 三個層次做一輪深度清理，並決定從 `appspine-
> packages`（共用套件）開始——理由是 `appspine-app-template` 與全部業務 app 都透過 GitHub
> Packages 消費這裡發布的版本，套件的介面/結構若有異動，下游遲早要跟著調整，先清套件可以避免
> 之後重工一次。範本與業務 app 兩層的清理留待套件這輪完成後另外排入。
> 範圍：`appspine-packages/packages/*`（15 個套件）本身的結構盤點與依賴分層；下游（template
> 與 8 個業務 app）僅做「誰消費了哪個套件」的唯讀查核，**不含**下游程式碼本身的異動。
> 盤點方法：檔案數／`package.json` 依賴圖靜態掃描 + 跨 repo `@appspine/*` 消費點 grep，沒有
> 逐檔讀程式碼內容找重複/死碼，沒有 Opus 二次審查，沒有實跑 build/test 驗證健康度。

---

## 1. 背景

appspine 先前已有兩輪全庫規模的清理：[029](029-appspine-wide-cleanup-plan.md)（2026-07-20
定案、42/42 完成）與 [036](036-appspine-wide-cleanup-round2-plan.md)（第二輪，涵蓋套件與全部
業務 app）。這兩輪都是「套件 + 全部 app 一起盤點」的橫向稽核。本文件不是第三輪同規格的全庫
稽核，而是使用者這次明確要求「分層次來、從套件開始」之後的**第一階段範圍簡報**——目的是把
`appspine-packages` 內部的結構現況整理清楚，交給 codex 去做實際的深度清理（讀程式碼、抓重複/
死碼、補測試、視需要拆版本發布），範本與業務 app 兩層的清理待這輪套件清理有結論後再另外排期。

## 2. 套件盤點總覽

### 2.1 套件清單與規模

| 套件 | 版本 | 檔案數 | TS 原始碼 | 測試檔 |
|---|---|---|---|---|
| `common` | 0.3.2 | 17 | 13 | 3 |
| `integration-contracts` | 0.3.1 | 24 | 17 | 6 |
| `frontend-shell` | 0.14.0 | 83 | 77 | 7 |
| `e2e-kit` | 1.0.1 | 10 | 6 | 3 |
| `master-data-client` | 0.1.3 | 13 | 7 | 2 |
| `oidc-delegation` | 0.3.1 | 27 | 22 | 7 |
| `audit-log` | 1.0.0 | 13 | 8 | 3 |
| `health-check` | 0.1.7 | 7 | 3 | **0** |
| `notification` | 0.2.1 | 16 | 10 | 3 |
| `auth` | 6.2.1 | 48 | 42 | 14 |
| `m2m-api-key` | 4.0.6 | 17 | 12 | 2 |
| `rbac` | 4.0.6 | 14 | 9 | 2 |
| `domain-events` | 7.1.5 | 39 | 30 | 11 |
| `mcp-server` | 0.6.6 | 29 | 21 | 10 |
| `metadata-schema` | 0.2.20 | 12 | 8 | 2 |

### 2.2 內部依賴分層

依 `@appspine/*` 之間互相 import 的關係分層（層數越高，改動波及的下游套件越多）：

- **第 0 層**（無內部依賴）：`common`、`integration-contracts`、`frontend-shell`、`e2e-kit`、
  `master-data-client`、`oidc-delegation`
- **第 1 層**（依賴 `common`）：`audit-log`、`health-check`、`notification`
- **第 2 層**：`auth`（依賴 `audit-log` + `common`）
- **第 3 層**：`m2m-api-key`、`rbac`（依賴 `auth` + `common` + `audit-log`）
- **第 4 層**：`domain-events`、`mcp-server`、`metadata-schema`（依賴到第 3 層）

`common` 雖然自己在第 0 層、規模不大（17 檔），但被 8 個套件直接或間接依賴，是波及面最廣的
基礎套件——變動風險最集中，清理時要最保守。

### 2.3 既有管理工具（codex 執行時必須遵守）

- **版本發布走 changesets**：根 `package.json` 的 `release` script 是
  `pnpm -r run build && changeset publish`；push 到 main 會觸發 `changesets/action` CI 自動
  發布已 bump 的套件（見既有記憶：手動 `pnpm publish` 是多餘的）。
- **`scripts/check-changeset-discipline.mjs`**：CI 門檻，檢查「套件版本若在 BASE...HEAD 之間
  改變，`CHANGELOG.md` 必須同步改，且第一個 `## ` 標題要等於新版本號」。防的是手改
  `package.json` 版本號、繞過 `changeset` 流程、讓對應的 changeset 檔案孤兒化（`033` 執行審查
  記錄過同一個套件犯兩次）。**清理過程中若牽動版本號，一定要跑 `pnpm changeset`，不能手改
  版本欄位。**
- **`scripts/contract-cli.mjs`**：`integration-contracts` 套件與 `knowledge/contracts/` 底下
  capability/binding 契約文件的管理工具。
- **`scripts/lint-knowledge.js`**：`knowledge/` 文件的 lint 工具。
- **`scripts/042-delegation-e2e-verify.mjs` / `042-delegation-e2e-negative-verify.mjs`**：專屬
  `oidc-delegation` 套件的 e2e 驗證腳本，對應已完成的
  [042 計畫](042-oidc-delegation-package-plan.md)（29/29，2026-08-07）。

## 3. 已知風險／待查項

- **`oidc-delegation` 目前零下游消費**：跨 template + 8 個業務 app 的 `package.json` grep，
  找不到任何一處把它列為依賴；但它不是廢棄／半成品——042 計畫已完成並發布（`0.3.1`），有專屬
  e2e 驗證腳本（見 2.3）。現狀是「已交付的能力，還沒有 app 選擇採用」，**不應該當成死碼
  直接砍**。使用者已確認方向：維持現狀、被動等待，不主動排 app 採用（見第 6 節）。
- **`health-check` 零測試**：只有 7 個檔案、3 個原始碼檔，卻被 6 個業務 app 的 backend 直接
  依賴，是清理時第一個要顧的風險點——使用者已確認補測試排進本輪範圍，codex 動這個套件前必須
  先補測試，不能先改行為（見第 6 節）。
- **`frontend-shell` 規模最大、測試比例偏低**：83 檔案只有 7 個測試檔，且是 9 個 repo（8 業務
  app + template）共用的前端元件層，深度清理（找重複/死 export）優先看這裡，其次是
  `auth`（48 檔/14 測試，比例較健康）。

## 4. 非目標（本輪不做）

- 不修改 `appspine-app-template` 或任何業務 app 的程式碼——下游消費盤點只是唯讀查核，範本／
  app 層的清理待套件這輪有結論後另外排期。
- 不做逐檔程式碼閱讀去找套件內部重複邏輯／死 export／型別缺口——本文件只做結構面盤點，這項
  深查工作留給 codex 接手後做。
- 不在清理過程中手改任何套件的版本號——一律走 `pnpm changeset`（見 2.3）。

## 5. 建議執行順序（交給 codex）

1. **`common`** 優先且改動最保守——波及面最廣，任何清理先確認不會動到對外介面行為。
2. 第 0 層其餘 5 個套件（`integration-contracts`、`frontend-shell`、`e2e-kit`、
   `master-data-client`、`oidc-delegation`）彼此無內部依賴，可平行進行。
3. 第 1 層（`audit-log`、`health-check`、`notification`）——`health-check` 先補測試再清理
   行為（使用者已確認排進本輪範圍，見第 3、6 節）。
4. 第 2～4 層（`auth` → `m2m-api-key`/`rbac` → `domain-events`/`mcp-server`/
   `metadata-schema`）依層級順序進行，避免下層套件的介面還在變動時上層就開始改。

## 6. 待確認事項（已於 2026-08-14 由使用者確認）

1. **`oidc-delegation` 零下游消費**：維持現狀，被動等待——不主動排 app 採用，等真的有委派需求
   的 app 出現時再接。套件清理時正常納入第 0 層平行處理即可，不需額外 adoption 安排。
2. **`apps/drive` 空目錄**：確認是遺留、無未來用途，已於 2026-08-14 直接刪除
   （`d:\Source\Private\appspine\apps\drive`，該路徑不屬於本 repo，未受 git 追蹤）。
3. **`health-check` 補測試**：排進本輪套件清理範圍——codex 動 `health-check` 前必須先補測試，
   不能先改行為再補測（呼應第 3 節風險評估）。

## 7. 盤點方法侷限

本文件的盤點方法是：`find`/`node -e` 讀 `package.json` 統計檔案數與依賴、`git log` 確認 repo
commit 深度（219 筆，非新建 repo）、跨 8 個業務 app + template 的 `package.json` 做
`@appspine/*` 消費點 grep。**沒有**做到：逐檔讀程式碼內容找重複/死碼（跟 029/036 那種規模的
稽核不同層級）、Opus 或其他模型的二次獨立審查、實跑 `build`/`test`/`typecheck` 驗證套件目前的
真實健康度、CVE/依賴安全性掃描。本文件的定位是「範圍界定與交接」，實際的深度清理與驗證是
codex 接手後的工作範圍。

## 8. 深度清理執行結果（2026-08-14）

### 8.1 已實作項目

- 完成 15 個套件的 production 入口可達性、嚴格 unused、依賴使用、重複區塊與 publish tarball
  稽核。所有 production 檔都能由公開入口抵達，`noUnusedLocals`／`noUnusedParameters` 全綠；沒有
  僅因目前下游未使用就刪除任何公開 export，`oidc-delegation` 依第 6 節決策完整保留。
- `health-check` 先新增 controller 成功／失敗 characterization tests 與正式 `test` script，再把
  Terminus adapter 邊界的 `any` 改為精確的 `pingCheck` 參數型別；production runtime 行為不變。
- 全部 15 個套件統一使用 package `files` allowlist。`npm pack --dry-run` 驗證所有 `main`、`types`
  與 `exports` 目標均存在，且不再發布 `src/`、測試原始碼或 tsconfig；`e2e-kit/dist/specs/*` 是套件
  的正式可重用 Playwright 規格，保留在 `dist`。
- `auth` 將 `bcrypt` 5.1.1／`@types/bcrypt` 5.0.2 升至 6.x，移除帶入 vulnerable
  `@mapbox/node-pre-gyp`／`tar` 的舊安裝鏈；130 個 auth tests 全數通過。
- `mcp-server` 明確提供 `@modelcontextprotocol/node` 的 Hono peer（`^4.12.34`），workspace 以
  parent-scoped override 要求 `@hono/node-server ^1.19.15`。最終解析為 Hono 4.13.2 與 node-server
  1.19.17，55 個 MCP tests 全數通過。
- 建立 changeset，對本輪公開套件異動一律採 patch bump；沒有手改任何套件版本號。

### 8.2 驗證結果

- `pnpm test`：15/15 套件通過，共 521 tests。
- `pnpm typecheck`、`pnpm build`：15/15 套件通過。
- `pnpm exec biome check packages`：341 files 通過；額外的嚴格 TypeScript unused 檢查通過。
- 15/15 `npm pack --dry-run`：公開入口完整，無開發原始碼洩漏。
- `pnpm audit --prod --audit-level=low`：0 known vulnerabilities（執行前為 20：1 critical、10 high、
  8 moderate、1 low）。
- `contract-cli validate`：6 contracts 通過；`index --check --root-only` 為最新。
- `scripts/lint-knowledge.js`：63 knowledge documents 與 3 entry-point documents 全數通過。
- 042 的正向與 inbound-verifier 負向 scripts 已使用 Keycloak 26.2.5 healthy container、canonical
  `KC_BASE_URL=http://host.docker.internal:8180` 實測通過；dev-infra 的 provider 正向／負向 smoke
  matrix 亦全數通過。另有 74 個套件 tests、typecheck 與 build 通過。

### 8.3 範圍邊界與後續清理

原先範圍外的根層 `pnpm lint` 紅燈，已於使用者追加授權後清除：格式化 043 fixtures 與
`scripts/lint-knowledge.js`，並讓 Biome formatter 排除 byte-sensitive contract schemas，避免改寫
approved contract digest；schema 本身維持 byte-for-byte 不變。另補上 047 repo 重構漏改的
`043-two-app` 套件路徑。根層 Biome、043 fixture gates、contract validation/index freshness 與
knowledge lint 均通過。下游 template 與 8 個業務 app 仍只做深層 import 的唯讀查核，沒有修改
下游程式碼。

### 8.4 Sol 深度盤點與本輪處理

Sol 依本計畫做了唯讀的程式碼層級盤點。可採納的結果與處理如下：

- `health-check` 原本沒有可執行測試；先新增 controller 成功 probe 與失敗傳遞測試，補上
  `test` script 與 Vitest，驗證通過後未改動 controller 行為。
- `e2e-kit` 原本沒有套件自測；新增 Playwright config 的 defaults/overrides 測試，以及
  fixture context 成功／失敗時都會關閉的測試。登入 fixture 改用 `withBrowserContext` 保證
  setup 失敗時釋放 browser context，並將 unit test script 限定在兩個 unit spec，不執行需要
  真實 app／IdP 的 registration specs。
- Sol 初步將 `frontend-shell/src/lib/date-only.ts` 判為疑似死碼；交叉搜尋確認它由
  `date-picker.tsx` 實際使用，且由 date-picker 對外 re-export，故判定為誤報，不刪除。
- `domain-events` 的 `DomainEventWebhookKeyResolver` 雖在本 repo 零引用，但仍是已發布的
  public type，沒有足夠證據證明外部無消費者；暫不移除，待有相容性依據再另行處理。
- `oidc-delegation` 與 `m2m-api-key` 的 rate limiter 重複是刻意用來維持低依賴層級，保留不動。

Sol 盤點階段驗證：`health-check` 2 tests、`e2e-kit` 4 unit tests、兩者 typecheck/build、changeset
discipline 與 `git diff --check` 均通過。該階段留下的 10 個範圍外格式錯誤，已於使用者追加授權後
依 8.5 的處置清除。

### 8.5 執行時序與處置紀錄

1. **建立基線與保護既有工作**：先讀取 repo agent guide、048 計畫、15 個 package manifests、
   workspace 設定與目前 working tree；既有／並行的 `e2e-kit`、knowledge 與 changeset 異動均保留，
   沒有 reset 或覆寫。下游 template 與 8 個 app 只以搜尋確認實際 import，維持唯讀。
2. **逐套件深度稽核**：檢查公開入口到 production 檔案的可達性、未使用 symbol、套件間依賴、
   重複實作、測試缺口、publish tarball 與 production dependency vulnerabilities。先做 package-scoped
   驗證，再進入全 workspace gate，避免把根層範圍外問題誤算成套件缺陷。
3. **小步實作與回歸**：先替 `health-check` 建立 characterization tests，再收斂 adapter 型別；統一
   15 個 package `files` allowlist；升級 `auth` 的 bcrypt 鏈；修補 `mcp-server` 的 Hono peer／override；
   每一組變更後都先跑對應 package tests、typecheck 與 build，最後建立 patch changeset。
4. **全套件與發布面驗證**：依序執行 `pnpm test`、`pnpm typecheck`、`pnpm build`、package-scoped
   Biome、嚴格 unused、15 次 `npm pack --dry-run`、`pnpm audit --prod --audit-level=low`、contract
   validation/index check、knowledge lint 與 `git diff --check`；結果彙整於 8.2。
5. **真實 Keycloak 補驗**：容器啟動後先以 `KC_BASE_URL=http://localhost:8180` 執行 042 正向腳本；
   token exchange 成功，但 inbound verifier 因 issuer mismatch 回報 `Invalid delegated token`。檢查 OIDC
   discovery 與 Docker `KC_HOSTNAME` 後確認 canonical issuer 是
   `http://host.docker.internal:8180`，改用該 URL 重跑 T-17000、T-17010 與 dev-infra provider smoke
   matrix，三者全數通過。
6. **根層 lint 後續清理**：重跑 `pnpm lint`，將 10 errors／1 warning 分成 043 fixtures、4 個
   contract schemas 與 `scripts/lint-knowledge.js`。先以 targeted formatter 處理；contract validation
   隨即偵測 approved contract digest 改變，因此立即把 4 個 schema 還原為原始 bytes，改在
   `biome.json` 停用 contract schema formatter，仍保留其他 Biome 檢查。接著完成 fixtures／script
   格式修正，並補上 047 repo 重構漏改的 `043-two-app` `packages/...` 路徑。
7. **最終確認**：根層 Biome 共檢查 363 files，0 errors／0 Biome warnings；two-app fixture 行為測試、
   clean-consumer 的 CI syntax gate、6 contracts validation、contract index freshness、63 份 knowledge
   documents 與 3 份 entry-point documents、`git diff --check` 均通過。clean-consumer 的完整
   `npm test` 仍需先以 GitHub Packages credential 執行其隔離式 `npm run setup`；本機未偽造或提交
   registry credential。
