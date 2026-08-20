---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-08-12
updated: 2026-08-12
---

# appspine Repo 重整 — 執行任務拆解（how）

> 已執行完畢，見 [047-repo-restructure-plan.md](047-repo-restructure-plan.md)。以下為原始執行拆解，保留作為紀錄。
>
> 對應計畫：`repo-restructure-plan-draft.md`（目標範圍 1–9 + Opus 盲點章節，全部已定案）。
> 本文件只講「怎麼做、什麼順序、怎麼驗」，不重新討論「要不要做」。
> 任務編號格式 `R<phase>-<n>`。每個任務標註：**repo** / **依賴** / **驗證**。

## 執行前必讀：計畫數字與實際 working tree 的落差

拆解前實際 grep 過工作目錄，有幾個計畫裡引用的數字與現況不符。**執行時請以現場 grep 為準，不要照計畫的數字當作完成條件**，否則會漏改：

| 計畫寫的 | 實際查到的 | 影響 |
|---|---|---|
| 8 個 app 有 **46** 個 `appspine-workspace` 絕對網址 | **87 處 / 49 個檔案**（`apps/` 底下） | R4-6 的完成條件要用實際清單 |
| 刪 `_archive/` 會弄壞 **4** 份 active 文件的連結 | root `knowledge/` 有 **32 份 active 文件**引用 `_archive/`，全庫共 **188 處** | R5-1 不能只修 4 份 |
| `appspine` 有 **9 個 README 寫死舊 repo URL** | `appspine` repo 的 tracked markdown **一個 `github.com/appspine/appspine` 都沒有**；該 repo 剛好有 9 個 README 檔——「9」很可能是檔案數被誤記成 URL 數 | R1-5 要先 grep 確認，不要憑空找 9 處 |
| 15 個 `package.json` 的 `repository` 欄位 | **確認正確**：`packages/*` 15 個各一處，root `package.json` 無此欄位 | 可照做 |
| `check-generated-integration-contracts.mjs` 每個 fork 各一份 | 只有 **approve / projects / wiki 3 個** fork 有 | R7 的傳播範圍要重算 |
| `apps/` 底下 `dev_docs/` 死引用（CLAUDE.md/AGENTS.md/docs） | **86 處 / 63 個檔案**，且含 `.prisma`、`.ts`、`seed.ts` 等程式碼註解，不只文件 | R4-7 範圍比計畫描述大 |

另外三個現場事實，後面的排序都建立在這上面：

- **`ghcr.io/appspine/keycloak-dev` 是 org-scoped 不是 repo-scoped**，8 個 app 的 `e2e.yml` 拉 image 的字串**不用改**；而且它們是用 `secrets.PACKAGES_READ_TOKEN`（PAT）而非 `GITHUB_TOKEN` 認證，所以轉掛 connected repository **不影響消費端**。真正會壞的只有發布端（`keycloak-image.yml` 用 `GITHUB_TOKEN` + `packages: write`，那個寫入權限來自 connected repository）。
- **`contract-cli.mjs` 的 `compareSchemaPair()` 對 `appspine/packages/integration-contracts/dist/index.js` 的 require 包在 `try {} catch {}` 裡**（第 435-441 行）。搬家後路徑沒改不會報錯，而是**靜默退回內建的弱比較器**。所以 R2 的驗證絕對不能只看 exit code。
- **`integration-contracts.yml` 的觸發路徑包含 `knowledge/topics/043-*.md`**，而那兩份 043 文件的 status 都是 `completed`——也就是第 5 點精簡時會被刪掉。這是計畫內部自己撞自己，決定了 R2 必須排在 R4 之前（見 R2-3）。

---

## Phase 0 — 基準與盤點（不改動任何檔案）

目的：這次有兩個不可逆動作（刪 `_archive/` ~300 檔、刪 completed 文件），事後只能靠 git history 救，所以先把「history 在哪」釘死。

### R0-1 建立 10 + 1 個 repo 的 baseline 快照
- **repo**：全部（workspace root、`appspine`、`appspine-app-template`、`dev-infra`(尚在 root)、8 個 app）
- **依賴**：無
- **做什麼**：記錄每個 repo 的 branch / HEAD SHA / working tree 是否 clean。目前已確認：workspace root 只有一個 untracked 的計畫草稿；8 個 app 全 clean；`appspine` 有開著的 PR #19。
- **驗證**：表格列滿 10 個 repo，每列都有 SHA，且 `git status --short` 全空（草稿檔除外）。

### R0-2 對 workspace root repo 做離線備份
- **repo**：workspace root
- **依賴**：R0-1
- **做什麼**：`git bundle create appspine-workspace-<date>.bundle --all`，存到 repo 外的位置（例如 `d:\Source\_backup\`）。**這是整個計畫唯一的 `_archive/` 與被刪 knowledge 文件的還原來源**——第 9 點要把本機 root 資料夾的 `.git` 拿掉，一旦拿掉，本機 history 就沒了。
- **驗證**：`git bundle verify <file>` 通過，且 `git bundle list-heads` 看得到 `refs/heads/main`。

### R0-3 產出「現況事實清單」grep 快照
- **repo**：全部
- **依賴**：無
- **做什麼**：把下列查詢的完整結果（含檔案路徑與行號）存成一份執行用清單，作為 R1-5 / R4-5 / R4-6 / R4-7 / R5-1 的完成條件依據：
  1. `github.com/appspine/appspine-workspace`（apps/ + root + template）
  2. `_archive`（root `knowledge/` 全部，並標註各檔 `status:`）
  3. `dev_docs/`（apps/ 全部，含程式碼檔）
  4. `appspine/appspine`（非 `-` 結尾，root tracked 檔案）
  5. root 與 apps 之間**同檔名重複文件**清單（已查到 15 個檔名、共 40 份 app 端副本：`001-app-framework-plan.md` ×7、`002-app-dev-conventions.md` ×8、`010-m2m-api-key-acting-user-plan.md` ×7、`Z02-app-template-fork-validation.md` ×7，其餘 11 個各 1-2 份）
  6. 各 repo `knowledge/` 內 `status:` 統計（root：decisions 39 active / 15 completed / 1 archived / 2 draft；topics 7 active / 19 completed / 2 superseded / 1 paused）
- **驗證**：清單檔存在，六項查詢各有數字，且數字與 R4/R5 的收尾 grep 可以逐項對照歸零。

### R0-4 確認 `appspine` 以外沒有進行中的 PR / 分支
- **repo**：全部
- **依賴**：無
- **做什麼**：`gh pr list --state open` 逐 repo 跑一遍。已確認 `appspine` 只有 PR #19，其他 repo 乾淨。若期間有人開新 PR，先合併或請對方暫停。
- **驗證**：除 `appspine#19` 外，10 個 repo 的 open PR 數為 0。

