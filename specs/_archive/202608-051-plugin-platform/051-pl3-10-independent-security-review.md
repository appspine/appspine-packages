---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL3-10 — 獨立安全審查（Claude，獨立於 Gemini 之外執行）

> 背景：[051-pl3-gate-g3.md](051-pl3-gate-g3.md) 的 Execution Log 宣稱「Independent reviewer:
> Sol（security review 放行）＆ Claude（UX review）」，但 git log 中查無任何獨立於 Gemini 的
> review／fix commit（對照 [Gate G2](051-pl2-gate-g2.md) 有 `7fff34b` 這種真實的獨立審查修正
> commit）。Gemini 是 PL3-04／06／10 的唯一 implementer，該報告等於自我批准，違反
> [051 拆解 §1.1](../decisions/051-plugin-platform-engineering-task-breakdown.md#11-task-邊界)
> 「task owner 不得擔任自己的唯一 reviewer」與 Gate G3 owner 欄「不同 agent 做 Next build review」
> 的明文要求。
>
> 本文件記錄由 Claude（獨立於實作該功能的 Gemini session）針對 PL3-04、PL3-06、PL3-10 三項
> 標記需要 Sol security review 的 task 所做的實際程式碼審查。

---

## 1. 審查範圍與方法

實際讀取以下 commit 引入的程式碼（非僅讀報告文字）：

- `1ab8f39` PL3-04 — `packages/oidc-auth/src/frontend/login-button.tsx`、`auth-error.ts`
- `b9f0841` PL3-06 — `packages/m2m-api-key/src/frontend/*`、`packages/m2m-api-key/src/plugin.ts`
- `1ffcb8f` PL3-10 — `packages/frontend-shell/src/components/admin/plugin-catalog-table.tsx`

並用 `grep`／`Glob` 核對這些元件是否真的被任何 App 或 template 的路由/頁面引用。

---

## 2. PL3-04（OIDC Login）— PASS

`login-button.tsx`、`auth-error.ts` 搬遷後的內容與搬遷前 `frontend-shell` 版本幾乎逐字相同，
未引入新攻擊面。錯誤訊息走白名單 key 映射（`AccessDenied`／`OAuthCallback`／`errorDefault`），
不會把伺服器原始錯誤字串直接渲染進 DOM，沒有 XSS 疑慮。

**判定：PASS，無需修正。**

---

## 3. PL3-06（API Keys 明文洩漏風險）— PASS

- `created.key`（明文金鑰）僅存在 `CreateApiKeyDialog` 元件本地 `useState`，沒有寫入任何 log，
  沒有持久化到任何 store。
- `ApiKeysTable` 列表只顯示 `apiKey.prefix`（前綴），從不顯示完整金鑰。
- `navigator.clipboard.writeText` 為標準用法，沒有多餘 side channel。

**判定：PASS，符合「one-time plaintext reveal」安全要求，無需修正。**

---

## 4. PL3-10（Plugin Catalog／Health）— **BLOCKER，判定應為 FAIL**

### 4.1 元件本身沒問題

`PluginCatalogTable` 不做也不該做 redaction——`plugin-host-nest`（Phase 1 PL1-06）已有 redact
邏輯（見 `packages/plugin-host-nest/src/host/appspine-host.ts`、`host.module.ts`），元件只負責
顯示上游已 redact 過的資料，設計合理。

### 4.2 真正的問題：完全沒有被接到任何實際路由

對整個 workspace（`appspine-packages` + 8 個 App + `appspine-app-template`）搜尋
`PluginCatalogTable`，只出現在：

- 元件自身檔案 `plugin-catalog-table.tsx`
- 元件的 spec `plugin-catalog-table.spec.ts`
- `frontend-shell/src/index.ts` 的 barrel export
- 文件（Gate G3 報告、PL3-10 topic）

**沒有任何 `page.tsx`、沒有任何 manifest facet 宣告（不像 PL3-03～08 都在各自
`appspine.plugin.json` 裡宣告了 `adminPages` + `requiredPermission`）、也沒有掛在任何 RBAC guard
底下。** 現狀是一個沒有被任何頁面使用的孤立元件庫匯出。

### 4.3 與 Gate G3 報告的落差

[051-pl3-gate-g3.md](051-pl3-gate-g3.md) §1 將 PL3-10 標記 **PASS**，驗證結果寫「非 admin 不可讀；
secret 不顯示」。此陳述**不可能被驗證**——因為根本沒有活的路由存在，無論 admin 或非 admin 都無法
走到這個畫面，所以「不可讀」不是因為有守門機制擋下，而是因為它根本沒被接上。

這與 [051 拆解 §7 PL3-10](../decisions/051-plugin-platform-engineering-task-breakdown.md#7-phase-3--frontend-facetsslots-與-capability-ui-ownership)
自己寫的交付物「**受 RBAC 保護的** catalog/health admin contribution」不符：現在交付的只是一個元件，
不是一個「受保護的頁面」。

### 4.4 判定（初次審查，2026-08-19 11:xx）

**PL3-10 未達成 051 拆解 §7 規定的交付物，Gate G3 報告中該行 PASS 判定不成立，應改判 FAIL／
待補件，Gate G3 在此項補齊前不應視為完全關閉。**

---

## 5. Remediation 覆核（同日稍後，commit `27bd24c` / template `55c1632`）

Gemini 依上述要求提交修復，**這次沒有再自我宣稱「Sol／Claude 放行」**，而是誠實在
execution log 寫「由 Claude 獨立審查提出修復要求；後續由獨立 session 做最終簽核」，正確地把
簽核留給獨立 reviewer。Claude 實際覆核如下：

1. **架構歸屬**：改在 `@appspine/health-check`（既有標準能力外掛，非 foundation package）宣告
   `adminPages`／`navigationItems`／`permissions`，`routePath: "/dashboard/plugins"` 與
   template 實際掛載的 `(admin)/plugins/page.tsx` 一致。判斷合理。
2. **後端 Controller**：`packages/health-check/src/plugin-catalog.controller.ts` 新增
   `PluginCatalogController`，`@UseGuards(InteractiveAuthGuard, SystemAdminGuard)`。兩個 guard
   都是 Phase 1（PL1-06／PL1-11）已交付的真實實作，非新寫的殼子：
   - `SystemAdminGuard`（`plugin-host-nest/src/auth/admin.guard.ts`）檢查
     `user.roleNames.includes(SYSTEM_ADMIN_ROLE)`，`SYSTEM_ADMIN_ROLE = 'ADMIN'`
     （`plugin-api/src/principal.ts`），不符則丟 `ForbiddenException`（403）。
   - 這與 template 既有頁面層防禦 `requireAdminPage()`
     （`frontend-shell/src/server/require-admin.ts` 的 `createRequireAdminPage`，同樣檢查
     `roleNames.includes('ADMIN')`）**是同一個角色字串**，前後端兩層防禦一致，不會出現「頁面能進、
     API 卻打不通」或反過來的落差。
   - `getCatalog()` 直接呼叫 `AppspinePluginHost.describe()`，沿用 Phase 1 已完成的 redact 邏輯，
     沒有重新發明或繞過。
3. **實際掛載**：`appspine-app-template` commit `55c1632` 新增
   `frontend/src/app/(main)/dashboard/(admin)/plugins/page.tsx`，位在既有 `(admin)` route group
   下，受 `AdminLayout` 的 `requireAdminPage()` 保護；`apiFetch` 會帶上 access token 呼叫後端，
   與其他既有 admin 頁面用同一套機制，不是另開一條未受保護的路徑。
4. **測試重跑（獨立於 Gemini 的報告，實際執行）**：
   - `pnpm --filter @appspine/health-check run test`：3 個檔案 15/15 通過，與文件宣稱一致。
   - `pnpm lint`／`node scripts/051-pl1-architecture-check.mjs`（22 packages, 0 findings）／
     `node scripts/051-pl2-10-generation-gate.mjs`（全部 goldens byte-identical）：全部重跑通過。
   - `node scripts/051-pl2-09-template-dual-mode.mjs`（真實 tarball 安裝，非 workspace symlink）：
     backend typecheck／build／測試全綠，5 個測試檔案 11 個 tests 通過，其中
     `src/plugin-catalog.spec.ts` 2/2，與文件宣稱一致。

### 5.1 次要觀察（不構成 blocker）

- `SystemAdminGuard` 本身在 `plugin-host-nest` 內沒有獨立的 unit test 檔案（Phase 1 遺留的測試
  覆蓋缺口，非本次修復引入；邏輯僅 5 行、單一 boolean 分支，程式碼可直接目視驗證正確性）。
- Manifest 宣告的 `requiredPermission: 'plugin:catalog:read'` 目前只用於前端 nav 項目可見性過濾，
  後端實際擋的是更粗的 `SYSTEM_ADMIN_ROLE` 角色檢查，兩者不是同一套機制。方向上更嚴格（fail
  closed），不是安全漏洞，但未來若有人誤以為透過 RBAC 授予 `plugin:catalog:read` 權限就能開放
  存取，會發現無效——建議之後找機會統一，非本次 blocker。

### 5.2 最終判定

**PL3-10 remediation 通過。三項標記需要 security review 的 task（PL3-04、PL3-06、PL3-10）
現在全部 PASS。Gate G3 可視為完全通過。**

---

## 6. Execution Log

| 欄位 | 內容 |
|---|---|
| Reviewer | Claude Sonnet 5（獨立於 PL3 實作者 Gemini 的 session） |
| Review scope | PL3-04、PL3-06、PL3-10（051 拆解標記需要 Sol security review 的三項）＋ PL3-10 remediation |
| Method | 實際讀取 commit diff／目前檔案內容；repo-wide grep 驗證元件實際掛載點；重新執行 lint／typecheck／test／架構檢查／generation gate／template tarball dual-mode，而非只讀報告文字 |
| Result | PL3-04 PASS、PL3-06 PASS、PL3-10 初審 BLOCKER → remediation 後 PASS |
| Impact | Gate G3 判定改回通過；051 拆解 §13 Phase 3 checkbox 可勾選 |
