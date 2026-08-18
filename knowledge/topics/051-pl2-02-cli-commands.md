---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL2-02 — `add`／`remove`／`list`／`validate`

> Task：`PL2-02`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL2-01](051-pl2-01-plugin-cli.md)、PL1-04（loader）、PL1-05（resolver）。
> Changeset：`.changeset/051-phase2-cli-commands.md`。

---

## 1. plan → apply，`--dry-run` 只是停在中間

每個會改東西的指令都先算出 `ChangePlan`（`{file, before, after}` 的集合）再套用，`--dry-run` 就是在
兩步之間停下來。這個順序讓「這會做什麼」與「這做了什麼」**是同一段程式碼**，而不是兩份可能互相矛盾的
描述。

diff 是對 canonical 序列化做的逐行 unified diff，不是結構化摘要。在 pull request 裡 review 的人看到的
就是這串文字，所以在終端機給他們看別的東西，等於給他們看另一件事。LCS 用最樸素的 O(n·m) 表——這些檔案
幾十行，為了印字而多一個依賴不划算。

## 2. 五個指令各自守什麼

| 指令 | 拒絕的時機 | exit code |
|---|---|---|
| `add <package>` | 讀不到 manifest（未安裝）| `NOT_FOUND` |
| | manifest 讀得到但不合法 | `VALIDATION_FAILED` |
| | 該 instance 已存在 | `CONFLICT` |
| | `--optional` 但 manifest 沒有 `optionalFailurePolicy` | `VALIDATION_FAILED` |
| | 加完之後解不開 | `RESOLUTION_FAILED` |
| `remove <plugin>` | 找不到該 instance | `NOT_FOUND` |
| | 移除後剩下的 inventory 解不開 | `CONFLICT` |
| `list` | 從不因為解不開而拒絕顯示 | `OK`／`RESOLUTION_FAILED` |
| `validate` | 輸入格式不對 | `VALIDATION_FAILED` |
| | 輸入合法但組不起來 | `RESOLUTION_FAILED` |
| `config-stub <plugin>` | 讀不到 manifest | `NOT_FOUND` |

### 2.1 `add` 只做計畫 §7 的前三步

計畫 §7 給 `plugin add` 六個步驟。本 task 交付前三步（讀 manifest 不執行任何東西 → 檢查 engine／
dependency／conflict／provenance → 更新 package dependency 與 inventory），**其餘三步（產生 artifacts、
更新 plugin lockfile、consumer typecheck）分別屬於 PL2-05／PL2-04／PL2-03**，而且在輸出裡被明白點名，
不是安靜跳過。讀到「added」就以為 App 可以開機的操作者，是被誤導的。

`add` 需要 package **已安裝**才能進行。CLI 沒辦法 preflight 一個它讀不到的 manifest，而為一個沒人看過的
package 憑空寫一筆 inventory，等於把未驗證的 plugin 放進 host 信任的檔案裡。

### 2.2 idempotency 是「拒絕」而不是「靜默 no-op」

重複 `add` 回 `CONFLICT` 並且 `data.added = false`。手打兩次的人應該被告知第二次沒有作用，而腳本應該分得出
「本來就在」與「剛加進去」。

### 2.3 `remove` 的拒絕才是重點

移除是出錯代價高的方向，所以它會把**拿掉該筆之後**的 inventory 拿去 resolve，若還有 enabled 的 plugin
需要只有它提供的 capability，就拒絕並回 `CONFLICT`。等到下次 deploy 才發現，正是這個指令存在的理由。

`remove` **不動 `package.json`**：卸載是另一個決定（那個 package 可能還是 transitive dependency，或明天就
要再加回來），而 051 決策 13 也明確規定移除 plugin 不刪資料——輸出裡會講這件事。

### 2.4 `list` 不會因為壞掉就不給看

伸手去 `list` 的人通常正在查「為什麼壞了」。在那個當下拒絕顯示狀態的指令是沒有用的。所以 `list` 一定會
列出來，問題以 diagnostics + 非零 exit code 回報。每筆的 status 是
`resolved`／`disabled`／`unresolved`／`manifest-missing`。

### 2.5 `validate` 為什麼要分兩種失敗

CI 跑的是這一個。`VALIDATION_FAILED`（有人要去改檔案）與 `RESOLUTION_FAILED`（有人要去改安裝或啟用的
內容）需要不同的反應，所以 manifest 缺失／不合法算前者，解不開算後者。

## 3. 找 manifest 的規則

`candidateDirs()` 依序試：`@scope/name` → `node_modules/@scope/name`；裸 id → `node_modules/@appspine/<id>`
**再** `node_modules/<id>`；最後才是 `localPluginDirs` 指定的 app-local 目錄。

官方 scope 先試是刻意的：在 Appspine App 裡 `health-check` 指的幾乎一定是 `@appspine/health-check`，
反過來排序會讓一個不相干的公開 package 有機會滿足一個官方引用。

找不到時，診斷會**列出找過的每一個路徑**——沒有這串，「not found」分不出是打錯字、沒安裝、還是那個
package 根本沒有 manifest。

停用的 entry 也會讀 manifest。今天停用的東西，operator 明天會啟用；到那時（deploy 中）才發現它的 manifest
壞掉，正是這個工具要避免的結果。