> **閘門 G1**：R0-1 ~ R0-4 全綠才進 Phase 1。這是唯一一次「零成本回頭」的機會。

---

## Phase 1 — release 收尾與 `appspine` → `appspine-packages` 改名

排在最前面的理由：後面每一個 phase（contract 搬家的落點、治理文件的落點、15 個 `package.json`、所有文件裡的 repo 名稱）都要寫新名字。晚改名 = 同一批檔案改兩次。但它自己被 PR #19 卡住，所以 Phase 1 內部順序不能動。

### R1-1 合併 PR #19「Version Packages」並確認發布完成
- **repo**：`appspine`
- **依賴**：R0-4
- **為什麼一定要在改名前**：`release.yml` 是 `push: branches[main]` 觸發、`concurrency` 綁 workflow+ref，並用 `github.token` 對 GitHub Packages 發布。若在改名瞬間有 release job 在跑，checkout / registry 認證會踩到轉址；而且 changesets action 的 release PR head branch (`changeset-release/main`) 若跨過改名，狀態很難判讀。把它清空，改名窗口才是靜止的。
- **做什麼**：merge PR #19 → 等 `Release` workflow 跑完 → 確認套件已推上 GitHub Packages。
- **驗證**：`gh run list --workflow=release.yml --limit 3` 最新一筆 success，且 `gh pr list --state open` 為空。

### R1-2 選一個 `release-health-check.yml` 不會誤報的改名窗口
- **repo**：`appspine`
- **依賴**：R1-1
- **做什麼**：`release-health-check.yml` 是每日 `cron: 0 1 * * *`（台北 09:00）、專門偵測「Version Packages PR 沒人合併 / main 紅燈 / run 卡在 action_required」並自動開 issue。避開這個時間點改名，否則會多一個假 issue。
- **驗證**：改名執行時間不落在 UTC 00:50–01:20 區間。

### R1-3 執行 GitHub repo rename（**不是**開新 repo 複製）
- **repo**：`appspine` → `appspine-packages`
- **依賴**：R1-1、R1-2
- **做什麼**：GitHub repo Settings → Rename。rename 會保留 repo ID，因此 history、issue/PR 編號、GitHub Packages 的 per-package「Manage Actions access」授權全部跟著走，舊 URL 自動轉址。開新 repo 複製會把這些全部弄丟。
- **驗證**：`gh repo view appspine/appspine-packages --json id,createdAt` 的 `createdAt` 等於改名前的建立時間（證明是 rename 不是新建）；瀏覽舊 URL 會 302 到新 URL。

### R1-4 本機資料夾改名並更新 remote
- **repo**：本機 `appspine/` → `appspine-packages/`
- **依賴**：R1-3
- **做什麼**：關掉所有佔用該目錄的 process（IDE、dev server、`pnpm` watch），`mv appspine appspine-packages`，然後 `git remote set-url origin https://github.com/appspine/appspine-packages.git`。**不要依賴 GitHub 自動轉址**當長期解法。
- **驗證**：`git -C appspine-packages remote -v` 顯示新 URL；`git fetch` 成功且無 redirect 警告。

### R1-5 批次更新 15 個 `package.json` 的 `repository.url`
- **repo**：`appspine-packages`
- **依賴**：R1-4
- **做什麼**：`packages/*/package.json` 共 15 檔，把 `git+https://github.com/appspine/appspine.git` 改成 `...appspine-packages.git`。root `package.json` 沒有這個欄位，不用動。同時依 R0-3 第 4 項的實際 grep 結果處理 markdown（**預期為 0 處，不要為了湊「9 個 README」而亂改**）。
- **驗證**：`git grep -c "appspine/appspine\.git"` 回 0；`git grep -n "appspine/appspine[^-]" -- '*.md' '*.json'` 無輸出。

### R1-6 用一次真實 release 驗證改名沒弄壞發布鏈
- **repo**：`appspine-packages`
- **依賴**：R1-5
- **做什麼**：R1-5 本身就是可發布的 metadata 變更，替其中任一套件加一個 patch changeset，走完整條 `Release` 流程（產生 Version Packages PR → 合併 → 發布）。**這是驗證 GitHub Packages 的 repo 關聯有沒有在 rename 中存活的唯一可靠方法**，光看設定頁不夠。
- **驗證**：`Release` workflow success，新版本出現在 GitHub Packages，且該套件頁面的 repository 連結指向 `appspine-packages`。

> **閘門 G2 — 停下來確認**：發布鏈是整個系統最脆弱的一環。R1-6 沒綠燈之前不要進 Phase 2。
> **回滾**：GitHub rename 可以再 rename 回去（repo ID 不變）；本機 `mv` 回去 + `remote set-url` 回去；R1-5 是單一 commit，`git revert` 即可。

---

## Phase 2 — contract 工具鏈整組搬遷（原子批次，不可拆）

四樣東西（工具 / 合約來源 / 測試 fixture / CI 驗證）必須在**同一批**離開 root、同一批落地 `appspine-packages`。任何一樣先走，root 的 `integration-contracts.yml` 下一次 push 就紅。

