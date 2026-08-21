---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-08 — 遷移 `master-data-client` multi-instance plugin（4C）

> Task：`PL4-08`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 建議 Owner：Gemini（G2 `repo-integration`）；實際執行：Gemini 3.7 Flash（Thinking: High）。  
> 依賴：[PL4-07](051-pl4-07-oidc-delegation-plugin.md)（`oidc-delegation`，已驗收）、[PL1-05](051-pl1-plugin-platform-core.md)（dependency resolver 與 deterministic graph）。  
> Changeset：`.changeset/051-phase4-master-data-client-plugin.md`。  

---

## 1. 任務目標與交付範圍

`@appspine/master-data-client` 是 Phase 4 插件遷移中 4C 群組的多實例主檔同步/快取（Master Data Sync/Cache）Connector/Adapter 套件。本 task 將其升級為符合 `appspine.plugin/v1` 規範的標準 Multi-Instance Connector Plugin：
1. 宣告 `cardinality: "multiple"` 與 `provides: ["appspine.master-data-client"]`。
2. 支援 stable `instanceId` 與 instance-aware token（`Symbol.for('appspine.master-data-client#<instanceId>')`）、config、health 與 metrics prefix。
3. 在 `@appspine/plugin-api` 定義 `MasterDataClientPort`，並由 `MasterDataReconciliationService` 實作。
4. 宣告 connector config schema 驗證與環境變數 `MASTER_DATA_API_KEY` 之機密遮蔽（secret redaction）。
5. 實作雙端點實例隔離（instance isolation）、重複/改名實例防護（duplicate/renamed instance migration policy）、部分實例降級（partial degradation）與安全關機（shutdown cleanup），並維持 100% 舊版相容性（Legacy Parity）。

### 1.1 核心交付物

1. **Manifest 與 Facets 宣告（`appspine.plugin.json` & `src/plugin.ts`）**：
   - 宣告 `cardinality: "multiple"`, `distribution: "official"`。
   - 宣告 `provides: ["appspine.master-data-client"]`。
   - 宣告 `requires: ["appspine.identity-delegation"]`, `optionalRequires: ["appspine.audit-sink"]`。
   - 宣告 `configSchema: { "configRef": "masterData" }`。
   - 宣告環境變數：`MASTER_DATA_ENDPOINT` (non-secret)、`MASTER_DATA_API_KEY` (secret: true)。
   - 宣告 `optionalFailurePolicy: { "isolationBoundary": "instance", "degradedBehavior": { "readiness": "degraded", "catalog": "degraded", "alert": "required" } }`。
   - 宣告 `backend` facet：`modulePath: "./dist/master-data-client.module.js"`, `exportName: "MasterDataClientModule"`。
   - 宣告 `operations` facet：`healthIndicatorId: "master-data-client"`, `metricsPrefix: "master_data_client"`, `shutdownTimeoutMs: 5000`。
   - 提供 Node10/Classic 模組解析相容 shims（`plugin.js`, `plugin.d.ts`）。

2. **Connector Contract 與 Ports 擴充（`@appspine/plugin-api`）**：
   - 在 `packages/plugin-api/src/ports.ts` 新增 `MasterDataClientPort`（含 `start()`, `stop()`, `reconcileAll()`）。
   - `MasterDataReconciliationService` 實作 `MasterDataClientPort`。

3. **Multi-Instance Backend Factory 與 Instance-Aware Tokens（`src/plugin.ts`）**：
   - 依據 `ctx.instanceId` 動態綁定合格實例 token `capabilityInstanceToken('appspine.master-data-client', instanceId)`，同時輸出通用 `MASTER_DATA_CLIENT` token。
   - 各實例獨立解析配置並實例化獨立之 `MasterDataReconciliationService`。

4. **Connector Config Schema 與 Validation（`packages/master-data-client/src/config.ts`）**：
   - 封裝 `masterDataClientConfigSchema` 與 `validateMasterDataClientConfig`，嚴格驗證 endpoint、apiKey、intervalMs、autoStart 與 entities 欄位。