## 4. 「不執行 plugin code」的測試升級

每個測試 App 裡的每個安裝 package 都被塞了一個載入即 `throw` 的 `index.js`。整輪
`add` → `list` → `validate` 全綠，代表沒有一條路徑載入過它們。

PL2-01 的「原始碼裡沒有 `import(`／`require(`」那條測試在本 task **抓到自己的偽陽性**：
`manifest-source.ts` 的檔頭註解寫了「this module has no way to load a module … no `import()`」，
原文掃描把這句解釋讀成違規。修法與 Gate G1 對 identity-core 的處理一致——比對前先去掉註解，而不是刪掉
解釋邊界的文件。

### 4.1 同一天，同一類錯誤在 architecture checker 上又出現一次

`051-pl1-architecture-check.mjs` 對 `packages/plugin-cli` 回報
`undeclared-dependency: imports "added" but "added" is not in package.json`。來源是 `add.ts` 的一句
註解：`tell "already there" from "added"`。

`IMPORT_RE` 原本寫成 `(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]…['"]`。那個
`[\s\S]*?` 可以從某個 `export` 開頭一路吃到檔案下方**任何**一個 `from '…'`——包含字串與註解裡的。
兩處修正，兩處都做過變異驗證：

| 修正 | 為什麼個別有效 |
|---|---|
| `[\s\S]*?` → `[^;]*?` | import 子句在 `from` 之前不可能出現分號，所以比對停在前一個敘述結尾。這條是由真實失敗證明的 |
| 掃描前先 `stripComments()` | 新增 self-test：一個**區塊註解內部**含 `import { legacy } from 'lodash';` 的檔案，規則必須保持沉默。拿掉 stripComments 該 self-test 立刻紅 |

PL0 的兩支腳本（`051-pl0-snapshot.mjs`、`051-pl0-build-graph-check.mjs`）掃的是
`from '@appspine/…'`，觸發條件較窄但屬同一類，一併加上 `stripComments()`。順帶修好
`051-pl0-build-graph-check.mjs` 的 `test-support.ts` 判斷式——它用 `[/]`，在 Windows 上
（`path.join` 產生反斜線）永遠不會匹配，與 Gate G1 在另一支腳本修掉的是同一個 bug。

self-test 從 13 個增加到 14 個。

## 5. 驗證

```bash
pnpm --filter @appspine/plugin-cli test   # 67 tests
node scripts/051-pl1-architecture-check.mjs --self-test   # 14 self-tests
```

涵蓋拆解 PL2-02 點名的每一項：idempotency、invalid package、duplicate instance、
remove-required-dependency、config preservation、no arbitrary TypeScript rewrite。另外兩條：

- **完整 add／remove 循環後，除了 `package.json` 之外每一個檔案 byte 相同**（含
  `appspine.config.ts`、`tsconfig.json`）。
- 兩個「拒絕」守衛都做過變異驗證：把 `hasErrors` 判斷關掉，對應的測試立刻紅。

## 6. 已知限制

- `add` 寫 `package.json` 的 `dependencies` 但**不執行 package manager**。安裝會連網並改動
  `node_modules`；一個在編輯設定檔時順手做這件事的工具，沒人敢在 CI 裡跑。輸出會告知要自己安裝。
- 版本 range 取 `^<已安裝版本>`。真正的版本策略（PL2-04 lockfile）還沒接上。
- `list`／`validate` 的 host capabilities 目前是硬編碼的三個 ambient capability，與
  `051-pl1-architecture-check.mjs` 同一份清單；App 自訂的 host capability 要等 PL2-03 從設定讀取。
- 沒有 `enable`／`disable` 指令；目前要改 `enabled` 得手動編輯 inventory。拆解沒有要求，但實務上會需要。
- `config-stub` 只能產生 configRef 的骨架，不知道 plugin config schema 的內部欄位（那是執行期的 zod
  schema，讀它就要載入 plugin code）。

## 7. 相對 PL2-01 的修正

PL2-01 的 README 與文件寫「CLI 只會修改 inventory」。本 task 讓 `add` 也寫 `package.json` 的
`dependencies`——那是計畫 §7 step 3 明文要求的。正確的說法是：**寫入面是兩個宣告式 JSON 檔案，
而且永遠不碰 TypeScript**。兩份文件都已更正。

`CommandDefinition` 另外新增 `flags`：每個指令自己宣告接受哪些 flag，而不是共用一個全域池。
否則 `--dry-run` 打在唯讀指令上會被安靜吃掉——正是「以為自己開了某個開關」的那類錯誤。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-02 |
| Actual agent | Claude Opus 5（拆解建議 Terra high；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-02-cli-commands` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §5；`packages/plugin-cli/src/commands/commands.spec.ts`；兩次變異驗證 |
| 已知風險 | §6 |
| Rollback | 刪除 `packages/plugin-cli/src/commands/`、`src/manifest-source.ts`、`src/plan.ts`、`.changeset/051-phase2-cli-commands.md`、本文件；還原 `src/cli.ts` 的 `flags`、`src/bin.ts`、`src/index.ts`、`README.md`、[PL2-01 文件](051-pl2-01-plugin-cli.md)、三支 checker 腳本的 `stripComments`／`IMPORT_RE` 修正 |
