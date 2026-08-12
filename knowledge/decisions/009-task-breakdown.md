---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-05
---

# 009 - App Template 品質改善 Task Breakdown

> 依照 `009-app-template-quality-improvements-plan.md` 執行範圍 A~E 的品質改善。
> 所有修改只落在 `appspine-app-template` 這個 template repo,以下所有相對路徑都以
> `appspine-app-template/` 為根。
> 每個 task 假設執行者(可能是 Codex 或另一個 agent)沒有本次對話的上下文,必須照著檔案路徑、
> 指令、驗證步驟獨立完成。
> 每完成一個 task,要把 checkbox 從 `[ ]` 改成 `[x]`,並在對應段落補上實際執行結果。

---

## 1. 執行原則

- 所有修改只進 `appspine-app-template` repo,不碰任何已 fork 出去的業務系統 repo,也不碰外層
  `appspine` workspace。
- 只處理範圍 A~E 列出的具體問題,不新增功能、不做預防性重構、不順手擴大範圍。
- 範圍 A~E 五者彼此獨立,沒有互相依賴,可平行或依任意順序處理(唯一例外:A 內部的 scaffold
  pattern 同步依賴 metadata 修正)。
- 每一項修正都要有明確驗證,驗證未通過不得標記完成。
- 若執行過程中發現本計劃未預期的新問題,依既有慣例另開一份 Z 系列記錄文件,不要混進本次 commit。

---

## 2. Task Breakdown

### A. Frontend App Metadata 修復

- [x] **T-900** 修復 `frontend/src/config/app-config.ts` 的 `APP_CONFIG` metadata:
  - 把 copyright 文字中的亂碼字元 `穢` 改回正確的版權符號 `©`。
  - 修掉 meta description 中 `fully customizable` 之前那段標點符號亂碼,使句子通順。
  - 把殘留的上游 dashboard starter 品牌 `Studio Admin`(app name / title / 相關 identity 欄位)
    改為中性的 appspine template 預設值。
  - 驗證:`pnpm -C frontend typecheck` 通過,並人工檢閱 `app-config.ts` 內已無 `穢`、無標點
    亂碼、無 `Studio Admin` 字串殘留。
  - 依賴:無

- [x] **T-901** 同步更新 `scripts/scaffold-init.mjs` 的字串替換規則,使其對應 T-900 改過的
  新字串。
  - `scaffold-init.mjs` 目前的替換 pattern 是照著「尚未修正」的舊字串(含亂碼與 `Studio Admin`)
    寫的;T-900 一旦改動 `app-config.ts`,這些 pattern 會匹配不到而讓 scaffold 靜默失效,因此
    必須把 pattern 更新成 T-900 的新字串。
  - 驗證:跑一次
    `node scripts/scaffold-init.mjs --dry-run --name smoke-test-app --display-name "Smoke Test App"`
    確認 scaffold 仍然能匹配並正確替換 `app-config.ts` 中對應的 identity 欄位(dry-run 輸出中應
    出現該檔案的替換,且無「找不到 pattern / 未替換」的警告)。
  - 依賴:T-900

### B. CI 與本機 pre-commit 的 typecheck/lint 把關

- [x] **T-902** 在 CI 補一個 static-checks 關卡,實際執行目前從未被 CI 跑到的靜態檢查。
  - 檔案:`.github/workflows/e2e.yml`。
  - 新增一個獨立 job,或在 E2E 步驟之前新增步驟,涵蓋:root `pnpm typecheck`、root `pnpm check`、
    `pnpm -C backend check:enum-i18n`、`pnpm -C e2e typecheck`。
  - 驗證:實際 push 一個 commit,確認 CI 綠燈,且在 workflow run log 中可看到新加的檢查步驟
    「真的有執行」(而非被 skip)。
  - 依賴:無

