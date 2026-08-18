---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 Phase 1 執行紀錄 — task ledger 與 workspace gate

> 涵蓋 `PL1-01` ～ `PL1-14`。分項設計說明見
> [PL1-01～06／11](051-pl1-plugin-platform-core.md)、[PL1-07／14](051-pl1-architecture-and-consumer-checks.md)、
> [PL1-08／09](051-pl1-pilot-plugins.md)、[PL1-10／12／13](051-pl1-identity-auth-split.md)。
> Gate 判定見 [Gate G1](051-pl1-gate-g1.md)。
> 本文件只記錄「做了什麼、跑了什麼、結果是什麼」，不重述設計理由。

---

## 1. Task ledger

拆解 §5 列了 14 個 task。實際落點：

| Task | 交付 | 文件 |
|---|---|---|
| PL1-01 | `@appspine/plugin-api` | [核心](051-pl1-plugin-platform-core.md) |
| PL1-02 | `@appspine/plugin-testkit` | 同上 |
| PL1-03 | `@appspine/plugin-host-nest` 骨架 | 同上 |
| PL1-04 | `plugin-api/loader`（Ajv 2020、canonical digest、engine range） | 同上 §4.1 |
| PL1-05 | `plugin-api/resolver`（確定性拓撲排序） | 同上 §4.2 |
| PL1-06 | Nest host lifecycle／catalog／diagnostics | 同上 §5 |
| PL1-07 | `scripts/051-pl1-architecture-check.mjs`（9 規則＋13 self-test） | [checkers](051-pl1-architecture-and-consumer-checks.md) |
| PL1-08 | `health-check` 試點 | [試點](051-pl1-pilot-plugins.md) |
| PL1-09 | `audit-log` 試點＋`AUDIT_SINK` token 反轉 | 同上 |
| PL1-10 | `@appspine/identity-core` | [identity 拆分](051-pl1-identity-auth-split.md) |
| PL1-11 | authentication strategy registry／principal bridge | [核心](051-pl1-plugin-platform-core.md) §5 |
| PL1-12 | `@appspine/oidc-auth` | [identity 拆分](051-pl1-identity-auth-split.md) |
| PL1-13 | `@appspine/auth` 相容 facade | 同上 §4 |
| PL1-14 | `scripts/051-pl1-clean-consumer.mjs`＋fixture | [checkers](051-pl1-architecture-and-consumer-checks.md) §3 |

Changesets：`051-phase1-plugin-platform-core.md`（PL1-01～06、11）、`051-phase1-pilot-plugins.md`
（PL1-08、09）、`051-phase1-identity-split.md`（PL1-10、12、13）。PL1-07／14 是 repo 內部工具，無發布面，
依 `check-changeset-discipline.mjs` 規則不需要 changeset。

### 1.1 相對拆解的偏離

