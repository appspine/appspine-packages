---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 Phase 5 Wave B 執行提示詞（PL5-07 ～ PL5-08）

> 派工用途文件，非驗收報告。實際交付報告仍應各自寫在
> `knowledge/topics/051-pl5-07-drive-rollout.md`、`051-pl5-08-projects-rollout.md`。

```text
Task series: PL5-07 (drive) ~ PL5-08 (projects)，appspine 插件平台 Phase 5 Wave B
Source of truth: knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Gate G5A 狀態: 已通過（2026-08-20，見拆解文件 §13）。@appspine/* canary 版本已「真的」發布在
npm.pkg.github.com（22 個套件，dist-tag canary），不再是本機 tarball 模擬。目前 canary 版本範例：
plugin-host-nest@2.0.0、preset-standard@2.0.0、frontend-shell@0.17.0（其餘版本以
`npm view @appspine/<pkg>@canary version --registry=https://npm.pkg.github.com` 現查為準，不要憑記憶）。

Required capability: 文件建議 Terra high 執行（PL5-07 另有 Luna 維護版本差異；PL5-08 另有 Claude review
notification/frontend integration）；本環境由你（Gemini）執行兩個 task，Claude 之後獨立覆核並做
Claude review 的角色。

drive/projects 各自獨立 repo，可用不同 worktree 平行，但兩個 task 完成後仍各自獨立 handoff、各自一份
topic 報告，不要混在同一次 commit series。

============================================================
重要：這次不要用 tarball override，直接裝真的 registry 版本
============================================================
Wave A（PL5-03~06）第一次交付時，驗證腳本把每個 App repo 的 package.json/pnpm-lock.yaml/
pnpm-workspace.yaml 原地改成指向這台機器 %TEMP% 底下帶時間戳記的暫存路徑，且從未還原就直接 commit——
這比 workspace symlink 驗證還差，換一台機器根本裝不起來，也悄悄拿掉了 preinstall（registry auth 檢查）
和 prepare（husky）腳本。獨立覆核花了大量時間才修好。

