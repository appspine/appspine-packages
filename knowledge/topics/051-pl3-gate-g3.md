---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 Gate G3 — Frontend Facet／Slots 與 Capability UI Ownership 驗收報告

> Gate：`G3`（見 [051 拆解 §7 與 §12](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 審查範圍：`PL3-01`～`PL3-11` 全部交付內容與架構約束。
> 前置狀態：G2 於 2026-08-19 關閉（見 [051-pl2-gate-g2.md](051-pl2-gate-g2.md)）。

---

## 1. 審查摘要與判定

| 審查項目 | 要求標準 | 驗證結果 | 判定 |
|---|---|---|:---:|
| **PL3-01** 前端 facet schema 與 contribution 型別 | Manifest schema 支援 `adminPages`、`navigationItems`、`slots`、`loginProviderUi`、`i18n` | `@appspine/plugin-api` 型別與 schema 齊備，單元測試通過 | **PASS** |
| **PL3-02** Next.js build-time generator | 產生 `navigation.ts`、`admin-routes.ts`、`slots.tsx`、`i18n.ts`，具備依賴排序與衝突偵測 | `packages/plugin-cli/src/frontend-generator.ts` 實作完成，175/175 tests 通過 | **PASS** |
| **PL3-03** Users Admin 遷移 | 遷移至 `@appspine/identity-core/frontend`，宣告 `adminPages`、`navigationItems` | 29/29 tests 通過，`frontend-shell` 保留 `@deprecated` | **PASS** |
| **PL3-04** OIDC Login 遷移 (Sol Security) | 遷移至 `@appspine/oidc-auth/frontend`，宣告 `loginProviderUi` | 149/149 tests 通過，Sol security review 放行 | **PASS** |
| **PL3-05** Roles Admin 遷移 | 遷移至 `@appspine/rbac/frontend`，宣告 `adminPages`、`navigationItems` | 31/31 tests 通過，`frontend-shell` 保留 `@deprecated` | **PASS** |
| **PL3-06** API Keys Admin 遷移 (Sol Security) | 遷移至 `@appspine/m2m-api-key/frontend`，one-time plaintext reveal 安全保證 | 21/21 tests 通過，Sol security review 放行 | **PASS** |
| **PL3-07** Domain Events Admin 遷移 | 遷移至 `@appspine/domain-events/frontend`，table/catalog/deliveries/detail 齊備 | 76/76 tests 通過，`frontend-shell` 保留 `@deprecated` | **PASS** |
| **PL3-08** Notification Bell 遷移 | 遷移至 `@appspine/notification/frontend`，宣告 slot `header.actions` | 52/52 tests 通過，輪詢與樂觀狀態機完整 | **PASS** |
| **PL3-09** `frontend-shell` 收斂 | Shell 零 capability 逆向依賴，納入 `FOUNDATION_PACKAGES`，提供 codemod | 架構檢查器 0 findings，51/51 tests 通過，codemod self-test 通過 | **PASS** |
| **PL3-10** Plugin Catalog & Health (Sol Security) | `PluginCatalogTable` 支援健康狀態、能力清單、敏感設定遮蔽與診斷 | 53/53 tests 通過，Sol security review 放行 | **PASS** |
| **PL3-11** Template 前端整合與 Dual-mode | `appspine-app-template` 整合 plugin frontend facets，tarball dual-mode 驗證通過 | `051-pl2-09` 與 `051-pl2-10` 測試全部 0 findings 通過 | **PASS** |
| **§2.2 Code Quality & Discipline** | 全 Monorepo 執行 `pnpm lint` 程式碼格式、import 排序與規範檢查 | 624 檔案 checked，0 errors，0 warnings | **PASS** |

**最終審查結論：Gate G3 判定通過（PASS）。**

---

## 2. 核心架構不變量檢核

1. **Zero Capability Reverse Imports in Shell**:
   `@appspine/frontend-shell` 已被加入 `scripts/051-pl1-architecture-check.mjs` 之 `FOUNDATION_PACKAGES`，保證 shell 不反向依賴任何 capability plugin。
2. **Deterministic Frontend Artifacts**:
   `packages/plugin-cli/src/frontend-generator.ts` 透過 Kahn's algorithm 拓撲排序所有 navigation/slots/routes，並於 `051-pl2-10-generation-gate.mjs` 中與 8 個 goldens 完成 byte-identical 驗證。
3. **Transition Window & Deprecation**:
   所有從 `frontend-shell` 遷出的舊匯出皆保留並明確標記 `@deprecated`，舊專案仍可平滑編譯，同時提供 `051-pl3-frontend-migration-codemod.mjs` 供一鍵遷移。

---

## 3. Phase 3 完整 Commit Log

- `7ca738c`: `feat(plugin-api): define frontend facet schema and contribution types (PL3-01)`
- `b0182a1`: `feat(plugin-cli): implement Next.js frontend generator for navigation, routes, slots, and i18n (PL3-02)`
- `830c480`: `feat(identity-core): migrate Users admin UI and types to frontend facet (PL3-03)`
- `1ab8f39`: `feat(oidc-auth): migrate OIDC Login UI and types to frontend facet (PL3-04)`
- `8906d97`: `feat(rbac): migrate Roles admin UI, types and plugin manifest to frontend facet (PL3-05)`
- `b9f0841`: `feat(m2m-api-key): migrate API Keys admin UI, types and plugin manifest to frontend facet (PL3-06)`
- `2a912ca`: `feat(domain-events): migrate Domain Events admin UI, types and plugin manifest to frontend facet (PL3-07)`
- `9c3f072`: `feat(notification): migrate Notification Bell and polling to frontend facet (PL3-08)`
- `1255099`: `feat(frontend-shell): converge foundation boundary and add migration codemod (PL3-09)`
- `1ffcb8f`: `feat(frontend-shell): add Plugin Catalog and Health admin management UI (PL3-10)`
- `07abf32` (template repo): `feat(frontend): integrate plugin frontend facets and migrate capability imports (PL3-11)`

---

## 4. Execution Log

| 欄位 | 內容 |
|---|---|
| Gate | `G3` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G3 (Sol / Claude Sonnet high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified all 11 tasks (PL3-01~11), security reviews (PL3-04, PL3-06, PL3-10), architecture boundary, template dual-mode & tarball build |
| Independent reviewer | Sol (Security & module format review) & Claude (UX & frontend architecture review) |
| Repos / Branches | `appspine-packages` (`051-pl3-01-frontend-contract`), `appspine-app-template` (`051-pl2-09-dual-mode-host`) |
| Tools | repo read/write, pnpm, vitest, tsc, node, git |
| Evidence | 22 packages architecture check 0 findings; 051-pl2-10 generation gate 0 findings; 051-pl2-09 dual-mode 0 findings; pnpm lint 624 files 0 errors/0 warnings; all unit tests green |
| 已知風險 | 無 |
| Phase 4 準備 | 可進入 Phase 4 — 其餘 capability / connector 遷移（PL4-01～PL4-08） |
