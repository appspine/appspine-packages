---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 Phase 5 派工 Prompt — 給 Gemini 執行（PL5-01～06，不含 Gate G5A）

使用方式：
- 依序貼給 Gemini，**一次一個 task**。每個 task 是獨立 branch／worktree、獨立可 review 的 commit series，不要合併成一次改完。
- 上一個 task 沒有被 reviewer 接受，不要開下一個 task。
- 這批全部是把 §3 建議 workstream（Fleet rollout：Gemini coordinator／Terra 執行／Luna 維護 matrix／Sol 或同級
  G3 做 release gate）裡「Terra 執行」的部分換成 Gemini；每個 prompt 底部都附了 §11 substitution log 該填的
  欄位，Gemini 交付時要一併回報，回貼到
  `appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md` 的執行追蹤（§13）。
- Gate G5A 不在這批 prompt 裡：PL5-05／PL5-06（calendar／chat）全部被驗收後才由使用者請 Claude 執行，需要
  calendar/chat 兩個 App 全綠、無新增 app-specific host exception、rollback evidence 完整。

> ## ⚠️ 發布授權— 這批 task 跟 Phase 0～4 最大的不同
>
> PL5-01／PL5-02 會準備並可能觸及真正的 **npm publish** 與 **git push 到遠端**。這是外部可見、對其他
> registry consumer／協作者有影響的動作。文件本身寫得很清楚：
>
> - PL5-01 的驗證要求「使用者明確授權 push/publish 前停止，**不把本文件核准當發布授權**」。
> - PL5-02 的依賴是「PL5-01 的明確授權」——這裡指的是**使用者在當次對話裡給的實際同意**，不是 PL5-01
>   這份文件或 release manifest 本身被 reviewer 接受這件事。
>
> 換句話說：**Gemini 完成 PL5-01 只代表 release manifest 準備好了，不代表可以執行 PL5-02 的 publish
> 動作**。PL5-02 開工前，一定要先回來問使用者「現在要不要真的發布 canary／push」，拿到當次對話裡的明確
> 同意才能繼續；不能讓 Gemini 自行判斷「manifest 核准了就等於可以發布」。這一點在下面 PL5-01／PL5-02
> 的 prompt 裡都各自重複標注了一次，發 prompt 給 Gemini 時不要刪掉。

共通全套驗證命令（每個 task 的 handoff 都要附實際執行結果，不是描述）：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm typecheck
pnpm test
node scripts/lint-knowledge.js
git diff --check
```

---

## PL5-01 — 產生 release manifest 與取得外部操作授權

```text
Task: PL5-01 產生 release manifest 與取得外部操作授權
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch（本 task 是文件/清單產出，不預期 runtime 變更）
Required capability: G2 repo-integration（文件原本就把 Gemini 列為此 task 建議 coordinator；Sol G3 release
  gate 審核，環境無 Sol 時由使用者指定的獨立 reviewer 校準替補）
In scope:
  - 列出所有要 release 的 packages/versions/changesets
  - canary tag 規劃、publish order、peer ranges
  - template/App upgrade waves 的順序規劃
  - rollback tag 規劃、migration plans 摘要
  - CI/registry health checklist（唯讀核對，不變更任何權限設定）
Out of scope:
  - PL5-02 及之後任何 task
  - 任何實際 npm publish、任何 git push 到遠端、任何 canary tag 的實際建立
  - production migration
  - 移除 @appspine/auth 舊 API
Dependencies/evidence: Gate G4（已通過，2026-08-19，附帶 2 項已記錄例外，見 task-breakdown §13）
Hot files owner: 執行者本人；本 task 不得直接修改 package.json 版本欄位，版本規劃只能以 changeset 草稿或文件表格呈現
Required validation:
  - 共通全套驗證命令
  - 每個要發布的 package 先以 `npm pack --dry-run`（或本地 tarball 安裝）核對打包內容，不得只用 workspace symlink 當證據
  - release workflow／registry 權限盤點（唯讀）
Handoff: release manifest 文件、version/changeset 清單、publish order 與 rollback tag 規劃、CI/registry
  checklist 核對結果、§11 substitution log；**必須在 handoff 明確寫一句「本 task 未執行任何 push/publish，
  等待使用者在對話中明確授權後才能進入 PL5-02」**
