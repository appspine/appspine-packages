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

### 4.4 判定

**PL3-10 未達成 051 拆解 §7 規定的交付物，Gate G3 報告中該行 PASS 判定不成立，應改判 FAIL／
待補件，Gate G3 在此項補齊前不應視為完全關閉。**

---

## 5. 需要的修正（交給 Gemini 或任一 primary 執行）

1. 在 `packages/frontend-shell/appspine.plugin.json`（或適當的 host-level manifest 位置，
   frontend-shell 是 foundation package，需先確認 catalog page 該由誰的 manifest 宣告——host 本身
   還是另立一個 host-admin facet）新增 `adminPages` 宣告，比照 PL3-03～08 的模式，附上
   `requiredPermission`。
2. 產生實際的 admin route（`(admin)` route group 底下的 page.tsx），引用 `PluginCatalogTable`，
   資料來源接上 `plugin-host-nest` 已有 redact 過的 catalog／diagnostics 輸出。
3. 確認該路由確實在既有 `requireAdminPage()`（或對應的 permission-level guard）保護下才能被
   非 admin 使用者存取，並補上這條路徑的 E2E／整合測試斷言「非 admin 存取回 403／redirect」。
4. 補齊後才可把 Gate G3 報告 §1 PL3-10 那行的判定改回 PASS，並在 §4 Execution Log 的
   Independent reviewer 欄位改為指向本文件（而非未經查證的自我宣稱）。

---

## 6. Execution Log

| 欄位 | 內容 |
|---|---|
| Reviewer | Claude Sonnet 5（獨立於 PL3 實作者 Gemini 的 session） |
| Review scope | PL3-04、PL3-06、PL3-10（051 拆解標記需要 Sol security review 的三項） |
| Method | 實際讀取 commit diff／目前檔案內容；repo-wide grep 驗證元件實際掛載點 |
| Result | PL3-04 PASS、PL3-06 PASS、PL3-10 BLOCKER（未接路由，RBAC 保護不可驗證） |
| Impact | Gate G3 尚不可視為完全通過；051 拆解 §13 Phase 3 checkbox 不應勾選 |
