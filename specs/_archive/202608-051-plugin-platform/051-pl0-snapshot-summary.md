---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL0-02 — Public API / Dependency / Consumer Snapshot

> Task: `PL0-02`（見 [051 拆解 §4](../decisions/051-plugin-platform-engineering-task-breakdown.md#pl0-02-產生-public-apidependency-consumer-與-direct-import-snapshot)）。
> Owner（實際執行）：Claude Sonnet（承接 Gemini G2 `repo-integration` 角色，substitution 見末尾 Execution Log）。
> 依賴：[PL0-01 baseline](051-pl0-baseline.md)。

生成器：[`scripts/051-pl0-snapshot.mjs`](../../scripts/051-pl0-snapshot.mjs)（read-only，唯讀掃描本 repo
`packages/*` 與 sibling `../appspine-app-template` + 8 個 App repo）。
輸出：[`fixtures/051-pl0-baseline/snapshot.json`](../../fixtures/051-pl0-baseline/snapshot.json)。

```bash
node scripts/051-pl0-snapshot.mjs --write
pnpm run verify:snapshot
```

## 1. 決定性驗證

同一組 repo HEAD 連續執行腳本會產生 byte-identical snapshot。generator 直接呼叫 repo 已安裝的 Biome
formatter，因此 `--write` 產物就是版控中的 canonical 格式，不需要再跑會改動全 repo 的 `lint:fix`。

```text
exactBytesEqual: true
generatedBytes: 101265
savedBytes: 101265
```

腳本不使用 `Date.now()`／`Math.random()`；每個外部 consumer 另記錄 `repo.head`、`repo.branch`、`repo.dirty`，
所以 point-in-time snapshot 可以追溯到實際輸入，而不是只記 appspine-packages 自己的 HEAD。

## 2. Package Exports、Local Dependencies

`snapshot.json` 的 `packages` 欄位涵蓋全部 15 個 package 的 `exports` map，以及三個管道各自宣告的
`@appspine/*` 本地依賴：一般 `dependencies`（`localDependencies`）、`peerDependencies`
（`localPeerDependencies`）、`devDependencies` 的 `workspace:*` 項目（`localDevWorkspaceDependencies`），
再聯集成 `localWorkspaceDependencyUnion`。

**更正（獨立 review 發現，初版描述錯誤）**：初版文字聲稱「目前每個 package 只有單一 `"."` root
export」，但實際查 `snapshot.json` 的 `exports` 欄位，8 個 package 已經有 subpath export：

| Package | Exports |
|---|---|
| `@appspine/audit-log` | `.`、`./prisma/audit-log.prisma` |
| `@appspine/auth` | `.`、`./prisma/user.prisma` |
| `@appspine/domain-events` | `.`、`./testing`、`./admin` |
| `@appspine/frontend-shell` | `.`、`./notification`、`./server` |
| `@appspine/m2m-api-key` | `.`、`./prisma/api-key.prisma` |
| `@appspine/notification` | `.`、`./testing` |
| `@appspine/oidc-delegation` | `.`、`./testing` |
| `@appspine/rbac` | `.`、`./prisma/role.prisma` |

這不只是文字修正——[PL0-03 的 facet 命名 registry](051-pl0-package-classification.md) 原本是在「目前
沒有 subpath」的錯誤前提下凍結 `@appspine/<plugin-id>/<facet>` 規則，已回頭在 PL0-03 §2 補上與這些
既有 subpath（`./prisma/*.prisma` 已符合未來 `prisma` facet 慣例；`./testing` 是三個 package 已經在用
的**非計畫原文命名**，需要 PL1-02 `plugin-testkit` 設計時明確處理是否沿用或收斂；`frontend-shell` 的
`./notification`、`./server` 是 Phase 3 UI 遷移前的暫時性 ad hoc 拆分）的協調說明，見該文件第 2 節。

**修正記錄**：腳本第一版只掃描 `peerDependencies`／`devDependencies`，漏掉部分 package（`rbac`、
`m2m-api-key`、`mcp-server`、`domain-events`、`health-check`、`metadata-schema`）把本地依賴宣告在一般
`dependencies`（例如 `rbac` 的 `@appspine/auth`／`@appspine/common` 都在 `dependencies`，不在
`peerDependencies`），導致第一版快照低估依賴圖。已在同一 PL0-02 task 內修正並重新產生
`snapshot.json`；修正後以下列命令核對 `localWorkspaceDependencyUnion` 與 §3 的 concrete import edge
完全一致（零缺漏、零多餘）：

```bash
node -e "
const s = require('./fixtures/051-pl0-baseline/snapshot.json');
const edges = {};
for (const e of Object.keys(s.crossPackageImports)) {
  const [from, to] = e.split(' -> ');
  edges[from] ??= new Set();
  edges[from].add(to.split('/').slice(0,2).join('/'));
}
for (const name of Object.keys(s.packages).sort()) {
  const declared = new Set(Object.keys(s.packages[name].localWorkspaceDependencyUnion));
  const actual = edges[name] ?? new Set();
  const missing = [...actual].filter(x => !declared.has(x));
  const unused = [...declared].filter(x => !actual.has(x));
  if (missing.length || unused.length) console.log(name, 'DRIFT', { missing, unused });
}
console.log('checked all packages, no output above this line means zero drift');
"
```

輸出只有 `checked all packages, no output above this line means zero drift`，即宣告依賴（三種管道聯集）
與原始碼實際 import 完全一致，可放心作為 [PL0-07 TypeScript project references](051-pl0-build-graph.md)
的依據。

## 3. Cross-package Source Import Graph（`packages/*/src` 內部）

從 `crossPackageImports` 萃取關鍵鏈：

| From | To |
|---|---|
| `@appspine/auth` | `@appspine/audit-log`、`@appspine/common` |
| `@appspine/rbac` | `@appspine/audit-log`、`@appspine/auth`、`@appspine/common` |
| `@appspine/m2m-api-key` | `@appspine/audit-log`、`@appspine/auth`、`@appspine/common` |
| `@appspine/mcp-server` | `@appspine/audit-log`、`@appspine/auth`、`@appspine/m2m-api-key` |

與 [051 拆解 §1.2](../decisions/051-plugin-platform-engineering-task-breakdown.md#12-目前基線) 所述
「`auth → audit/common`、`rbac → auth/audit/common`、`m2m → auth/common/audit`、
`mcp → auth/m2m/audit`」完全一致（concrete source import，非僅宣告的 dependency）。這些邊即
[051 計畫 §6.1](../decisions/051-plugin-platform-engineering-plan.md) 要求改為穩定 token 的目標。

## 4. Prisma Fragments

`prismaFragments` 列出目前公開發布 `.prisma` 片段的 package，共 4 個（**更正**：初版文字誤寫成只有
`@appspine/auth`）：`@appspine/audit-log`（`prisma/audit-log.prisma`）、`@appspine/auth`
（`prisma/user.prisma`，含 `password` 欄位，PL0-04 responsibility matrix 的核心對象）、
`@appspine/m2m-api-key`（`prisma/api-key.prisma`）、`@appspine/rbac`（`prisma/role.prisma`）；四者的
`package.json` `files` 都包含 `"prisma"`，與 §2 表格的 `./prisma/*.prisma` subpath export 一致。其餘
package 的 Prisma model 定義位置以 `snapshot.json` 實際列出為準，不在此重複列舉。

## 5. Frontend Ownership 現況

`frontendOwnership.currentFiles` 確認 [051 計畫 §3.2 表格](../decisions/051-plugin-platform-engineering-plan.md)
所列 6 組 UI 中的 4 組（**更正**：初版誤寫成 5 組）實體檔案集中在 `packages/frontend-shell/src/components/admin/`
（`users-table.tsx`、`create-user-dialog.tsx`、`user-row-actions.tsx`；`roles-table.tsx`、
`create-role-dialog.tsx`、`role-row-actions.tsx`；`api-keys-table.tsx`、`create-api-key-dialog.tsx`、
`api-key-row-actions.tsx`、`created-api-key-reveal.tsx`；`domain-events-table.tsx`、
`domain-event-catalog-table.tsx`、`domain-event-deliveries-panel.tsx`、`domain-event-detail-panel.tsx`）；
其餘 2 組各自獨立：`components/auth/login-button.tsx`（OIDC Login）與 `src/notification/`
（`notification-bell.tsx`、`use-notification-polling.ts`）。`appspine-app-template/frontend/src/app/(main)/dashboard` 的
`(admin)/users`、`(admin)/roles`、`(admin)/api-keys` 與對應 `@modal` intercepted routes 只是 wrapper page，
實際元件仍從 `@appspine/frontend-shell` 匯入——確認 Phase 3 遷移範圍與 051 計畫描述一致。

## 6. Consumer Version／Direct-import Matrix

`consumers` 涵蓋 template + 8 個 App（`wiki`、`calendar`、`chat`、`drive`、`projects`、`approve`、
`master-data`、`mcp-gateway`），全部 9 個 repo 皆能在本機掃描。每個 consumer 記錄 repo HEAD/branch/dirty，
並掃描 `backend`、`frontend`、`e2e` 下的全部 `.ts`／`.tsx`，不再只看 `src/`；因此 Prisma seed、maintenance
scripts、frontend scripts、Playwright config 與 E2E specs 也進入 `directImports`。各 area 若有自己的
`package.json`，其 `@appspine/*` 宣告版本一併記在 `declaredDependencies`。

## 7. 已知限制

- 掃描範圍涵蓋 consumer 的 `backend`／`frontend`／`e2e` tree；這三個 area 以外若未來新增 TypeScript
  workspace，需要把 area 名稱加入 generator，否則不會自動掃到。
- `crossPackageImports` 只解析靜態 `from '...'` import，不含動態 `require()`／`import()`；目前
  `packages/*/src` 內未發現需要動態載入的案例（手動核對 `grep -rn "require(" packages/*/src`
  未見 `@appspine/` 動態 require）。
- 快照是 point-in-time 檔案；HEAD 前進後需重新執行腳本才代表最新狀態，`snapshot.json` 本身不由 CI
  自動重生（Phase 0 不新增 CI gate）。
- **`fixtures/051-pl0-baseline/snapshot.json` 是凍結的 pre-split 基線，不得重新產生。** Phase 1 曾經
  就地覆寫它，等於刪掉 PL1-13 驗收「每個 pre-split export 都保留或有明確 migration 結論」所比對的對象
  （Gate G1 review B2）。已由 HEAD 的 git worktree 逐位元還原（101265 bytes，與本文件原記錄相同），
  generator 現在會**拒絕** `--write` 這個路徑。
- 每個 phase 寫自己的快照：`node scripts/051-pl0-snapshot.mjs --write --baseline
  fixtures/051-pl<n>-baseline/snapshot.json`。`pnpm run verify:snapshot` 檢查的是**當期** phase 的那一份
  （目前 `fixtures/051-pl1-baseline/snapshot.json`）。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL0-02 |
| Actual agent | Claude Sonnet 5，本 session 直接執行 |
| Required class | G2 `repo-integration`（建議 owner：Gemini G2；Luna 產生清單） |
| Substitution reason | 同 [PL0-01](051-pl0-baseline.md) Execution Log 所述，session 內無獨立 Gemini/Luna provider，依使用者核准的替代方式執行 |
| Independent reviewer | Claude Opus（general-purpose agent，2026-08-18，Gate G0 blind-spot audit）——發現本文件初版三處錯誤：(1) exports 描述聲稱每個 package 只有單一 root export，實際 8 個 package 已有 subpath；(2) Prisma fragments 只列 `auth`，實際有 4 個 package；(3) frontend-shell 集中度誤寫成 6 組中的 5 組，實際是 4 組。三處均已於本次修訂更正（見 §2／§4／§5），並回頭促成 [PL0-03 §2](051-pl0-package-classification.md) 補上既有 subpath 協調說明 |
| Tools | repo read/write（Read/Write/Bash/Grep），跨 9 個 sibling repo 唯讀掃描 |
| Evidence | 兩次連續執行 `snapshot.json` 的 `diff` 結果（無差異）；本文件第 3、5 節列出的具體鏈與現有檔案核對；第 2 節記錄的依賴宣告 vs. 實際 import 零 drift 核對；獨立 review 覆核後修正的三處見上一列 |
| 已知風險 | 掃描範圍限制見第 7 節；dynamic `require()`／`import()` 仍需在新增時擴充 parser |
| Rollback | 刪除 `fixtures/051-pl0-baseline/`、`scripts/051-pl0-snapshot.mjs`、本文件 |
