---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-16
updated: 2026-08-03
---

# Z21 - 共用套件發布基礎設施缺口（025 執行期間意外發現）

> 狀態：四個原始問題均已修復——2026-07-17 org 設定與 `frontend-shell`/`e2e-kit` 的 package Actions access 已由 admin 在 UI 補上，release run 29550939955 煙霧測試通過（`changeset publish` 用 Actions `GITHUB_TOKEN` 檢查全部套件、無 403），見 §8/§9。殘留地雷：registry 上有已 rollback 的 024 線發布的孤兒版本（`audit-log@0.5.0`、`mcp-server@0.6.0`），版本號已被燒掉且會毒害 peer 自動安裝，見 §9。consumer repo 的 CI/E2E 問題已於同日另行修復，見 §6。
> 來源：執行 `_archive/dev_docs-20260803/app-mcp-gateway/025-task-breakdown.md` T-10660 時，為了核發帶 `gateway:call` scope
> 的 M2M key，需要修改 `@appspine/m2m-api-key` 共用套件的 scope 格式驗證。過程中連續踩到
> 四個跟 025 本身無關、appspine monorepo 既有的發布基礎設施問題，本文件把這批「計畫外」
> 發現單獨記錄，避免跟 025 的業務邏輯變更混在一起。

## 1. 起因

`dev_docs/025` 的 `call_tool` meta-tool 設計拍板用 `gateway:call` 當 `requiredScopes`，但
`@appspine/m2m-api-key` 的 `ApiKeysService.validateScopes()` 只接受
`/^[a-z0-9_-]+:(read|write|\*)$/`，`call` 不是合法動作字，核發 key 時被 400 擋下。跟使用者
確認後決定修共用套件（而非改 025 的 scope 命名），詳見 `025-task-breakdown.md` §3 T-10660。

## 2. 發現的四個既有問題（依發現順序，2 個真的修好、2 個只是繞過）

1. **`SCOPE_PATTERN` 缺 `call` 動作字**（`packages/m2m-api-key/src/api-keys.service.ts`）
   ——加入 `call`，純新增、向後相容。補了 2 個單元測試。已發布 `@appspine/m2m-api-key@2.1.0`
   （見「3. 發布方式教訓」，實際可用版本是 2.1.1）。

2. **CI/Release 整個壞掉，跟本次改動無關**——`pnpm install --frozen-lockfile` 卡在
   `ERR_PNPM_IGNORED_BUILDS`：`sharp` 進了依賴樹，但 `pnpm-workspace.yaml` 的 `allowBuilds`
   允許清單沒放行它的 postinstall script。回溯前一個（跟 025 無關的）commit 也是同樣錯誤，
   確認是既有壞掉、不是本次引入。修法：`allowBuilds` 加 `sharp: true`。

3. **Release workflow 的 changesets action 無法建立「Version Packages」PR**——
   `GitHub Actions is not permitted to create or approve pull requests`（org/repo 設定
   限制)。workaround：手動用 `gh pr create` 把 action 已經 push 好的
   `changeset-release/main` branch 開成 PR，再用 `gh pr merge --admin` merge（因為這條
   branch 上的 CI 檢查會因 4. 而失敗，需要 admin 覆蓋)。**這個 org 設定問題本身沒有修——
   只是繞過，下次有新 changeset 要發版時還是要手動開 PR。**

4. **`changeset publish` 對 `@appspine/e2e-kit` 回 403**——`npm info` 檢查
   workspace 內所有套件時，`@appspine/e2e-kit` 回 `403 permission_denied: read_package`
   （跟本次改動的套件無關）。導致自動 publish 整批失敗。**這個權限問題本身也沒有修**——
   繞過方式是改用本機一把有 `write:packages` scope 的 PAT，直接對需要發布的套件單獨跑
   `pnpm publish`（見下方「發布方式教訓」）。

## 3. 發布方式教訓：`npm publish` vs `pnpm publish`

第一次手動發布 `@appspine/m2m-api-key` 時圖快用了 `npm publish`，忽略了這個
monorepo 用 pnpm workspace protocol（`"@appspine/auth": "workspace:*"`）——`npm publish`
不認得 `workspace:*`，直接把這個無效字串原樣發布出去，讓 2.1.0 對外部消費者是壞的（無法
安裝）。已核實沒有 `delete:packages` 權限可以撤回這個版本，最終處理方式：

- 保留 2.1.0 為壞掉版本（無法刪除），bump 到 **2.1.1**，改用 `pnpm publish`（會在打包時
  正確把 `workspace:*` 重寫成解析後的真實 semver）重新發布，CHANGELOG 註明原因。
