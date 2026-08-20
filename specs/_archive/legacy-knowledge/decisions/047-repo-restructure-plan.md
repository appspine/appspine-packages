---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-08-12
updated: 2026-08-12
---

# Repo 架構重整 — 執行完畢

> 已執行完畢：`appspine` 改名 `appspine-packages`、8 個 app 拉平為頂層獨立 repo、`dev-infra` 拆成
> 獨立 repo、`appspine-workspace` 已退場刪除。原草稿內容如下，保留作為決策紀錄。
>
> 這是一份獨立的思考草稿，刻意不套用 `knowledge/` 既有的 init-knowledge 範本／編號機制
> （原因見下方第 4、6 點——這套機制本身也在被檢討的範圍內）。
> 內容只到「要做什麼、為什麼」，還沒進到「怎麼做」的執行步驟。

## 背景與動機

開發工作要開始分給不同人／team 負責。目前的 repo 架構（`appspine` workspace 底下混著
`appspine`、`appspine-app-template`、`apps/<name>` 一堆本機 clone）需要先理解整個 workspace
才能上手，不利於分工——希望改成讓每個人只看自己負責的部分就懂，不需要先吸收整個系統的脈絡。

## 目標範圍

1. **`appspine` → `appspine-packages`**
   本機資料夾與 GitHub remote 都改名，讓名稱直接說明「這是套件庫」。

2. **`apps/` 拉平成頂層獨立 repo**
   `approve`、`calendar`、`chat`、`drive`、`master-data`、`mcp-gateway`、`projects`、`wiki`
   從 `apps/<name>` 搬到頂層，各自的人只需接觸自己負責的那個 app，不被迫理解或 clone
   其他 repo。

3. **`appspine-app-template` 維持原名不動**
   不改名，只是本來就在頂層。

4. **跨 repo 腳本機制要重新定位**
   `scripts/lint-knowledge.js`、`scripts/contract-cli.mjs` 目前假設執行者手上有全部 app repo
   的本機 clone（硬編 `apps/<name>` 路徑）。兩支腳本的實際跨 repo程度不同，分開處理：
   - **`lint-knowledge.js`**：檢查邏輯其實只針對單一 repo 自己的 `knowledge/`，跟其他 repo
     無關，寫死 11 個 repo 清單只是把多次獨立檢查包在同一指令裡跑。→ 搬進
     `appspine-app-template`，每個 app repo 各自帶一份，只 lint 自己的
     `knowledge/`，在自己的 CI/pre-commit 跑，不需要拿到其他 repo。
   - **`contract-cli.mjs`**：這個是真的跨 repo，因為 `knowledge/contracts/`
     存放的 API/介面合約（capabilities/bindings）本質上跟 `@appspine/auth`、
     `@appspine/rbac` 等共用套件同一類，只是目前放錯地方。→ 把 `knowledge/contracts/`
     跟 `contract-cli.mjs` 一起搬進 `appspine-packages`，每個 app repo 執行
     `sync-views`/`generate-runtime` 時只需要讀 `appspine-packages` + 自己的 repo，
     不需要全部 app 都在本機。現有 `collectLocalUsage()`「哪些 app 用了這份合約」的
     跨 repo 掃描功能會因此拿不到全貌，變成次要功能，之後再另外處理（例如挪到 CI
     各自回報），不影響核心的合約消費流程。

5. **所有 repo 的 `knowledge/` 文件要總結精簡**
   範圍包含 workspace 根目錄的 `knowledge/`（55 個 decisions、29 個 topics）以及每個
   app repo／`appspine`／`appspine-app-template` 各自內部的 `knowledge/`，降低新接手的人
   要吸收的文件量。
   - **文件可見度＝歸檔正確與否**：文件該不該讓某個 app 開發者看到，不需要另外設計一套
     可見度／權限機制，只要精簡時把每份文件歸位到它真正屬於的 repo（框架決策歸
     `appspine-packages`，app 專屬決策歸該 app 自己的 repo），之後 GitHub repo 的存取權
     自然就決定了誰看得到什麼。現在跨 repo 重複存放同一份文件的情況（例如
     `003-shared-package-reuse-plan.md` 同時在 root 跟 `apps/wiki`），精簡時要判斷真正
     歸屬、搬到該去的地方，不要每個相關 repo 都留一份。
   - **精簡範圍與做法（方法確定，範圍要做完整，全部 repo 都套用，不是只試一小塊）**：
     - 現況：root `knowledge/decisions/` 55 篇裡 39 篇 `active`、15 篇 `completed`、
       1 篇 `archived`；`knowledge/topics/` 29 篇裡 19 篇 `completed`、7 篇 `active`——
       已完成/過時文件佔了近一半（decisions 16/55、topics 22/29）。
     - 範圍只動 `completed`／`superseded`／`archived` 狀態的文件，`active` 不動
       （還在指導現在行為，不能砍）。
     - 做法：每篇壓縮成 `knowledge/log.md` 裡 3-5 行的條目（決策、原因、結果），原本完整
       文件刪除——完整內容留在 git history，需要時可回去查，不需要留在活躍的 `knowledge/`
       裡佔位。
     - `log.md` 本身現有條目也偏長（部分條目接近完整段落甚至技術細節），一併改成
       3-5 行的精簡格式，不寫成完整 report。
     - 觸發時機：任務全部完成、狀態改為 `completed` 的當下，就是壓縮進 log 的時機點，
       避免「已完成」文件持續累積。

