---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 Phase 5 Wave C 執行提示詞（PL5-09 ～ PL5-12）

> 派工用途文件，非驗收報告。實際交付報告仍應各自寫在
> `knowledge/topics/051-pl5-09-approve-rollout.md`、`051-pl5-10-master-data-rollout.md`、
> `051-pl5-11-mcp-gateway-rollout.md`、`051-pl5-12-fleet-matrix.md`。

```text
Task series: PL5-09 (approve) ~ PL5-12 (fleet matrix)，appspine 插件平台 Phase 5 Wave C
Source of truth: knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Gate G5B 狀態: 已通過（2026-08-20，見拆解文件 §13，無記錄例外）。@appspine/* canary 版本真的發布在
npm.pkg.github.com（22 個套件，dist-tag canary）。目前 canary 版本以
`npm view @appspine/<pkg>@canary version --registry=https://npm.pkg.github.com` 現查為準。

Required capability: 文件建議 Terra xhigh 執行（各 task 另有 Gemini review/coordinator/audit 角色、
Sol G3 審 cross-app/security 或 identity/delegation 或 MCP/auth/security）；本環境由你（Gemini）執行
四個 task，Claude 之後獨立覆核並承擔 Sol/Claude review 的角色。

approve/master-data/mcp-gateway 各自獨立 repo，PL5-09～11 可用不同 worktree 平行；PL5-12 依賴前三個都
完成後才能做（它要盤點整個 fleet，包含 template 和已完成的 wiki/calendar/chat/drive/projects）。四個
task 各自獨立 handoff、各自一份 topic 報告，不要混在同一次 commit series。

============================================================
硬性規則：這次每一項都要跑到真的通過為止，不要用「應該會過」交差
============================================================
Wave A、Wave B 的獨立覆核各自抓到過嚴重問題，這次要求你自己先做到覆核會做的事，不要留給下一輪：

1. **實際要 commit，而且要用 `git log --oneline -3` 確認 commit 真的存在，再把那個真實 SHA 寫進報告**。
   Wave B 兩份報告都引用了根本不存在的 commit SHA（`git log`／`git reflog` 都查無此紀錄），因為工作
   從頭到尾只是 working tree 修改，從未 commit。這次每個 task 收尾前，自己跑一次
   `git log -1 --format="%H"`，把輸出貼進報告，不要用記憶或猜測的 SHA。
2. **不要用 tarball override，直接對真實 registry 跑 `pnpm install`**（正常安裝，非
   `--frozen-lockfile`），讓 `pnpm-lock.yaml` 真的改變。安裝完自己跑
   `git diff --stat -- pnpm-lock.yaml`，如果是零行 diff，代表沒有真的裝，回去重裝。
3. **新增的 `*.module.spec.ts` 如果 import 了 `@nestjs/testing`，先確認 `backend/package.json` 的
   devDependencies 真的有這一行**（`^11.0.5`，比照 `@nestjs/core` 版本）——這是 Wave B 兩個 repo 都
   犯過的錯：測試檔案 import 了從未宣告的套件，裝了也裝不出來。
4. **`appspine build` 要真的執行過**，用 `ls backend/.appspine/generated/` 確認 8 個檔案跟
   `appspine.plugin-lock.json` 真的存在，不要只憑指令「沒有印錯誤訊息」就假設它跑過。
5. **`main.ts` 加上 `app.enableShutdownHooks()`**——這是 Phase 1 就該有、Gate G5A 才發現漏掉的平台級
   缺口，template/wiki/calendar/chat/drive/projects 現在都已經補上，approve/master-data/mcp-gateway
   也要加。
6. **`frontend-shell` 用 `^0.17.0`**（不是 `^0.16.x`，那個版號在 registry 上是不同內容，Gate G5A 已經
   修過這個版本碰撞問題）。
7. **`pnpm install` 之後、跑 typecheck 之前先跑 `cd backend && npx prisma generate --schema
   prisma/schema`**。
8. **真實開機測試前，先檢查有沒有除了 Postgres 之外的外部依賴會在 `onModuleInit` 真的打網路**（例如
   S3/MinIO、Redis、Vault 之類）。drive 因為沒準備 disposable MinIO，真的在開機時打向正式 AWS S3、被拒
   絕、整個 app 崩潰——這是可重現的真崩潰，不是偶發。如果 grep `onModuleInit`／建構子裡有外部
   client（S3Client、Redis client 等），照 disposable Postgres 的模式（`docker run -d ...`）幫它也準備
   一個 disposable 容器，不要假設「沒設定就會跳過」。
9. **驗證指令一次只跑一個，不要背景平行跑多個 install/build/test**——這台機器資源有限，平行跑會讓本來
   會過的測試假性逾時失敗（Gate G5A/G5B 都踩過）。
10. **任何「驗證」腳本只印成功訊息但沒有真的斷言，等於沒測**——PL5-06 的 fake shutdown 驗證已經因為
    這樣被抓到一次，不要重蹈覆轍。真實開機腳本要用會拋錯的 `waitForHttp` 之類寫法，不要無條件印
    ✓。

