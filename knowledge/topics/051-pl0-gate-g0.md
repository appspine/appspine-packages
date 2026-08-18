---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 Gate G0 — 規格與基線凍結

> Gate：`G0`（見 [051 拆解 §4](../decisions/051-plugin-platform-engineering-task-breakdown.md#gate-g0--規格與基線凍結)）。
> Owner（實際執行）：Claude Sonnet；Claude Opus 執行第一輪 blind-spot review；Codex 執行 G0 follow-up
> review 與 remediation（文件建議 owner：Sol xhigh G3；Gemini 做獨立遺漏審查——本 session 無獨立
> Sol/Gemini provider，依使用者 2026-08-18 核准的替代方式執行）。
> 涵蓋：[PL0-01](051-pl0-baseline.md)、[PL0-02](051-pl0-snapshot-summary.md)、
> [PL0-03](051-pl0-package-classification.md)、[PL0-04](051-pl0-identity-responsibility-matrix.md)、
> [PL0-05](051-pl0-manifest-fixtures.md)、[PL0-06](051-pl0-prisma-permission-fixtures.md)、
> [PL0-07](051-pl0-build-graph.md)。

---

## 1. Agent 替代與執行節奏（依 051 拆解 §11／§15.3 記錄）

本 session 沒有接入拆解文件建議的 Gemini／Terra／Luna／Sol 獨立 provider；使用者已於 2026-08-18 明確
核准以下替代方式：全部 PL0-01～07 由 Claude Sonnet 直接執行（不分派給不同 role 的獨立 instance），
但 Gate G0 的「不同 provider／model family 獨立 review」要求改由**一個完全獨立、無先前對話上下文的
Claude Opus general-purpose agent**擔任 blind-spot reviewer，扮演文件建議的 Gemini 角色。這不是拆解
§15.3 所稱的「不同 provider」（同屬 Claude 模型家族），但符合使用者本次核准的替代範圍，且獨立 review
確實是在完全獨立 context（無法看到 primary agent 的推理過程，只看最終產出與原始碼）下執行，並非
primary agent 自我核准。

執行節奏：`PL0-01～07 依序執行（primary） → 全部完成後一次性獨立 review → primary 依 review 結果逐項
修正 → 全部修正後重跑完整 gate` ——不是拆解 §15.4 建議的「每個工作批次都先做一次獨立 review」，是
使用者本次核准的簡化節奏（見對話紀錄），記錄於此以便之後校準。

## 2. 獨立 Review 結果與修正

獨立 review（Claude Opus general-purpose agent，2026-08-18）產出結論：「Phase 0 尚未可關閉 Gate
G0，有 4 項 blocking issue」，並列出 7 項 should-fix 與若干 minor nit。**全部 4 項 blocking issue 與
全部 7 項 should-fix 已修正**；minor nit 中影響判斷的部分（覆蓋率宣稱、命名空間錯誤）已一併修正，
純措辭/風格類（例如「§5 見 §5 override 規則」的死連結）已修正，其餘（例如未來新增測試檔案時
`e2e-kit` exclude pattern 需要注意）已記錄為已知限制。

### 2.1 Blocking（4 項，全部已修正）

| # | 發現 | 影響文件 | 修正方式 |
|---|---|---|---|
| B1 | PL0-04 誤判 `m2m-api-key` 的 acting-user service-account 檢查「不存在」，實際存在於 `api-keys.service.ts:151-162`；真正的發現應是該處對 `identity-core` 未來擁有的 `User` 做直接 Prisma 讀取 | [PL0-04](051-pl0-identity-responsibility-matrix.md) | 更正錯誤主張，補上真正的跨 owner 直接讀取發現，並新增一列記錄拆分後 `rbac`／`m2m-api-key` 對 `identity-core`／`oidc-auth` 的殘留具體依賴（獨立 review 額外指出的 S6） |
| B2 | PL0-07 把 `tsBuildInfoFile` 指到 `dist/` 內，導致每個發布 tarball 多出約 179kB 的建置中介檔案（`dist/` 在 `files` allowlist 內） | [PL0-07](051-pl0-build-graph.md) | 改回 package 根目錄（不在 `files` allowlist 內），`.gitignore` 新增 `*.tsbuildinfo`；`npm pack --dry-run` 驗證 `health-check` 恢復到 14 個檔案／12.2 kB，與修正前一致 |
| B3 | `node scripts/lint-knowledge.js` 因為 7 份新文件沒有登記進 `knowledge/index.md` 而回報 `[STALE INDEX]`，與「4 個指向本文件的 broken link」是兩個不同原因的失敗 | `knowledge/index.md` | 本文件建立後執行 `node scripts/lint-knowledge.js --write-indexes`（見第 4 節） |
| B4 | PL0-02 聲稱「目前每個 package 只有單一 root export」，實際 8 個 package 已有 subpath export | [PL0-02](051-pl0-snapshot-summary.md)、[PL0-03](051-pl0-package-classification.md) | 更正 exports 描述；G0 follow-up 再把 `./testing` 凍結為 reserved test-support subpath、`domain-events/./admin` 凍結為 backend compatibility entry、Shell subpath 定義為 UI SDK 自有入口，不留下 facet owner 二選一 |

### 2.2 Should-fix（7 項，全部已修正）

| # | 發現 | 影響文件 | 修正方式 |
|---|---|---|---|
| S1 | PL0-05 checker 從未讀取 `051-manifest-v1.schema.json`，餵入同時違反 4 條規則的 manifest 得到 `errors: []` | [PL0-05](051-pl0-manifest-fixtures.md) | 改寫成直接載入並直譯 schema 檔案的最小 JSON Schema 子集直譯器；新增 self-test 把獨立 review 的違規案例固化成回歸測試 |
| S2 | PL0-05 fixture 使用了 PL0-03 未登記的 capability 名稱（`appspine.health-indicator`、舊稱 `appspine.identity-delegation-verifier`） | [PL0-03](051-pl0-package-classification.md) | 補登記 health capability；G0 follow-up 將 inbound delegated verification 最終凍結為 `appspine.delegated-identity-verifier`（owner `oidc-auth`），fixture 已同步 |
| S3 | `conflicts` 語意不明確（plugin ID vs. capability name 混用），`provides ∩ conflicts` 規則比對的是兩個不同命名空間，永遠不會觸發 | [PL0-05](051-pl0-manifest-fixtures.md)、schema、fixture、checker | 確立 `conflicts` 存放 plugin ID（依計畫 §6.3 範例），schema pattern 同步更新；語意規則改為偵測「自我衝突」（plugin 在 `conflicts` 中列出自己的 ID） |
| S4 | PL0-07 的 `051-pl0-build-graph-check.mjs` 把 `snapshot.json` 拿來跟自己比對，snapshot 產生器的 bug 無法被抓到 | [PL0-07](051-pl0-build-graph.md) | 改寫成完全不讀 snapshot，每次直接重新讀取 `package.json`／重新掃描 `src/`／重新讀取 `tsconfig.build.json` |
| S5 | PL0-02「重新產生快照零 diff」的說法在原始未格式化輸出上不成立（biome 格式化規則差異） | [PL0-02](051-pl0-snapshot-summary.md) | G0 follow-up 讓 generator 直接產出 Biome canonical JSON；實測 generated/saved 都是 101265 bytes 且 exact byte equality 為 true，不再依賴全 repo `lint:fix` |
| S6 | PL0-04 只點名 `mcp-server`／`m2m-api-key` 直接 import `auth` 型別，漏列 `rbac` | [PL0-04](051-pl0-identity-responsibility-matrix.md) | 補上 `rbac` 的三處 import，並新增一列說明拆分後的殘留具體依賴後果 |
| S7 | PL0-04 §3 的 export 數量誤植為 24、引用了不存在的 `UserDto` | [PL0-04](051-pl0-identity-responsibility-matrix.md) | 更正為「14 個 `export *` 陳述式」，`UserDto` 改為實際的 6 個 export 名稱 |

### 2.3 Minor nit（已修正影響判斷的部分）

- **覆蓋率宣稱與實際不符**（composer／reconciler 都宣稱「6 orderings」但 seeded shuffle 實際只覆蓋
  4 種排列）：[PL0-06](051-pl0-prisma-permission-fixtures.md) 已改用窮舉排列（`allPermutations()`），
  composer 6/6、reconciler 576/576（`4! × 4!`）全覆蓋。
- **PL0-06 reconciler 覆蓋缺口**（`duplicate-permission-id` 只查 desiredState、`aliasOf` 目標未驗證、
  `update-display` 無 fixture、「structural guarantee」措辭自相矛盾）：全部已修正，見
  [PL0-06 §2](051-pl0-prisma-permission-fixtures.md#2-permission-lifecycle) 的「更正」清單。
- **PL0-03 §3 死連結**（「見 §5 override 規則」但 §5 是 Reserved Names）：已改指向計畫 §4.5。
- **PL0-02 §5 miscount**（「6 組中的 5 組」實際是 4 組）、**§4 miscount**（誤稱只有 `auth` 發布
  `.prisma`，實際 4 個）：均已更正。
- 其餘（`e2e-kit` exclude 的非遞迴限制、腳本依賴 `process.cwd()`）記錄為已知限制，見
  [PL0-07 §5](051-pl0-build-graph.md#5-已知限制phase-0-範圍內刻意不做的事)；snapshot 未內嵌外部
  consumer HEAD 的缺口已在 C4 修正。

### 2.4 Codex G0 follow-up（5 項 blocking，全部已修正）

使用者要求依 Gate G0 再審後，Codex 找到五項先前 review 未關閉的 blocking；本輪修正如下：

| # | 發現 | 修正 |
|---|---|---|
| C1 | PL0-04 把 issuer+subject cases 延後，且兩個 export/lookup owner 仍是二選一，沒有 data migration/downgrade/rollback | owner 固定為 `oidc-auth` compatibility adapter 與 host `PRINCIPAL_CONTEXT` helper；新增 additive migration/downgrade/rollback；新增 6 個 executable identity contract cases |
| C2 | capability 與 legacy subpath 分類仍標成「未裁定」 | 凍結 `appspine.delegated-identity-verifier` 與三類 legacy subpath 的 owner/compatibility 語意 |
| C3 | `replaces` 未強制 exact target；optional lifecycle 沒有 manifest-defined degraded policy，checker 只查三個說明字串 | schema 強制 plugin/facet/contribution/reason 與 app-local distribution；新增 optionalFailurePolicy、2 個 negative fixtures，checker 實際核對 inventory/failure/policy/shutdown/timeout/index completeness |
| C4 | snapshot 原始輸出不是版控格式，且漏掃 consumer 的 seed/scripts/E2E | generator 直接輸出 Biome canonical JSON，掃完整 backend/frontend/e2e tree，並記錄 9 個 consumer repo HEAD/branch/dirty |
| C5 | Prisma augmentation 以 `targetModel + field` 排序有 ambiguous key | 改為 targetModel/field/plugin/type tuple comparator，新增 `A`/`bc` vs. `Ab`/`c` regression scenario |

## 3. 已驗證正確的部分（獨立 review 逐項核對，非空話）

獨立 review 也重新推導並確認以下內容準確，未發現問題（避免只列缺陷、誤導讀者以為全部都是錯的）：

- `@Global()` 恰好 6 處，與 [PL0-01](051-pl0-baseline.md) 列表一致；`domain-events` 的第 7 個 grep
  命中是註解文字，非裝飾器，已正確排除。
- 15 個 package、版本、root scripts、CI gate 順序全部正確。
- README／CI 的套件數文件漂移已完整修正，無遺漏。
- [PL0-02](051-pl0-snapshot-summary.md) 的 4 條 concrete cross-package import chain
  （`auth→audit-log/common`、`rbac→auth/audit-log/common`、`m2m-api-key→auth/audit-log/common`、
  `mcp-server→auth/audit-log/m2m-api-key`）與獨立重新 grep 的結果逐一相符。
- [PL0-04](051-pl0-identity-responsibility-matrix.md) 的 email-keyed OIDC identity 落差（已誠實標註為
  已知限制、不在 Phase 0 修復）經核對程式碼確認屬實。
- 三支 checker 腳本（manifest／prisma composer／permission reconciler）修正前的版本，其「16/0」
  「4/0」「6/0」執行結果本身確實可重現（問題出在覆蓋率與規則設計，不是執行結果造假）。
- `e2e-kit` 的 tsconfig exclude 修正經獨立 review 用新舊 exclude 各建置一次 `dist/` 比對檔案清單，
  確認完全相同（14 個 artifact，含 `dist/specs/*.spec.js`），純粹是 build-graph 修正，未新增或刪除
  任何 export。

## 4. Full Gate 執行（修正後，依拆解 §2.2）

```bash
pnpm install --frozen-lockfile
pnpm exec tsc -b tsconfig.json --clean
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm run verify:snapshot
pnpm run verify:phase0
node scripts/lint-knowledge.js --write-indexes
node scripts/lint-knowledge.js
git diff --check
```

| 命令 | 結果 |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm exec tsc -b tsconfig.json --clean` | ✅ exit 0 |
| `pnpm lint`（biome check .） | ✅ exit 0，0 error |
| `pnpm build` | ✅ 15/15 package Done |
| `pnpm typecheck` | ✅ 15/15 package Done |
| `pnpm test` | ✅ 全部 package Test Files/Tests 皆 passed，0 FAIL |
| `pnpm run verify:snapshot` | ✅ byte-identical（101265 bytes） |
| `pnpm run verify:phase0` | ✅ 98 checks，0 failed |
| `node scripts/lint-knowledge.js --write-indexes` | ✅ index 已是最新，0 份需重新生成 |
| `node scripts/lint-knowledge.js` | ✅（見下方實際輸出） |
| `git diff --check` | ✅ exit 0，無 whitespace 問題 |

另外五支 PL0 checker 腳本（非拆解 §2.2 標準 gate 的一部分，但是本 Phase 0 交付物自身的驗收）：

```bash
node scripts/051-pl0-manifest-fixture-check.mjs      # 20 fixtures checked, 0 failed
node scripts/051-pl0-identity-contract-check.mjs      # 6 checks run, 0 failed
node scripts/051-pl0-prisma-composer-check.mjs        # 5 checks run, 0 failed
node scripts/051-pl0-permission-reconciler-check.mjs  # 7 checks run, 0 failed
node scripts/051-pl0-build-graph-check.mjs            # 60 checks run, 0 failed
```

以及乾淨 worktree 的 TypeScript project references graph build（PL0-07 §4.1）：

```bash
pnpm exec tsc -b tsconfig.json --clean
pnpm exec tsc -b tsconfig.json           # exit 0，15/15 package dist/ 產生
npm pack --dry-run --json                # health-check：14 files，12194 bytes unpacked
```

## 5. Consumer Runtime 行為未改變（Gate G0 驗收條件）

拆解 §4 Gate G0 明確要求「consumer runtime 行為未改變」。本 Phase 0 的程式碼變更只有：

1. README.md、`.github/workflows/ci.yml` 的文件/註解修正（PL0-01）——無 runtime 影響。
2. 15 個 `packages/*/tsconfig.build.json` 新增 `composite`／`references`／`tsBuildInfoFile`，新增根
   `tsconfig.json`（PL0-07）——只影響編譯期的 project reference graph，不改變任何 emit 出的 `.js`
   內容或 public API（`e2e-kit` 的 exclude 修正經獨立 review 逐檔比對確認 `dist/` 輸出完全相同）。
3. `package.json` 新增 build graph、snapshot 與 Phase 0 verification scripts；`.github/workflows/ci.yml`
   新增 clean graph build 與 frozen contract verification——都是新增，不修改既有
   `build`／`typecheck`／`test` 行為。Snapshot 因需要 sibling consumers，只在完整 workspace gate 執行。
4. `.gitignore` 新增 `*.tsbuildinfo`——不影響任何已追蹤檔案。

其餘全部是 `knowledge/`、`fixtures/`、`scripts/051-pl0-*.mjs` 的新增文件與工具，不在任何 package 的
`main`／`exports` 路徑上，consumer（template + 8 Apps）不會受到任何影響。

## 6. 過不了就怎麼辦（拆解 §4 Gate G0 條款）

本次 Gate G0 在獨立 review與 Codex follow-up 後的**第三輪**驗證全部通過（前兩輪的 B1～B4、C1～C5
均已修正）。依拆解 §4
「過不了就停在 Phase 0 修規格或 graph，不建立 plugin runtime packages」的條款，本次不需要停留——
Phase 0 的全部 7 個 task 加上獨立 review 修正輪，均已通過驗收，可以進入 Phase 1（PL1-01 建立
`@appspine/plugin-api`）。

## 7. 未解風險與傳遞給 Phase 1 的事項

Gate G0 通過**不代表**以下事項已解決，逐一列出以免 Phase 1 task owner 遺漏（多數已在對應 PL0 文件的
「已知風險」欄位個別記錄，此處彙總）：

| 事項 | 來源 | 需要哪個 Phase 1 task 處理 |
|---|---|---|
| OIDC runtime 現況仍以 email 為身份鍵；target contract、test cases 與 additive migration 已凍結 | [PL0-04 §4/§5](051-pl0-identity-responsibility-matrix.md) | PL1-12（`oidc-auth`） |
| `m2m-api-key` 對 `identity-core` 未來 `User` model 的直接 Prisma 讀取 | [PL0-04 §1/§2](051-pl0-identity-responsibility-matrix.md)（B1 修正後的真實發現） | PL1-10（`identity-core`）／PL1-11（strategy registry） |
| 拆分後 `rbac`／`m2m-api-key` 對 `identity-core`／`oidc-auth`／host `PRINCIPAL_CONTEXT` 的殘留具體依賴 | [PL0-04 §2](051-pl0-identity-responsibility-matrix.md)（S6 新增列） | PL1-10／PL1-11 |
| 已凍結的 legacy subpath 仍需實作 compatibility bridge，但不再有 owner/facet 未決 | [PL0-03 §2.1](051-pl0-package-classification.md) | PL1-02／PL1-06／PL3-02 |
| `frontend-shell` 的 `./notification`、`./server` 是 Phase 3 前的暫時狀態 | [PL0-03 §2.1](051-pl0-package-classification.md) | PL3-02／PL3-08（既有 Phase 3 排程，非新增） |
| Prisma／permission composer/reconciler 目前只是 Phase 0 規則凍結證明，非正式實作 | [PL0-06 §3](051-pl0-prisma-permission-fixtures.md) | PL2-06／PL2-07 |
| manifest schema checker 是自寫的最小直譯器，非成熟 JSON Schema 函式庫 | [PL0-05 §3.2](051-pl0-manifest-fixtures.md) | PL1-04（建議改用 ajv 或等價函式庫） |
| `distribution: app-local` 不能作為自我證明，正式 loader 必須核對 inventory/package provenance | [PL0-05 §3.2](051-pl0-manifest-fixtures.md) | PL1-04／PL1-05 |

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | Gate G0 |
| Actual agent | Claude Sonnet 5（primary）+ Claude Opus（第一輪 blind-spot review）+ Codex（G0 follow-up review 與 C1～C5 remediation，2026-08-18） |
| Required class | G3（Sol xhigh 主責，Gemini 獨立遺漏審查）——本 session 依使用者核准替代，primary 由 Claude Sonnet 承接，review 由獨立 Claude Opus agent instance 承接（見第 1 節說明） |
| Substitution reason | 使用者 2026-08-18 對話中明確核准：「全部由 Claude Sonnet 直接執行，用不同的 Agent 子代理 instance 做『獨立審查』角色」 |
| Independent reviewer | Claude Opus general-purpose agent（第一輪）與 Codex（follow-up；相對 Sonnet 交付為獨立 context） |
| Tools | repo read/write、完整執行拆解 §2.2 full gate、5 支 PL0 checker、snapshot exact-byte check、clean `tsc -b`、`npm pack --dry-run` |
| Evidence | 第 4 節完整 gate；第 2 節逐項列出原 review 與 follow-up 的發現/修正；第 3 節列出重新推導後確認無誤部分 |
| 已知風險 | 第 7 節列出的 implementation follow-ups；review provider 替代方式相對拆解 §15.3 理想狀態的落差見第 1 節 |
| Rollback | 刪除本文件；`git checkout -- <Phase 0 涉及的已追蹤檔案清單，見本 repo `git status`>`；刪除全部 `fixtures/051-*`、`knowledge/contracts/051-manifest-v1.schema.json`、`knowledge/topics/051-pl0-*.md`、`scripts/051-pl0-*.mjs`、根 `tsconfig.json` |
