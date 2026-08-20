---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL0-07 — TypeScript Project References ／ Build Graph

> Task: `PL0-07`（見 [051 拆解 §4](../decisions/051-plugin-platform-engineering-task-breakdown.md#pl0-07-導入-typescript-project-references-並修正-build-graph)）。
> Owner（實際執行）：Claude Sonnet（G2，文件建議 owner：Terra xhigh G2，substitution 見末尾 Execution Log）。
> 依賴：[PL0-02 snapshot](051-pl0-snapshot-summary.md)（修正後的 `localWorkspaceDependencyUnion`）。

## 1. 交付物

| 檔案 | 用途 |
|---|---|
| [`tsconfig.json`](../../tsconfig.json)（新增，root） | solution-style 設定（`files: []`），`references` 指向全部 15 個 package 的 `tsconfig.build.json` |
| `packages/*/tsconfig.build.json`（15 個，修改） | 新增 `compilerOptions.composite: true`、`compilerOptions.tsBuildInfoFile`、`references` |
| [`scripts/051-pl0-add-project-references.mjs`](../../scripts/051-pl0-add-project-references.mjs) | 產生上述設定的 codemod，依 [PL0-02 snapshot](../../fixtures/051-pl0-baseline/snapshot.json) 的 `localWorkspaceDependencyUnion` 算出每個 package 該 reference 誰；可重跑（依賴圖改變時重新產生） |
| [`scripts/051-pl0-build-graph-check.mjs`](../../scripts/051-pl0-build-graph-check.mjs) | 驗證 TS `references`／`package.json` 本地依賴／`packages/*/src` 實際 import 三者一致 |
| `package.json` 新增 script | `build:graph`（`tsc -b tsconfig.json`）、`verify:build-graph`（跑上述 checker）；G0 follow-up 另加入 `verify:phase0` 聚合 frozen contract/checker |
| `.github/workflows/ci.yml` | 新增「Verify TypeScript project-references build graph (clean)」步驟：先執行 `tsc -b --clean` 清除 graph 已知 outputs/buildinfo，再執行 `tsc -b` 與 `verify:build-graph` |
| `packages/e2e-kit/tsconfig.build.json`（連帶修正） | `exclude` 從 `src/**/*.spec.ts` 改為 `src/*.unit.spec.ts`（見第 3 節「意外發現」） |
| [`.gitignore`](../../.gitignore) | 新增 `*.tsbuildinfo`（見第 3.3 節） |

**未變更**：既有 `package.json` 的 `build`／`typecheck`／`test` script、每個 package 的 `tsconfig.json`
（`--noEmit` typecheck 用）完全沒動；不導入 Turbo／Nx；`pnpm -r` 的既有拓樸排序行為不變。符合拆解
§4「先保留現有 package scripts／Changesets，不導入 Turbo／Nx」。

## 2. Reference Graph 依據

`references` 不是手動猜測，而是由 [`scripts/051-pl0-add-project-references.mjs`](../../scripts/051-pl0-add-project-references.mjs)
讀取 [PL0-02 snapshot](../../fixtures/051-pl0-baseline/snapshot.json) 的 `localWorkspaceDependencyUnion`
（`dependencies`／`peerDependencies`／`devDependencies` 三個管道宣告的 `@appspine/*` 聯集）自動產生：

```text
audit-log      -> common
auth           -> audit-log, common
domain-events  -> auth, common, integration-contracts, m2m-api-key
health-check   -> common
m2m-api-key    -> audit-log, auth, common
mcp-server     -> audit-log, auth, m2m-api-key
metadata-schema -> common, m2m-api-key
notification   -> common
rbac           -> audit-log, auth, common
(common / e2e-kit / frontend-shell / integration-contracts / master-data-client / oidc-delegation 無本地依賴)
```

[`scripts/051-pl0-build-graph-check.mjs`](../../scripts/051-pl0-build-graph-check.mjs) 逐一核對每個
package：TS `references` 涵蓋全部實際 import、沒有多餘 reference、`package.json` 宣告涵蓋全部實際
import、`composite` 已開啟。**60 項檢查全部 PASS**（15 個 package × 4 項）。

**更正（獨立 review 發現，checker 設計缺陷）**：初版 checker 的「declared dependencies」與「actual
imports」兩邊都是從同一份 `fixtures/051-pl0-baseline/snapshot.json` 讀出來的——等於拿 snapshot 跟
自己比對，snapshot 產生器本身若有 bug 永遠不會被這個 checker 抓到。已改寫成完全不讀 snapshot：
每次執行時直接重新讀取每個 package 自己的 `package.json`（declared）、重新掃描自己的 `src/`（actual
import）、重新讀取自己的 `tsconfig.build.json`（TS references），三者互相獨立重新推導，不依賴任何
中介產物是否過期。

## 3. 意外發現（過程中修正，非本 task 原定範圍但必須記錄）

### 3.1 PL0-02 snapshot 低估依賴圖

第一版 [`scripts/051-pl0-snapshot.mjs`](../../scripts/051-pl0-snapshot.mjs) 只掃描 `peerDependencies`／
`devDependencies`，漏掉 `rbac`、`m2m-api-key`、`mcp-server`、`domain-events`、`health-check`、
`metadata-schema` 六個 package 把本地依賴宣告在一般 `dependencies`（例如 `rbac` 的 `@appspine/auth`／
`@appspine/common` 都在 `dependencies`，不在 `peerDependencies`）。PL0-07 需要準確的依賴圖才能產生正確
的 `references`，因此回頭修正了 PL0-02 的腳本並重新產生 `snapshot.json`（詳見
[051-pl0-snapshot-summary.md §2](051-pl0-snapshot-summary.md#2-package-exportslocal-dependencies)）。

### 3.2 `e2e-kit` 的 composite 完整性錯誤（TS6307）

`packages/e2e-kit/src/index.ts` 把 `src/specs/*.spec.ts`（公開匯出的共用 Vitest spec 套件，供 consumer
import 執行）當作正式 public export re-export；但 `tsconfig.build.json` 原本的 `exclude` 是廣義的
`src/**/*.spec.ts`，同時排除了這些公開檔案與 `e2e-kit` 自己的內部單元測試（`src/*.unit.spec.ts`）。

一般 `tsc -p`（無 composite）不會因為這個矛盾出錯——`exclude` 只過濾 `include` glob 的初始匹配集合，
透過 import 鏈可達的檔案仍會被納入編譯，所以现有 `pnpm build` 一直「意外可行」。但 `composite: true`
要求 project 的檔案集合必須「封閉」（每個透過 import 可達的檔案都必須被 `include` 涵蓋，不能只靠
exclude 之外的 import 撿漏），於是在導入 project references 後立刻浮現：

```text
error TS6307: File '.../packages/e2e-kit/src/specs/auth.spec.ts' is not listed within the file
list of project '.../packages/e2e-kit/tsconfig.build.json'. Projects must list all files or use
an 'include' pattern.
```

修正：對照 `package.json` 的 `"test": "vitest run src/auth-context.unit.spec.ts src/config.unit.spec.ts"`
（明確列出兩個內部單元測試檔案，而非 glob），確認 `e2e-kit` 的實際命名慣例是「內部測試用
`*.unit.spec.ts`，公開 spec 套件用 `specs/*.spec.ts`（不含 `unit`）」。把 `tsconfig.build.json` 的
`exclude` 從 `["node_modules", "dist", "src/**/*.spec.ts", "src/**/*.test.ts"]` 改為
`["node_modules", "dist", "src/*.unit.spec.ts"]`，只排除套件自己的內部測試，公開 spec 套件正常編譯進
`dist/`。這是本 task 唯一影響「現有檔案會被編譯進哪個 dist」的變更，且方向是修正既有 exclude 誤把
公開 API 當測試檔案的問題，不是新增或刪除任何 export。

### 3.3 `.tsbuildinfo` 預設位置與「清空 dist 才算乾淨」的假陽性

`composite: true` 的 `.tsbuildinfo` 預設寫在 tsconfig 所在目錄（package 根目錄），不在 `outDir`
（`dist/`）裡——第一次「清空 `dist/` 後重跑 `tsc -b`」的驗證因此得到假陽性（`tsc -b` 讀到舊
`.tsbuildinfo` 誤判「已是最新」，實際上 `dist/` 已被清空，什麼都沒有真的產出）。

**第一次修正、又被獨立 review 抓出新問題（B2）**：為了解掉上面的假陽性，PL0-07 初版把
`tsBuildInfoFile` 明確指到 `./dist/tsconfig.build.tsbuildinfo`，讓 `rm -rf packages/*/dist` 順便清掉
buildinfo。但這個「修正」引入了一個更嚴重的問題：`dist/` 是每個 package `package.json` `files`
allowlist 的成員，plain `pnpm -r run build`（`release` script 實際會跑的路徑：`"release": "pnpm -r run
build && changeset publish"`）本身就會產生 `.tsbuildinfo`（`composite` 隱含 `incremental`，不是只有
`tsc -b` 才會寫），於是這個約 175–185 kB 的建置中介檔案會被打進**每一個**發布 tarball——獨立 review 用
`npm pack --dry-run` 在 `health-check` 上實測確認：修正前 15 個檔案、`unpacked size: 12.2 kB` 變成
`total files: 15`、多出一個 `179.2kB dist/tsconfig.build.tsbuildinfo`。

修正後的最終方案：把 `tsBuildInfoFile` 改回 package 根目錄（`./tsconfig.build.tsbuildinfo`，即
composite 的原始預設位置，只是明確寫出來），**不放進 `dist/`**；改在根 `.gitignore` 新增
`*.tsbuildinfo` pattern（不論檔案落在哪個目錄都不會被 commit）。因為它不在任何 package 的 `files`
allowlist 內（`files` 只列 `"dist"`、`"prisma"`、`"README.md"`、`"CHANGELOG.md"` 等具名項目），
`npm pack` 也不會收錄它，重新驗證 `npm pack --dry-run` 確認 `health-check` 恢復成 14 個檔案、
`unpacked size: 12.2 kB`，與修正前一致。代價是「清空 dist 即代表乾淨」不再成立，第 4.1 節與 CI 已
改用 TypeScript 原生 `tsc -b --clean` 同時清除 graph outputs 與 buildinfo。

## 4. 驗證

### 4.1 乾淨 worktree、無既存 `dist` 仍能依 graph build

```bash
pnpm exec tsc -b tsconfig.json --clean
node_modules/.bin/tsc -b tsconfig.json
```

執行結果：exit code 0，10 秒完成，15 個 package 的 `dist/` 全部產生對應的 `.d.ts`
（`audit-log: 5`、`auth: 28`、`common: 10`、`domain-events: 18`、`e2e-kit: 7`、`frontend-shell: 78`、
`health-check: 3`、`integration-contracts: 10`、`m2m-api-key: 10`、`master-data-client: 5`、
`mcp-server: 9`、`metadata-schema: 6`、`notification: 7`、`oidc-delegation: 15`、`rbac: 7`），且是依
依賴順序自動建置（`common`／`integration-contracts` 等無依賴的 package 先建，`rbac`／`mcp-server`
等有依賴的後建），無需像現行 CI 那樣手動保證「先 `pnpm build` 全部再 typecheck」。

### 4.2 `pnpm build`／`typecheck`／`test`／`lint` 全綠（既有 script 未變、行為不變）

```bash
pnpm exec tsc -b tsconfig.json --clean
pnpm run build       # 15/15 package Done
pnpm run typecheck   # 15/15 package Done（用的是未改動的 tsconfig.json，非 tsconfig.build.json）
pnpm run test        # 全部 package Test Files/Tests 均為 passed，無 FAIL
pnpm run lint         # biome check . 通過，0 error
```

### 4.3 Graph 一致性（TS references vs. package.json vs. 實際 import）

```bash
node scripts/051-pl0-build-graph-check.mjs
```

60 項檢查（15 package × 4 項：references 涵蓋實際 import／無多餘 reference／package.json 涵蓋實際
import／composite 已開啟）全數 PASS。

### 4.4 Publish 面未增加額外檔案（`npm pack --dry-run`，B2 修正的驗證證據）

拆解 §2.1 DoD 要求「新增或修改 public subpath 時，必須驗證 `exports`、types、runtime target 與
`npm pack --dry-run` 內容」；本 task 雖未新增 subpath，但因為一度把 `.tsbuildinfo` 移進 `dist/`
（§3.3），仍屬於會改變 publish 內容的變更，補驗證：

```bash
cd packages/health-check && npm pack --dry-run
```

修正後（`tsBuildInfoFile` 移出 `dist/` + `.gitignore` 新增 `*.tsbuildinfo`）：

```text
npm notice 81B   dist/health.module.d.ts
npm notice 140B  dist/health.module.d.ts.map
npm notice 1.2kB dist/health.module.js
npm notice 339B  dist/health.module.js.map
npm notice 105B  dist/index.d.ts
npm notice 148B  dist/index.d.ts.map
npm notice 896B  dist/index.js
npm notice 142B  dist/index.js.map
npm notice 1.2kB package.json
npm notice package size: 4.4 kB
npm notice unpacked size: 12.2 kB
npm notice total files: 14
```

沒有 `.tsbuildinfo`，`total files: 14`、`unpacked size: 12.2 kB`，與 PL0-07 之前的既有基準一致。

## 5. 已知限制（Phase 0 範圍內刻意不做的事）

- 不導入 Turbo／Nx（拆解明確要求先驗證 dependency correctness，快取排程器留到之後評估）。
- CI 新增的「clean graph build」步驟是**額外**驗證，不取代既有 full-workspace `pnpm build/typecheck/test`
  gate；兩者目前都跑，是否之後改用 `tsc -b` 取代部分既有步驟（例如省略 CI 裡「先 build 全部才能
  typecheck」的手動順序要求）留給 PL1-07 或後續 task 決定。
- `scripts/051-pl0-build-graph-check.mjs` 只核對「有沒有依賴」，不核對 peer range、module format、
  forbidden internal path——那是 PL1-07（`package／manifest／import／peer graph validator`）的完整範圍，
  本 task 只交付 Phase 0 需要的最小子集。
- `frontend-shell` 目前沒有任何本地依賴（`localWorkspaceDependencyUnion` 為空），因此它的 `references`
  是空陣列；Phase 3 UI 遷移後，`frontend-shell` 若開始依賴其他 capability package 的 `./frontend` facet，
  需要重跑 [`scripts/051-pl0-add-project-references.mjs`](../../scripts/051-pl0-add-project-references.mjs)
  重新產生 references（屆時也要先重跑 PL0-02 snapshot）。
- `e2e-kit` 新 exclude `src/*.unit.spec.ts` 只匹配 `src/` 頂層、只匹配 `.unit.spec.ts` 結尾（獨立
  review 提醒）：若未來新增巢狀目錄下的內部測試（例如 `src/foo/bar.unit.spec.ts`）或改用
  `.test.ts` 命名，目前的 exclude 不會排除它，會被意外編進 `dist/` 一併發布。現況（本 task 交付時）
  `e2e-kit` 只有兩個內部測試檔且都在 `src/` 頂層、都是 `.unit.spec.ts`，不構成現有缺陷，但下次新增
  `e2e-kit` 測試檔時需要記得檢查這個 exclude pattern 是否還夠用。
- 所有 `scripts/051-pl0-*.mjs` 都以 `process.cwd()` 作為 repo root，必須從 `appspine-packages` 目錄下
  執行，未在腳本內顯式檢查或報錯（獨立 review 提醒）。snapshot 已內嵌 9 個外部 consumer 的
  HEAD/branch/dirty；appspine-packages 自身 HEAD 仍由 [PL0-01 baseline](051-pl0-baseline.md) 對應。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL0-07 |
| Actual agent | Claude Sonnet 5（G2） |
| Required class | G2；文件建議 Terra xhigh |
| Substitution reason | 本 session 無獨立 Terra provider；依使用者核准的替代方式由 Claude Sonnet 直接執行，Gate G0 統一由獨立 review agent 覆核 |
| Independent reviewer | Claude Opus（general-purpose agent，2026-08-18，Gate G0 blind-spot audit）——發現本文件初版兩處問題：(1) `tsBuildInfoFile` 指向 `dist/` 導致 `.tsbuildinfo`（約 179kB／package）被打進每個發布 tarball，`npm pack --dry-run` 未執行驗證；(2) `051-pl0-build-graph-check.mjs` 拿 snapshot 跟自己比對，snapshot 產生器的 bug 無法被這個 checker 抓到。兩者均已修正，見 §3.3／§2／§4.4 |
| Tools | repo read/write（Read/Write/Edit/Bash），實際執行 `tsc -b`、`pnpm build/typecheck/test/lint`、`npm pack --dry-run` |
| Evidence | 第 4 節完整命令與結果（含 §4.4 的 `npm pack --dry-run` 修正前後對比）；`git status`／`git diff --stat` 可核對變更範圍僅限 15 個 `tsconfig.build.json`、新增根 `tsconfig.json`、`package.json` 兩個新 script、`ci.yml` 一個新 step、`e2e-kit` 的 exclude 修正、`.gitignore` 新增一行；獨立 review 覆核後修正的兩處見上一列 |
| 已知風險 | 見第 5 節；CI 步驟本身未經真實 GitHub Actions runner 執行，但本機已以完全相同的 `tsc -b --clean` + `tsc -b` 驗證；runner 差異仍由首次 CI run 確認 |
| Rollback | `git checkout -- tsconfig.json packages/*/tsconfig.build.json package.json .github/workflows/ci.yml`；刪除 `scripts/051-pl0-add-project-references.mjs`、`scripts/051-pl0-build-graph-check.mjs`、本文件 |
