---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-02
updated: 2026-08-03
---

# Z01 - CI/CD 修復紀錄：app-template E2E Pipeline 從全紅到全綠
> 註：本檔編號與 app-drive 的 Z01 衝突，屬 framework 之獨立記錄。

> 本文件記錄 2026-07-02 討論「app-template fork 之後應遵守的規範及需要提供給 forker 的資料」時，
> 順手實際驗證 `appspine-app-template` 的 E2E CI 是否真的能跑，結果發現該 workflow **自 T-406 建立以來從未成功執行過一次**
> （每次 push 都在 0 秒內失敗、0 個 job 被建立）。逐步排查、修復、重跑驗證，前後共修了 11 個問題才讓 CI 轉綠。
> 記錄根因是因為這些坑很細、彼此看似無關，日後若又要動這條 CI 或再次調整 `@appspine/*` 套件的發布方式，
> 很容易忘記「當初為什麼要這樣寫」而不小心改回壞掉的版本。
> 狀態：CI 已全綠（見「最終結果」）。`appspine-app-template` 現在才是真正「fork 出去能跑起來」的狀態——
> 這件事發現前，template 其實一直帶著一個會讓任何新業務系統 repo `pnpm install` 失敗的根本性 bug（見問題 D）。

## 起因

討論「fork 之後的規範跟參考資料」時，想確認 002/006 已經定案的東西是不是真的照預期運作，就去看了一下
`appspine-app-template` 的 GitHub Actions 頁面，發現 `.github/workflows/e2e.yml` 兩次執行紀錄都是
「0 秒完成、conclusion: failure、0 個 check run」。這是典型的「workflow 在排程階段就被 GitHub 擋下來，
根本沒進到執行階段」的訊號，跟一般的測試失敗完全不同類型，所以决定先查清楚再继续讨论規範本身。

## 問題與修法（依實際除錯順序）

### A. Workflow 檔案在 GitHub 解析階段就被拒絕（0 job、即時失敗）

- **現象**：`gh api .../check-suites` 回報 `latest_check_runs_count: 0`；run 的 `name` 欄位退化成檔案路徑
  `.github/workflows/e2e.yml` 而不是 YAML 裡寫的 `name: E2E`——代表 GitHub 連 `name:` 欄位都沒讀到，
  是整份檔案解析失敗，不是單純某個 step 失敗。
- **根因**：GitHub 網頁上的 Annotations 給出了明確訊息：
  `Unrecognized function: 'hashFiles'`，用在 job 層級的 `if: ${{ hashFiles('e2e/package.json') != '' }}`。
  `hashFiles()` 需要存取 runner 的檔案系統，但 job 層級的 `if:` 是在 runner 分配、checkout 執行**之前**由
  orchestrator 評估的，那時候檔案系統還不存在，GitHub 直接判定整份 workflow 不合法。
- **修法**：拆成兩個 job——`detect`（checkout 後用 shell 判斷 `e2e/package.json` 是否存在，寫入 job
  output）與 `e2e`（`needs: detect` + `if: needs.detect.outputs.has_e2e == 'true'`）。保留「只有系統有
  `e2e/` 目錄才觸發」的原始設計意圖（見 001「框架基本功能」）。

### B. `@appspine/*` 私有套件在 CI 裡完全沒有認證

- **現象**：`pnpm install` 對 `npm.pkg.github.com` 全部回 401，log 顯示
  `[WARN] Failed to replace env in config: ${GITHUB_TOKEN}`。
- **根因**：`.npmrc` 用 `${GITHUB_TOKEN}` 佔位，但 workflow 從沒把這個環境變數傳進 job。本機開發能動是因為
  使用者自己的 `~/.npmrc`（使用者層級）湊巧寫死了一組個人 PAT，把這個缺口完全遮住了——這也是「需要提供
  什麼資料給 forker」討論裡發現的一個真實缺口：README 完全沒提到 forker 要準備 `GITHUB_TOKEN` 才能
  `pnpm install`（已在 README 補上「Authenticate to GitHub Packages」步驟）。
- **修法**：先試著在 job env 接上 GitHub Actions 自動提供的 `secrets.GITHUB_TOKEN`。

### C. 預設 `secrets.GITHUB_TOKEN` 讀不到別的 repo 發布的 package

- **現象**：接上 B 的預設 token 後，錯誤從 401 變成 403——認證本身過了，但沒有權限。
- **根因**：GitHub Actions 自動提供的 `GITHUB_TOKEN` scope 僅限於**觸發 workflow 的那個 repo**
  （`appspine-app-template`），無法跨 repo 讀取 `appspine`（另一個 repo）發布的 private package。這是
  GitHub Packages 在多 repo 架構下的已知限制。