- [x] **T-903** 明確決定並記錄 pre-commit hook 是否要補 `tsc --noEmit`。
  - 背景:`docs/conventions.md` 明文要求「`tsc --noEmit` 必須在每次 commit 前通過」,但目前
    `.husky/pre-commit` 只跑 `check:enum-i18n`、`generate:presets`、`lint-staged`,而 `lint-staged`
    只對 staged 檔案跑 `biome check --write`,從未跑過 `tsc --noEmit`。
  - 選一個方向並記錄理由(不要靜默替使用者決定):
    - 方向一:在 `.husky/pre-commit` 補上 `tsc --noEmit`(或等效的 root typecheck),讓本機
      commit 前真的把關。
    - 方向二:維持「typecheck 只在 CI(T-902)把關」,並在 `docs/conventions.md`(及/或 README)
      把這個決定寫清楚,修正原本「每次 commit 前必須通過」的措辭,使文件與實際行為一致。
  - 驗證:
    - 若選方向一:實際 stage 一個會 typecheck 失敗的改動,確認 commit 被 hook 擋下;還原後
      commit 正常通過。
    - 若選方向二:人工檢閱 `docs/conventions.md`(及 README)已明確載明「typecheck 由 CI 把關、
      pre-commit 不跑」,不再與實際 hook 行為矛盾。
  - 依賴:T-902

### C. Frontend Server 環境變數 fail-fast

- [x] **T-904** 移除 `NEXT_PUBLIC_API_URL` 的硬寫死 fallback,改為缺漏時 fail-fast。
  - 檔案:`frontend/src/server/api-client.ts`、`frontend/src/server/auth-actions.ts`。
  - 兩處目前在 `NEXT_PUBLIC_API_URL` 缺漏時 fallback 回 `http://localhost:3900`,違反「原始碼不
    寫死 host/port」的慣例,且正式環境漏設時不會明確失敗。改用一個在缺漏時直接丟例外的 helper
    (例如 `readRequiredEnv()`)。localhost 預設值只保留在 `.env.example` 與文件中,不留在原始碼。
  - 驗證:`pnpm -C frontend typecheck` 通過;並在本機手動移除/清空 `NEXT_PUBLIC_API_URL` 後觸發
    相關 server 路徑,確認會明確丟出例外(fail-fast)而非靜默使用 localhost。
  - 依賴:無

### D. README / scaffold 文件一致性

- [x] **T-905** 修正 `README.md` 中指向 workspace-only 文件的死連結。
  - 檔案:`appspine-app-template/README.md`,「Adding a new CRUD module」段落。
  - 該段目前指向 `_archive/dev_docs-20260803/framework/002-app-dev-conventions.md`,但 fork 出去的 repo 不會帶 `dev_docs/`
    資料夾,對 forker 而言是死連結。改為指向 app repo 自己會帶的 `docs/conventions.md`。
  - 驗證:人工檢閱 README 該段已改指 `docs/conventions.md`,且該檔在 template repo 內確實存在
    (路徑可被打開)。
  - 依賴:無

- [x] **T-906** 處理 `frontend/README.md` 這份上游殘留樣板文件。
  - 檔案:`appspine-app-template/frontend/README.md`。
  - 該檔是上游 `blank_shadcn_app` 留下的樣板,教讀者跑獨立 `npm install`,和 root README 真正的
    pnpm workspace + Docker + backend 流程互相矛盾,且從未被 `scaffold-init.mjs` 處理過。
  - 三選一處理:刪除該檔、精簡成純 frontend 專屬且與 root 流程不衝突的說明、或把它納入
    `scaffold-init.mjs` 的替換清單。並記錄選了哪個方向與理由。
  - 驗證:人工檢閱 `frontend/README.md` 已不再教獨立 `npm install`、不再與 root README 的
    pnpm/Docker/backend 流程矛盾(若選刪除,確認檔案已移除且無其他文件連到它)。
  - 依賴:無

### E. `docs/conventions.md` 文件結構修復