5. **DI 綁定與 Legacy Parity（`MasterDataClientModule`）**：
   - 在 `MasterDataClientModule.forRoot()` 與 `forRootAsync()` 中綁定並匯出 `MASTER_DATA_CLIENT` token，確保既有 Nest Dynamic Module 消費者零破壞。

---

## 2. 下游 Consumer 影響追蹤與相容性保證

依據 [051 計畫 §4.4](../decisions/051-plugin-platform-engineering-plan.md#44-singleton-與-multi-instance)，`master-data-client` 是平台目前唯一已知的 `cardinality: multiple` connector 套件。

1. **Zero Breaking Changes**：所有公開型別（`MirrorRecord`、`MirrorModel`、`MasterDataEventRecord` 等）、工廠函式（`createMasterDataSyncHandler`）、對賬輔助函式（`reconcileEntity`）與服務方法維持原樣。
2. **Dual-Mode Import**：既有 Consumer 可繼續使用 `import { MasterDataClientModule, createMasterDataSyncHandler } from '@appspine/master-data-client'`，新版 Host 亦可透過 `import { masterDataClientPlugin } from '@appspine/master-data-client/plugin'` 進行多實例宣告式掛載。

---

## 3. 驗證命令與實際輸出

本任務已通過全套 Monorepo 驗證指令與專屬測試套件：

### 3.1 `@appspine/master-data-client` 單元與整合測試（3 test files, 28 tests）

```
 RUN  v3.2.6 D:/Source/Private/appspine/appspine-packages/packages/master-data-client

 ✓ src/sync-handler.factory.spec.ts (5 tests)
 ✓ src/reconciliation/reconciliation.service.spec.ts (3 tests)
 ✓ src/plugin.spec.ts (20 tests)

 Test Files  3 passed (3)
      Tests  28 passed (28)
```

### 3.2 全套件建置與型別檢查

- `pnpm -r run build`：全 22 個 package 建置成功，`tsc -b` 乾淨無警告。
- `pnpm -r run typecheck`：全 22 個 package 型別檢查通過（0 errors）。
- `pnpm -r run test`：全 22 個 package 所有單元與整合測試全部 PASS。
- `pnpm run lint`：Biome 檢查通過（0 errors, 2 allowed static warnings）。

### 3.3 平台架構與契約驗證

- `node scripts/051-pl1-architecture-check.mjs`：22 packages checked (12 with a plugin manifest), 0 findings.
- `node scripts/051-pl2-10-generation-gate.mjs`：generation gate: OK (all 20 composition/golden tests passed).
- `node scripts/051-pl0-build-graph-check.mjs`：88 checks run, 0 failed.
- `node scripts/051-pl0-manifest-fixture-check.mjs`：20 fixtures checked, 0 failed.
- `node scripts/051-pl0-identity-contract-check.mjs`：6 checks run, 0 failed.
- `node scripts/051-pl0-prisma-composer-check.mjs`：5 checks run, 0 failed.
- `node scripts/051-pl0-permission-reconciler-check.mjs`：7 checks run, 0 failed.
- `node scripts/check-changeset-discipline.mjs`：Changeset 格式與套件範圍完全合規。
- `node scripts/lint-knowledge.js`：知識庫文件格式、連結與狀態一致性通過。

---

## 4. 未解風險、Rollback 策略與後續 Task 前置條件

### 4.1 未解風險
- **無未解架構風險**：`master-data-client` 在 multi-instance 下透過 `Symbol.for('appspine.master-data-client#<instanceId>')` 完成完全隔離，不持有 Prisma schema，無 `@Global()` 依賴污染風險。

### 4.2 Rollback 策略
- 若需回滾，只需 revert 本次 commit，原有 `@appspine/master-data-client` 即可回到純 Dynamic Module 模式；對現有 App 無任何運行時損害。

### 4.3 下一 Task（PL4-09 `package coverage/governance audit`）前置條件確認
- PL4-01 至 PL4-08 全部 8 個 Phase 4 capability/connector plugins 已全數完成遷移與驗收。
- 全 Monorepo 12 個 plugin manifests 完全合規，已為 PL4-09 的全套件 coverage/governance 審計提供完整基底。