| 偏離 | 說明 |
|---|---|
| 全部 14 個 task 由同一個 agent 在同一個 working tree 依序完成 | 拆解 §1.1 要求「一個 task 一個 branch／worktree、可獨立 review 的 commit series」。本次沒有做到，Phase 2 起應恢復 |
| 建議 roster（Sol／Terra／Luna／Gemini）未接入 | 屬拆解 §11 的 agent 替代；本 session 只有 Claude Opus 5 |
| `plugin-api` 起版 1.0.0 而非 0.1.0 | PL0-05 fixtures 已凍結 `^1.0.0`，見[核心 §1](051-pl1-plugin-platform-core.md#1-三個新-package-與它們的邊界) |
| 新增 `plugin-api/runtime` subpath | 拆解未預期，理由見[核心 §2](051-pl1-plugin-platform-core.md) |

## 2. Workspace gate（拆解 §2.2）

在 `d:\Source\Private\appspine\appspine-packages` working tree 執行，非乾淨 worktree——這是相對拆解
§2.2「乾淨 worktree」的偏離，記錄於此。

| 指令 | 結果 |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ |
| `pnpm lint` | ✅（見 §2.1） |
| `pnpm build` | ✅ 20 packages |
| `pnpm typecheck` | ✅ 20 packages |
| `pnpm test` | ✅ **798 tests / 20 packages**（見 §2.2） |
| `pnpm verify:phase0` | ✅ 5 支 PL0 checker、80 checks |
| `pnpm verify:phase1` | ✅ self-test **13/13**、architecture 0 findings、clean consumer 7/7 |
| `pnpm verify:snapshot` | ✅ byte-identical（115024 bytes，`fixtures/051-pl1-baseline/`） |
| `pnpm check:changeset-discipline` | ✅ |
| `node scripts/lint-knowledge.js` | ✅ |
| `git diff --check` | ✅ |

### 2.1 收尾時修掉的事

Phase 1 實作結束時 gate 並**不是**綠的。這一段記錄的是**在獨立 review 之前**、單純把 gate 跑完就浮出來
的問題；review 自己找到的 4 blocking／9 should-fix 見 [Gate G1 §2](051-pl1-gate-g1.md)。

| # | 問題 | 修法 |
|---|---|---|
| 1 | `packages/identity-core/src/plugin.spec.ts` 失敗：source-text ban 掃到 `users.service.ts` 註解裡引述的 `prisma.role.findUnique(...)` | 比對前先 `stripComments()`，保留解釋邊界的註解。見 [identity 拆分 §2](051-pl1-identity-auth-split.md) |
| 2 | `pnpm lint` 兩個 biome 錯誤：`051-pl0-build-graph-check.mjs` 的多餘 regex escape、`oidc-auth/src/plugin.spec.ts` 的 import 排序 | `biome check --write` 套用 safe fix |
| 3 | `node scripts/lint-knowledge.js` 兩個錯誤：指向不存在的 `051-pl1-execution-log.md` 的 broken link、`knowledge/index.md` stale | 建立本文件與其餘 4 份 PL1 文件，重跑 `--write-indexes` |

第 1 項是實質的：`pnpm test` 在 `identity-core` 就中止，**排在它之後的 5 個 package 從來沒被跑過**。
Phase 1 的原始交付只驗證了三個新 package 各自的 `pnpm --filter … test`，沒有跑過 workspace 全量——
這正是拆解 §2.2 要求整包 gate 而不是逐 package 綠燈的理由。

### 2.2 各 package 測試數

| Package | Tests | Package | Tests |
|---|---:|---|---:|
| `oidc-auth` | 149 | `identity-core` | 29 |
| `plugin-api` | 105 | `integration-contracts` | 27 |
| `oidc-delegation` | 74 | `rbac` | 26 |
| `domain-events` | 72 | `common` | 24 |
| `mcp-server` | 55 | `audit-log` | 22 |
| `frontend-shell` | 51 | `plugin-testkit` | 16 |
| `notification` | 40 | `m2m-api-key` | 16 |
| `auth` | 34 | `health-check` | 12 |
| `plugin-host-nest` | 31 | `master-data-client` | 8 |
| | | `e2e-kit` | 4 |
| | | `metadata-schema` | 3 |
| | | **合計** | **798** |

## 3. 未授權的動作

依拆解 §2.3 與計畫本文，以下都**沒有**執行，也不在 Phase 1 授權範圍內：

- `git push`、canary／stable publish（走 PL5 release gate）
- 任何 Prisma migration 的**套用**（`@appspine/oidc-auth` 的 additive migration 已產生但未執行，見
  `packages/oidc-auth/prisma/migrations/README.md`；拆解 §2.3 禁止的是套用，不是產生）
- 移除 `@appspine/auth` 任何舊 API

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL1-01～14 彙總 |
| Actual agent | Claude Opus 5 |
| Required class | G2／G3 混合，見各分項文件 |
| Substitution reason | 本 session 無獨立 Sol／Terra／Luna／Gemini provider |
| Independent reviewer | 獨立 Claude Opus general-purpose agent；findings 與修正見 [Gate G1 §2](051-pl1-gate-g1.md) |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node、npm、prisma generate、git worktree |
| Evidence | §2 全部指令與結果；§2.1 收尾修正；§2.2 逐 package 測試數；[Gate G1 §2](051-pl1-gate-g1.md) 的 review 修正 |
| 已知風險 | §1.1 偏離；各分項文件的「已知限制」 |
| Rollback | 見各分項文件的 Rollback 欄位；本文件本身刪除即可 |