- [x] **T-907** 修復 `docs/conventions.md` 的段落結構。
  - 檔案:`appspine-app-template/docs/conventions.md`。
  - 現況:`## Comments & Documentation` 標題底下直接空接 `## Enum / i18n`,自己沒有內容;真正
    屬於 Comments & Documentation 的內容(英文註解規則、Prisma `///` doc comment 要求、
    `docs/data-dictionary.md` 自動產生說明)錯落在 Enum/i18n 段落之後。
  - 把這些內容搬回 `## Comments & Documentation` 標題底下,緊接在標題之後、`## Enum / i18n`
    段落之前。不改動內容文字本身,只調整位置。
  - 驗證:人工檢閱段落順序,確認 `## Comments & Documentation` 標題下已有正確內容,且
    `## Enum / i18n` 段落內不再混入 Comments & Documentation 的內容。
  - 依賴:無

### F. 記錄與收尾

- [x] **T-908** 回填本 task breakdown 的執行結果,並記錄任何新發現。
  - 每個 task 完成後把 checkbox 改為 `[x]`,並在本文件補上實際執行結果(改了哪些檔、驗證輸出、
    B/D 的方向決策與理由)。
  - 若執行過程中發現本計劃 A~E 未預期的新問題,依既有慣例另開一份 Z 系列記錄文件(例如
    `Z03-...`),不要把新問題混進 A~E 的修正 commit。
  - 依賴:T-901、T-902、T-903、T-904、T-905、T-906、T-907

---

## 3. 執行結果

- **T-900**
  - 已修改 `appspine-app-template/frontend/src/config/app-config.ts`:
    - `APP_CONFIG.name` / copyright / meta title 改為中性的 `Appspine App Template`
    - meta description 改為通順的 appspine template 描述
  - 驗證成功:
    - `pnpm -C frontend typecheck`
    - 人工檢閱 `app-config.ts` 已無 `穢`、無標點亂碼、無 `Studio Admin`

- **T-901**
  - 已修改 `appspine-app-template/scripts/scaffold-init.mjs`,將 `app-config.ts` 的替換 pattern 同步到 T-900 的新字串。
  - 驗證成功:
    - `node scripts/scaffold-init.mjs --dry-run --name smoke-test-app --display-name "Smoke Test App"`
    - dry-run 顯示 `frontend\src\config\app-config.ts` 的 4 條 replacement rules 全部 verified
  - Commit:
    - `1f786e0 fix(scaffold): neutralize template app metadata`

- **T-902**
  - 已修改 `appspine-app-template/.github/workflows/e2e.yml`:
    - 新增獨立 `static-checks` job
    - 執行 `pnpm typecheck`、`pnpm check`、`pnpm -C backend check:enum-i18n`、`pnpm -C e2e typecheck`
    - 另補 `pnpm -C backend prisma:generate`,避免 fresh CI runner typecheck 前缺 Prisma Client
    - `e2e` job 依賴 `static-checks`
  - 驗證成功:
    - 本機跑過同組 static commands
    - 首次 push 的 workflow run `28631675997` 失敗,原因是 fresh CI runner 未先產生 Prisma Client
    - 修正後 workflow run `28631715821` 成功,且 `static-checks` / `e2e` 皆綠燈
    - 最終 push 後 workflow run `28632395704` 成功,`static-checks` 裡新步驟皆有執行
  - Commits:
    - `9f7fd82 ci(e2e): add static checks job`
    - `be8c902 ci(e2e): generate prisma client before static checks`

- **T-903**
  - 選擇方向一:在 `.husky/pre-commit` 補 root `pnpm typecheck`。
  - 理由:
    - `docs/conventions.md` 已明確要求 `tsc --noEmit` must pass before every commit
    - 將 typecheck 放進 hook 可讓本機 commit 行為與 CI 安全網一致,避免文件和實際行為分裂
  - 驗證成功:
    - 暫時 stage 一個 frontend type error,嘗試 commit 時 hook 在 `pnpm typecheck` 擋下:
      `Type 'number' is not assignable to type 'string'`
    - 移除測試改動後,正式 commit 正常通過
    - 最終 push 後 workflow run `28632395704` 綠燈
  - Commit:
    - `813c12c chore(husky): run typecheck before commit`