- **教訓，供下次手動繞過自動發版時參考：monorepo 內的套件一律用 `pnpm publish`，不要用
  `npm publish`。**

## 4. 版本連動遺漏：只發布改動的套件不夠

`@appspine/mcp-server`／`@appspine/metadata-schema` 都直接依賴 `@appspine/m2m-api-key`
（`workspace:*`）。changesets 的 `updateInternalDependencies: patch` 設定已經在
"Version Packages" commit 裡把它們的 `package.json` 版本號 bump 到 0.5.1／0.2.6，但
**版本號 bump 不等於已經 publish**——這兩個套件從未真的發布新版到 GitHub Packages。
消費端（`apps/mcp-gateway`）的 node_modules 因此同時裝到 `m2m-api-key@2.0.0`（來自這兩個
還沒發布新版的舊套件）與 `2.1.1`（`mcp-gateway` 自己的直接依賴），NestJS DI 認不出同一個
`ApiKeyGuard` class，炸出 `UnknownDependenciesException`。

**教訓**：changesets 標記「這個套件也要 bump」的下游套件，必須連同一起真的 publish，只
publish 觸發變更的那一個套件是不夠的。**這其實是同一個根因的第二次出現**——
`_archive/dev_docs-20260803/framework/Z07-common-version-cascade-gap.md` 已經記錄過幾乎一樣的
`updateInternalDependencies: patch`「bump ≠ publish」缺口（當時是 `@appspine/common`），
這裡是 `@appspine/m2m-api-key` 再次踩到；根因至今仍未修，兩份文件都值得一起看。

## 5. 消費端的版本釘選落差

修完 4. 之後 `pnpm why @appspine/m2m-api-key` 仍顯示兩個版本——根因是
`apps/mcp-gateway/frontend/package.json` 的 `@appspine/metadata-schema` 還釘在
scaffold 帶出來的 `^0.2.0`（跟 backend 用的 `^0.2.6` 不一致，`appspine-app-template` 的
scaffold 預設值本身可能就沒跟上框架的最新版本號）。改成 `^0.2.6` 後才真正只剩一個
`m2m-api-key` 版本。**已確認（2026-07-17）`appspine-app-template` 本身的
`frontend/package.json` 也釘著 `@appspine/metadata-schema: ^0.2.0`。** 不過補一個 nuance：
`^0.2.0` 在 semver 上涵蓋 0.2.6，全新 fork 全新 install 會拿到新版；真正會中招的情境是
template 連 lockfile 一起帶出去、鎖住舊的解析結果（mcp-gateway 這次就是這樣）。更新這個
釘選仍值得做，但風險比原先描述的低一階——不在本次修復範圍內，留給框架維護者。

## 6. 2026-07-17 後續驗證

025 完成後重新檢查各 consumer repo 的 GitHub Actions，發現有些失敗已不是本文件原始記錄的
release infra root cause，而是各 repo 自己的 CI secret 或 E2E 穩定性問題。已處理如下：

- `approve` / `chat` / `drive` / `mcp-gateway` 的 E2E 都已改成透過後端 API 建立 M2M key，
  不再依賴 `@appspine/e2e-kit` 裡 brittle 的 UI 勾選流程；四個 repo 的最新 E2E workflow
  已重新跑過並通過。
- `mcp-gateway` 的 `PACKAGES_READ_TOKEN` 曾對 GitHub Packages 回
  `401 unauthenticated`。同一把 PAT 用本機 `npm view @appspine/common@0.2.0` 搭配
  `--//npm.pkg.github.com/:_authToken=$env:NODE_AUTH_TOKEN` 驗證可讀後，重新貼到
  `appspine/mcp-gateway` repo secret；後續 GitHub Actions install/static checks 已通過。
  因此 `mcp-gateway` 這一側判定是原 repo secret 內容錯誤或失效，而不是套件本身不可讀。
- 以上只修掉 consumer repo 的執行問題；不等於 `appspine` monorepo release workflow 的
  `@appspine/e2e-kit` 403 根因已經解掉。兩者使用的 token/權限上下文不同，仍需分開追。

## 7. 後續建議（非本次處理範圍，留給框架維護者參考）

- 修正 org 層級「GitHub Actions 不能建 PR」的設定，讓 Release workflow 能自動完成
  Version PR 流程，不需要每次手動介入。
- 查清楚 `@appspine/e2e-kit` 的 GitHub Packages 讀取權限為什麼對 Actions 的
  `GITHUB_TOKEN` 回 403，修正後 `changeset publish` 才能真正自動化。
