---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-02 — 遷移 `rbac` plugin（4A）

> Task：`PL4-02`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 依賴：[PL4-01](051-pl4-01-notification-plugin.md)、[PL2-07](051-pl2-07-permission-reconciler.md)、[PL1-10](051-pl1-pilot-plugins.md)（`identity-core`）。  
> Changeset：`.changeset/051-phase4-rbac-plugin.md`。  

---

## 1. 任務目標與交付範圍

`@appspine/rbac` 是 Phase 4 第二個遷移的標準業務 capability 套件（4A 第二項）。本 task 將其升級為符合 `appspine.plugin/v1` 規範的正式 Capability Plugin，完成 backend、frontend、prisma、permissions 四大 facets 整合、建立過渡期 `@Global()` 相容性橋接與退場規劃、完善 `./plugin` 入口與 classic/node10 模組解析 shim，並建立跨外掛穩定授權 Token 反轉與完整測試矩陣。

### 1.1 核心交付物

1. **Manifest 與 Facets 宣告（`appspine.plugin.json` & `src/plugin.ts`）**：
   - 宣告 `provides: ["appspine.rbac-policy"]`。
   - 宣告 `requires: ["appspine.identity-store", "appspine.prisma", "appspine.principal-context"]` 與 `optionalRequires: ["appspine.audit-sink"]`。
   - 宣告完整 4 大 Facets：
     - `backend`: `modulePath: "./dist/rbac.module.js"`, `exportName: "RbacModule"`, `global: true`（過渡期相容橋接）, `controllerRoutes: ["roles"]`, `providerTokens: ["appspine.rbac-policy"]`。
     - `frontend`: 貢獻 `adminPages` (`roles`), `navigationItems` (`roles`), `i18nNamespace: "rbac"`, `clientEntry: "./dist/frontend.js"`。
     - `prisma`: `owns: ["Role", "RolePermission", "UserRole"]`，`augments: [{ targetModel: "User", field: "userRoles", owner: "identity-core" }]`，`schemaFragment: "prisma/role.prisma"`, `schemaDigest: "sha256:bcecd51f14428efcbb36fa3ee65971459228741b0cfbb940f2883e2b3379cb5e"`。
     - `permissions`: 宣告 `rbac:role:create`, `rbac:role:update`, `rbac:role:delete`, `rbac:role:read`。

2. **過渡期 Compatibility Bridge 與 `@Global()` 退場規劃**：
   - 在 Phase 4 過渡期，`RbacModule` 維持 `@Global()`（並於 manifest `facets.backend.global` 標記為 `true`）。
   - **保留理由**：下游 9 個業務 App（`appspine-app-template` + `calendar`／`chat`／`wiki`／`drive`／`master-data`／`approve`／`projects`／`mcp-gateway`）共有 40+ 個 feature controllers 直接使用 `@UseGuards(PermissionGuard)`，而所屬 feature module 尚未進行顯式 import。若在 package 端直接拔除 `@Global()`，下游升級時會在 Nest bootstrap 階段因找不到 `PermissionGuard` 拋出 `UnknownDependenciesException` 導致開機失敗。
   - **退場規劃**：符合 Gate G4「已按設計移除或只剩有明確期限的 compatibility bridge」要求。此 `@Global()` 橋接將於 Phase 5 下游 App 進行 plugin mode 遷移或 codemod 補齊 feature-level wiring 後，在下一個 major release 徹底移除。
   - 模組內部以 `useExisting` 綁定 `RBAC_POLICY` 至 `RbacPolicyService`，並完整匯出 `RolesService`, `PermissionGuard`, `RbacAdminGuard`, `RbacPolicyService`, `RBAC_POLICY`。

3. **穩定授權 Token 與 `./plugin` 入口完善**：
   - 於 `src/plugin.ts` 導出 `RBAC_POLICY`（`Symbol.for('appspine.rbac-policy')`）、`SYSTEM_ADMIN_ROLE`、`SYSTEM_USER_ROLE`、`RbacPolicyPort`、`RoleGrant`、`PrincipalAuthorization` 等型別與常數。
   - 提供 `packages/rbac/plugin.js` 與 `packages/rbac/plugin.d.ts` 轉發 `./dist/plugin`，支援 Node10 / classic `moduleResolution`。