- **T-904**
  - 已修改:
    - `appspine-app-template/frontend/src/server/api-client.ts`
    - `appspine-app-template/frontend/src/server/auth-actions.ts`
  - 兩處都移除 `http://localhost:3900` fallback,改用缺漏時丟出
    `Missing required environment variable: NEXT_PUBLIC_API_URL` 的 `readRequiredEnv()` helper。
  - 驗證成功:
    - `pnpm -C frontend typecheck`
    - `pnpm typecheck`
    - 清空 `NEXT_PUBLIC_API_URL`,啟動 frontend dev server,用 fake `auth_token` 打
      `/dashboard/admin/users`,回 `500 Internal Server Error`,內容含
      `Missing required environment variable: NEXT_PUBLIC_API_URL`
    - `rg` 確認 `frontend/src/server` 已無 `http://localhost:3900` fallback
  - Commit:
    - `1306936 fix(frontend): fail fast when API URL is missing`

- **T-905**
  - 已修改 `appspine-app-template/README.md` 的「Adding a new CRUD module」段落:
    - 從 workspace-only `_archive/dev_docs-20260803/framework/002-app-dev-conventions.md`
    - 改為 repo 內的 `docs/conventions.md#standard-flow-for-adding-a-new-crud-module`
  - 驗證成功:
    - `docs/conventions.md` 存在
    - README 該段已不再指向 workspace-only dead link

- **T-906**
  - 選擇方向:刪除 `appspine-app-template/frontend/README.md`。
  - 理由:
    - 該檔是上游 frontend-only 樣板,內容教 `npm install` / `npm run dev`
    - template 的正確 onboarding 已由 root README 提供 pnpm workspace + Docker + backend 流程
    - repo 內沒有其他文件引用 `frontend/README.md`;刪除比保留第二份容易漂移的說明更清楚
  - 驗證成功:
    - `frontend/README.md` 已不存在
    - `rg` 確認 repo 內沒有其他文件連到它
    - root README 仍保留正確的 `pnpm install` 流程
  - Commit:
    - `45ab212 docs(readme): remove stale frontend setup guidance`

- **T-907**
  - 已修改 `appspine-app-template/docs/conventions.md`:
    - 將英文註解規則、Prisma `///` doc comment 要求、`docs/data-dictionary.md` 自動產生說明移回
      `## Comments & Documentation` 底下
    - `## Enum / i18n` 段落只保留 enum/i18n 規則
  - 驗證成功:
    - 人工檢閱段落順序正確
    - `pnpm typecheck`
  - Commit:
    - `2bcf1aa docs(conventions): restore comments section structure`

- **T-908**
  - 已回填本文件:
    - T-900 ~ T-908 checkbox 全部改為 `[x]`
    - 補上本「3. 執行結果」段落
    - 記錄 T-903 / T-906 的方向選擇與理由
  - 本次沒有新增 Z 系列 follow-up 文件。

---

## 4. 驗證方式總覽

| 範圍 | 主要驗證方式 |
|---|---|
| A | `pnpm -C frontend typecheck` + `node scripts/scaffold-init.mjs --dry-run --name smoke-test-app --display-name "Smoke Test App"` 確認 scaffold 仍匹配 |
| B | 實際 push 確認 CI 綠燈且新的 static-checks 步驟真的執行;pre-commit 依所選方向做對應驗證 |
| C | `pnpm -C frontend typecheck` + 手動移除 `NEXT_PUBLIC_API_URL` 觸發 fail-fast |
| D | 人工檢閱兩份 README 是否一致、連結是否有效 |
| E | 人工檢閱 `docs/conventions.md` 段落順序 |
