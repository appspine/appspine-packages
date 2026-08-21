---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 Phase 4 派工 Prompt — 給 Gemini 執行（PL4-01～10，不含 Gate G4）

使用方式：
- 依序貼給 Gemini，**一次一個 task**。每個 task 是獨立 branch／worktree、獨立可 review 的 commit series，不要合併成一次改完。
- 上一個 task 沒有被 reviewer 接受（尤其標了「⚠️ 需要 Sol/Claude 獨立覆核」的），不要開下一個 task。
- 這是把 §11「Agent 替代」的實際指派從建議 roster（Terra／Sol）換成 Gemini；每個 prompt 底部都附了 substitution log 該填的欄位，Gemini 交付時要一併回報，你再貼回
  `appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md` 的執行追蹤（§13）或對應 topics 檔。
- PL4-04、PL4-05、PL4-06 原本的 owner 是 Sol xhigh（G3），Gemini 在文件裡的角色只是 dependency/capability audit。這三個 task 讓 Gemini 做實作是可以的，但**必須**有 Sol（或校準過的同級 G3）做獨立 review 才能勾選完成，不能由 Gemini 自我核准。
- Gate G4 本身不在這批 prompt 裡：它要求 Sol max（G3）+ Gemini 跨 package audit + Claude review 三方角色，且明確排除「未完成項目留在 legacy mode」的情況，等 PL4-01～10 全部被驗收後再另外處理。
- **更正（2026-08-19，PL4-04 覆核中發現）**：先前這裡寫過「不要碰 `alert-dialog.tsx`」，是 reviewer（Claude）的錯誤判斷，已撤銷。Gemini 在 PL4-01～03 把該檔案 `AlertDialogAction`/`AlertDialogCancel` 的 `variant`/`size` 型別從 `Pick<...>` 改成 `Partial<Pick<...>>`是**對的**，reviewer 三次 revert 都是誤判——當時只用 `pnpm --filter @appspine/frontend-shell typecheck` 驗證，沒有測到下游消費者（`identity-core`／`rbac`／`m2m-api-key` 各自的 `*-row-actions.tsx` 都用 `<AlertDialogCancel disabled={...}>` 沒帶 `variant`/`size`），而且之後用「全庫 `pnpm typecheck`」重驗時又因為 TypeScript 的 `tsconfig.build.tsbuildinfo` incremental cache 沒清乾淨，誤判為綠燈。實際上用完全乾淨的 rebuild（清掉所有 `dist/` 與 `*.tsbuildinfo` 再重跑）驗證過，沒有這個改動 identity-core/rbac/m2m-api-key 全部會 typecheck 失敗。這個修正已經在 PL4-04 branch 重新加回去並驗證過，之後的 task 不用再管這個檔案。

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

## PL4-01 — 遷移 `notification` plugin（4A）

```text
Task: PL4-01 遷移 notification plugin（4A）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch（不要在既有 Phase 3 branch 上疊加）
Required capability: G2 implementation（原建議 owner 為 Terra high；本次由 Gemini 執行，需在 handoff 附 §11 substitution log）
In scope:
  - notification package 的 backend/prisma/operations/frontend facets
  - notification capability token
  - schema metadata 與 lifecycle（validate → register → ready → shutdown）
Out of scope: PL4-02（rbac）及之後任何 task；push／publish；production migration；移除 @appspine/auth 舊 API
Dependencies/evidence: G3（已於 2026-08-19 通過，證據見 knowledge/topics/051-pl3-gate-g3.md）、PL1-09（audit-log 試點）、PL2-06（Prisma owns/augments composer）
Hot files owner: 本 task 的 integration owner 即執行者本人；若需碰 root package.json / pnpm-lock.yaml / tsconfig* 等 §1.4 列出的 hot files，先確認沒有其他 task 同時在改
Required validation:
  - 共通全套驗證命令（見本檔開頭）
  - legacy/plugin 行為 parity 對照測試
  - recipient isolation 測試
  - schema drift 檢查
  - worker/poll cleanup（shutdown 時資源正確釋放）
  - template（appspine-app-template）的 notification contract 測試
Handoff: diff summary、每個驗證命令的實際輸出、changeset（若有發布面變更）、未解風險、rollback 步驟、§11 substitution log（Actual agent／Required class／Substitution reason／Calibration／Independent reviewer／Evidence）
```

