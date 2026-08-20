---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL1-07／PL1-14 — architecture validator 與 tarball clean consumer

> Tasks：`PL1-07`（package／manifest／import／peer graph validator）、`PL1-14`（Phase 1 tarball clean
> consumer）。
> 見 [051 拆解 §5](../decisions/051-plugin-platform-engineering-task-breakdown.md#5-phase-1--最小平台核心與三種試點)。
> 依賴：PL1-07 → PL0-02／PL1-01／PL1-04；PL1-14 → PL1-07～13。

---

## 1. 兩支腳本各自守什麼

PL0-07 的 build-graph checker 已經證明 TypeScript project references 與 `package.json` dependencies 一致。
有了 plugin 之後多出來的破法，它一個都看不到：manifest require 了沒人 provide 的 capability、source 用了
沒宣告的 package、manifest 與 peerDependencies 對框架版本說法不同、foundation package 反向依賴 capability、
或是有人 import 了別的 package 的 `dist/`／`src/`。

| 腳本 | npm script | 守的範圍 |
|---|---|---|
| `scripts/051-pl1-architecture-check.mjs` | `pnpm verify:architecture` | 靜態 graph：import／dependency／manifest／peer／project reference |
| `scripts/051-pl1-clean-consumer.mjs` | （含在 `pnpm verify:phase1`） | 發布面：tarball 內容、`exports`、CJS／ESM、真的 boot 起來 |

## 2. Architecture validator（PL1-07）

九條規則，全部**直接讀 working tree**，不讀任何自己產生的 snapshot——Gate G0 的獨立 review 抓到
`051-pl0-build-graph-check` 犯過這個錯（checker 校驗的是自己的輸出，於是 generator 有 bug 也會通過）。

| 規則 | code |
|---|---|
| source import 了未宣告的 package（shipped source 只接受 `dependencies`／`peerDependencies`／`optionalDependencies`；devDependencies 僅在 `*.spec.ts`／`test-support.ts` 合法） | `undeclared-dependency` |
| import 別的 package 的 `dist/*`／`src/*` | `forbidden-internal-import` |
| foundation／platform package 依賴 capability plugin | `foundation-reverse-dependency` |
| manifest 的 framework range 與 `peerDependencies` 不一致 | `framework-peer-range-mismatch` |
| workspace 內版本與宣告 range 不符 | `workspace-version-range-mismatch` |
| **實際 import** 的 workspace package 缺 TS project reference | `missing-project-reference` |
| manifest require 的 capability 沒人 provide 也非 ambient | `unsatisfiable-requirement` |
| facet 宣告的 export／檔案不在 `exports`／`files` 內 | facet export 檢查 |
| manifest 宣告與實際 import 不符 | manifest／import 對照 |

`FOUNDATION_PACKAGES` 是 `common`／`integration-contracts`／`e2e-kit`／`plugin-api`／`plugin-testkit`／
`plugin-host-nest`；`AMBIENT_CAPABILITIES` 是 App 或 host 自己供應、不需要任何 plugin 的三個
（`appspine.prisma`、`appspine.principal-context`、`appspine.authentication-strategy-registry`）。

project reference 那條刻意寫成「**實際 import**」而不是「有 dependency」。原本是後者，結果與 PL0-07 的
「不得有 unused reference」**直接衝突**：`m2m-api-key` 只透過 `RBAC_POLICY` token 使用 `@appspine/rbac`，
兩條規則會同時要求「必須有這個 reference」與「這個 reference 沒被用到」。project reference 存在的理由是
`tsc -b` 的編譯順序，一個沒被 import 的 package 不需要它。

### 2.1 `--self-test`

「沒人看過它失敗的 checker，就是沒人知道它會不會動的 checker」。`--self-test` 造一批故意壞掉的暫存
package，斷言 checker 確實吐出預期的 code——**13 個案例，0 failed**；工作區本身
`20 packages checked (4 with a plugin manifest), 0 findings`。

Gate G1 的獨立 review（S3）指出原本只有 7 個案例，文件卻寫「為每條規則」，而且其中
`undeclared-capability-requirement` 在現有 workspace **結構上不可能觸發**（四個有 manifest 的 package
彼此完全沒有互相 import），只能靠 self-test 覆蓋。補齊時另外加了一件原本沒有的東西：**負向案例**
（`expect: null`，規則必須保持沉默）。沒有它，「把規則收緊到什麼都會觸發」看起來會像進步——S2 的修正
（devDependency 只在測試檔合法）正是最容易犯這個錯的那種改動。

規則與 self-test 仍不是一對一：checker 會吐 18 種 code，13 個案例覆蓋核心路徑，其餘由 workspace 實跑
覆蓋。這句話刻意寫清楚，不再宣稱「每條規則都有」。

## 3. Clean consumer（PL1-14）

051 計畫 §8.4 要求「stable publish 前由真實 registry tarball 驗證，不得只靠 workspace symlink」。
理由不是形式：workspace link 直接指向 `packages/*`，於是它會愉快地供應 package **並沒有發布**的檔案，
與**沒有宣告**的依賴——每一個 `files` allowlist 與 `exports` 的錯誤都要等到 consumer 真的安裝才會現形。

流程：

0. 先跑 `tsc -b tsconfig.json`。Gate G1 review（S8）指出腳本原本直接打包現有 `dist/`——它在 CI 裡是獨立
   的一個 step，於是驗到的可能是**上一次**的建置產物，正好造成這個 task 存在的目的所要防止的「預建
   dist 假象」。增量建置成本近乎零；`--no-build` 是明示的逃生口。
1. 對 10 個 package 跑 `pnpm pack`（不是 `npm pack`）——pnpm 會把 `workspace:*` 改寫成具體版本，
   跟發布時做的事一樣。
2. 產生一個臨時 consumer，`dependencies` 指向 `file:` tarball，並用 npm `overrides` 把**所有傳遞的**
   `@appspine/*` 解析也釘到同一個 tarball，避免任何一個悄悄從 registry 抓。
3. `npm install --ignore-scripts`（051 §9：tarball 不得執行 install hook），再顯式跑 `prisma generate`。
4. `npm ls --all` 掃 ` -> `——只要出現一個 workspace link，整個測試就失效，直接失敗。
5. 在 consumer 內跑 typecheck、build、`node --test`、bootstrap。

`consumer.mjs` 證明四件事：`exports` map 在 CJS 與 ESM 都解析得到；每個 plugin 的
`appspine.plugin.json` 與 Prisma fragment 真的在 tarball 裡；真實 Nest App 能以 **plugin mode**
經 `createAppspineModule` 帶四個試點啟動並回報 catalog；同一個 App 也能以 **legacy mode** 經
`@appspine/auth` 的 `AuthModule` 啟動——也就是相容 facade 仍然組得起來。

Node 版本在腳本開頭硬性檢查 `>=22`，peer 版本全部釘死（`@nestjs/* 11.1.27`、`@prisma/client 6.19.3` …），
免得某次 range 飄移把結果變成另一回事而沒人察覺。

## 4. 驗證

```bash
pnpm verify:phase1   # = architecture --self-test && architecture && clean-consumer
```

結果見 [PL1 執行紀錄](051-pl1-execution-log.md)。

## 5. 已知限制

- architecture validator 的 `AMBIENT_CAPABILITIES` 與 `FOUNDATION_PACKAGES` 是硬編碼清單，Phase 2 之後
  新增 host capability 時要同步；目前沒有機制強制它與 PL0-03 的登記表一致。
- clean consumer 只涵蓋 backend；`frontend` facet 與 Next.js consumer 是 Phase 3（PL3-11）。
- clean consumer 用 `npm`（非 pnpm）安裝，因為 npm `overrides` 是把傳遞解析釘死最直接的方式；真正的
  consumer 多數用 pnpm，兩者 hoisting 行為不同，這個落差留給 PL5 的 rollout 驗證。
- 腳本執行需要網路（要向 registry 取 Nest／Prisma 等 peer），離線環境會失敗，不是程式碼問題。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL1-07、PL1-14 |
| Commit | `4c0ce5f`（branch `051-plugin-platform-phase0-phase1`）——Phase 0 與 Phase 1 合併為單一 commit，偏離見 [Gate G1 §1](051-pl1-gate-g1.md) |
| Actual agent | Claude Opus 5（單一 session 依序執行；拆解建議的 Terra high + Gemini／Luna review 未接入，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Gemini／Luna provider；使用者要求直接執行 Phase 1 |
| Independent reviewer | 見 [Gate G1](051-pl1-gate-g1.md) |
| Tools | repo read/write、node、pnpm pack、npm install、prisma generate、tsc |
| Evidence | §2.1 self-test 輸出；§4；[PL1 執行紀錄](051-pl1-execution-log.md) |
| 已知風險 | §5 |
| Rollback | 刪除 `scripts/051-pl1-architecture-check.mjs`、`scripts/051-pl1-clean-consumer.mjs`、`fixtures/051-pl1-clean-consumer/`，還原 root `package.json` 的 `verify:architecture`／`verify:phase1` script |
