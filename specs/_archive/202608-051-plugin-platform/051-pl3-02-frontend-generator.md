---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-02 — Next.js build-time generator

> Task：`PL3-02`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-01](051-pl3-01-frontend-contract.md)、[PL2-03](051-pl2-03-build-doctor.md)～[PL2-05](051-pl2-05-generated-composition.md)。
> 本 task 實作 Next.js 建置期產生器，在 `.appspine/generated/frontend/*` 產生靜態 imports、導覽、admin 路由、插槽註冊與 i18n 註冊。

---

## 1. 產出檔案結構

建置指令 `appspine build` 會產生以下四個前端產物：

| 產物路徑 | 內容 |
|---|---|
| `.appspine/generated/frontend/navigation.ts` | 依相依關係（`before`/`after`）拓撲排序與 priority 排序的導覽項目 |
| `.appspine/generated/frontend/admin-routes.ts` | 靜態 admin 路由清單，包含權限、麵包屑與對應的 owner package frontend subpath 靜態匯入 |
| `.appspine/generated/frontend/slots.tsx` | 插槽（如 `header.actions`, `dashboard.widgets`）註冊表與依賴排序 |
| `.appspine/generated/frontend/i18n.ts` | 各插件宣告之 i18n 命名空間清單與語系設定 |

### 1.1 核心保證與驗證規則

1. **靜態匯入（Static Imports）**：所有元件引用直接指向各 owner 套件之公開 `./frontend` subpath，絕不在 runtime 動態解析 package name，不使用 Module Federation。
2. **拓撲排序與循環依賴檢測（Cycle Detection）**：`sortWithDependencies` 使用 Kahn's 演算法處理 `before` 與 `after` 宣告，並在偵測到循環依賴時拋出具體錯誤。
3. **重複定義衝突防護**：
   - 重複之 `adminRoutes.routePath` 或 `adminRoutes.id` 會即時報錯。
   - 重複之 `i18nNamespace` 會即時報錯。
4. **Drift Detection & Source Digest**：每個前端產物均包含 `sourceDigest` 標頭，並納入 `appspine.plugin-lock.json` 的 `artifacts` 簽章與 `appspine build --check` 比對。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/plugin-cli test`: 9 test files, 175 tests 全數通過（含 7 個 `frontend-generator.spec.ts` 專屬測試）。
- `pnpm --filter @appspine/plugin-cli build`: tsc 編譯通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked, 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-02` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra xhigh roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified against PL3-01 contract and CLI test suite |
| Independent reviewer | Claude (slot/route semantics review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 175 tests in `@appspine/plugin-cli` passed, `frontend-generator.spec.ts` 涵蓋循環檢測、重複路由/語系衝突防護與建置驗證 |
| 已知風險 | 無 |
| Next prerequisite | PL3-03 遷移 Users Admin 到 identity-core/frontend |