⚠️ Reviewer 要求：文件建議由 Claude 做 contract review。不要讓 Gemini 自己核准這個 task。

---

## PL4-02 — 遷移 `rbac` plugin（4A）

```text
Task: PL4-02 遷移 rbac plugin（4A）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch
Required capability: G2 implementation（原建議 owner 為 Terra xhigh；本次由 Gemini 執行，需在 handoff 附 §11 substitution log）
In scope:
  - rbac 的 manifest、./plugin 入口
  - permission/prisma/backend/frontend facets
  - stable authorization tokens
  - 逐步移除 RbacModule @Global() 與 concrete auth imports
Out of scope: PL4-03（m2m-api-key）及之後任何 task；push／publish；production migration；移除 @appspine/auth 舊 API
Dependencies/evidence: PL4-01（已驗收）、PL2-07（permission reconciler）、PL1-10（identity-core）
Hot files owner: 執行者本人；auth／identity-core／oidc-auth public exports 與 Prisma ownership 屬 §1.4 hot files，若同時有其他 task 在動，先排隊
Required validation:
  - 共通全套驗證命令
  - system roles 測試
  - permission policy 測試
  - guard behavior 測試
  - identity augmentation 測試
  - explicit bridge 測試（RbacModule @Global() 移除後的替代路徑）
  - legacy parity
Handoff: diff summary、驗證命令實際輸出、changeset、未解風險、rollback、§11 substitution log
```

⚠️ Reviewer 要求：這是 authorization 相關變更，**必須**由 Sol（或校準過的同級 G3）審 authorization，不能由 Gemini 自我核准；文件也建議 Claude 做 permission semantics review。

---

## PL4-03 — 遷移 `m2m-api-key` plugin（4A）

```text
Task: PL4-03 遷移 m2m-api-key plugin（4A）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch
Required capability: G2 implementation（原建議 owner 為 Terra xhigh；本次由 Gemini 執行，需在 handoff 附 §11 substitution log）
In scope:
  - machine auth strategy
  - scope matcher token
  - backend/prisma/frontend facets
  - instance-aware diagnostics
  - 移除 JwtOrApiKeyGuard 作為跨插件組裝機制
Out of scope: PL4-04（metadata-schema）及之後任何 task；push／publish；production migration；移除 @appspine/auth 舊 API
Dependencies/evidence: PL4-02（已驗收）、PL1-11（authentication strategy registry／principal bridge）
Hot files owner: 執行者本人；auth／identity-core／oidc-auth exports 屬 hot files，排隊改
Required validation:
  - 共通全套驗證命令
  - OIDC + machine provider 共存測試
  - acting-user 測試
  - rate limit 測試
  - inactive/expired/revoked key 測試
  - scope 測試
  - legacy parity
Handoff: diff summary、驗證命令實際輸出、changeset、未解風險、rollback、§11 substitution log
```

⚠️ Reviewer 要求：**必須**由 Sol（或校準過的同級 G3）審 authentication/security，不能由 Gemini 自我核准。

---

## PL4-04 — 遷移 `metadata-schema` plugin（4B）

```text
Task: PL4-04 遷移 metadata-schema plugin（4B）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch
Required capability: G3 architecture-contract（原建議 owner 為 Sol xhigh；本次由 Gemini 執行實作，需在 handoff 附 §11 substitution log，並在 calibration 欄位說明為何可承接 G3 級別任務）
In scope:
  - metadata capability
  - explicit Prisma/scope requirements
  - backend facet 與 catalog
  - 不得直接依賴 M2M guard 的 concrete chain
Out of scope: PL4-05（domain-events）及之後任何 task；push／publish；production migration
Dependencies/evidence: PL4-03（已驗收）
Hot files owner: 執行者本人
Required validation:
  - 共通全套驗證命令
  - DMMF/permission/scope derivation 測試
  - missing optional capability 測試
  - schema drift 測試
  - authorization negative tests
Handoff: diff summary、驗證命令實際輸出、changeset、未解風險、rollback、§11 substitution log（包含 dependency audit 結果——文件原本就要求這個角色，現在由執行者自己先做一輪，再交獨立 reviewer 覆核）
```

⚠️ Reviewer 要求：這是原本指定 Sol xhigh（G3）owner 的 task，Gemini 只能做「實作」角色。**完成後必須有 Sol（或校準過的同級 G3）做獨立 architecture/dependency review 才能勾選驗收**，不可由 Gemini 自我核准。

