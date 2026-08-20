---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL0-01 — Execution Baseline

> Task: `PL0-01`（見 [051-plugin-platform-engineering-task-breakdown.md](../decisions/051-plugin-platform-engineering-task-breakdown.md) §4）。
> Owner（實際執行）：Claude Sonnet（承接文件建議的 Gemini G2 `repo-integration` 角色，本 session 無獨立
> Gemini/Terra/Luna provider 可用，屬 §11 記錄的 substitution；見本文件末尾 Execution Log）。
> 目的：建立可重跑的 Phase 0 baseline，並修正 README／CI 的套件數文件漂移。本文件不改變任何 runtime 行為。

---

## 1. Repo 狀態

| 項目 | 值 |
|---|---|
| repo | `appspine-packages`（獨立 git repo，位於 `appspine-packages/` 下） |
| branch | `main` |
| HEAD | `8312e2d9cdfe57efd7dc8e90fb69e4159546712c`（2026-08-18 09:46:04 +0800） |
| working tree | clean（`git status --short` 無輸出） |

重跑方式：

```bash
git log -1 --format='%H %ci'
git branch --show-current
git status --short
```

## 2. 15 個 Workspace Packages 與版本

```bash
for d in packages/*/; do
  n=$(node -pe "require('./${d}package.json').name")
  v=$(node -pe "require('./${d}package.json').version")
  echo "$n@$v"
done
```

| # | Package | Version |
|---|---|---|
| 1 | `@appspine/audit-log` | 1.0.1 |
| 2 | `@appspine/auth` | 6.2.2 |
| 3 | `@appspine/common` | 0.3.4 |
| 4 | `@appspine/domain-events` | 8.0.0 |
| 5 | `@appspine/e2e-kit` | 1.0.2 |
| 6 | `@appspine/frontend-shell` | 0.16.3 |
| 7 | `@appspine/health-check` | 0.1.9 |
| 8 | `@appspine/integration-contracts` | 0.4.0 |
| 9 | `@appspine/m2m-api-key` | 5.0.0 |
| 10 | `@appspine/master-data-client` | 0.1.4 |
| 11 | `@appspine/mcp-server` | 0.6.8 |
| 12 | `@appspine/metadata-schema` | 0.2.22 |
| 13 | `@appspine/notification` | 0.2.2 |
| 14 | `@appspine/oidc-delegation` | 0.3.1 |
| 15 | `@appspine/rbac` | 4.0.8 |