### R2-1 在 `appspine-packages` 落地四組檔案（單一 commit）
- **repo**：`appspine-packages`（新增）、workspace root（刪除）
- **依賴**：R1-6
- **做什麼**：一次搬完，不分批：
  1. `scripts/contract-cli.mjs`（626 行）
  2. `knowledge/contracts/` 全部 17 個檔
  3. `fixtures/043-clean-consumer/` + `fixtures/043-two-app/` —— **只搬 git tracked 的 10 個檔**；本機那份 `node_modules/`（含 prisma engine 二進位）不要跟著搬
  4. `.github/workflows/integration-contracts.yml`
- **驗證**：`appspine-packages` 端 `git status` 顯示四組都在同一個 commit；root 端同一時間點四組都不見了。

### R2-2 改寫 `contract-cli.mjs` 的路徑邏輯（這是重寫，不是 `git mv`）
- **repo**：`appspine-packages`
- **依賴**：R2-1（同批 commit 內完成）
- **做什麼**：
  - `const root = resolve(process.env.APPSPINE_WORKSPACE_ROOT ?? process.cwd())`：現在「合約來源」與「寫入目標 app」是同一棵樹下的相對路徑，搬家後變成兩個不相關的 checkout。改成**合約來源固定為本 repo root**，`--target` 改吃**任意路徑（絕對或相對於 CWD）**，不再是 `apps/<app>` 這種 workspace 相對寫法。
  - `resolve(root, 'appspine/packages/integration-contracts/dist/index.js')` → `resolve(root, 'packages/integration-contracts/dist/index.js')`。
  - `collectLocalUsage()`：硬編 `apps/wiki`、`apps/approve`。依計畫第 4 點，跨 repo 掃描降級為次要功能——**改成在拿不到其他 repo 時明確印出 warning 並回傳空集合，不要靜默當作「沒人用」**（靜默會讓 `index` 產出錯誤的使用者欄位）。
- **驗證**：`node scripts/contract-cli.mjs validate` 與 `index --check --root-only` 通過；且**額外驗**：暫時把 `packages/integration-contracts/dist/` 移走，確認 `compareSchemaPair` 現在會印出可見的 warning 而不是靜默走弱比較器。

### R2-3 改寫 `integration-contracts.yml` 的觸發路徑與 job 步驟
- **repo**：`appspine-packages`
- **依賴**：R2-1（同批）
- **做什麼**：
  - 觸發路徑 `knowledge/contracts/**`、`scripts/contract-cli.mjs`、`fixtures/043-*/**` 維持。
  - **移除 `knowledge/topics/043-*.md` 這條觸發路徑**：那兩份文件 status 都是 `completed`，Phase 4 會把它們壓進 `log.md` 後刪除。留著會變成指向不存在路徑的觸發器。
  - **新增 build 步驟**：搬進 `appspine-packages` 後要在 `validate` 前加 `pnpm install --frozen-lockfile` + build `@appspine/integration-contracts`，否則新家還是走同一條靜默降級路徑。
  - 確認新 repo 已有 `ci.yml`，兩條 workflow 的 job 名稱不衝突、`push: main` 不會互卡。
- **驗證**：在 `appspine-packages` 開一個只動 `knowledge/contracts/index.md` 的測試 PR，確認 `Integration contracts` workflow 被觸發且綠燈；再 push 一個只動 `packages/auth/` 的 commit，確認它**不會**被觸發。

### R2-4 更新三個 fork 的 contract checker 上游對照關係
- **repo**：`apps/approve`、`apps/projects`、`apps/wiki`、`appspine-app-template`
- **依賴**：R2-3
- **做什麼**：generator 產出的樣板與各 fork 的 `check-generated-integration-contracts.mjs` 是逐字複製關係，原本靠 root workflow 一起 gate。**注意實際只有 3 個 fork 有這份副本（approve / projects / wiki），不是 8 個。** gate 消失後，至少在 `appspine-packages` 的 `contract-cli.mjs` 檔頭與 template 的 `scripts/check-generated-integration-contracts.mjs` 檔頭互相加上「這段樣板與 X 逐字對應，改一邊要同步另一邊」的註記，並在 `appspine-packages/knowledge/` 記一筆待辦（自動化 gate 屬於後續工作，不在本次範圍）。
- **驗證**：4 個檔案都有互指註記；3 個 fork 各跑一次 `node scripts/check-generated-integration-contracts.mjs` 通過。

> **閘門 G3**：R2-3 的 PR 綠燈 + 3 個 fork 的 checker 通過，才往下。
> **回滾**：整個 Phase 2 是 root 一個 delete commit + `appspine-packages` 一個 add commit，兩邊各 revert 即可，24 小時內都還原得回去。

---

## Phase 3 — `dev-infra` 拆成獨立 repo 與 GHCR 轉掛

`dev-infra/` 目前是 root repo 的一部分（`.gitignore` 沒有排除它），所以這是真正的 repo 拆分，不是資料夾搬移。

### R3-1 用保留 history 的方式切出 `dev-infra`
- **repo**：workspace root → 新 repo `appspine/dev-infra`
- **依賴**：R2-1（避免與 Phase 2 的 root commit 打架；技術上兩者無耦合，但都動 root 的 `.github/workflows/`，排開比較好處理衝突）
- **做什麼**：`git filter-repo --subdirectory-filter dev-infra`（或 `git subtree split`）切出 `dev-infra/`，推到新建的 `appspine/dev-infra`。**判斷取捨**：計畫沒明說要不要保 history；判斷選保留，理由跟第 3 點堅持用 rename 而非新建 repo 是同一個——realm export 的變更史是排查 SSO 問題的主要線索。
- **驗證**：新 repo `git log --oneline -- keycloak/` 看得到歷史 commit（不是只有一筆 "initial commit"）；`docker build -f Dockerfile.keycloak .` 在新 repo 內成功。