- **修法**：另外建一把有 `read:packages` scope、對 `appspine` org 有權限的 classic PAT，存成 repo secret
  `PACKAGES_READ_TOKEN`（刻意不取名 `GITHUB_TOKEN`，避免跟自動提供的那把搞混），workflow 改用這把。

### D. `frontend-shell` / `e2e-kit` 從沒真的發布過，靠本機 `file:` 路徑撐著 —— 影響所有 fork，不只 CI

- **現象**：`ENOENT: no such file or directory, scandir '/home/runner/.../appspine/packages/frontend-shell'`
  （`e2e-kit` 也是同樣錯誤）。
- **根因**：`frontend/package.json`、`e2e/package.json` 裡 `@appspine/frontend-shell`、`@appspine/e2e-kit`
  兩個依賴寫的是 `file:../../appspine-packages/packages/...`——這個相對路徑只有在「`appspine` 跟
  `appspine-app-template` 兩個 repo 被 clone 成同一層兄弟目錄」（也就是這個 workspace 目前的樣子）才解析
  得到。**這代表在這個發現之前，任何團隊透過 GitHub「Use this template」fork 出去、clone 下來執行
  `pnpm install`，都會用一模一樣的方式失敗**——因為新 repo 不會有 `appspine` 框架 monorepo 這個兄弟目錄。
  這是今天所有發現裡對「fork 之後能不能動」影響最大的一個，比任何 CI 設定問題都根本。
- **修法**：
  1. `appspine` 框架 monorepo 的 10 個套件全部補上 `publishConfig.registry`（見問題 J，這是能成功發布的
     前提）。
  2. 用 changeset 把 `frontend-shell`（0.1.1 → 0.1.2）、`e2e-kit`（0.1.0 → 0.1.1）各自 bump 一個 patch
     版本並正式 `pnpm release` 發布到 `npm.pkg.github.com`。
  3. `frontend/package.json`、`e2e/package.json` 的依賴改成 `^0.1.2` / `^0.1.1` 這種 semver range，重新產生
     對應的 lockfile（根目錄 `pnpm-lock.yaml` 跟 `e2e/pnpm-lock.yaml` 各自要重新 `pnpm install`）。

### E. `pnpm install --ignore-workspace` 把 `e2e/` 當成完全獨立的專案

- **現象**：`e2e/` 底下手動 `pnpm install --ignore-workspace` 打去 `registry.npmjs.org`（預設 registry）
  找 `@appspine/e2e-kit`，回 404——完全沒套用根目錄 `.npmrc` 的 `@appspine:registry` scope 對應。
- **根因**：`--ignore-workspace` 讓 pnpm 把 `e2e/` 當獨立專案處理，不會往上層走到 repo 根目錄找
  `.npmrc`/`pnpm-workspace.yaml`。
- **修法**：`e2e/` 底下補一份自己的 `.npmrc`（跟根目錄一樣的 registry/token 設定）。

### F. pnpm 11 的 `.npmrc` 已經不吃 `minimumReleaseAge` 這類設定