- 檢查 `appspine-app-template` 的 `frontend/package.json` 是否也釘著過舊的
  `@appspine/metadata-schema`（或其他 `@appspine/*`）版本。
- **第二次踩到同一個根因**（見「4. 版本連動遺漏」）：`updateInternalDependencies: patch`
  只 bump 版本號、不會自動 publish 下游套件，`Z07-common-version-cascade-gap.md` 記錄過
  一次、這裡又是一次。但要注意：`changeset publish` 本來就會發布 workspace 裡所有
  「本機版本號不存在於 registry」的套件，包含被連動 bump 的下游套件——所以不需要另外造
  一個「偵測 bump 就發布」的機制。兩次踩坑的共同點其實是**繞過自動化之後挑著做**：
  Z07 是人為丟棄 cascade，這次是 403 炸掉自動發布後手動只 publish 改動的那一個。
  真正的系統性修法是修好上面第 2 點（`@appspine/e2e-kit` 403），讓 `changeset publish`
  能跑完，§4 這一類問題就自然消失；若下次仍不得不手動繞過，務必把 Version Packages
  commit 裡**所有**被 bump 的套件一起 `pnpm publish`，不能只發改動的那個。

## 8. 2026-07-17 release infra follow-up

- **任務 1——GitHub Actions 建 PR 權限**：
  - `gh api orgs/appspine/actions/permissions/workflow` 回 403（`You must be an org admin
    or have the actions policies fine-grained permission`），org 層級設定仍需 admin 到
    GitHub UI 確認/開啟：Settings → Actions → General → Workflow permissions →
    「Allow GitHub Actions to create and approve pull requests」（org 層級關閉時
    repo 層級會被鎖住）。
  - repo 層級已 PATCH 成功：`gh api repos/appspine/appspine/actions/permissions/workflow`
    現在回 `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}`。
    本次沒有 pending changeset，未實際驗證到建 PR 那一步。
  - 下次驗證點：下一次 release workflow 應能讓 changesets 自動建立「Version Packages」
    PR，不再需要手動 `gh pr create`。

- **任務 2——GitHub Packages 的 Actions access**：
  - 用 GitHub Packages API 盤點 repository 關聯：`m2m-api-key`、`auth`、`metadata-schema`、
    `mcp-server`、`rbac`、`audit-log`、`common`、`health-check` 都有關聯到
    `appspine/appspine`；`frontend-shell`、`e2e-kit`、`chatbot-contracts` 沒有任何關聯。
  - REST API 沒有可用的 Manage Actions access 端點
    （`/orgs/appspine/packages/npm/{name}/permissions/repositories` 回 404），需人工到 UI
    操作：**`frontend-shell` 與 `e2e-kit`** 到各自套件頁面 → Package settings →
    Manage Actions access → 加入 `appspine/appspine`。
  - **`chatbot-contracts` 是另一回事，不要照上面處理**：它的原始碼不在 appspine monorepo
    （也不在本 workspace 任何地方），不是 workspace 套件，monorepo 的 `changeset publish`
    不會碰它，跟本文件的 403 問題無關。它應該是 024 chat+n8n（已 rollback，見 `_archive`）
    時期從 chat 側發布的——若要處理，access 應授給實際發布它的 repo；先確認它是否已是
    孤兒套件，是的話不用管。
  - 已為 `appspine/packages/*/package.json` 全部（10 個）補上 `repository` metadata（指向
    `git+https://github.com/appspine/appspine.git` 加各 package 的 `directory`），讓未來
    從 workflow 發布時有正確的 package–repo 關聯來源。注意這只影響**未來發布的版本**，
    已發布版本的存取權仍靠上面的 UI 授權。
  - 本機用 `GITHUB_TOKEN=$(gh auth token)` 驗證
    `npm view @appspine/e2e-kit version --registry=https://npm.pkg.github.com` 通過
    （回 `0.1.2`）——但這是本機 token，不等於 Actions 的 `GITHUB_TOKEN` 已可讀，
    上述 UI 授權完成前 release workflow 仍不可依賴。