### R3-2 把 `keycloak-image.yml` 搬進新 repo 並改寫路徑（先**不要**刪掉 root 那份）
- **repo**：`dev-infra`
- **依賴**：R3-1
- **做什麼**：複製 workflow 過去，把所有 `dev-infra/` 前綴拿掉。push 目標 `ghcr.io/${{ github.repository_owner }}/keycloak-dev` **不用改**（owner 仍是 `appspine`）。
- **驗證**：`workflow_dispatch` 手動跑一次，前面的 build + token-exchange smoke 步驟綠燈——**最後的 push 步驟這時應該會 403**，那是預期中的，正好證明 R3-3 有必要。

### R3-3 手動把 GHCR package 的 Connected repository 轉掛到 `dev-infra`
- **repo**：GitHub Packages 設定（`appspine/keycloak-dev`）
- **依賴**：R3-1（新 repo 必須先存在才能選）、R3-2（要先確認除了 push 以外都跑得過）
- **做什麼**：Package settings → Connected repository → 改指 `appspine/dev-infra`。順便**確認 package 仍是 private、且「Manage Actions access」清單沒被清空**。
- **順序的關鍵理由**：`keycloak-image.yml` 是用 `secrets.GITHUB_TOKEN` + `permissions: packages: write` 推 image，這個寫入權限**完全來自 connected repository**。轉掛之前，新 repo 推不上去；而 root repo 那份 workflow 一旦先被刪掉，就沒有任何來源能維持 `:latest` 是最新的。所以順序必須是「新 repo 能推成功 → 才刪舊 workflow」。
- **驗證**：重跑 R3-2 的 `workflow_dispatch`，這次 push 步驟成功；GHCR 上 `keycloak-dev:latest` 的 published 時間更新。

### R3-4 驗證 8 個 app 的 E2E 仍能拉到 image
- **repo**：8 個 app
- **依賴**：R3-3
- **做什麼**：8 個 app 的 `e2e.yml` 都是 `image: ghcr.io/appspine/keycloak-dev:latest` + `credentials: PACKAGES_READ_TOKEN`。因為 image 名稱是 org-scoped、認證走 PAT 而非 `GITHUB_TOKEN`，理論上**一個字都不用改**。但要實測，不能推論。挑 2 個 app（建議 `approve`：e2e 最複雜；`mcp-gateway`：036 的 pilot）各觸發一次完整 e2e。
- **驗證**：兩條 e2e pipeline 的 keycloak service container 正常起來、golden-path spec 通過。
- **附註**：package 的讀取授權嚴格說屬於計畫裡「延後處理的權限議題」，但這一項會直接讓 8 條 CI 掛掉，所以拉進本次範圍。

### R3-5 刪除 root 的 `keycloak-image.yml` 與 `dev-infra/`
- **repo**：workspace root
- **依賴**：R3-4（**必須**）
- **做什麼**：從 root repo 移除 workflow 與整個 `dev-infra/` 目錄。
- **驗證**：root repo 的 `.github/workflows/` 剩 0 個檔（`integration-contracts.yml` 已於 R2-1 搬走）；root `git grep -n "dev-infra"` 只剩文件敘述性提及。

### R3-6 更新 8 個 app 對 `dev-infra` 的敘述性引用
- **repo**：8 個 app
- **依賴**：R3-5
- **做什麼**：已查證 apps 底下 86 處 `dev-infra` 引用**沒有任何一處是相對檔案路徑**，全是 README/`.env.example`/workflow 註解裡的文字說明。「at the repo root」這種措辭在拆 repo 後是錯的，要改成「clone `appspine/dev-infra` 這個 repo」。
- **驗證**：8 個 app 的 README / `.env.example` 都不再宣稱 `dev-infra` 在同一棵樹底下。

> **閘門 G4 — 停下來確認**：R3-4 是本計畫風險最高的驗證點（一次錯會同時打掉 8 條 CI）。兩個 app 的 e2e 沒有實跑綠燈，不要執行 R3-5。
> **回滾**：R3-5 之前，root repo 的舊 workflow 都還在，把 connected repository 轉回 `appspine-workspace` 就完全復原。R3-5 之後就沒有退路了。

---

## Phase 4 — `knowledge/` 精簡、去重與連結修復

一次做完整批，理由有三：
(a) 這是**最後一個「一個人手上同時有全部 clone」的時間點**，跨 repo 去重之後就分工出去了，之後再做要協調 9 個 repo 的 PR；
(b) 精簡會刪掉大量文件，先精簡再決定「還剩什麼要併進 `appspine-packages`」（Phase 6），順序反過來會把待刪文件搬一趟；
(c) 精簡也會刪掉大量引用 `_archive/` 的 completed 文件，**先精簡再刪 `_archive/`，要手修的連結會少非常多**。

### R4-0 保留 root `scripts/lint-knowledge.js` 作為本階段的驗證工具
- **repo**：workspace root
- **依賴**：R2-1
- **做什麼**：**明確決定：`lint-knowledge.js` 不在這裡搬走。** 它硬編了 11 個 repo，一次能檢查全部 repo 的 frontmatter、index 新鮮度、本機連結、`copy_status: pending` 跨 repo 副本完整性——這正是 Phase 4 每一步需要的驗證器。搬進 template 之後它只剩單 repo 檢查能力，跨 repo 去重（R4-4）就沒有工具可驗。搬遷排在 Phase 7。
- **驗證**：`node scripts/lint-knowledge.js` 在 Phase 4 開始前跑一次，記下 baseline 錯誤數（應為 0）。

### R4-1 先把 `log.md` 的既有條目改寫成 3-5 行格式
- **repo**：workspace root + 8 個 app 各自的 `log.md`
- **依賴**：R4-0
- **做什麼**：現有條目長度不一（部分接近完整段落甚至含技術細節）。**先統一格式再開始壓縮新條目**，否則新舊混雜、無從判斷「3-5 行」的實際標準。每則保留：決策、原因、結果。
- **驗證**：`log.md` 內沒有任何單一條目超過 5 行；`node scripts/lint-knowledge.js` 維持 0 錯。