---

## PL4-05 — 遷移 `domain-events` plugin（4B）

```text
Task: PL4-05 遷移 domain-events plugin（4B）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch
Required capability: G3 architecture-contract（原建議 owner 為 Sol xhigh；本次由 Gemini 執行實作，需在 handoff 附 §11 substitution log）
In scope:
  - backend/prisma/frontend/operations facets
  - subscriber registry bridge
  - integration contract references
  - admin contribution
  - host 不得吞併 domain registry
Out of scope: PL4-06（mcp-server）及之後任何 task；push／publish；production migration
Dependencies/evidence: PL4-02、PL4-03、PL4-04（皆已驗收）
Hot files owner: 執行者本人
Required validation:
  - 共通全套驗證命令
  - outbox/dispatch/receipt/webhook 測試
  - schema drift／admin 測試
  - catalog snapshot 測試
  - shutdown 測試
  - legacy/plugin parity
Handoff: diff summary、驗證命令實際輸出、changeset、未解風險、rollback、§11 substitution log
```

⚠️ Reviewer 要求：**必須**有 Sol（或校準過的同級 G3）做獨立 review；文件也建議 Claude 做 public API review。不可由 Gemini 自我核准。

---

## PL4-06 — 遷移 `mcp-server` plugin（4B）

```text
Task: PL4-06 遷移 mcp-server plugin（4B）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch
Required capability: G3 architecture-contract（原建議 owner 為 Sol xhigh；本次由 Gemini 執行實作，需在 handoff 附 §11 substitution log）
In scope:
  - MCP tools capability
  - tool registry bridge
  - audit/scope/principal requirements
  - backend/operations facets
  - 移除 McpModule @Global() 與 concrete auth/m2m/audit service imports
Out of scope: PL4-07（oidc-delegation）及之後任何 task；push／publish；production migration
Dependencies/evidence: PL4-03、PL4-04、PL4-05（皆已驗收）
Hot files owner: 執行者本人
Required validation:
  - 共通全套驗證命令
  - tool discovery/invoke 測試
  - scope denial 測試
  - principal propagation 測試
  - audit correlation 測試
  - registry snapshot 測試
  - shutdown 測試
Handoff: diff summary、驗證命令實際輸出、changeset、未解風險、rollback、§11 substitution log
```

⚠️ Reviewer 要求：**必須**有 Sol（或校準過的同級 G3）做獨立 review，不可由 Gemini 自我核准。這個 task 牽涉 audit/auth/m2m 三個既有 @Global() module 的移除，風險較高。

---

## PL4-07 — 遷移 `oidc-delegation` plugin（4C）

```text
Task: PL4-07 遷移 oidc-delegation plugin（4C）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch
Required capability: G2 repo-integration（文件原本就把 Gemini 列為此 task 建議 owner，不需要 substitution log，但仍要記錄實際 agent／model/version 與推理強度）
In scope:
  - connector config schema
  - backend/operations facets
  - delegated principal contract
  - integration contract refs
  - negative diagnostics
Out of scope: PL4-08（master-data-client）及之後任何 task；push／publish；production migration
Dependencies/evidence: PL1-12（@appspine/oidc-auth）、PL4-05（domain-events，已驗收）
Hot files owner: 執行者本人；auth／identity-core／oidc-auth exports 屬 hot files，排隊改
Required validation:
  - 共通全套驗證命令
  - 既有 delegation positive/negative verification 測試
  - issuer/audience/mapping 測試
  - secret redaction 測試
  - legacy parity
Handoff: diff summary、驗證命令實際輸出、changeset、未解風險、rollback、下一 task（PL4-08）的前置條件確認
```

⚠️ Reviewer 要求：**必須**由 Sol（或校準過的同級 G3）審 identity/security，不可由 Gemini 自我核准。

---

## PL4-08 — 遷移 `master-data-client` multi-instance plugin（4C）