- **現象**：補了 `minimumReleaseAge=0` 到 `.npmrc` 卻完全沒用，CI 依然被 pnpm 11 內建的「新套件 24 小時
  內拒絕安裝」supply-chain 防護擋下（`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，因為 D 裡才剛發布的套件
  沒滿 24 小時）。
- **根因**：**pnpm 11 把 `.npmrc` 限縮成只處理 auth/registry**，`minimumReleaseAge` 這類一般設定的正式
  位置改成 `pnpm-workspace.yaml`（或新的全域 `config.yaml`）。
- **一次修法（後來又被 E 的變體問題推翻，見下）**：把設定搬到 `pnpm-workspace.yaml`；同時因為 `e2e/`
  用 `--ignore-workspace` 一樣不會往上讀根目錄的 `pnpm-workspace.yaml`，補了一份 `e2e/pnpm-workspace.yaml`。
- **最終修法**：即使兩份 `pnpm-workspace.yaml` 都補齊、本機也驗證 `pnpm config get minimumReleaseAge`
  回傳 `0`，CI 在 `--ignore-workspace` 這個組合下依然沒吃到（原因未完全查清，懷疑是 pnpm 內部對
  `--ignore-workspace` 的 workspace-config 解析路徑有不同行為）。改用 pnpm 內建、明確為這個情境設計的
  `--trust-lockfile` flag（跳過整個 supply-chain 重新驗證，官方說明就是給「CI 對已 commit、已審查的
  lockfile」這種情境用的），加在兩個 `pnpm install` 指令上，徹底繞開這個設定解析的不確定性。

### G. Workflow 從沒建立過 `.env`

- **現象**：`Prepare database` 步驟 `source .env` 直接報 `.env: No such file or directory`。
- **根因**：README 的本機開發步驟有 `cp .env.example .env`，但 CI workflow 從建立以來就沒有對應的步驟。
- **修法**：checkout 後立刻加一步 `cp .env.example .env`。

### H. `source .env` 蓋掉 CI 刻意產生的 `SEED_USER_PASSWORD`

- **現象**：補完 G 之後，`test-env.ts` 丟出 `Missing required environment variable: SEED_USER_PASSWORD`——
  但這個變數明明在 job 層級的 `env:` 有設定成一組帶 run id 的隨機密碼。
- **根因**：`.env.example` 裡 `SEED_USER_PASSWORD=` 故意留空（配合 README 的說明：預設種子帳號不帶密碼，
  給 OIDC 模式用）。workflow 每個 step 都用 `set -a && source .env && set +a` 把整份 `.env` 灌進環境變數，
  這會把 job 層級刻意設定的隨機密碼**蓋回空字串**——`source` 對同名變數是覆蓋，不是「沒寫到就跳過」。
- **修法**：在 `Prepare database` 與 `Run E2E suite` 兩個會用到這個密碼的 step，於 `source .env`
  **之前**先把值存到一個不同名的暫存變數（`ci_seed_password="$SEED_USER_PASSWORD"`），`source .env` 跑完
  後再用暫存值重新 `export` 回去。兩個 step 是各自獨立的 shell process，`export` 不會跨 step 保留，所以
  兩處都要各自做一次，不能只修一個地方。

### I.（H 的延伸漏網之魚）`readOptionalEnv` 的 fallback 參數是 eager evaluation

- **現象**：修完 H 的 `SEED_USER_PASSWORD` 之後，`Run E2E suite` 還是同樣的錯誤。
- **根因**：`e2e/test-env.ts` 裡
  `password: readOptionalEnv("E2E_ADMIN_PASSWORD", readEnv("SEED_USER_PASSWORD"))`——JavaScript
  函式呼叫會**無條件先算完所有參數**，所以就算 `E2E_ADMIN_PASSWORD` 已經正確設定，
  `readEnv("SEED_USER_PASSWORD")` 這個 fallback 参数还是會被求值，只要 `SEED_USER_PASSWORD` 本身是空的
  就會丟例外——即使它的結果根本用不到。
- **修法**：在 `Run E2E suite` 這個 step 裡，`export SEED_USER_PASSWORD` 這件事本身也要做（不能只靠
  `E2E_ADMIN_PASSWORD` 迂迴解決），H 的暫存值同時拿來回填這兩個變數。

### J. `changeset publish` 對所有套件的 token 驗證都打錯 registry

- **現象**：要發布 D 的套件時，`pnpm release` 卡在
  `error while checking if token is required` → `E401 Unable to authenticate`，即使直接對
  `npm.pkg.github.com` 跑 `npm whoami` 用同一把 token 是成功的。
- **根因**：`changeset publish` 內部有個「檢查是否需要 2FA token」的 preflight 呼叫，會打向 npm 的**預設
  registry**（`registry.npmjs.org`，`npm config get registry` 的值），而不是 `.npmrc` 裡 scope 對應的
  `npm.pkg.github.com`——因為當時 10 個套件的 `package.json` 都沒有 `publishConfig.registry` 明確指定要用
  哪個 registry。拿 GitHub PAT 去跟 npmjs.org 認證，當然是無效 token。
- **修法**：所有 10 個套件的 `package.json` 都補上
  `"publishConfig": { "registry": "https://npm.pkg.github.com" }`。

### K.（順手發現，跟 CI 無關，但同一輪除錯發現的）`@appspine/e2e-kit` 共用 golden path fixture 寫死英文 locator

- **現象**：CI 終於跑到真正的 Playwright 測試階段後，7 個測試全部卡在
  `waiting for getByLabel('Email')` 逾時；截圖顯示登入頁其實正常渲染，只是欄位是「電子郵件」。
- **根因**：`frontend/src/i18n/config.ts` 的 `defaultLocale` 是 `zh-TW`（刻意的商業決策，appspine 是面向
  台灣企業系統的框架），這不是 bug。但 `@appspine/e2e-kit`（共用套件，被所有 fork 出去的業務系統重複使用）
  裡的 `auth.fixture.ts`／`auth.spec.ts`／`rbac.spec.ts` 都寫死 `getByLabel('Email')`、
  `getByText('Sign in')` 這類英文 locator，從沒考慮過 forked app 的預設語系可能不是英文。
- **修法**：語系是透過 `locale` cookie 控制的（`frontend/src/server/server-actions.ts` 的
  `getPreference`）。在 `loginAndSaveStorageState`（`auth.fixture.ts`）、`auth.spec.ts`、
  `rbac.spec.ts` 的匿名測試裡，導覽到 `/login` 之前都先 `context.addCookies([{name:'locale', value:'en', ...}])`
  強制英文。`loginAndSaveStorageState` 存的 `storageState` 含 cookie，所以這個設定會自然傳遞到後續用
  `adminContext`/`userContext` 的測試，不用每個 spec 各自重複設定。**這個修法惠及所有 fork 出去的業務
  系統**，不只 `appspine-app-template` 自己。

## 修改的檔案與 commit 一覽

**`appspine-app-template`**（依修復順序）：

| commit | 內容 |
|---|---|
| `b4d8271` | 拆 `detect`/`e2e` job（A）；README 補 GITHUB_TOKEN 說明（B 的資料缺口）；順帶修正 002 的 MCP 文件錯誤（跟本次 CI 修復無關，見同日對話的另一段） |
| `320c39a` | job env 接上 `secrets.GITHUB_TOKEN`（B） |
| `3084efd` | 改用 `PACKAGES_READ_TOKEN`（C） |
| `a5b731c` → `f183056` → `0f45917` | `minimumReleaseAge` 的三次嘗試（F 的前兩階段） |
| `5fe6109` / `03dc25f` | `frontend-shell`／`e2e-kit` 改吃 registry 版本，補 `e2e/.npmrc`（D、E） |
| `47c03c3` | `e2e/pnpm-workspace.yaml`（F 的第二階段） |
| `093c5e7` | 改用 `--trust-lockfile`（F 最終修法） |
| `5edef71` | 建立 `.env`（G） |
| `7b7bea7` / `4725abe` | `SEED_USER_PASSWORD` 回填（H、I） |
| `bb15bde` | bump `e2e-kit` 到 0.1.2，撿回 K 的語系修法 |

**`appspine`**（框架 monorepo）：

| commit | 內容 |
|---|---|
| `0a19a03` | 10 個套件補 `publishConfig.registry`（J）；發布 `frontend-shell@0.1.2`（D） |
| `e7410bb` | 發布 `e2e-kit@0.1.1`（D） |
| `7a41e83` | `e2e-kit` 的語系 cookie 修法，發布 `e2e-kit@0.1.2`（K） |

**workspace（本 repo）**：`2cb33dc` 同步修正 `dev_docs/002` 的 MCP 文件錯誤（見上，跟 CI 修復平行、不同主題）。

## 最終結果

`gh run watch` 確認 `appspine-app-template` main 分支的 E2E workflow 全綠、7 個測試全過、耗時 2 分 9 秒
（run `28562169832`）。

## 給未來的提醒

- **新增或修改 GitHub Actions workflow 後，一定要實際 push 一次確認真的跑起來**，`js-yaml` 之類的語法
  驗證只能抓 YAML 語法錯，抓不到 GitHub Actions 專屬的 schema/expression-context 限制（例如問題 A 的
  `hashFiles()` 用在錯的地方）。
- **pnpm 11 把大部分設定從 `.npmrc` 搬到 `pnpm-workspace.yaml`**（`.npmrc` 現在只處理 registry/auth）；
  且 `--ignore-workspace` 底下的子專案（本 repo 的 `e2e/`）**不會**繼承上層目錄的 `.npmrc` 或
  `pnpm-workspace.yaml`，需要各自一份。
- **共用套件裡任何 `file:../../其他-repo/...` 這種相對路徑依賴，都是「還沒真的可以被 fork」的訊號**，
  發現一個就要走 D 的流程（補 `publishConfig` → changeset → 發布 → 改回 semver range → 重新產生
  lockfile）處理掉，不要讓它继续存在。
- **共用的 E2E golden path spec（`@appspine/e2e-kit`）如果用了跟語言/文字相關的 locator，要假設 forked
  app 的預設語系可能不是英文**，統一在登入流程強制一個語系（本例選英文），不要讓每個新業務系統自己
  各自處理一次。
- **`source .env` 之類會整份載入環境變數的操作，對「CI 刻意覆蓋的值」是有風險的**——`.env.example`
  裡任何跟 CI job env 同名的 key，都可能在 `source` 時被蓋掉，需要的話要在 `source` 前後手動保存/回填。