### R4-2 壓縮 root `knowledge/` 的 completed / superseded / archived 文件
- **repo**：workspace root
- **依賴**：R4-1
- **做什麼**：範圍 = decisions 15 completed + 1 archived、topics 19 completed + 2 superseded，共 **37 份**。每份壓成 `log.md` 3-5 行後刪除原檔。39 篇 `active` decisions 與 7 篇 `active` topics 一律不動。
- **判斷取捨（需要使用者確認）**：另有 **2 份 `draft`**、**1 份 `paused`** 不在計畫列舉的三種狀態內。判斷比照 `active` 保留不動（計畫寫「只動 completed/superseded/archived」，未列舉即不在範圍）。但 `043-cross-app-integration-contracts-plan.md`（draft）描述的正是 Phase 2 剛搬走的東西，值得單獨看一眼。
- **驗證**：`ls knowledge/decisions knowledge/topics | wc -l` 從 84 降到 47；`grep -c "^status: \(completed\|superseded\|archived\)" knowledge/**/*.md` 為 0；lint 0 錯。

### R4-3 壓縮 8 個 app repo 各自的 `knowledge/`
- **repo**：8 個 app
- **依賴**：R4-2（先用 root 把做法定型，再套到 app）
- **做什麼**：同 R4-2 的規則逐 repo 執行。各 repo 的 completed/superseded/archived 數量偏少（approve 1、calendar 1、chat 2、drive 3、master-data 1、mcp-gateway 4、projects 0、wiki 1）。
- **驗證**：8 個 repo 各自 `grep -c "^status: \(completed\|superseded\|archived\)"` 為 0；lint 0 錯。

### R4-4 跨 repo 重複文件歸位（去重）
- **repo**：workspace root + 8 個 app
- **依賴**：R4-3（先刪掉不需要的，剩下的才需要判斷歸屬）
- **做什麼**：依 R0-3 第 5 項的清單處理 **15 個重複檔名、40 份 app 端副本**。歸屬原則（計畫第 5 點）：框架/跨 repo 決策 → `appspine-packages`；app 專屬 → 該 app。`001-app-framework-plan.md`（root + 7 app）、`002-app-dev-conventions.md`（root + 8 app）、`010-m2m-api-key-acting-user-plan.md`（root + 7 app）、`Z02-app-template-fork-validation.md`（root + 7 app）是主要出血點，共 29 份 app 副本，歸 `appspine-packages`（或 `appspine-app-template`），app 端刪除並改連結指向擁有者 repo。其餘 11 個檔名各 1-2 份，逐份判斷。`copy_status` 這個 frontmatter 欄位在去重完成後失去意義，記下來，Phase 7 改寫 linter 時一併移除該檢查。
- **驗證**：R0-3 第 5 項的重複清單重跑後為空；lint 的 `[PENDING COPY]` 檢查 0 錯；被刪副本的每個原引用點都指向新家。

### R4-5 修掉指向已刪文件的**內部**相對連結
- **repo**：全部
- **依賴**：R4-4
- **做什麼**：R4-2 ~ R4-4 刪了大量檔案，指向它們的相對連結全斷。特別注意兩個**跨 repo 逃逸**的相對連結，它們在 Phase 9 拉平後會第二次斷掉，這裡就一次改成絕對 URL（已查到 `apps/mcp-gateway/knowledge/topics/Z33-...md` 與 `apps/wiki/knowledge/topics/011-task-breakdown.md` 各有一處）。
- **驗證**：`node scripts/lint-knowledge.js` 的本機連結檢查 0 錯。

### R4-6 修掉 87 處 `appspine-workspace` 絕對網址
- **repo**：8 個 app（49 個檔案）
- **依賴**：R4-4（要先知道文件最終落在哪個 repo 才知道新 URL）
- **做什麼**：`lint-knowledge.js` **不檢查絕對網址**，這批只能靠 grep 清單逐條處理，已知至少有一條現在就是壞的（`apps/wiki/README.md`）。三種處理：(a) 目標文件已歸到某 repo → 改指新 repo 的絕對 URL；(b) 目標文件已被壓進 log → 改成引用該 repo 的 `knowledge/log.md`；(c) 目標文件已刪且無替代 → 直接拿掉連結，保留文字。
- **驗證**：`grep -ro "github.com/appspine/appspine-workspace" apps/` 回 0；抽樣 10 條新 URL 確認 200。

### R4-7 掃掉 86 處 `dev_docs/` 死引用
- **repo**：8 個 app（63 個檔案）+ root `docs/agent-guide.md` + root `README.md`
- **依賴**：R4-4
- **做什麼**：與本次重整無關的既有問題，但同一批清理成本最低。範圍比計畫描述的大——除了 `CLAUDE.md`/`AGENTS.md`/`docs/*.md`，還散在 `.prisma` schema 註解、`seed.ts`、`check-schema-docs.ts`、`auth.ts`、`.env.example`、`e2e.yml` 註解裡。優先處理**主動指路型**的，歷史備註型的可以只加註「已封存」或直接刪句。
- **驗證**：`grep -rn "dev_docs/" apps/ --exclude-dir=node_modules` 剩下的每一筆都是明確標記為歷史備註的敘述，沒有任何一筆是要求讀者前往閱讀的指標。

> **閘門 G5 — 停下來確認**：`node scripts/lint-knowledge.js` 對全部 11 個 repo 0 錯，且 R0-3 的六項 grep 清單逐項歸零/可解釋。**這是刪 `_archive/` 之前的最後檢查點。**

---

## Phase 5 — 刪除 `_archive/`

