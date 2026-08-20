---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-04 — 遷移 OIDC Login 到 `oidc-auth/frontend`

> Task：`PL3-04`（見 [051 拆解 §7](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)）。
> 依賴：[PL3-02](051-pl3-02-frontend-generator.md)、[PL1-12](051-pl1-identity-auth-split.md)、[PL3-03](051-pl3-03-identity-core-frontend.md)。
> 本 task 將 OIDC Login UI（`LoginButton`、`isNextRedirectError` 與 `mapAuthErrorKey` / `AuthErrorKey`）遷移至 `@appspine/oidc-auth/frontend`，並在 manifest 中宣告 `loginProviderUi` 與 `i18nNamespace`。

---

## 1. 交付內容

### 1.1 `oidc-auth` 前端匯出

`@appspine/oidc-auth/frontend` 新增以下元件與錯誤處理工具：
- `LoginButton`: NextAuth 導向登入按鈕元件，妥善處理 `NEXT_REDIRECT` 內部異常與一般客戶端錯誤呈現。
- `isNextRedirectError`: 判斷錯誤是否為 Next.js 重新導向內部 digest。
- `mapAuthErrorKey`、`AuthErrorKey`: NextAuth 錯誤碼（`AccessDenied`、`OAuthCallback`、預設錯誤）之 i18n 鍵名映射。
- `OidcAuthFrontendContribution`: 前端 facet 宣告型別。

### 1.2 Manifest 前端 Facet 宣告

在 `packages/oidc-auth/appspine.plugin.json` 中宣告：
- `loginProviderUi`: `true`
- `i18nNamespace`: `"oidc-auth"`
- `clientEntry`: `"./dist/frontend.js"`

### 1.3 相容性過渡保證

- `packages/frontend-shell/src/components/auth/login-button.tsx` 與 `packages/frontend-shell/src/lib/auth-error.ts` 保留相容宣告並註記 `@deprecated`，維護既有 consumer 之編譯相容性。

---

## 2. 驗證與測試

- `pnpm --filter @appspine/oidc-auth build`: tsc 編譯乾淨通過。
- `pnpm --filter @appspine/oidc-auth test`: 12 test files, 149 tests 全數通過（含 JWT 驗證、delegated claims、manifest 一致性）。
- `pnpm --filter @appspine/frontend-shell build`: 相容匯出編譯通過。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages checked, 0 findings。

---

## 3. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL3-04` |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (Terra high roster replacement) |
| Substitution reason | Current execution agent assigned by user |
| Calibration | Verified redirect-style signIn() semantics, error mapping boundary, and non-leakage of IdP secrets in frontend artifacts |
| Independent reviewer | Sol (security-sensitive authentication & redirect review) |
| Branch | `051-pl3-01-frontend-contract` |
| Tools | repo read/write, pnpm, vitest, tsc, node |
| Evidence | 149 tests in `@appspine/oidc-auth` passed; redirect & error mapping preserved; frontend exports verified |
| 已知風險 | 無 |
| Next prerequisite | PL3-05 遷移 Roles Admin 到 rbac/frontend |
