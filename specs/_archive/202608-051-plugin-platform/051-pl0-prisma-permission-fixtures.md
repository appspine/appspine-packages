---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL0-06 — Prisma Owns/Augments 與 Permission Lifecycle Fixtures

> Task: `PL0-06`（見 [051 拆解 §4](../decisions/051-plugin-platform-engineering-task-breakdown.md#pl0-06-凍結-prisma-ownsaugments-與-permission-lifecycle-fixtures)）。
> Owner（實際執行）：Claude Sonnet（G2 `implementation`，文件建議 owner：Terra xhigh G2；Sol G3 審
> migration/determinism，substitution 見末尾 Execution Log）。
> 依賴：[PL0-04 identity matrix](051-pl0-identity-responsibility-matrix.md)、
> [PL0-05 manifest fixtures](051-pl0-manifest-fixtures.md)。

`plugin-cli`（PL2-06 composer、PL2-07 reconciler 的正式實作位置）尚未存在，因此本 task 交付「凍結規則
的最小可執行 checker + fixture」，用來在 Phase 0 就證明兩個拆解 §4 明文要求的性質：**(1) 亂序輸入產生
相同 digest；(2) remove 不產生 drop table／delete permission data 的自動操作**。PL2-06／PL2-07 正式實作
時必須至少通過本文件全部 fixture。

## 1. Prisma Owns/Augments

交付物：

| 檔案 | 用途 |
|---|---|
| [`fixtures/051-prisma-permission/prisma/scenarios/identity-rbac-apikey.json`](../../fixtures/051-prisma-permission/prisma/scenarios/identity-rbac-apikey.json) | 依 [PL0-04 矩陣](051-pl0-identity-responsibility-matrix.md) 結論組出的正例：`identity-core` 擁有 `User`；`rbac` 擁有 `Role`／`RolePermission`／`UserRole` 並對 `User` 增加 `userRoles` augmentation；`m2m-api-key` 擁有 `ApiKey` 並對 `User` 增加 `actingApiKeys`、對 `Role` 增加 `apiKeys` augmentation |
| [`fixtures/051-prisma-permission/prisma/scenarios/ambiguous-augmentation-sort-key.json`](../../fixtures/051-prisma-permission/prisma/scenarios/ambiguous-augmentation-sort-key.json) | G0 regression：`A`/`bc` 與 `Ab`/`c` 若直接串接會得到相同 sort key `Abc`；要求 composer 以 tuple 欄位逐一排序，任何輸入排列都產生同一 digest |
| [`fixtures/051-prisma-permission/prisma/negative/owner-collision.json`](../../fixtures/051-prisma-permission/prisma/negative/owner-collision.json) | 兩個 plugin 都宣稱擁有 `Role` |
| [`fixtures/051-prisma-permission/prisma/negative/missing-augmentation-target.json`](../../fixtures/051-prisma-permission/prisma/negative/missing-augmentation-target.json) | augmentation 指向沒有任何 plugin 擁有的 `User`（inventory 缺少 `identity-core`） |
| [`scripts/051-pl0-prisma-composer-check.mjs`](../../scripts/051-pl0-prisma-composer-check.mjs) | 純函式 composer：偵測 owner collision／missing target，並將 `owns`／`augments` 排序後計算 SHA-256 digest |

```bash
node scripts/051-pl0-prisma-composer-check.mjs
```

執行結果（5 項全 PASS）：

```text
PASS scenarios/identity-rbac-apikey.json (composes without error) — []
PASS scenarios/identity-rbac-apikey.json (order-independent digest across all 6 permutations) — 1 distinct digests
PASS scenarios/ambiguous-augmentation-sort-key.json (tuple sort is order-independent) — 1 distinct digests
PASS negative/owner-collision.json
PASS negative/missing-augmentation-target.json

5 checks run, 0 failed.
```

**決定性驗證**：同一份 `identity-rbac-apikey.json` 的 3 個 `contributions` 窮舉全部 `3! = 6` 種排列
（`allPermutations()`，見下方「更正」），6 次輸出的 digest 收斂成同一個值（`1 distinct digests`），證明
composer 的輸出與 plugin 宣告順序無關。

**更正（獨立 review 發現，覆蓋率與 canonical key 不足）**：初版用 seeded pseudo-random shuffle 跑 6 次並宣稱「6 種排列」，
但兩組 seed（2 與 3、4 與 5）在 3 個元素時算出相同排列，實際只覆蓋 `3! = 6` 種排列中的 4 種——文字宣稱
與實際覆蓋不符。已改為 `allPermutations()` 窮舉遞迴函式，對這種小陣列（3 個 contribution）直接生成
全部排列，不再用抽樣。G0 follow-up 又發現 augmentation 原先以 `targetModel + field` 串接排序，合法的
`A`/`bc` 與 `Ab`/`c` 會碰撞並保留輸入順序；現改為依 targetModel/field/plugin/type 的 tuple comparator，
並以第二個 scenario 固化 regression。

## 2. Permission Lifecycle

交付物：

| 檔案 | 用途 |
|---|---|
| [`fixtures/051-prisma-permission/permission/scenarios/add-rename-retire.json`](../../fixtures/051-prisma-permission/permission/scenarios/add-rename-retire.json) | 正例：涵蓋全部 5 種 op——`rbac:role:create` 不變（`no-op`）、`health-check:status:read` 只改 displayName（`update-display`）、以 `aliasOf` 將 `rbac:role:legacy-delete` rename 成 `rbac:role:delete`（`alias`）、`notification:digest:send` 從 desired state 消失（`retire`，不能產生刪除操作）、新增 `audit-log:entry:read`（`add`） |
| [`fixtures/051-prisma-permission/permission/negative/duplicate-permission-id.json`](../../fixtures/051-prisma-permission/permission/negative/duplicate-permission-id.json) | desiredState 重複宣告同一個 immutable ID |
| [`fixtures/051-prisma-permission/permission/negative/downgrade-blocked.json`](../../fixtures/051-prisma-permission/permission/negative/downgrade-blocked.json) | currentState 的 `schemaGeneration` 比 `targetGeneration` 新——reconciler 必須偵測並停止，不能把舊 plan 蓋上去 |
| [`fixtures/051-prisma-permission/permission/negative/alias-target-not-found.json`](../../fixtures/051-prisma-permission/permission/negative/alias-target-not-found.json)（獨立 review 後新增） | `aliasOf` 指向 currentState 裡不存在的 ID（typo／已被移除）——reconciler 必須拒絕，不能安靜地產生一個看起來合理但目標不存在的 `alias` op |
| [`scripts/051-pl0-permission-reconciler-check.mjs`](../../scripts/051-pl0-permission-reconciler-check.mjs) | 純函式 reconciler：`OP_CODES` 常數只有 `no-op`／`add`／`update-display`／`alias`／`retire` 五種，程式碼裡沒有任何分支寫入 `delete`／`drop-table`（結構性保證），另有 defense-in-depth 的 runtime 斷言（見下方「更正」） |

```bash
node scripts/051-pl0-permission-reconciler-check.mjs
```

執行結果（7 項全 PASS）：

```text
PASS scenarios/add-rename-retire.json (reconciles without error) — []
PASS scenarios/add-rename-retire.json (plan contains exactly the expected op codes) — got add,alias,no-op,retire,update-display, expected add,alias,no-op,retire,update-display
PASS scenarios/add-rename-retire.json (never emits delete/drop-table ops)
PASS scenarios/add-rename-retire.json (order-independent digest across all 576 orderings) — 1 distinct digests
PASS negative/duplicate-permission-id.json
PASS negative/downgrade-blocked.json
PASS negative/alias-target-not-found.json

7 checks run, 0 failed.
```

**「remove 不產生 drop table／delete permission data 的自動操作」的驗證方式**：不是只跑一次正例看輸出裡
沒有 delete——`reconcile()` 的 `OP_CODES` 陣列本身只定義了 5 種合法 op，程式碼裡完全沒有寫 `delete` 或
`drop-table` 分支；`notification:digest:send` 從 desired state 消失時唯一可能的結果就是 `retire`（保留
資料，只標記狀態）。checker 額外再對 `expectedOpsNeverIncluding` 做顯式斷言，避免未來修改 reconciler
時不小心加入刪除路徑而沒被發現。

**決定性驗證**：`currentState`（4 筆，`4! = 24` 種排列）與 `desiredState`（4 筆，`4! = 24` 種排列）窮舉
交叉組合，共 `24 × 24 = 576` 次 reconcile，全部收斂成同一個 digest。

**更正（獨立 review 發現，4 處）**：

1. **覆蓋率不足**：同 §1 composer 的問題，初版用 seeded shuffle 宣稱「6 orderings」但實際覆蓋不足；已
   改為 `allPermutations()` 窮舉。
2. **`duplicate-permission-id` 只檢查 desiredState**：初版沒有檢查 `currentState` 本身是否已有重複 ID
   （例如上游資料源已損壞的防禦性檢查缺失）；已補上對稱檢查，`errors` 現在會標註 `where:
   'currentState'` 或 `'desiredState'`。
3. **`aliasOf` 指向不存在目標時沒有驗證**：初版遇到 `desired.aliasOf` 直接產生 `alias` op，即使
   `currentState` 裡根本沒有這個 ID——一個設定打錯字會產生一個看起來合理、實際上目標不存在的 plan；
   已新增檢查與對應負例 fixture `alias-target-not-found.json`。
4. **「structural guarantee」措辭過度宣稱**：程式碼裡確實有一段
   `for (const entry of plan) { if (!OP_CODES.includes(entry.op)) throw ... }` 的 runtime 斷言，初版
   comment 卻寫「this is a structural guarantee, not a runtime check」，自相矛盾。已更正說明：**真正
   的保證是程式碼裡沒有任何分支寫入 `delete`／`drop-table`（structural）**；那段迴圈斷言只是額外的
   defense-in-depth，防止未來有人不小心新增一個沒登記進 `OP_CODES` 的新 op 字串卻沒被發現，不是宣稱
   的「唯一保證」本身。
5. **`update-display` op 之前沒有 fixture 覆蓋**：`add-rename-retire.json` 已擴充加入
   `health-check:status:read` 這筆只改 `displayName` 的案例，現在 `expectedPlanOpCodes` 涵蓋全部 5
   種 op，不再有「有程式碼但沒有 fixture 驗證」的落差。

## 3. 已知限制（Phase 0 範圍內刻意不做的事）

- 這兩支 checker 是 Phase 0 的「規則凍結證明」，不是 PL2-06／PL2-07 的正式實作——正式版本需要處理真正
  的 `.prisma` AST（而非本文件手寫的 `owns`/`fields` JSON 摘要）、真正連接資料庫查詢目前 permission 狀態、
  並輸出可審查的 diff／dry-run 報表，而不只是本文件的 JSON plan。
- `schemaGeneration` 是 PL0-06 為了驗證 downgrade 偵測而引入的簡化欄位；正式版本的「較新狀態」判斷可能
  需要更精確的來源（例如已套用 migration 的時間戳記或版本號），由 PL2-06／PL2-07 決定實際欄位設計。
- fixture 只涵蓋 [PL0-04 矩陣](051-pl0-identity-responsibility-matrix.md) 目前已知的 identity/RBAC/API-key
  三方組裝；`domain-events`、`notification`、`metadata-schema` 等其餘 capability 的 owns/augments 留給
  Phase 4 對應 task 各自出 fixture，不在 Phase 0 一次涵蓋全部 15 個 package。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL0-06 |
| Actual agent | Claude Sonnet 5（G2 `implementation`） |
| Required class | G2；文件建議 Terra xhigh 實作、Sol（G3）審 migration/determinism |
| Substitution reason | 本 session 無獨立 Terra/Sol provider；依使用者核准的替代方式由 Claude Sonnet 直接執行，G3 determinism review 併入 Gate G0（見 [051-pl0-gate-g0.md](051-pl0-gate-g0.md)） |
| Independent reviewer | Claude Opus（general-purpose agent，2026-08-18，Gate G0 blind-spot audit）+ Codex G0 follow-up；除既有 5 項外，follow-up 發現 augmentation concatenated sort-key collision，已補 tuple comparator 與 regression fixture |
| Tools | repo read/write（Read/Write/Bash），純資料與純函式操作，未觸碰任何既有 Prisma schema 或資料庫 |
| Evidence | 第 1、2 節完整執行輸出；composer 對兩個 scenario 各窮舉全部 6 種排列、reconciler 窮舉全部 576 種排列組合，均收斂為單一 digest |
| 已知風險 | 見第 3 節；正式 composer/reconciler 實作（PL2-06/PL2-07）需要重新對照真實 `.prisma` 檔案與資料庫狀態驗證，本 fixture 的簡化 JSON 摘要不能直接當成正式輸入格式 |
| Rollback | 刪除 `fixtures/051-prisma-permission/`、兩支 `scripts/051-pl0-*-check.mjs`、本文件 |