6. **文件編號與任務步驟編號改成各 repo 獨立算，不共用全域序號**
   - 現況問題：目前是全 workspace 共用一組序號，跨 repo 相關決策會被複製成同名同號檔案
     放進每個相關 repo（例如 `003-shared-package-reuse-plan.md` 同時存在於 root 和
     `apps/wiki`），而且這組全域序號**單人維護時就已經撞號**（root `knowledge/decisions/`
     底下 `004-framework-completion-plan.md` 與 `004-task-breakdown.md` 撞號）。
   - 改法：每個 repo 自己獨立算序號；跨 repo 相關的決策只放共用位置一份，不複製進每個
     repo。
   - **任務步驟編號改用 GitHub Issues 取代手刻 `T-XXXXX` 的想法——移出本次計畫，另立
     新計畫處理**（原討論：GitHub 上的 commit hash 是 SHA-1，不是 GUID，不適合拿來當
     任務編號；構想是規劃定案時直接把任務步驟開成 issue，計畫文件只留「為什麼」，
     「做什麼、做到哪」交給 Issues 追蹤——這部分留給未來另一份計畫討論，不在這次範圍內）。

7. **刪除 `_archive/`**
   根目錄下的 `_archive/`（14 個子目錄，約 300 個檔案，歷史封存文件）確認可以整個刪除。
   排在整體重整動作裡一起執行，這次先列入計畫、不單獨先動手。