---

## 2. 驗證與測試覆蓋

本 task 建立了多維度的測試套件（8 個測試檔案，64 個單元與合約測試全數 PASS）：

### 2.1 單元與 Manifest 測試（`plugin.spec.ts`）
- 驗證 `appspine.plugin.json` 與 TS `rbacManifest` 100% deep-equal。
- 驗證通過嚴格模式的 `parsePluginManifest()`。
- 驗證 schema digest 與 `prisma/role.prisma` 完全一致。
- 驗證 backend（含 `global: true`）、frontend、prisma、permissions 4 大 facets 完整宣告。
- 驗證在 `identity-store`、`prisma`、`principal-context` 與 optional `audit-sink` 環境下的 host resolution。
- 驗證 backend factory 回傳 `RbacModule` 及公開 tokens/constants 輸出。

### 2.2 系統角色防護測試（`system-roles.spec.ts`）
- 驗證 `SYSTEM_ADMIN_ROLE` ('ADMIN') 與 `SYSTEM_USER_ROLE` ('USER') 系統角色常數。
- 驗證 ADMIN 系統角色的權限不可被編輯或取代（`assertPermissionsEditable` 阻擋並拋出 `BadRequestException`）。
- 驗證 ADMIN 與 USER 系統角色禁止被刪除（拋出 `BadRequestException("System roles cannot be deleted")`）。
- 驗證 `defaultRoleIds()`：資料庫已 seed USER 時回傳正確 ID；未 seed 時拋出 `NotFoundException` fail-fast。
- 驗證 `PermissionGuard` 對 `SYSTEM_ADMIN_ROLE` 進行 100% bypass。

### 2.3 權限策略與合併測試（`permission-policy.spec.ts`）
- 驗證 `buildUserContext` 與 `RbacPolicyService.flatten` 演算法輸出 100% 一致。
- 驗證策略階層合併規則：`ALLOW_ALL` (2) > `READ_ALL` (1) > `DENY_ALL` (0)。
- 驗證多角色指派時的策略提升（如 DENY_ALL + READ_ALL → READ_ALL；READ_ALL + ALLOW_ALL → ALLOW_ALL）。
- 驗證多角色之明確認證 permissions 自動去重 (deduplication)。

### 2.4 Guard 行為測試（`guards/permission.guard.spec.ts`）
- 驗證無權限要求或空陣列時自動放行。
- 驗證未帶 user 資訊時拋出 `ForbiddenException`。
- 驗證 `SYSTEM_ADMIN_ROLE` bypass。
- 驗證 `ALLOW_ALL` policy bypass。
- 驗證 `READ_ALL` policy 對 `*_READ` 權限自動放行、對寫入權限嚴格阻擋。
- 驗證 Explicit permissions 採 OR 邏輯比對。
- 驗證 Handler-level metadata 優先於 Class-level metadata。

### 2.5 資料模型 Augmentation 測試（`identity-augmentation.spec.ts`）
- 驗證 Prisma facet 宣告 `augments: [{ targetModel: "User", field: "userRoles", owner: "identity-core" }]`。
- 驗證 `rolesForUser(userId)` 能從 `UserRole` 關聯正確讀取並映射出 `RoleGrant[]`。
- 驗證 `replaceUserRoles(userId, roleIds, tx?)` 在單一 transaction 內原子性執行 delete-then-createMany；傳入空陣列時安全清除。

### 2.6 顯式 Bridge 與相容性測試（`explicit-bridge.spec.ts`）
- 驗證 `RbacModule` 在 Phase 4 過渡期保留 `@Global()` 裝飾器，確保下游既有 feature controllers 開機正常。
- 驗證 `RbacModule` 的 `providers` 與 `exports` 包含完整授權服務（`RolesService`、`PermissionGuard`、`RbacAdminGuard`、`RbacPolicyService`、`RBAC_POLICY`），為 Phase 5 移除 global 做好準備。
- 驗證透過 `rbacPlugin` backend factory 可乾淨組裝。

