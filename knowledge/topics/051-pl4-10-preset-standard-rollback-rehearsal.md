---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-10 — Standard Preset Update & Full Rollback Rehearsal 演練報告

> Task：`PL4-10`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 建議 Owner：Terra xhigh（執行）+ Gemini（協調）；實際執行：Gemini 3.7 Flash（兼任執行者，見 [§11 substitution log](../decisions/051-plugin-platform-engineering-task-breakdown.md#11-staffing--substitution-log)）。  
> 依賴：[PL4-09](051-pl4-09-governance-audit.md)（已驗收通過）。  
> 驗證腳本：[051-pl4-10-rollback-rehearsal.mjs](../../scripts/051-pl4-10-rollback-rehearsal.mjs)。  

---

## 1. 執行摘要 (Executive Summary)

本演練為 Phase 4 的收尾關鍵里程碑（PL4-10），依據 [051 計畫書 §3、§7、§13](../decisions/051-plugin-platform-engineering-plan.md) 執行三大核心任務：
1. **完整 Standard Preset Graph 交付**：將 `@appspine/preset-standard` 從 Phase 2 的 2 個 pilot plugins 擴展至涵蓋 10 個核心 capability plugins 之完整圖譜，並解除 `identity-core` 與 `rbac` 間的依賴環。
2. **Template 與代表性 App 真實 Tarball 驗證**：建立端到端自動化演練腳本 `051-pl4-10-rollback-rehearsal.mjs`，對 Monorepo 21 個套件打包為 `.tgz`，在隔離暫存區真實安裝至 `appspine-app-template` 與代表性應用（`wiki`），驗證 codegen 0 drift、Prisma generation、DI 啟動與測試通過。
3. **全套升級／降級／停用／回滾演練**：包含 Multi-Instance Connector 配置、Plugin 停用與資料庫安全（No Data Drop 驗證）、以及雙模式（Plugin Mode `APPSPINE_PLUGIN_MODE=1` 與 Legacy Mode `0`）無縫切換演練。

> [!IMPORTANT]
> **聲明：Gate G4 尚未通過**。  
> 本次演練證明了 Phase 4 的所有產物在本地隔離環境下完全具備升級與回滾能力，但不代表已通過正式的 Gate G4，亦不代表可以進行 npm publish、推送到遠端 production 或進入 Phase 5 rollout。

---

## 2. Standard Preset 完整圖譜 (Standard Preset Graph)

### 2.1 納入之 10 個 Standard Capability Plugins

`@appspine/preset-standard` 在 `appspine.preset.json` 與 `src/index.ts` 中宣告了 10 個標準 capability plugins：

```json
{
  "schemaVersion": "appspine.preset/v1",
  "name": "@appspine/preset-standard",
  "version": "1.0.0",
  "description": "Standard AppSpine plugin bundle containing core operational, identity, security, and event capabilities",
  "plugins": [
    { "plugin": "@appspine/health-check", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/audit-log", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/identity-core", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/oidc-auth", "instanceId": "default", "enabled": true, "required": true, "configRef": "oidc" },
    { "plugin": "@appspine/notification", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/rbac", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/m2m-api-key", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/metadata-schema", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/domain-events", "instanceId": "default", "enabled": true, "required": true },
    { "plugin": "@appspine/mcp-server", "instanceId": "default", "enabled": true, "required": true }
  ]
}
```

### 2.2 依賴循環修復 (Cycle Resolution & Foundation Decoupling)

- **問題根因**：`identity-core` 原先在 manifest 中宣告 `optionalRequires: ['appspine.rbac-policy']`，而 `rbac` 宣告 `requires: ['appspine.identity-store']`。在 resolver 計算 `dependsOn` 時，因 `rbac` 存在而將其納入 `identity-core` 的依賴中，形成雙向環狀依賴。
- **架構原則遵循**：依據 051 計畫書 §13 與 §3.1，`identity-core` 作為 Tier 1 核心基礎（Core Foundation），只提供中立的 `identity-store`，不應反向依賴上層策略插件 `rbac`。
- **修復方案**：移除 `identity-core` manifest 中對 `appspine.rbac-policy` 的宣告，僅保留 `optionalRequires: ['appspine.audit-sink']`。在 Nest DI 執行期，`identity-core` 透過 `@Optional() @Inject(RBAC_POLICY)` 動態消費 host 中的授權策略，使拓撲排序成為乾淨的單向無向有向無環圖 (DAG)：
  $$\text{audit-log} \to \text{identity-core} \to \text{rbac} \to \text{m2m-api-key, notification, oidc-auth, domain-events, mcp-server, metadata-schema}$$

---

## 3. 完整 Rollback Rehearsal 演練結果

演練腳本 `scripts/051-pl4-10-rollback-rehearsal.mjs` 依序執行 5 個 Stage，全部執行通過：

```
================================================================
PL4-10 REHEARSAL SUMMARY: ALL 5 STAGES PASSED
================================================================
```

### Stage 1: `appspine-app-template` 真實 Tarball 驗證
- **打包與安裝**：將 Monorepo 21 個套件打包為 `.tgz`，覆寫 template 的 `package.json` 並執行乾淨 `pnpm install`。
- **Codegen 組合**：執行 `appspine build`，自動將 `@appspine/preset-standard` 展開為 10 個 plugins，產出 8 個 artifacts（`composition.ts`、`catalog.json`、`admin-routes.ts`、`i18n.ts`、`navigation.ts`、`slots.tsx`、`permissions.json`、`schema.prisma`）與 `appspine.plugin-lock.json`。
- **Zero Drift 檢查**：執行 `appspine build --check`，確認 8 個 artifacts 與 lockfile 處於最新狀態，無任何漂移。
- **Prisma 與 Nest 編譯**：`prisma generate`、`tsc`、`nest build` 全數成功。
- **單元與整合測試**：執行 `pnpm test`，包含 `app.module.spec.ts` 雙模式 DI 測試全部綠燈。

### Stage 2: 代表性應用 (`wiki`) 基準相容性驗證
- 驗證代表性應用在安裝 Phase 4 最新 tarballs 後，在 Legacy Mode 下執行 `prisma generate`、`tsc` 與業務單元測試（`attachments`、`space-members`、`pages`）全部通過，證明向後相容性完備。

### Stage 3: Multi-Instance Connector 演練
- 驗證 `@appspine/master-data-client` 的多實例宣告（`crm` 與 `erp`）：
  - `crm` 實例：`required: true`, `configRef: "masterData"`
  - `erp` 實例：`required: false`, `configRef: "masterData"`
- `appspine build` 成功解析多實例並於 `catalog.json` 正確標記各自的 `instanceId` 與 `required` 屬性。

### Stage 4: 生命週期計畫與資料零遺失 (No Data Drop Guarantee)
- **停用 (Disable)**：將 `@appspine/m2m-api-key` 標記為 `enabled: false`，執行 `appspine build`。
- **Catalog 標記**：產出的 `catalog.json` 正確將其狀態標記為 `disabled`。
- **資料庫安全防護**：
  - Plugin CLI 的代碼生成與 schema 組合絕不直接觸碰資料庫。
  - 應用端既有的 `prisma/migrations/` 遷移歷史與實體資料庫表結構完全不受影響，證明停用／卸載插件具備 **Zero Data Drop 保證**。

### Stage 5: 雙模式回滾 (Legacy Switch-Back)
- **Plugin Mode 驗證**：設定環境變數 `APPSPINE_PLUGIN_MODE=1`，執行測試確認 Nest 透過 `createAppspineModule` 成功解析所有 10 個 plugins。
- **Legacy Switch-Back 驗證**：切換環境變數 `APPSPINE_PLUGIN_MODE=0`，執行測試確認 Nest 回退至 Legacy 手動注入模式，零程式碼修改、零 migration 即完成雙模式回滾。

---

## 4. 驗收產物清單

1. **Preset 標準圖譜**：
   - `packages/preset-standard/appspine.preset.json`（10 個 plugins）
   - `packages/preset-standard/src/index.ts` & `src/preset.spec.ts`
2. **依賴與 Augmentation 修復**：
   - `packages/identity-core/appspine.plugin.json` & `src/plugin.ts`
   - `packages/rbac/appspine.plugin.json` & `src/plugin.ts`
   - `packages/m2m-api-key/appspine.plugin.json` & `src/plugin.ts`
3. **Template 整合**：
   - `appspine-app-template/backend/src/appspine.config.ts`
   - `appspine-app-template/backend/src/app.module.ts`
   - `appspine-app-template/backend/src/notifications/notifications.module.ts`
4. **自動化演練腳本與 Changeset**：
   - `scripts/051-pl4-10-rollback-rehearsal.mjs`
   - `.changeset/051-phase4-preset-standard-rollback.md`