### R5-1 重跑 `_archive` 引用掃描並修掉倖存的 active 引用
- **repo**：workspace root
- **依賴**：R4-2 ~ R4-7（**關鍵**：先精簡再掃，數量會從 32 份 active 文件 / 188 處大幅下降，因為許多引用者本身是 completed 文件已被刪除）
- **做什麼**：重跑 R0-3 第 2 項。剩下的 active 引用逐份處理，計畫點名的四份是最低限度，但**實際清單以重掃結果為準**（改前的基準是 32 份 active 文件，不是 4 份）。root `README.md` 與 `docs/agent-guide.md` 的 `_archive/dev_docs-20260803/` 指標一定要處理。
- **驗證**：`grep -rn "_archive" knowledge/ docs/ README.md` 只剩「這些內容已封存，不再維護」這類不含連結的敘述，沒有任何 markdown link 指進去。

### R5-2 確認 `_archive/` 的內容有第二份存放處
- **repo**：workspace root
- **依賴**：R0-2
- **做什麼**：**刪除前的最後一道保險。** 確認 R0-2 的 bundle 存在且 verify 通過——`appspine-workspace` 這個 repo 之後會被整個刪除（見 R9-4），過渡期唯一能回去查已刪內容的地方就是這份 bundle，不是 GitHub 上的 repo。
- **驗證**：bundle 檔案存在於 repo 外的路徑，`git bundle verify` 通過，且 `git bundle list-heads` 含 main。

### R5-3 刪除 `_archive/`
- **repo**：workspace root
- **依賴**：R5-1、R5-2
- **做什麼**：`git rm -r _archive/`，單一 commit，commit message 記明「內容保留於 git history 與 `<bundle 路徑>`」。
- **驗證**：`ls _archive` 不存在；`git log --oneline -1 -- _archive/` 看得到刪除 commit；`git show <sha>^:_archive/dev_docs-20260803/INDEX.md | head` 能取回內容。

---

## Phase 6 — 系統級治理文件併入 `appspine-packages`、`docs/agent-guide.md` 拆分

### R6-1 判定並搬移系統級治理文件
- **repo**：workspace root → `appspine-packages`
- **依賴**：R4-4（精簡與去重後才知道剩什麼）、R5-3
- **做什麼**：把 root `knowledge/` 精簡後剩下的內容併入 `appspine-packages/knowledge/`。**`appspine-packages/knowledge/decisions/` 與 `topics/` 目前都是空的**，這是「填入」不是「合併」，不會有檔名衝突——但正因為要一次填入 40+ 份，index 重建與編號規則（Phase 8）要同批處理。同時搬 `knowledge/index.md`、`knowledge/log.md`、`knowledge/Cited.md`。
- **判斷取捨**：`Cited.md` 計畫沒指定歸屬，判斷跟著知識庫走進 `appspine-packages`，但**引用來源已被刪除的條目要一併刪掉**。
- **驗證**：`appspine-packages/knowledge/index.md` 重新產生後行數與實際檔案數一致；root `knowledge/` 只剩空目錄。

### R6-2 拆分 root `docs/agent-guide.md`（98 行，5 個區塊，各有不同歸屬）
- **repo**：workspace root → `appspine-packages` + `appspine-app-template`
- **依賴**：R6-1
- **做什麼**：計畫只明確指派了 port 表（→ template）與「其餘併入 `appspine-packages`」。實際內容有五塊，歸屬判斷（**需要覆核**）：

  | 區塊 | 歸屬 | 理由 |
  |---|---|---|
  | 頂部 workspace 目錄結構說明 | **刪除** | 描述的正是本次要拆掉的結構 |
  | Knowledge Base & Architecture Docs | `appspine-packages` | 指向 001/002，已歸該 repo |
  | Integration contracts CLI 用法 | `appspine-packages` | 跟著 Phase 2 搬走的工具 |
  | **Local Dev Ports 對照表** | **`appspine-app-template`** | 計畫中風險第 1 點明訂 |
  | Template change propagation | **`appspine-app-template`** | 步驟全在 template repo 執行，計畫未指派，判斷歸 template |
  | Absolute Rules | `appspine-packages` | 全 repo 通用規範 |
- **驗證**：root `docs/` 清空；兩個目的地 repo 的 agent-guide 都能獨立讀懂。

### R6-3 更新 port 對照表的路徑寫法並補上維護指示
- **repo**：`appspine-app-template`
- **依賴**：R6-2
- **做什麼**：表格內 9 列的 app 名稱目前寫成 `apps/wiki` 等，Phase 9 拉平後這些路徑不存在，改成純 repo 名。維護指示「add a row in the same commit」在拆 repo 後做不到（改 port 的人跟表格不在同一個 repo），改成「開一個 PR 到 `appspine-app-template` 更新此表」。
- **驗證**：表格 9 列都是 repo 名不含 `apps/`；維護指示不再要求「same commit」。

---

## Phase 7 — `lint-knowledge.js` 進 template 與 1 + 8 + 1 傳播

排在 Phase 4 之後：它是 Phase 4 的驗證器，不能先拆掉。

### R7-1 改寫 `lint-knowledge.js` 成單 repo 版本
- **repo**：workspace root → `appspine-app-template`
- **依賴**：R4-7（Phase 4 全部驗證完畢）、R6-2
- **做什麼**：移除 11 repo 硬編清單與外層迴圈，改成只檢查 `process.cwd()` 自己的 `knowledge/`。**移除 `copy_status: pending` 檢查**：R4-4 去重後不再有副本，單 repo 版本也驗證不了。落點：`appspine-app-template/scripts/lint-knowledge.js`。
- **驗證**：在 template repo 內跑 0 錯；複製到任一 app repo 直接跑也 0 錯（證明沒有殘留 workspace 假設）。

### R7-2 依既有 template propagation 流程 replay 進 8 個 fork
- **repo**：8 個 app
- **依賴**：R7-1
- **做什麼**：這**不是一個動作，是 8 次**。依既有流程：每個 fork 讀自己的 `docs/template-sync.md` 找 last-synced SHA → 在 template 跑 `list-template-changes.mjs` → 手動 replay → 回填對應。**已知既有缺陷**：8 個 fork 的 `template-sync.md` 都指向一個不存在的章節，replay 的同時順手修掉。
- **驗證**：8 個 app 各自 lint 0 錯；8 份 `docs/template-sync.md` 都有本次 commit 的對應紀錄，且不再指向不存在的章節。

