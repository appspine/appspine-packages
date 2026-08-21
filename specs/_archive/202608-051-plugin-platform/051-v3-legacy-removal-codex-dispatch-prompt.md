---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 v3.0.0 Legacy Removal — M1/M2 執行提示詞（Codex）

> 派工用途文件，非驗收報告。實際交付報告應寫在
> `knowledge/topics/051-v3-m1-codemod-tooling.md`、`051-v3-m2-fleet-migration.md`。
> 承接 [051-legacy-removal-plan.md](../decisions/051-legacy-removal-plan.md) 的 M1／M2 里程碑；
> M3（真的刪除 export、發 3.0.0）刻意不在這份提示詞範圍內，見下方硬性停點。

```text
Task: appspine 插件平台 v3.0.0 Legacy Removal — M1（Migration Tooling）＋ M2（Fleet Zero-Legacy）
Source of truth: knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
承接計畫: knowledge/decisions/051-legacy-removal-plan.md（M1 → M2 → M3 三個里程碑，這次只做前兩個）
Deprecation baseline: knowledge/decisions/051-pl5-13-deprecation-telemetry-report.md（389 筆，
scanner 是 scripts/051-pl5-13-deprecation-telemetry.mjs，跑 `node
scripts/051-pl5-13-deprecation-telemetry.mjs --self-test` 先確認腳本本身沒壞掉）

現況: Phase 0～5（PL5-01～14）已全數完成並經獨立覆核，Gate G5 已簽核。22 個 `@appspine/*` 套件已真的
stable publish（`latest` dist-tag，`npm.pkg.github.com`）。appspine-packages 與全部 9 個 repo
（template + 8 App）的 051 分支都已推上 origin（各自獨立分支，未 merge 進 main，PR 尚未開）。

Required capability: 文件建議 M1 由 Terra 開發 codemod（見 051-legacy-removal-plan.md §4
Governance）；本環境由你（Codex）執行，Claude 之後獨立覆核。

============================================================
先讀這段：這個計畫的教訓，適用範圍比 Gemini 之前的 Wave 更廣
============================================================
這個 051 計畫從 Phase 0 做到現在，每一輪獨立覆核都抓到過真實問題，摘要如下，這次同樣適用：

1. **一定要真的 commit，收尾前自己跑 `git log -1 --format="%H"`**，把真實輸出貼進報告，不要用記憶
   或猜測的 SHA。
2. **不要自己在 051-plugin-platform-engineering-task-breakdown.md 或
   051-legacy-removal-plan.md 裡把任何 checkbox／里程碑勾成「已完成」**；那只能等 Claude 獨立覆核後
   才勾。
3. **表格類的彙整資料（例如 fleet 掃描結果、consumer 清單）一定要用真的指令重新產生／核對過**，不要
   照樣板規律填、不要引用不存在的檔名——這個計畫已經有兩次「幻覺出一個不存在的
   `scripts/test-real-bootstrap.mjs`」的紀錄。
4. **任何「驗證」腳本只印成功訊息但沒有真的斷言，等於沒測**。
5. **驗證指令一次只跑一個，不要背景平行跑多個 install/build/test**——這台機器資源有限，平行跑會讓
   本來會過的測試假性逾時失敗。
6. **遇到型別不相容時，用明確窄化型別的 cast，不要用 `as any` 蓋過去且不揭露**。
7. **package.json 的 `dependencies`／`devDependencies` 如果宣告 `workspace:*`，那是給 monorepo 內部
   用的，不要手動改成寫死的版本號**——如果這個 task 過程中不小心動到 appspine-packages 任何套件的
   `package.json`，不要自己 publish 任何東西（這個 task 不需要 publish，見下方 out of scope）。

============================================================
M1 — Migration Tooling Ready
============================================================
交付：
- `scripts/051-v3-backend-auth-migration-codemod.mjs`：把 `@appspine/auth` 的舊 export 自動轉換成
  對應新套件的 codemod。對照表（來自 telemetry report §2，依出現次數排序）：
  - `JwtUser`、`ApiKeyUser`、`CurrentUser`、`resolveActingUserId` → `@appspine/plugin-host-nest`
  - `SYSTEM_ADMIN_ROLE`、`SYSTEM_USER_ROLE`、`AdminGuard` → `@appspine/identity-core`
  - `AuthModule` → `@appspine/preset-standard`（plugin mode）或
    `@appspine/identity-core` + `@appspine/oidc-auth`
  - `JwtVerifierService` → `@appspine/oidc-auth`
  - `@appspine/m2m-api-key` 的 `JwtOrApiKeyGuard` → `@appspine/plugin-host-nest` 的
    `AppspineAuthGuard`
- codemod 要包含 self-test（比照 `051-pl5-13-deprecation-telemetry.mjs` 的 `--self-test` 模式，用
  fixture 檔案驗證轉換前後語意一致，不是只看語法有沒有跑過）。
- codemod 要支援 `--dry-run`（只印出會改哪些檔案、改成什麼樣子，不真的寫入）跟真的執行兩種模式。
- 需要人工判斷的 case（例如某個 import 同時混用多個舊 API、或轉換後型別對不上）要清楚印出來，不要
  硬套換掉導致編譯失敗。

驗證：
- self-test 全數通過。
- 在一個 scratch 檔案上手動測過 dry-run 輸出跟真的轉換結果，確認轉換後的程式碼語意正確（不是只是
  「編譯得過」，要對照原本的行為）。

============================================================
M2 — Consumer Fleet Zero-Legacy
============================================================
範圍: `appspine-app-template` + 8 個 App（wiki、calendar、chat、drive、projects、approve、
master-data、mcp-gateway）。可用不同 worktree 平行處理不同 repo，但同一個 repo 內的 hot files
（`app.module.ts` 之類）不要多個 agent 同時改。

對每個 repo：
1. 用 `node scripts/051-v3-backend-auth-migration-codemod.mjs --dry-run` 先看一次要改哪些檔案。
2. 真的執行 codemod。
3. 跑 `node scripts/051-pl5-13-deprecation-telemetry.mjs`（在 appspine-packages 執行，掃全 fleet）
   確認這個 repo 的筆數往下降。
4. 跑該 repo 的 `pnpm -C backend typecheck`／`pnpm -C frontend typecheck`／`pnpm -C backend build`／
   `pnpm -C backend test`，確認 codemod 沒有破壞既有行為。
5. 對 Frontend Capability UI 的部分（`LoginButton`、`UsersTable`、`RolesTable`、`ApiKeysTable`、
   `CreateApiKeyDialog`、`CreateRoleDialog`、`DomainEventDeliveriesPanel`、`DomainEventDetailPanel`、
   `DomainEventCatalogTable`、`DomainEventsTable`、`CreateUserDialog` 之類的 `@appspine/frontend-shell`
   舊 export），這些是 Phase 3 就規劃好要搬到各自 capability package 的 `./frontend`
   subpath（例如 `@appspine/identity-core/frontend`、`@appspine/rbac/frontend`），照 telemetry
   report §2 的「Recommended Replacement」欄位改 import path，不是刪掉整個功能。
6. 真的做一次該 repo 既有的 Docker 開機測試腳本（每個 repo 在 Wave A/B/C 都已經有一支
   `scripts/051-pl5-0X-<app>-real-bootstrap.mjs`，直接重用，不要重寫）確認改完後真的能開機。

目標：全 fleet（template + 8 App）加總的 telemetry 掃描筆數從 389 收斂到 0，或者對於「暫時沒辦法轉
換」的殘留 case，要有明確原因記錄（不是漏改）。

Out of scope（這條非常重要）：
- **不要刪除 appspine-packages 裡任何 `@appspine/auth` 或其他 legacy export**——那是 M3，不是這次
  範圍。這個 task 做完之後，`@appspine/auth` 等套件應該還是完整可用，只是 9 個 repo 都不再「主動」
  import 它的舊路徑。
- **不要對 appspine-packages 做任何版本 bump 或 publish**——這個 task 不改 appspine-packages 本身的
  程式碼（只在裡面新增 codemod 腳本跟報告文件），不涉及發布。
- **不要對任何 App repo 做 `git push`**——push 到 origin 是另一件事，這次已經授權過的是 M1/M2
  本身，不包含把這次的改動 push 出去（那需要之後再確認）。

============================================================
硬性停點：M3（真的刪除 export、發 3.0.0）不在這次範圍
============================================================
即使 M2 做到全 fleet telemetry 掃描歸零，也不要接著做以下事情：
- 不要刪除 `packages/auth` 目錄或任何其他 legacy export。
- 不要移除 `RbacModule`／`McpModule`／`ApiKeysModule`／`AuditLogModule` 的 `@Global()` 裝飾器。
- 不要 bump 任何 major 版本或執行任何 publish 指令。
M2 做完、Claude 獨立覆核通過之後，是否要接著做 M3，需要使用者另外明確授權——這是一個 breaking
change，會影響所有還沒升級的 consumer，跟先前 canary／stable publish 的授權層級不一樣，要更謹慎。

============================================================
共通流程要求
============================================================
- 若你取代了文件建議角色，在報告裡填寫 §11 substitution log 完整表格（Actual agent／Required
  class／Substitution reason／Calibration／Independent reviewer 留白／Evidence）。
- 每個 repo 各自 handoff：diff summary、實際跑的 commands/results、telemetry 掃描筆數變化、風險、
  下一步（M3）前置條件是否已滿足。
- 報告摘要用語要跟實際驗證深度一致；不確定的地方寫「未解風險」，不要自行判斷沒問題。
```