現在 canary 已經真的發布了，沒有理由再做 tarball 模擬。正確流程：
1. 把 backend/package.json、frontend/package.json、根 package.json 裡要遷移的 @appspine/* 依賴改成
   `^<canary 版本>`（caret range，不要用 file: 路徑），pnpm-workspace.yaml 的 overrides（如果有）比照
   辦理，用實際版本號（不要 caret，維持這個檔案原本的慣例）。
2. 不要刪除、也不要用任何方式繞過 package.json 裡既有的 preinstall / prepare 腳本。
3. 直接跑 `pnpm install`（正常真實安裝，非 --frozen-lockfile，因為版本真的變了要重新產生 lockfile），
   讓 lockfile 真的對 registry 解析。
4. `pnpm install` 之後、跑 typecheck 之前，記得先跑一次 `cd backend && npx prisma generate --schema
   prisma/schema`——新裝的 node_modules 不會自動帶著上一次的 Prisma Client，這是 Wave A 覆核踩過的坑，
   不是你的問題，只是先提醒不要漏掉。
5. 若某個 @appspine/* 套件目標版本剛好跟 registry 上既有的舊版本號相同、但內容明顯不同（可用
   `npm view @appspine/<pkg>@<version> dist.shasum` 跟本地 build 出的 tarball shasum 比對），停下來，
   不要假設「版號一樣所以裝了就好」，回報這個疑慮而不是自己決定跳過。

============================================================
PL5-07 — drive rollout（Wave B）
============================================================
Repo/worktree: D:\Source\Private\appspine\drive，目前 branch main，建立 051-pl5-07-drive-wave-b
依賴: Gate G5A（已通過）。

已知基準事實：drive 目前的 @appspine/* 版本明顯落後於其他已遷移的 App（例：
`domain-events@7.1.5`、`mcp-server@0.6.7`、`common@0.3.3`，都比 canary 目標版本舊好幾輪；也還沒有
`@appspine/notification`、`@appspine/integration-contracts`、`@appspine/plugin-api` 等新平台套件）。
這代表 drive 要先把這些既有依賴一次升到 canary 目標版本，才能疊上 dual-mode plugin host 改造，不能
只做插件化本身、放著舊版本不管。

In scope:
- 依 PL5-03/04/05/06 建立的模式，完成 drive 的 dual-mode 改造：`appspine.plugins.json`、
  `src/appspine.config.ts`、`app.module.ts` 的 `APP_OWNED` / `LEGACY_CAPABILITIES` / `pluginMode()`
  三段式結構、legacy escape hatch（`APPSPINE_PLUGIN_MODE=0`）。
- 既有依賴一次性升級到 canary 目標版本（見上方「已知基準事實」）。
- `main.ts` 加上 `app.enableShutdownHooks()`——這是 Gate G5A 覆核發現的平台級缺口（`plugin-host-nest`
  的 `AppspinePluginHost` 從 Phase 1 起就靠這個 hook 執行 reverse-order shutdown，沒加這行的話這個
  lifecycle 從來不會真的在 process 訊號下執行）；template/wiki/calendar/chat 現在都已經補上，drive
  也要加。
- 各業務 feature module（storage、whiteboard 等）依既有模式補上 `AppspineAuthInfrastructureModule`
  explicit import（因為部分 capability 的 `@Global()` 是過渡期 compatibility bridge，不保證涵蓋所有
  未來場景，明確 import 比較安全，比照 wiki/calendar 已完成的作法）。
- 重新產生 `.appspine/generated/*` 與 `appspine.plugin-lock.json`。

Out of scope: drive 的 storage/whiteboard 業務頁面本身不插件化（保持 app-owned，這是既定決策，不是
你要重新判斷的事）；其他 App 的遷移；production migration 實際套用；stable publish。

Hot files owner: 你自己（drive repo 獨立）。

Required validation:
- `pnpm -C backend typecheck && pnpm -C frontend typecheck && pnpm -C backend build`，全部要在乾淨
  狀態下跑（先清 dist/ 與 *.tsbuildinfo）。
- `pnpm -C backend test`——包含雙模式 DI 編譯測試（`Test.createTestingModule({imports:[AppModule]})`
  在 `APPSPINE_PLUGIN_MODE=0`／`1`／unset 三種情況下都要能 compile）。
- 真實 disposable Postgres 上的 `NestFactory.create()` + `app.listen()` 開機測試（比照
  `051-pl5-04-wiki-canary.mjs` 或 `051-pl5-05-calendar-wave-a.mjs` 的 Stage 11 寫法，但**不要**沿用
  它們 Stage 1-3 的 tarball override 邏輯——那段已經不需要了，因為現在裝的就是真的 registry 版本）。
- `appspine doctor` 與 `appspine build --check`（zero drift）。

============================================================
PL5-08 — projects rollout（Wave B）
============================================================
Repo/worktree: D:\Source\Private\appspine\projects，目前 branch main，建立 051-pl5-08-projects-wave-b
依賴: Gate G5A（已通過）。

In scope:
- 同上 dual-mode 改造模式、既有依賴升到 canary 目標版本、`main.ts` 加 `app.enableShutdownHooks()`、
  feature module 補 explicit import。
- **本 task 明確要求 notification facet／schema 整合**——projects 目前還沒有 `@appspine/notification`
  依賴，這次要把它接進去（比照 template 的 `notifications.module.ts` 的 import 方式），確保 projects
  的專案相關通知走標準 notification plugin，不要自己重造一套。
- 完整 E2E 與 rollback record。
- 專案業務 permission（project-specific roles/permissions）仍由 App 自己的 contribution 提供，不要
  搬進任何 capability package。

Out of scope: 其他 App 的遷移；production migration 實際套用；stable publish。

Hot files owner: 你自己（projects repo 獨立，可與 PL5-07 平行）。

Required validation: 同 PL5-07 的四項（typecheck/build/test 全綠、真實 boot、doctor、zero-drift），
額外要有 notification facet 接上後的行為驗證（至少一個測試證明 notification 真的能透過標準 plugin
發送/接收，不是只裝了依賴沒接線）。

============================================================
共通流程要求（依 051 §11、§13 執行紀錄與 Gate G5A 覆核的教訓）
============================================================
- 不要自己在 051-plugin-platform-engineering-task-breakdown.md §13 把任一 task 的 checkbox 勾成
  「已完成」；那只能等 Claude 獨立覆核後才勾。你在自己的 topic 報告裡寫「已完成，待覆核」即可。
- 若你取代了文件建議角色，在報告裡填寫 §11 substitution log 完整表格（Actual agent／Required
  class／Substitution reason／Calibration／Independent reviewer 留白／Evidence），不要只引用範本
  存在。
- 驗證指令一次只跑一個，不要為了求快同時背景平行跑多個 install/build/test——這台機器資源有限，
  Gate G5A 覆核時發現並行跑三個 vitest 套件會造成本來會過的 DI compile 測試假性逾時失敗，浪費時間
  排查假故障。
- 涉及 DI／host wiring／lifecycle 的驗證，不能只靠 compile-only 測試；要有真的起服務、對外送請求的
  測試（見上方 Required validation）。任何「驗證」腳本如果只是印出成功訊息而沒有真的斷言，等於沒測，
  Gate G5A 已經因為這種寫法抓到一次真的問題（PL5-06 的假 shutdown 驗證）。
- 不要改動 frontend-shell/alert-dialog.tsx 的 `Partial<Pick<...>>`（commit `1069362` 已確認正確，
  過去三次被誤判成無效改動而 revert，不要再犯）。
- 報告摘要用語要跟實際驗證深度一致；不確定的地方寫「未解風險」，不要自行判斷沒問題。
- 每個 task 各自 handoff：diff summary、實際跑的 commands/results、changeset（若有 appspine-packages
  端的變更）、風險、rollback、下一個 task 或 Gate G5B 的前置條件是否已滿足。

============================================================
授權邊界
============================================================
- 不得執行任何 git push（含 tag push）、npm/pnpm publish、production migration 指令。
- 插件安裝／啟用不得自動套用 migration；migration 只能產生 plan／dry-run。實際套用需使用者以 App
  owner 身分另外核准。
- canary 已經真的發布，這個 task 不需要、也不應該再對 appspine-packages 做任何 publish 動作；如果
  發現某個套件缺版本或內容不對，停下來回報，不要自己去 npm publish 補救。
```

Gate G5B（Wave B）由 Claude 接手：owner Gemini、Sol 只審重大例外；必須通過 drive/projects 全綠、版本升級與
plugin migration 問題可分辨、notification state 可回滾。