```

⚠️ Reviewer 要求：這個 task 的輸出**只是提案，不是發布授權**。不管哪個 reviewer 核准這份 release manifest，
都不構成 PL5-02 的發布授權；那必須由使用者在對話裡另外明確同意。

---

## PL5-02 — 發布 canary 並驗證 registry consumer

```text
Task: PL5-02 發布 canary 並驗證 registry consumer
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 沿用 PL5-01 分支或新開（依 release manifest 決定）
Required capability: G2 implementation（原建議 owner 為 Terra high 執行／Gemini 監看／Sol G3 核准；本次由
  Gemini 執行，需在 handoff 附 §11 substitution log）
In scope:
  - 依 PL5-01 release manifest 發布 canary packages/preset
  - 撰寫 release notes
  - 從 registry（而非 workspace）安裝驗證 canary consumer
  - rollback/fix-forward 決策記錄
Out of scope: PL5-03 及之後任何 task；stable publish；production migration
Dependencies/evidence: PL5-01（已驗收）**且使用者已在對話中明確同意這次可以真的發布 canary／push**——這一步
  不能省略，不能用「PL5-01 的 reviewer 核准了」代替
Hot files owner: 執行者本人；root package.json/pnpm-lock.yaml 等屬 §1.4 hot files，發布動作前先確認沒有其他
  task 同時在改
Required validation:
  - 共通全套驗證命令
  - 從 registry 安裝的 clean consumer 測試：package integrity、exports、types、manifest、CJS/ESM、peer ranges
  - template 用 registry 版本的 clean build
Handoff: diff summary、驗證命令實際輸出、canary tag/版本清單、registry install evidence、rollback/fix-forward
  決策記錄、§11 substitution log
```

⚠️ Reviewer 要求：**開工前務必再向使用者確認一次「現在要真的 npm publish canary／git push 了」**，取得當次
對話裡的明確同意，不能用 PL5-01 的核准代替。這是外部可見、影響其他 registry consumer 的動作，必須有 Sol 或
同級 G3 核准，不能由 Gemini 自我核准。

---

## PL5-03 — 將 `appspine-app-template` 切到 canary plugin mode

```text
Task: PL5-03 將 appspine-app-template 切到 canary plugin mode
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-app-template, 新 branch（package tarballs／canary versions 來自 appspine-packages）
Required capability: G2 implementation（原建議 owner 為 Terra xhigh；本次由 Gemini 執行，需在 handoff 附
  §11 substitution log；文件建議由 Gemini 做 integration review，這裡由另一位獨立 reviewer 擔任）
In scope:
  - bump 到 registry canary versions
  - preset/inventory/config 更新
  - 重新產生 backend/frontend/schema/lock
  - migration plan、E2E
  - fork docs 更新、legacy rollback tag
Out of scope: PL5-04 及之後任何 task；production migration；移除 legacy escape hatch
Dependencies/evidence: PL5-02（已驗收，canary 已在 registry 上）
Hot files owner: 執行者本人；template 的 AppModule、Prisma schema、plugin inventory、generated frontend
  routes、lockfiles 屬 §1.4 hot files，串行改
Required validation:
  - 共通全套驗證命令
  - fresh fork（乾淨 checkout，非既有 workspace）install/build/test/E2E/doctor/drift 全綠
  - plugin mode 為預設，legacy escape hatch 在 transition window 內仍可用且有測試
Handoff: diff summary、驗證命令實際輸出、changeset、migration plan、legacy rollback tag、未解風險、
  §11 substitution log
```

⚠️ Reviewer 要求：**不能只有 Gemini 自己覆核**。需要另一位獨立 agent 確認 fresh fork 驗證是真的乾淨重跑（不是
沿用既有 dist/tsbuildinfo 的 trust-report）——Gate G4 已經抓到過一次「incremental cache 沒清乾淨誤判為綠燈」
的案例（見 task-breakdown §13 Phase 4 記錄），這裡要求同樣的警覺。

---

## PL5-04 — `wiki` canary rollout

```text
Task: PL5-04 wiki canary rollout
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: wiki, 新 branch（package tarballs／canary versions 來自 appspine-packages）
Required capability: G2 implementation（原建議 owner 為 Terra high／Gemini coordinator／Sol review
  migration/security exceptions；本次由 Gemini 執行，需在 handoff 附 §11 substitution log）
In scope:
  - wiki inventory/preset、生成 artifacts、schema/permission plan
  - frontend imports 切換
  - E2E、rollback record
  - 補上 wiki 的 app.module.ts dual-mode 分支（Gate G4 已記錄：wiki 目前完全沒有 APPSPINE_PLUGIN_MODE／
    createAppspineModule，純 Legacy Mode——這正是本 task 要解決的缺口，不是延續中的問題）