8. **`dev-infra` 內容維持共用，但拆成自己獨立的 repo**
   `dev-infra`（共用本機開發用 Keycloak）依 [001-app-framework-plan.md](../topics/001-app-framework-plan.md#L57-L58)
   的既有決策，多個 app 本來就是刻意共用同一個 Keycloak 才能測 SSO 互通，**不拆給各 app
   自己管理**。但為了讓分工的人不用 clone 整個 workspace，`dev-infra` 本身要拉出來變成
   獨立 repo（跟其他 app repo 同一層），負責某個 app 的人只需要 clone 該 app + `dev-infra`
   兩個 repo 就能跑本機開發。

9. **`appspine-workspace` 這個 GitHub repo 整個功成身退，不獨立存在**
   原本考慮過留著放「沒有更具體歸屬的系統級治理文件」（例如講整體多 repo 架構為什麼這樣設計
   的 [001-app-framework-plan.md](../topics/001-app-framework-plan.md)），但重新評估後
   推翻：這只證明這類文件需要一個共同的家，不能證明這個家必須是獨立 repo。
   `appspine-packages` 才是更自然的家——它是唯一一個所有其他 repo（8 個 app + template）都
   依賴的 repo，本來就是整個依賴圖的根，很多專案的核心 repo 本來就會同時放「自己的決策」跟
   「整個系統為什麼長這樣」的紀錄。維持 `appspine-workspace` 獨立存在的成本是實質的（多一個
   repo 要維護 CLAUDE.md/AGENTS.md/README、多一個 GitHub repo 要管權限/設定），换來的東西卻很
   少——照這次分工的動機，日常根本沒人會去 clone 它。
   → **結論**：系統級治理文件併入 `appspine-packages/knowledge/`；本機
   `d:\Source\Private\appspine` 這個資料夾繼續存在（放 `appspine-packages`、
   `appspine-app-template`、`dev-infra`、8 個 app 的地方），但它本身不用是一個 git repo，純粹
   是本機組織用的資料夾。最終確定要保留的頂層 repo 數量：`appspine-packages`、
   `appspine-app-template`、`dev-infra`、8 個 app，共 **10 個**獨立 repo。

## 預期資料夾結構

```text
appspine/                        (本機組織用資料夾，不是 git repo)
├── appspine-packages/           ← 原 appspine，改名；knowledge/ 併入系統級治理文件（第 9 點）
├── appspine-app-template/       ← 原名不動；帶 lint-knowledge.js（第 4 點）+ port 對照表（Opus 中風險第 1 點）
├── approve/                     ← 原 apps/approve，拉平
├── calendar/                    ← 原 apps/calendar，拉平
├── chat/                        ← 原 apps/chat，拉平
├── drive/                       ← 原 apps/drive，拉平
├── master-data/                 ← 原 apps/master-data，拉平
├── mcp-gateway/                 ← 原 apps/mcp-gateway，拉平
├── projects/                    ← 原 apps/projects，拉平
├── wiki/                        ← 原 apps/wiki，拉平
└── dev-infra/                   ← 拆成獨立 repo，內容維持共用（dev Keycloak 等）
```

10 個獨立 GitHub repo，全部同一層，本機用一個普通資料夾裝著、方便一次開發多個。
`appspine-workspace` 這個 repo 本身依第 9 點功成身退，不再獨立存在；`scripts/`（依第 4 點搬空）、
`_archive/`（依第 7 點刪除）、`docs/`（agent-guide.md 內容併入 `appspine-packages`）、
`knowledge/`（依第 5 點精簡後併入 `appspine-packages`）都不會留在最終結構裡，因為已經沒有
獨立的根目錄 repo 可以承載它們。

`apps/` 這層資料夾整個消失，8 個 app 變成跟 `appspine-packages`、`appspine-app-template`、
`dev-infra` 同一層的頂層項目。

## 尚未決定 / 待補充

- 分工後的 GitHub repo 存取權／token/部署權限——**這次先不考慮，之後再設定**。
  （knowledge/ 文件可見度已在第 5 點解決：歸檔到正確的 repo，可見度就跟著 repo 存取權
  自然決定，不需要獨立的可見度機制。）

GitHub Issues 取代任務步驟編號的構想已移出本次計畫，見第 6 點備註，另立新計畫討論。

## Opus 審查發現的盲點（已全數討論定案；觀念層級兩點為觀察，不需另外決定）

實際查了 GitHub API、CI 設定與目前 git 狀態後找到的問題，依風險排序：

### 高風險（會直接弄壞東西）

1. **【已解決】`dev-infra` 拆 repo 會弄壞 `keycloak-dev` GitHub Package**：這個 container image
   目前掛在 `appspine-workspace` repo 底下（private package），8 個 app 的 E2E workflow 都 pull
   `ghcr.io/appspine/keycloak-dev:latest`。拆成獨立 repo 後，新 repo 的 token 對掛在別的 repo
   上的 package 沒有寫入權限，push 會 403，連帶 8 條 E2E pipeline 都拉不到 image。
   → **解法**：image 建置/發布 workflow 跟著 `dev-infra` 一起搬，並手動把該 GHCR package 的
   「Connected repository」改指到新的 `dev-infra` repo（GitHub package 設定裡的一次性手動動作，
   不用改程式碼），改完新 repo 的 workflow 才有寫入權限。

2. **【已解決，涵蓋原 2、3 項】根目錄兩條 GitHub Actions workflow 會被本計畫自己的決策弄壞，
   且 `fixtures/` 整個沒被計畫提到**：`integration-contracts.yml` 監聽 `knowledge/contracts/**`、
   `scripts/contract-cli.mjs`、`fixtures/043-*`（10 個被 `contract-cli.mjs` 測試用的固定檔案）
   ——第 4 點只講搬工具本體，沒講 workflow 跟 fixtures 要一起搬，搬完 workflow 觸發不了/找不到
   檔案，迴歸測試也斷link。
   → **解法**：workflow、`fixtures/043-*` 跟 `contract-cli.mjs`、`knowledge/contracts/` 一起整組
   搬進 `appspine-packages`，觸發路徑改指向新位置。工具、合約來源、測試 fixture、CI 驗證這四樣
   東西維持綁在一起，只是整組換家，不會有東西掉隊。

3. **【已解決】`appspine` 改名時機撞上進行中的 release**：`appspine` repo 現在有一個開著的 PR #19
   （changesets 自動產生的 "Version Packages"），且 15 個 `package.json`、9 個 README 寫死了舊
   repo URL。改名必須是 GitHub 的「repo rename」（保留 history、自動轉址、套件關聯不斷），不是
   「開新 repo 複製過去」；計畫目前沒寫清楚要哪一種、也沒排定「先處理掉這個 PR 再改名」的順序。
   → **解法**：先讓 PR #19 合併掉，再執行改名（GitHub repo rename，不是開新 repo 複製）；改名後
   批次取代 15 個 `package.json` 的 `repository` 欄位跟 9 個 README 裡寫死的舊 URL（GitHub 會自動
   轉址，但長期不該依賴轉址）。

### 中風險（文件/流程會斷，不會讓 CI 掛掉）

1. **【已解決】`docs/agent-guide.md` 的「本機開發 port 對照表」是手動維護的跨 app 共用狀態**
   （scaffold 工具看不到其他 fork 的 `.env`）。分工後每個人只 clone 自己的 app repo，就沒人看
   得到／能更新這張表，兩個 app 選到同個 port 的碰撞會重新發生——第 5 點的精簡範圍只設定在
   `knowledge/`，沒涵蓋 `docs/`。
   → **解法**：這張表要保留（沒有其他機制可以取代它），但不放 `appspine-packages`——它只在
   「建立新 app」的當下會被用到，跟共用套件性質不同。搬去 `appspine-app-template`，跟
   `scaffold-init.mjs` 放在一起，只有負責生出新 app 的人需要碰它，不是每個 app 開發者的日常
   負擔。

2. **【已解決，做法沿用既有流程】`lint-knowledge.js` 搬進 template 是 1 + 8 次手動同步，不是一個
   動作**：template 變更本來就是
   手動 replay 進每個 fork（已有先例：`check-generated-integration-contracts.mjs` 目前就是每個
   fork 各自一份副本）。而且 `appspine-packages` 不是 template fork，也有自己的 `knowledge/`
   （併入第 9 點系統級治理文件後更是如此），搬完之後這個 repo 反而變成沒有 linter 可用，需要
   自己額外留一份獨立副本（不透過 template 傳播機制），不能只靠 template 的傳播流程覆蓋到它。
   （`appspine-workspace` 已依第 9 點退場，不用再考慮它的 linter。）

3. **【已解決，併入第 5/7 點清理】8 個 app repo 裡有 46 個寫死的 workspace 絕對網址連結**
   （`github.com/appspine/appspine-workspace/blob/main/...`），第 5 點把文件搬走/刪除後這些連結
   會全部 404——而且已經有一個現在就是壞的例子（`apps/wiki/README.md` 連到一個實際上不在那個
   路徑的文件），因為 `lint-knowledge.js` 本來就不檢查絕對網址，完全沒人發現過。
   → **解法**：精簡/搬遷 `knowledge/` 文件時（第 5 點）一併抓出所有指向舊路徑的絕對連結改掉。

4. **【已解決，併入第 5/7 點清理，與這次重整無關的既有問題】8 個 app 的 `CLAUDE.md`、`AGENTS.md`、
   幾乎所有 `docs/*.md` 都還在引用 `dev_docs/`**——這個目錄已於 2026-08-03 歸檔進
   `_archive/dev_docs-20260803/`，早就不存在。多數是歷史備註（無害），但至少
   `apps/wiki/docs/agent-guide.md` 有一則是主動叫讀者去讀 `dev_docs/011-wiki-app-plan.md` 的
   斷掉指標，不是備註。（已驗證：每個 app repo 本身的 `CLAUDE.md → AGENTS.md →
   docs/agent-guide.md` 引導鏈確實自成一體，不依賴 workspace 根目錄，只 clone 單一 app repo
   不會失去 AI agent 引導功能——這點沒問題。）第 5、7 點清理文件連結時一併掃掉這些死引用。

### 觀念層級

1. **第 2 點「拉平 `apps/`」對新人上手其實沒有實質影響**：8 個 app repo 在 GitHub 上早就是乾淨
   獨立的 repo，拉平只是搬本機資料夾。真正的摩擦來自上面「中風險」三點——文件斷連結、共用狀態（port 表）
   沒地方放、template propagation 的指引本身就是斷的（8 個 app 的 `template-sync.md` 都指向一個
   不存在的章節）。folder 拉平不是解法本體，文件/共用狀態整理才是。

2. **`contract-cli.mjs` 搬遷不是 `git mv`，是真的要重寫路徑邏輯**：現在靠 `APPSPINE_WORKSPACE_ROOT`
   環境變數把「合約來源」跟「要寫入的 app 目標」算成同一棵樹下的相對路徑，搬進
   `appspine-packages` 後兩者變成兩個不相關的 checkout。且它產生的程式碼樣板跟 8 個 app 各自的
   `check-generated-integration-contracts.mjs` 是逐字複製的關係，現在靠根目錄 workflow 一起 gate
   住，搬完之後沒有東西再保證 generator 跟 8 份副本同步。

### 計畫已站得住腳的部分（Opus 有查證，不用重新討論）

- 改名 `appspine` 不會弄壞任何 app 的 build（都是走 npm registry 消費，沒有 `file:`/workspace
  路徑連結）。
- `lint-knowledge.js` 確實只做 repo 內部檢查，拆給各 repo 自帶是對的方向。
- app 端的 contract checker 本來就是獨立運作，不需要看到完整合約來源。
- 8 個 app repo 目前都乾淨、沒有進行中分支要顧慮（`appspine` 本身的 PR #19 除外，見上方第 3 點）。