15 個 package 與 [051 拆解 §1.2 表格](../decisions/051-plugin-platform-engineering-task-breakdown.md#12-目前基線)
所述一致。

## 3. Root Scripts

來自 root `package.json`：

| Script | Command |
|---|---|
| `build` | `pnpm -r run build` |
| `typecheck` | `pnpm -r run typecheck` |
| `test` | `pnpm -r run test` |
| `lint` | `biome check .` |
| `lint:fix` | `biome check --write .` |
| `check:changeset-discipline` | `node scripts/check-changeset-discipline.mjs` |
| `changeset` | `changeset` |
| `version-packages` | `changeset version` |
| `release` | `pnpm -r run build && changeset publish` |

## 4. CI Gate

`.github/workflows/ci.yml`（`ci` job，`ubuntu-latest`，Node 22）依序執行：

```text
pnpm install --frozen-lockfile
pnpm lint
node scripts/check-changeset-discipline.mjs <base>   # PR: origin/main；push: HEAD^
pnpm run build
pnpm run typecheck
pnpm run test
node scripts/lint-knowledge.js
```

其餘 workflow：`.github/workflows/integration-contracts.yml`、`release-health-check.yml`、`release.yml`
（Changesets 觸發的發布 workflow，本次未檢視細節，不在 PL0-01 範圍）。

full-workspace build 先於 typecheck/test 的理由（見 ci.yml 註解）：各 package 的 `tsc` 透過
`dist/*.d.ts` 解析 workspace 依賴，而非 TypeScript project references；fresh checkout 若無既存 `dist/`，
任何跨 package import 會在 typecheck 階段失敗。這正是 PL0-07（TypeScript project references）要處理的
build graph 缺口，PL0-01 只如實記錄現況，不在本 task 變更。

## 5. 現有 6 個 `@Global()` Module

```bash
grep -rn "@Global()" packages --include="*.ts"
```

| Package | 檔案 | Module |
|---|---|---|
| `@appspine/common` | `packages/common/src/prisma/prisma.module.ts` | `PrismaModule` |
| `@appspine/auth` | `packages/auth/src/auth.module.ts` | `AuthModule` |
| `@appspine/audit-log` | `packages/audit-log/src/audit-log.module.ts` | `AuditLogModule` |
| `@appspine/rbac` | `packages/rbac/src/rbac.module.ts` | `RbacModule` |
| `@appspine/m2m-api-key` | `packages/m2m-api-key/src/api-keys.module.ts` | `ApiKeysModule` |
| `@appspine/mcp-server` | `packages/mcp-server/src/mcp.module.ts` | `McpModule` |

與 [051 拆解 §1.2](../decisions/051-plugin-platform-engineering-task-breakdown.md#12-目前基線) 所述
「`common` Prisma、`auth`、`audit-log`、`rbac`、`m2m-api-key`、`mcp-server` 共 6 處」完全一致；沒有第 7 個
遺漏的 `@Global()`。`packages/domain-events/src/admin/domain-events-admin.module.ts` 有一段解釋
「為何不能用 `@Global()`」的註解（非裝飾器本身），已在人工核對時排除，避免被 grep 誤算。

## 6. 文件漂移修正（本 task 唯一的程式碼變更）

發現與修正：

1. **README.md `Package Catalog`** 只列出 10 個 package，缺少 `integration-contracts`、`domain-events`、
   `notification`、`oidc-delegation`、`master-data-client` 五個。已補齊全部 15 個 package 的一行描述，
   並加註「目前 15 個 package」的明確陳述。
2. **`.github/workflows/ci.yml`** 第 42 行註解寫「all 13 packages」，實際為 15 個。已更正為「all 15
   packages」。註解其餘關於 build-before-typecheck 順序的理由仍然成立（見上第 4 節），未變動。

掃描過 `docs/`、其餘 `.github/workflows/*.yml`，未發現其他套件數陳述性文字（`grep -rn -iE
"[0-9]+[ -]*(packages|個套件|package catalog)" docs/ .github/workflows/*.yml`）。

本 task 不修改任何 runtime 程式碼、不變更 build/test 行為；`pnpm lint`、`pnpm build`、`pnpm typecheck`、
`pnpm test` 預期與修正前結果相同（PL0-01 handoff 於 Gate G0 一併附上 full gate 執行紀錄，見
[051-pl0-gate-g0.md](051-pl0-gate-g0.md)）。

## 7. 驗證

- 上述每個表格都可由本文件列出的命令重新產生，且與 `packages/*/package.json`、`.github/workflows/`、
  `packages/**/*.ts` 的 source-of-truth 一致（本 task 交付當下已核對一致）。
- README、CI 文件數字修正後與 `packages/*/package.json` 名單一致。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL0-01 |
| Actual agent | Claude Sonnet 5（claude-sonnet-5），本 session 直接執行 |
| Required class | G2 `repo-integration`（文件建議 owner：Gemini G2；Luna 機械盤點） |
| Substitution reason | 本 session 未接入獨立 Gemini/Luna provider；使用者已核准「全部由 Claude Sonnet 直接執行」的替代方式（見 2026-08-18 對話紀錄），且本 task 屬可機械驗證的 inventory/文件修正，非高風險決策 |
| Independent reviewer | 無獨立 provider；風險等級低（純文件 + 盤點，無 runtime 變更），列入 Gate G0 統一由後續獨立 review agent 覆核 |
| Tools | repo read/write（Read/Edit/Bash/Grep） |
| Evidence | 本文件第 2～6 節列出的命令輸出；README.md、ci.yml 的 diff |
| 已知風險 | 無；純文件修正 |
| Rollback | `git checkout -- README.md .github/workflows/ci.yml` |