Out of scope: PL5-05／PL5-06 及之後任何 task；production data migration（除非使用者依 §2.3 在 rollout task
  另外核准）
Dependencies/evidence: PL5-03（已驗收）
Hot files owner: 執行者本人
Required validation:
  - 共通全套驗證命令
  - 完整 build/test/E2E
  - OIDC/RBAC/M2M/MCP/domain-events 功能驗證
  - direct route 驗證
  - doctor/catalog 驗證
  - **必須是真實 bootstrap（NestFactory.create + app.listen 對真實或 disposable 資料庫）+ E2E，不能只有
    Test.createTestingModule().compile() 的 compile-only 測試**——Gate G4 已記錄的已知例外 (1) 就是這個
    落差，本 task 是第一次要真正補上它
Handoff: diff summary、驗證命令實際輸出、changeset、rollback record、未解風險、§11 substitution log；
  **明確聲明是否真的做了 Plugin Mode 下的 real bootstrap/E2E（不是 compile-only）**
```

⚠️ Reviewer 要求：這是 App wave 的第一個（canary），文件寫「成功後才打開其餘 App waves」——後面 calendar／
chat／drive／projects／approve／master-data／mcp-gateway 全部等這個先過。**必須有獨立 reviewer 覆核，且必須
親自確認驗證是真實 bootstrap，不是 compile-only**（Gate G4 §"已知例外(1)"與 PL4-10 review 都已經抓到過同類
落差）。

---

## PL5-05 — `calendar` rollout（Wave A）

```text
Task: PL5-05 calendar rollout（Wave A）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: calendar, 新 branch（可與 PL5-06 使用不同 worktree 平行）
Required capability: G2 implementation（原建議 owner 為 Terra high，文件註明「可同級替代」；本次由 Gemini
  執行，需在 handoff 附 §11 substitution log）
In scope:
  - 依 PL5-04 模板完成 inventory、生成 artifacts、migration/permission dry-run、E2E、rollback
  - 保留 calendar business modules 與 pages 為 app-owned，不插件化
Out of scope: Gate G5A 本身；PL5-07 之後（Wave B/C）；production migration
Dependencies/evidence: PL5-04（wiki canary，已驗收）
Hot files owner: 執行者本人
Required validation:
  - 共通全套驗證命令
  - 依 PL5-04 模板全套（真實 bootstrap + E2E，不是 compile-only）
Handoff: diff summary、驗證命令實際輸出、changeset、rollback record、未解風險、§11 substitution log
```

⚠️ Reviewer 要求：仍需獨立 reviewer，不能由 Gemini 自我核准；驗證等級比照 PL5-04 的「真實 bootstrap」要求。

---

## PL5-06 — `chat` rollout（Wave A）

```text
Task: PL5-06 chat rollout（Wave A）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: chat, 新 branch（可與 PL5-05 使用不同 worktree 平行，互不影響）
Required capability: G2 implementation（原建議 owner 為 Terra high；本次由 Gemini 執行，需在 handoff 附
  §11 substitution log）
In scope:
  - 依 PL5-04 模板完成 inventory、生成 artifacts、migration/permission dry-run、E2E、rollback
  - 特別驗證 realtime/background resources（例如 websocket/polling worker）有正確 lifecycle shutdown，
    不被 host 誤判為可 hot unload
Out of scope: Gate G5A 本身；PL5-07 之後（Wave B/C）；production migration
Dependencies/evidence: PL5-04（wiki canary，已驗收）
Hot files owner: 執行者本人
Required validation:
  - 共通全套驗證命令
  - 依 PL5-04 模板全套（真實 bootstrap + E2E，不是 compile-only）
  - realtime/background resource shutdown 測試，附實際證據（log／測試輸出），不能只在報告裡宣稱
Handoff: diff summary、驗證命令實際輸出、changeset、rollback record、未解風險、§11 substitution log
```

⚠️ Reviewer 要求：同 PL5-05，額外要求 realtime resource shutdown 的驗證要有可重現的實際證據。

---

PL5-05／PL5-06 都被驗收後，回來請 Claude 做 **Gate G5A**（owner：Gemini；Sol 只審重大例外——環境無 Sol 時比照
Gate G4 前例由 Claude 校準替補）：必須通過 calendar/chat 兩個 App 全綠、無新增 app-specific host exception、
rollback evidence 完整，才能開 PL5-07（Wave B）。