另外一個 Gate G5B 抓到的細節，供你參考但不是這次的必要動作：如果某個 service 的建構子注入了一個類別，
而那個類別在該檔案裡「只當型別用、從沒被當值引用過」，Vitest 的 esbuild transform 有機率不會正確產生
`design:paramtypes` reflection metadata，導致 Nest 靜默用 `undefined` 建構那個物件而不丟例外（`tsc`
真的編譯不會有這問題，只有 vitest 測試會）。如果你寫的新測試裡，建構子注入的依賴在斷言階段是
`undefined`，先想到這個可能性，用 `@Inject(TheClass)` 明確標註來排除，不要直接懷疑 DI 設定寫錯。

============================================================
PL5-09 — approve rollout（Wave C）
============================================================
Repo/worktree: D:\Source\Private\appspine\approve，目前 branch main，建立 051-pl5-09-approve-wave-c
依賴: Gate G5B（已通過）。

In scope:
- 依既有模式完成 dual-mode 改造、既有依賴升到 canary 目標版本（approve 目前已經有
  `@appspine/master-data-client@^0.1.3`、`@appspine/notification@0.2.2`，都要升到 canary 版本，不是
  新增）、`main.ts` 加 `app.enableShutdownHooks()`、feature module 補
  `AppspineAuthInfrastructureModule` explicit import。
- 驗證跨 App workflow（approve 跟 wiki-to-approve、submit-knowledge-document-change 之類既有的
  integration contract 是否仍正常）、delegated/machine identity（`oidc-delegation`／`m2m-api-key`）、
  domain events。
- 完整 E2E 與 rollback record。

Out of scope: 其他 App 的遷移；production migration 實際套用；stable publish。

Required validation: 同 Wave B 標準（typecheck/build/test 全綠、真實 Docker boot、doctor、
zero-drift），額外驗證 delegated identity 與跨 App integration contract 沒有因為升級而破壞行為。

============================================================
PL5-10 — master-data rollout（Wave C）
============================================================
Repo/worktree: D:\Source\Private\appspine\master-data，目前 branch main，建立
051-pl5-10-master-data-wave-c
依賴: Gate G5B（已通過）。

In scope:
- 同上 dual-mode 改造模式、依賴升版、shutdown hooks、explicit import。
- delegations、org-specific admin pages、identity mapping、integration contracts。
- 一般 org 業務頁面保持 App-owned，不要插件化。
- 完整 negative tests／rollback。

Out of scope: 其他 App 的遷移；production migration 實際套用；stable publish。

Required validation: 同 Wave B 標準，額外驗證 identity mapping／delegation 的 negative case（例如
delegation 失敗、identity 對不上時的行為）。

============================================================
PL5-11 — mcp-gateway rollout（Wave C）
============================================================
Repo/worktree: D:\Source\Private\appspine\mcp-gateway，目前 branch main，建立
051-pl5-11-mcp-gateway-wave-c
依賴: Gate G5B（已通過）。

In scope:
- 同上 dual-mode 改造模式、依賴升版、shutdown hooks、explicit import。
- MCP tool registry、vault/DLP/audit integrations 維持正常運作。
- gateway-specific admin pages（modal/direct route）仍屬 App 自己的頁面，不要搬進任何 capability
  package；capability UI（health/catalog 之類）才是由 package 提供。

Out of scope: 其他 App 的遷移；production migration 實際套用；stable publish。

Required validation: 同 Wave B 標準，額外驗證 MCP tool discovery/invoke、scope denial、audit
correlation、secret redaction 沒有因為升級而破壞。

============================================================
PL5-12 — 完成 fleet matrix、觀測性與 rollback evidence
============================================================
不是某一個 repo 的改動，是唯讀盤點 + 產出文件，寫在 appspine-packages 的
`knowledge/topics/051-pl5-12-fleet-matrix.md`。
依賴: PL5-09～11 都完成。

In scope:
- 盤點 template + 8 個 App（wiki/calendar/chat/drive/projects/approve/master-data/mcp-gateway）的
  preset/version/instance/migration/permission/generated digest/CI/catalog/rollback 狀態，做成矩陣
  表格。
- 列出所有 app-local plugins（每個 App 自己 hand-wire、不透過 preset-standard 的部分）與已核准的例外
  （例如各 capability 的 `@Global()` compatibility bridge）。
- 針對每個 App 標註：目前是 legacy mode 還是 plugin mode 為預設、rollback 是否已演練過。

Out of scope: 修改任何 App 的程式碼；production migration；stable publish。

Required validation:
- 沒有 unknown version（每個 App 對每個已遷移 capability 的版本都要能對應到 canary manifest）。
- 沒有 missing owner（每個 App-local plugin 都要標注誰負責）。
- 沒有 unrehearsed rollback（每個 App 都要有實際跑過 legacy escape hatch 測試的證據，不能只是「理論上
  可以切回去」）。
- 沒有未解的 required plugin（doctor 輸出裡不能有 required 但 missing 的插件）。
- catalog/health 要能在 fleet 層級辨識出 degraded 狀態（不是只看單一 App，要能橫向比較）。

============================================================
授權邊界
============================================================
- 不得執行任何 git push（含 tag push）、npm/pnpm publish、production migration 指令。
- 插件安裝／啟用不得自動套用 migration；migration 只能產生 plan／dry-run。實際套用需使用者以 App
  owner 身分另外核准。
- canary 已經真的發布，這四個 task 不需要、也不應該對 appspine-packages 做任何 publish 動作。
- 不要自己在 051-plugin-platform-engineering-task-breakdown.md §13 把任一 task 的 checkbox 勾成
  「已完成」；那只能等 Claude 獨立覆核後才勾。
```
