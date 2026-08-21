---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-09 — 收斂 `frontend-shell` 並執行 migration codemod

> Task：`PL3-09`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-03](051-pl3-03-identity-core-frontend.md)～[PL3-08](051-pl3-08-notification-frontend.md)。
> 本 task 驗證 `frontend-shell` 已將所有 capability UI（Users、OIDC Login、Roles、API Keys、Domain Events、Notification Bell）完全解耦並由各 plugin facet 自主擁有；將 `frontend-shell` 納入 `scripts/051-pl1-architecture-check.mjs` 之 `FOUNDATION_PACKAGES` 嚴格禁止 capability 逆向依賴；並提供 migration codemod 工具 `scripts/051-pl3-frontend-migration-codemod.mjs`。

---

## 1. 交付內容

### 1.1 Foundation 邊界收斂

- `frontend-shell` 僅保留 host shell 核心能力（layout、nav sidebar、slots renderer、auth context、theme、UI primitives）。
- `scripts/051-pl1-architecture-check.mjs`: 將 `@appspine/frontend-shell` 加入 `FOUNDATION_PACKAGES`，由架構檢查器保證零 capability plugin 依賴。

### 1.2 Migration Codemod 工具

新增 `scripts/051-pl3-frontend-migration-codemod.mjs`：
- 自動辨識舊式 `@appspine/frontend-shell` 與 `@appspine/frontend-shell/notification` 匯入。
- 將 Users、Roles、API Keys、Domain Events、Notification、OIDC Login 之元件與型別精準重寫至對應的 `@appspine/<plugin>/frontend`。
- 支援 `--self-test`、dry-run 與 `--apply` 模式。

### 1.3 相容性過渡保證

- `frontend-shell` 內部所有舊元件匯出皆標註 `@deprecated`，以保證過渡期間外部舊專案仍可正常編譯。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/frontend-shell build`: tsc 編譯通過。
- `pnpm --filter @appspine/frontend-shell test`: 9 test files, 51 tests 全數通過。
- `node scripts/051-pl3-frontend-migration-codemod.mjs --self-test`: 自我測試通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked (8 with plugin manifests), 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-09` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified zero capability reverse imports in frontend-shell, deprecation annotations, and codemod import rewriting |
| Independent reviewer | Sol (foundation boundary review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | Architecture check passes with frontend-shell in FOUNDATION_PACKAGES; codemod self-test passes; all tests clean |
| 已知風險 | 無 |
| Next prerequisite | PL3-10 建立 plugin catalog／health 管理面 |