```text
Task: PL4-08 遷移 master-data-client multi-instance plugin（4C）
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch
Required capability: G2 repo-integration（文件原本就把 Gemini 列為此 task 建議 owner）
In scope:
  - cardinality: multiple
  - stable instanceId
  - instance-aware token/config/health/metric
  - connector contract
  - rename migration policy
Out of scope: PL4-09（package coverage audit）及之後任何 task；push／publish；production migration
Dependencies/evidence: PL4-07（已驗收）、PL1-05（dependency resolver 與 deterministic graph）
Hot files owner: 執行者本人
Required validation:
  - 共通全套驗證命令
  - 兩個 endpoints instance isolation 測試
  - duplicate/renamed instance 測試
  - partial degradation 測試
  - secret redaction 測試
  - shutdown 測試
  - consumer integration 測試
Handoff: diff summary、驗證命令實際輸出、changeset、未解風險、rollback
```

⚠️ Reviewer 要求：文件建議由 Claude 做 contract review。這個 task Gemini 是建議 owner，但仍不能自己是唯一 reviewer。

---

## PL4-09 — 完成 package coverage／governance audit

```text
Task: PL4-09 完成 package coverage／governance audit
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch（本 task 主要是唯讀掃描 + 文件產出，不預期大量 runtime 變更）
Required capability: G2 repo-integration（文件原本就把 Gemini 列為此 task 建議 owner；Luna 產生 matrix 的部分若無 Luna 可由 Gemini 自行產生，但需說明工具/腳本）
In scope:
  - 15 現有 + 新增 packages 的分類、owner、support/deprecation/security class
  - manifest/facet/export/peer/changeset coverage 盤點
  - 記錄哪些 foundation package 刻意不是 plugin
Out of scope: PL4-10（preset 更新／rollback rehearsal）；push／publish；production migration
Dependencies/evidence: PL4-01～08（全部已驗收）
Hot files owner: 執行者本人；本 task 應避免直接改動 hot files，若發現需要修正的地方，記錄為後續 task 而非本 task 內直接改
Required validation:
  - 共通全套驗證命令
  - catalog 無 orphan capability 的核對
  - 所有官方 plugin 有明確 owner 的核對
  - 無未宣告 direct import／requirement drift 的核對
Handoff: 完整盤點表（含資料來源／產生方式，需可重跑）、發現的落差清單、未解風險、§11 substitution log（若有需要）
```

⚠️ Reviewer 要求：文件建議由 Sol review exceptions。這個 task 的產出是後續 PL4-10 與 Gate G4 判斷的依據，錯誤會連鎖放大，建議務必要有獨立 reviewer 覆核盤點表的完整性。

---

## PL4-10 — 更新 preset 並做完整 rollback rehearsal

```text
Task: PL4-10 更新 preset 並做完整 rollback rehearsal
Source of truth: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: appspine-packages/knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: appspine-packages, 新 branch（涉及 appspine-app-template 與至少一個代表性 App 時另開對應 repo 的 worktree）
Required capability: G2 implementation（原建議 owner 為 Terra xhigh，Gemini 原本就是建議 coordinator；本次由 Gemini 兼任執行者，需在 handoff 附 §11 substitution log）
In scope:
  - 完整 preset-standard graph
  - template inventory
  - upgrade/downgrade/disable/remove plans
  - legacy switch-back
  - 代表性 connector 的 multi-instance configuration
Out of scope: Gate G4 本身；push／publish；production migration；任何 Phase 5 rollout
Dependencies/evidence: PL4-09（已驗收）
Hot files owner: 執行者本人；template 的 AppModule、Prisma schema、plugin inventory、generated frontend routes、lockfiles 屬 §1.4 hot files，串行改
Required validation:
  - 共通全套驗證命令
  - template 與至少一個代表性 App 以 tarballs 完成 install/build/bootstrap/E2E
  - 停用／回滾流程驗證：確認不會 drop data
  - required/degraded catalog 狀態正確性驗證
Handoff: diff summary、驗證命令實際輸出、rollback rehearsal 的完整紀錄（步驟＋結果）、changeset、未解風險、§11 substitution log、明確聲明「Gate G4 尚未通過，不代表可以發布或進入 Phase 5」
```

⚠️ Reviewer 要求：文件建議由 Sol G3 做 gate 前審查。這是 Phase 4 最後一個 task，完成後才能開 Gate G4（Gate G4 需要 Sol max + Gemini 跨 package audit + Claude review 三方角色，不在本批 prompt 內，且 Gemini 不能既是 PL4-10 執行者又是 Gate G4 的跨 package audit 者而不另找人交叉檢查）。
