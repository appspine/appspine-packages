---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-07 — 遷移 `oidc-delegation` plugin（4C）

> Task：`PL4-07`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 建議 Owner：Gemini（G2 `repo-integration`）；實際執行：Gemini 3.7 Flash（Thinking: High）。  
> 依賴：[PL1-12](051-pl0-package-classification.md)（`@appspine/oidc-auth`）、[PL4-05](051-pl4-05-domain-events-plugin.md)（`domain-events`，已驗收）。  
> Changeset：`.changeset/051-phase4-oidc-delegation-plugin.md`。  

---

## 1. 任務目標與交付範圍

`@appspine/oidc-delegation` 是 Phase 4 插件遷移中 4C 群組的 OIDC 身分委派（OAuth 2.0 RFC 8693 Token Exchange）Connector/Adapter 套件。本 task 將其升級為符合 `appspine.plugin/v1` 規範的標準 Connector Plugin，宣告 `backend` 與 `operations` facets、提供 `appspine.identity-delegation` capability、實作 `IdentityDelegationPort`、定義 `DelegatedPrincipalContext` 契約、規範 config schema 與環境變數之 secret redaction，並引用已核准之跨 App Integration Contracts，同時確保原有 `OidcDelegationModule.forRoot()` 與 `./testing` 的 100% 舊版相容性。

### 1.1 核心交付物

1. **Manifest 與 Facets 宣告（`appspine.plugin.json` & `src/plugin.ts`）**：
   - 宣告 `provides: ["appspine.identity-delegation"]`。
   - 宣告 `cardinality: "singleton"`, `distribution: "official"`。
   - 宣告 `configSchema: { "configRef": "oidcDelegation" }`。
   - 宣告環境變數清單，並為機密變數 `OIDC_DELEGATION_SOURCE_CLIENT_SECRET` 嚴格設定 `secret: true`。
   - 宣告 `backend` facet：`modulePath: "./dist/oidc-delegation.module.js"`, `exportName: "OidcDelegationModule"`, `providerTokens: ["appspine.identity-delegation"]`。
   - 宣告 `operations` facet：`healthIndicatorId: "oidc-delegation"`, `metricsPrefix: "oidc_delegation"`, `shutdownTimeoutMs: 5000`。
   - 引用跨 App 契約：`approve.submit-knowledge-document-change` 與 `wiki-to-approve.submit-knowledge-document-change`。
   - 提供 Node10/Classic 模組解析相容 shims（`plugin.js`, `plugin.d.ts`）。

2. **Delegated Principal 契約與 Ports 擴充（`@appspine/plugin-api`）**：
   - 在 `packages/plugin-api/src/ports.ts` 新增 `IdentityDelegationPort`、`ExchangeDelegatedTokenPortInput`、`DelegatedAccessTokenResult`。
   - 在 `packages/plugin-api/src/principal.ts` 新增 `DelegatedPrincipalContext`。
   - `OidcDelegationService` 實作 `IdentityDelegationPort`。

3. **Connector Config Schema 與 Validation（`packages/oidc-delegation/src/config.ts`）**：
   - 封裝 `oidcDelegationConfigSchema`，整合既有 `validateOidcDelegationModuleOptions`，在插件載入與啟動時進行嚴格驗證。
   - 提供 `OIDC_DELEGATION_CONFIG` 與 `OidcDelegationConfig` 型別定義。

4. **DI 綁定與 Legacy Parity（`OidcDelegationModule`）**：
   - 在 `OidcDelegationModule.forRoot()` 與 plugin descriptor 的 backend factory 中均綁定並匯出 `IDENTITY_DELEGATION` token（`Symbol.for('appspine.identity-delegation')`）。
   - 既有以 Nest Dynamic Module 方式消費之應用程式零破壞。

---

## 2. 下游 Consumer 影響追蹤與相容性保證

依據 [048 套件盤點計畫](../decisions/048-shared-packages-cleanup-scoping-plan.md)，`oidc-delegation` 是被動等待跨 App 委派需求（如 Wiki → Approve 知識審核流程）的 Connector 套件。

1. **Zero Breaking Changes**：所有公開型別、錯誤類別（`OidcDelegationError`、`PolicyConfigurationError` 等）、服務方法（`exchange()`）、測試輔助庫（`@appspine/oidc-delegation/testing`）維持原樣。
2. **Dual-Mode Import**：既有 Consumer 可繼續使用 `import { OidcDelegationModule } from '@appspine/oidc-delegation'`，新版 Host 亦可透過 `import { oidcDelegationPlugin } from '@appspine/oidc-delegation/plugin'` 以宣告式載入。

---

## 3. 驗證命令與實際輸出

本任務已通過全套 Monorepo 驗證指令與專屬測試套件：

### 3.1 `@appspine/oidc-delegation` 單元與整合測試（8 test files, 88 tests）

```
 RUN  v3.2.6 D:/Source/Private/appspine/appspine-packages/packages/oidc-delegation

 ✓ src/policy-registry.spec.ts (15 tests)
 ✓ src/subject-token-sanity-check.spec.ts (8 tests)
 ✓ src/module-options-validation.spec.ts (10 tests)
 ✓ src/observability/outbound-throttle.spec.ts (2 tests)
 ✓ src/providers/keycloak-token-exchange.provider.spec.ts (23 tests)
 ✓ src/oidc-delegation.service.spec.ts (13 tests)
 ✓ src/observability/security-event-log.spec.ts (3 tests)
 ✓ src/plugin.spec.ts (14 tests)

 Test Files  8 passed (8)
      Tests  88 passed (88)
```

### 3.2 全套件建置與型別檢查

- `pnpm -r run build`：全 22 個 package 建置成功，`tsc -b` 乾淨無警告。
- `pnpm -r run typecheck`：全 22 個 package 型別檢查通過（0 errors）。
- `pnpm -r run test`：全 22 個 package 所有單元與整合測試全部 PASS。
- `pnpm run lint`：Biome 檢查通過（0 errors, 2 allowed static warnings）。

### 3.3 平台架構與契約驗證

- `node scripts/051-pl1-architecture-check.mjs`：22 packages checked (11 with a plugin manifest), 0 findings.
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
- **無未解架構風險**：`oidc-delegation` 本身為無狀態、backend-only 的 outbound token exchange connector，不持有 Prisma schema，不具備 `@Global()` 依賴污染問題。

### 4.2 Rollback 策略
- 若需回滾，只需 revert 本次 commit，原有 `@appspine/oidc-delegation` 即可回到純 Dynamic Module 模式；對現有 App 無任何運行時損害。

### 4.3 下一 Task（PL4-08 `master-data-client`）前置條件確認
- PL4-08 所需之 `appspine.identity-delegation` capability 已由本 task 正式提供，並完成 manifest 與 token 宣告。
- `master-data-client` 在 multi-instance 模式下對 `appspine.identity-delegation` 的依賴路徑已完全就緒。
