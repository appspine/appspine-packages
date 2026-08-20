---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-11 — Template frontend integration 與 E2E

> Task：`PL3-11`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)～[PL3-10](051-pl3-10-plugin-catalog-health.md)、[PL2-08](051-pl2-08-preset-standard.md)。
> 本 task 在 `appspine-app-template` 整合 plugin frontend facets，將 Users、Roles、API Keys、Domain Events、Notification Bell 與 OIDC Login 遷移至各自的 `@appspine/<plugin>/frontend` 子路徑，並驗證 build-time generator 在 template 專案中產出完整 8 個 generated 構件。

---

## 1. 交付內容

### 1.1 `appspine-app-template` 前端匯入遷移

在 `appspine-app-template/frontend` 中完成以下檔案之匯入重構：
- `src/app/(external)/login/page.tsx`: 改用 `@appspine/oidc-auth/frontend`
- `src/app/(main)/dashboard/(admin)/users/page.tsx`: 改用 `@appspine/identity-core/frontend`
- `src/app/(main)/dashboard/(admin)/roles/page.tsx`: 改用 `@appspine/rbac/frontend`
- `src/app/(main)/dashboard/(admin)/api-keys/page.tsx`: 改用 `@appspine/m2m-api-key/frontend`
- `src/app/(main)/dashboard/_components/sidebar/notification-bell.tsx`: 改用 `@appspine/notification/frontend`
- `frontend/package.json`: 新增 `@appspine/identity-core`、`@appspine/oidc-auth`、`@appspine/rbac`、`@appspine/m2m-api-key`、`@appspine/domain-events`、`@appspine/notification` 依賴。

### 1.2 Dual-Mode 與 Tarball 隔離驗證

- 透過 `scripts/051-pl2-09-template-dual-mode.mjs`，將此 monorepo 20 個核心 packages 實際 pack 為 tarball，複製 template 至暫存目錄執行真實安裝與 build。
- 驗證 `appspine build` 產出全部 8 個 generated 構件：
  - `.appspine/generated/backend/composition.ts`
  - `.appspine/generated/catalog.json`
  - `.appspine/generated/frontend/admin-routes.ts`
  - `.appspine/generated/frontend/i18n.ts`
  - `.appspine/generated/frontend/navigation.ts`
  - `.appspine/generated/frontend/slots.tsx`
  - `.appspine/generated/permissions.json`
  - `.appspine/generated/schema.prisma`
  - `appspine.plugin-lock.json`
- `appspine build --check`、`appspine doctor` 與 backend module tests 全數乾淨通過。

---

## 2. 驗證與測試

- `node scripts/051-pl2-09-template-dual-mode.mjs`: 通過。
- `node scripts/051-pl2-10-generation-gate.mjs`: 通過（8 個 golden 構件比對通過 + 6 組 self-tests 全數通過）。
- `node scripts/051-pl3-frontend-migration-codemod.mjs`: 在 template 上執行 `--apply` 成功重寫所有 legacy 匯入。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked (8 with manifests), 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-11` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra xhigh roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified template frontend imports, packed tarball dual-mode execution, and build-time generator output |
| Independent reviewer | Sol (cross-package/template review) |
| Branch | `051-pl3-01-frontend-contract` (packages) / `051-pl2-09-dual-mode-host` (template) |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | Template dual-mode verification OK; generation gate 8 goldens byte-identical |
| 已知風險 | 無 |
| Next prerequisite | Gate G3 驗收報告 |