### 2.7 Legacy vs Plugin Parity 測試（`parity.spec.ts`）
- 驗證 `RbacModule` 內以 `useExisting` 綁定 `RBAC_POLICY` 至 `RbacPolicyService`。
- 對比直接調用 `RbacPolicyService` vs 透過 `RBAC_POLICY` token 調用：
  - `flatten` 輸出完全一致。
  - `rolesForUser` 輸出完全一致。
  - `defaultRoleIds` 輸出完全一致。
  - `replaceUserRoles` 資料操作與 transaction 傳遞完全一致。
- 驗證 `RolesService` 服務提供之完整性。

### 2.8 Monorepo 平台級整合檢驗
- `pnpm --filter @appspine/rbac test`: 8 test files, 64 tests 全數 PASS。
- `node scripts/051-pl1-architecture-check.mjs`: 22 packages (8 with manifests), 0 findings。
- `node scripts/051-pl2-10-generation-gate.mjs`: 20/20 checks PASS（包含 schema、catalog、composition 與 8 個 generated 構件驗證）。
- `node scripts/check-changeset-discipline.mjs`: Changeset discipline PASS。
- `node scripts/051-pl2-09-template-dual-mode.mjs`: 乾淨隔離環境 tarball 安裝、build、typecheck 及 Nest/Next unit tests 全數 PASS。
- `node scripts/lint-knowledge.js`: 108 docs, all PASSED。
- `pnpm lint`：641 檔案 0 errors, 0 warnings。
- `pnpm typecheck`：22 packages 0 errors。
- `pnpm test`：全倉庫單元與合約測試全數 PASS。

---

## 3. 回滾策略（Rollback Plan）

若 RBAC plugin 在 consumer 端整合出現未預期問題：
1. 既有 consumer 維持既有 import `RbacModule` 與 `RolesService`，因 `@Global()` 於過渡期獲得保留，現有 feature controllers 零破壞性影響。
2. 資料庫層面：Prisma schema fragment 結構未變更（`Role`, `RolePermission`, `UserRole` 保持完全相容），不會造成資料庫結構或資料遺失。
3. 可透過 Git 直接 revert 本 branch (`051-pl4-02-rbac-plugin`)，對其他 capability packages 無破壞性影響。

---

## 4. Execution Log & §11 Substitution Log

| 欄位 | 內容 |
|---|---|
| Task | `PL4-02` 遷移 `rbac` plugin（4A） |
| Actual agent | Gemini 3.7 Flash (High) |
| Required class | G2 (`implementation`) |
| Substitution reason | 本 session 由使用者指派 Gemini 執行；原 051 計畫建議 roster 為 Terra xhigh |
| Calibration | 依 051 §11 執行嚴格校準：宣告 4 大 facets（含 backend `global: true` compatibility bridge）、驗證 Prisma schema digest、透過 `RBAC_POLICY` token 實現授權解耦、驗證 User 模型雙向 augmentation、補充 classic 模組解析 shim。建立包含 system roles、permission policy、guard behavior、identity augmentation、explicit bridge、legacy parity 完整測試套件，並通過 monorepo 全套 6 大 platform gates |
| Independent reviewer (Permission) | Claude（Permission Semantics Review，已取得覆核意見） |
| Independent reviewer (Authorization) | Sol G3（Authorization & Security Review，待覆核／審批中） |
| Repos / Branches | `appspine-packages` (`051-pl4-02-rbac-plugin`) |
| Commit SHA | 見當前 branch commit 紀錄 |
| Evidence | 64/64 unit tests in `@appspine/rbac` pass; architecture check 0 findings; generation gate 0 findings; changeset discipline pass; template dual mode pass; lint 0 errors; typecheck 0 errors |
| 已知風險 | **過渡期 `@Global()` 相容性依賴**：下游 9 個業務 App 目前有 40+ 個 feature controllers 依賴全域 `PermissionGuard`。本版本採用 Gate G4 核准之 Compatibility Bridge 方案暫時保留 `@Global()`，以避免下游升級開機 crash；真正移除已明確排入 Phase 5 App 遷移階段 |
| 下一任務前置 | PL4-03 遷移 `m2m-api-key` plugin（4A） |