- **任務 3——appspine-app-template 釘版更新**：
  - `frontend/package.json`：`@appspine/metadata-schema` `^0.2.0` → `^0.2.6`。
  - `backend/package.json`：`@appspine/audit-log` `^0.4.0` → `^0.5.0`
    （**此項後來撤回**——0.5.0 是已 rollback 的 024 線發布的孤兒版本，見 §9）、
    `@appspine/m2m-api-key` `^2.0.0` → `^2.1.1`、`@appspine/mcp-server` `^0.5.0` → `^0.5.1`、
    `@appspine/metadata-schema` `^0.2.5` → `^0.2.6`。
  - 以 `gh auth token` 提供 `GITHUB_TOKEN` 重跑 `pnpm install`，`pnpm-lock.yaml` 現在解析到
    `m2m-api-key@2.1.1`、`mcp-server@0.5.1`、`metadata-schema@0.2.6`、`audit-log@0.5.0`。
  - 驗證：`pnpm install`、`pnpm typecheck`、`pnpm -C backend build`、frontend 的
    `pnpm exec dotenv -e ../.env -- pnpm build` 全部通過；`pnpm why @appspine/m2m-api-key`
    只剩單一版本 `2.1.1`。
  - 順手盤點 apps/ 下游，發現同類過舊釘選但**本次未改**，留給維護者決定：`approve`、
    `calendar`、`chat`、`drive`、`project`、`wiki` 的 backend 仍釘舊的
    `audit-log`／`m2m-api-key`／`mcp-server`／`metadata-schema` range、frontend 仍釘舊
    `metadata-schema`；`mcp-gateway` backend 的 `@appspine/audit-log` 仍是 `^0.4.0`。
    （注意：`audit-log` 的 `^0.4.0` 其實是**正確的**，不要照本節原始基準「bump 到
    registry 最新版」處理，見 §9。）

## 9. 2026-07-17 追加：驗證通過，但發現 registry 上有已 rollback 線的孤兒版本

兩個人工項目（org 設定、`frontend-shell`/`e2e-kit` 的 Manage Actions access → `appspine`
repo、role 給 Write）由 admin 在 UI 補上後，push `95371c8`（repository metadata commit）
觸發 Release workflow 做煙霧測試：

- **run 29550939955 綠**：`changeset publish` 用 Actions 的 `GITHUB_TOKEN` 對 workspace
  全部套件跑了 `npm info`（含先前炸 403 的 `@appspine/e2e-kit`），全數通過，最後回
  `No unpublished projects to publish`。項目 3、4 的根因至此**真正解掉**（對照：前一次
  release run 29545680964 還是 failure）。

但煙霧測試的 log 暴露一個版本倒掛：workflow 說「`audit-log` 0.4.0 already published」，
而 registry 上其實有 0.5.0（§8 任務 3 的 template 就解析到它）。追查結果：

- **`@appspine/audit-log@0.5.0` 與 `@appspine/mcp-server@0.6.0` 是孤兒版本**——兩個 tag
  都指向懸空 commit `8c392c6`（「Prepare shared bot package release」「Add audit log
  distributed trace fields」等，內容是 bot run/deployment 的 distributed trace 欄位），
  屬於已 rollback 的 024 chat+n8n 線，原始碼不在 main 也不在任何 branch 上。
  `chatbot-contracts`（§8 任務 2）跟它們同源，都是 024 線的發布產物。
- **影響一：版本號被燒掉。** main 的 `audit-log` 目前是 0.4.0，下次 minor bump 會產生
  0.5.0，`changeset publish` 檢查到 registry 已有 0.5.0 就會靜默跳過（「already
  published」）——這是「bump ≠ publish」的又一個變形，而且這次連手動 publish 都救不了
  （版本號被占走，且無 `delete:packages` 權限可清）。`mcp-server` 的 0.6.0 同理。
  **屆時必須直接跳過被燒的號碼**（例如 audit-log 從 0.4.x 直上 0.6.0），並在 CHANGELOG
  註明原因。
- **影響二：peer 自動安裝會抓到孤兒版本。** template 的 frontend 鏈沒有直接宣告
  `audit-log`，pnpm 的 peer 自動安裝去 registry 撈「最新版」，正好撈到 0.5.0——既是
  rollback 線的程式碼，又違反框架套件宣告的 `^0.4.0` peer range（0.x 的 caret 不涵蓋
  0.5.0，pnpm 只警告不擋）。已修：template backend pin 回 `^0.4.0`，並在
  `pnpm-workspace.yaml` 的 `overrides` 精確釘 `'@appspine/audit-log': 0.4.0`（比照 Z05
  對 `common` 的前例；range 形式的 override 實測壓不住 peer 自動安裝，要用精確版本）。
  驗證：`pnpm why @appspine/audit-log` 只剩 0.4.0、`pnpm peers check` 無 audit-log
  項目、前後端 typecheck 通過。
- **影響三：其他 consumer app 可能同樣中招。** 各 app 的 lockfile 若曾在 0.5.0 發布後
  重新解析，peer 自動安裝可能已經抓到孤兒版本。維護者做 §8 任務 3 的下游釘選盤點時，
  應一併檢查各 app 的 `pnpm why @appspine/audit-log`，中招的比照 template 加 override。