### R7-3 在 `appspine-packages` 放一份獨立副本
- **repo**：`appspine-packages`
- **依賴**：R7-1
- **做什麼**：`appspine-packages` **不是 template 的 fork**，拿不到 propagation，而它在 R6-1 之後反而是全系統 `knowledge/` 最多的 repo。直接放一份獨立副本，檔頭註明「與 `appspine-app-template/scripts/lint-knowledge.js` 逐字對應，非透過 template 傳播，改一邊要手動同步另一邊」。
- **驗證**：對 R6-1 併入的 40+ 份文件 0 錯。

### R7-4 接進各 repo 的 CI / pre-commit
- **repo**：`appspine-app-template` + 8 個 app + `appspine-packages`
- **依賴**：R7-2、R7-3
- **做什麼**：在 10 個 repo 的既有 workflow 加一步 lint。
- **驗證**：10 個 repo 各推一個故意破壞 frontmatter 的測試 commit，確認 CI 紅；還原後綠。

---

## Phase 8 — 編號規則改為各 repo 獨立

### R8-1 解決既有的全域撞號
- **repo**：`appspine-packages`
- **依賴**：R6-1
- **做什麼**：`004-framework-completion-plan.md` 與 `004-task-breakdown.md` 撞號——先確認 R4-2 後是否還活著（若已壓進 log，這題自動消失）。若還在，重編其中一份並修所有引用。
- **驗證**：`appspine-packages/knowledge/` 內沒有任何兩份文件共用同一個數字前綴。

### R8-2 把「各 repo 獨立編號」寫成成文規則
- **repo**：`appspine-packages`、`appspine-app-template`（→ 由 R7-2 傳播到 8 個 app）
- **依賴**：R8-1、R7-2
- **做什麼**：在各 repo 的 `knowledge/index.md` 或 agent-guide 寫明：序號各 repo 自算、不共用全域序號；跨 repo 相關決策只放共用位置一份，不複製。**明確寫出「不要複製」是關鍵**，這正是造成 40 份重複副本的原因。
- **判斷取捨**：`T-XXXXX` 格式**維持不動**（GitHub Issues 構想已移出本次範圍），只改文件序號規則。
- **驗證**：10 個 repo 的 knowledge 規則段落都有這條。

---

## Phase 9 — 本機資料夾拉平與 `appspine-workspace` 退場

排到最後的理由：Phase 4 全程仰賴 root `scripts/lint-knowledge.js`（硬編 `apps/<name>` 路徑），`contract-cli.mjs` 的 `collectLocalUsage()` 也硬編 `apps/wiki`、`apps/approve`。這些工具被搬走/改寫**之前**拉平資料夾，等於在最需要驗證器的時候把驗證器弄壞。等 R7-1、R2-2 都改寫完，拉平就是零風險的 `mv`。

### R9-1 拉平 8 個 app 資料夾
- **repo**：本機檔案系統（GitHub 端無任何動作，8 個 app 早就是獨立 repo）
- **依賴**：R7-4、R2-2
- **做什麼**：關閉所有佔用這些目錄的 process，`mv apps/<name> ./<name>` ×8，刪掉空的 `apps/`。已查證 apps 底下沒有任何逃出 app repo 的檔案系統路徑引用（僅有的兩處已於 R4-5 改成絕對 URL）。
- **驗證**：`ls d:\Source\Private\appspine` 顯示 10 個資料夾同一層；8 個 app 各跑 `git status`（clean）+ `pnpm -C backend typecheck`（通過）。

### R9-2 更新 `contract-cli.mjs` 文件裡的 `--target` 範例
- **repo**：`appspine-packages`
- **依賴**：R9-1
- **做什麼**：CLI 用法段落裡的 `--target apps/<app>` 拉平後不存在，改成 `--target ../<app>` 或絕對路徑。
- **驗證**：照文件抄一次 `sync-views --dry-run` 指令，能成功跑到目標 app repo。

### R9-3 清空 root repo 的剩餘內容
- **repo**：workspace root
- **依賴**：R9-1
- **做什麼**：此時 root repo 應該只剩 README/CLAUDE/AGENTS（pointer 檔）、空的 `knowledge/`/`docs/`/`scripts/`/`fixtures/`、`.gitignore`。全部移除，最後 commit 留一份 `README.md` 說明「本 repo 已功成身退，內容分散至 `appspine-packages` / `appspine-app-template` / `dev-infra` / 8 個 app repo」並列出對照表。
- **驗證**：root repo 除 `README.md` 外無 tracked 檔案。

### R9-4 GitHub 端刪除 `appspine-workspace`

- **repo**：`appspine-workspace`
- **依賴**：R9-3
- **做什麼**：Settings → Delete this repository。符合計畫第 9 點原意（功成身退，不獨立存在），不需要留一個唯讀 repo 撐著——「內容留在 git history」不是這個 repo 存續與否的硬性條件，過渡期的安全網是 R0-2 的 bundle，不是 GitHub 上的 repo 繼續存在。
- **驗證**：repo 已從 GitHub 上移除；R0-2 的 bundle 仍可還原（`git bundle verify` 通過）。

### R9-5 把本機 root 資料夾降級為普通資料夾
- **repo**：本機
- **依賴**：R9-4
- **做什麼**：移除 `.git`（建議先改名觀察一兩週再真刪）、`.gitignore`；`README.md` 改寫成純本機導覽（列出 10 個 repo 與各自 GitHub URL）。
- **驗證**：`git status` 回報 not a git repository；10 個子資料夾各自 `git status` 正常。

> **閘門 G6 — 停下來確認**：R9-5 之前，確認 R0-2 的 bundle 存在且可還原。這是全計畫最後一個不可逆步驟。

---

## Phase 10 — 全域收尾驗證

### R10-1 「單 repo clone 可用性」實測
- **repo**：全部
- **依賴**：R9-5
- **做什麼**：在一個乾淨目錄，模擬新接手的人：只 clone `<某 app>` + `dev-infra` 兩個 repo，照該 app 的 README 從零跑起本機開發（起 dev Keycloak、install、backend+frontend 起來、登入一次）。這是計畫第 8 點的整個動機。建議至少測 2 個 app（`calendar` 簡單、`approve` 複雜）。
- **驗證**：兩個 app 都能只靠兩個 repo 跑到登入成功，過程沒有任何一步需要參照 workspace 或其他 app repo。

### R10-2 AI agent 引導鏈完整性實測
- **repo**：8 個 app + `appspine-packages` + `appspine-app-template`
- **依賴**：R10-1
- **做什麼**：在單一 repo clone 內，沿 `CLAUDE.md → AGENTS.md → docs/agent-guide.md` 走一遍，確認大量改連結後這條鏈仍自成一體。
- **驗證**：三層文件的每個連結都可達，沒有任何一個指向已退場的 `appspine-workspace`。

### R10-3 CI 全綠掃描
- **repo**：10 個
- **依賴**：R10-2
- **做什麼**：逐 repo 確認：8 條 e2e、`appspine-packages` 的 `ci.yml`+`release.yml`+`integration-contracts.yml`、`dev-infra` 的 `keycloak-image.yml`、10 條新加的 lint。
- **驗證**：10 個 repo 最近一次 main 上的 run 全綠。

### R10-4 grep 清單歸零覆核
- **repo**：全部
- **依賴**：R10-3
- **做什麼**：重跑 R0-3 的六項查詢，逐項對照：絕對網址=0、`_archive`連結=0、`dev_docs/`主動指路型=0、`appspine/appspine[^-]`=0、跨repo重複檔名=0、completed/superseded/archived狀態文件=0。
- **驗證**：六項全部符合預期，不符的逐條補完。

### R10-5 記錄本次重整本身
- **repo**：`appspine-packages`
- **依賴**：R10-4
- **做什麼**：把計畫文件與本執行拆解收進 `appspine-packages/knowledge/decisions/`，狀態 `completed` → 依第 5 點的觸發時機規則立刻壓成 `log.md` 3-5 行條目。這既是紀錄，也是新規則的第一次實地演練。
- **驗證**：`log.md` 有一則 3-5 行的重整條目；linter 0 錯。

---

## 依賴關係摘要

```
Phase 0 ──> Phase 1 (PR#19 → rename → 15 package.json → 實測 release)
                │
                ├──> Phase 2 (contract 四件套原子搬遷)
                │        │
                │        └──> Phase 3 (dev-infra 拆分 → GHCR 轉掛 → 實測 → 才刪舊 workflow)
                │                 │
                └─────────────────┴──> Phase 4 (knowledge 精簡/去重/連結) ← 全程用 root lint 當驗證器
                                             │
                                             ├──> Phase 5 (刪 _archive，先重掃再刪)
                                             │        │
                                             │        └──> Phase 6 (治理文件併入 + agent-guide 拆分)
                                             │                 │
                                             └─────────────────┴──> Phase 7 (lint 進 template + 1/8/1 傳播)
                                                                        │
                                                                        └──> Phase 8 (編號規則)
                                                                                 │
                                                                                 └──> Phase 9 (拉平 + 退場)
                                                                                          │
                                                                                          └──> Phase 10 (驗證)
```

**可並行**：Phase 2 與 Phase 3 邏輯上獨立，只因為都要對 root repo 的 `.github/workflows/` 下 commit 才建議排開；若兩人分工可以並行，注意 root repo 的 merge 衝突。
**絕對不可並行**：Phase 4 全程需要獨占的、狀態一致的 11 個 repo clone（跨 repo 去重要同時看到所有副本）。

## 檢查點與回滾摘要

| 閘門 | 位置 | 過不了就 |
|---|---|---|
| G1 | Phase 0 結束 | 還沒動任何東西，零成本 |
| G2 | R1-6 實測 release 綠燈後 | rename 可反向 rename（repo ID 不變）；本機 `mv` 回去 |
| G3 | R2-3 的測試 PR 綠燈後 | 兩邊各一個 revert commit |
| G4 | **R3-4 兩個 app 的 e2e 實跑綠燈後** | connected repository 轉回 `appspine-workspace` 即完全復原。**R3-5 執行後就沒有退路** |
| G5 | Phase 4 結束、lint 11 repo 0 錯 | 這是刪 `_archive/` 前最後檢查點 |
| G6 | R9-5 執行前 | 確認 R0-2 的 bundle 存在且可還原。移除本機 `.git` 後不可逆 |

## 使用者裁決結果（全數確認，第 1-5 項照 Opus 判斷執行）

1. **`draft`（2 份）與 `paused`（1 份）狀態文件**（R4-2）：**確認**比照 `active` 保留不動，不在本次精簡範圍。`decisions/043-cross-app-integration-contracts-plan.md`（draft）之後可以另外單獨看要不要處理，不併入這次。
2. **root `docs/agent-guide.md` 的「Template change propagation」段落歸屬**（R6-2）：**確認**歸 `appspine-app-template`。
3. **`knowledge/Cited.md` 的歸屬**（R6-1）：**確認**併入 `appspine-packages`。
4. **`dev-infra` 拆分保留 git history**（R3-1）：**確認**用 `git filter-repo` 保留歷史。
5. **GHCR package 讀取授權驗證拉進本次範圍**（R3-4）：**確認**R3-4「驗證 8 個 app 仍拉得到 image」列為必做項目。
6. **Phase 4 的執行者**（R4-0 ~ R4-7）：**確認**由現在手上握有全部 11 個 repo clone 的人一次做完，維持文件既有的排序假設（Phase 4 排在 Phase 9 拉平/交接之前），不需要調整順序。
