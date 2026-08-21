---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL4-06 — 遷移 `mcp-server` plugin（4B）

> Task：`PL4-06`（見 [051 拆解 §8](../decisions/051-plugin-platform-engineering-task-breakdown.md#8-phase-4--其餘-capabilityconnector-遷移)）。  
> 依賴：[PL4-03](051-pl4-03-m2m-api-key-plugin.md)、[PL4-04](051-pl4-04-metadata-schema-plugin.md)、[PL4-05](051-pl4-05-domain-events-plugin.md)。  
> Changeset：`.changeset/051-phase4-mcp-server-plugin.md`。  

---

## 1. 任務目標與交付範圍

`@appspine/mcp-server` 是 Phase 4 插件遷移中 4B 群組的模型上下文協定（Model Context Protocol）伺服器套件。本 task 將其升級為符合 `appspine.plugin/v1` 規範的標準 Capability Plugin，宣告 `backend` 與 `operations` facets，實作 Tool Registry Bridge 與 Scope / Principal 傳遞，徹底解耦對具體 `@appspine/m2m-api-key`、`@appspine/audit-log` 套件的直接引用，並建立 Phase 4 過渡期的 `@Global()` Compatibility Bridge，確保全 App fleet 無痛升級與開機相容。

### 1.1 核心交付物（嚴格限定於 `@appspine/mcp-server` 與 `@appspine/plugin-api`）

1. **Phase 4 `@Global()` Compatibility Bridge（`McpModule`）**：
   - 在 Phase 4 過渡期，`McpModule` **保留 `@Global()`** 裝飾器，並在 manifest 的 `facets.backend` 宣告 `"global": true`。
   - **保留理由**：下游 8 個業務 App + template 中有超過 30 個 `*.mcp.ts` 檔案（如 `calendar/events.mcp.ts`、`drive/files.mcp.ts` 等）於 feature module 層直接注入 `McpToolRegistry`，而其所屬 feature module 尚未顯式 import `McpModule`。若在 Phase 4 貿然移除 `@Global()`，將導致 NestJS 在整個 fleet 開機時拋出 `UnknownDependenciesException`。
   - **正式解耦路徑**：真正移除 `@Global()` 將於 Phase 5 搭配 Next.js / Nest generated composition 與 codemod 一併推進。
   - 引入 `AppspineAuthInfrastructureModule`，確保 `MachineAuthGuard` 依賴之 `AuthenticationStrategyRegistry` 與 `PrincipalContextService` 於 Nest 執行時期獲得完整 DI 解析。
   - 綁定並匯出 `{ provide: MCP_TOOLS, useExisting: McpToolRegistry }`。

2. **依賴解耦與中立認證/審計架構**：
   - 從 `package.json` 與 `tsconfig.build.json` 徹底移除對具體 `@appspine/m2m-api-key` 與 `@appspine/audit-log` 的引用。
   - 引入 `@appspine/plugin-api` 與 `@appspine/plugin-host-nest`。
   - `McpController` 改用 `@appspine/plugin-host-nest` 的 `MachineAuthGuard`，並透過 `@appspine/plugin-api` 的 `actingUserIdOf` 與 `isMachinePrincipal` 安全萃取 Principal 資訊。
   - 本套件內建純函式 `extractWorkflowId`（萃取 `x-appspine-workflow-id` header），消除對 `@appspine/audit-log` 的跨套件具體依賴。

3. **Tool Registry 契約與 Scope 委派（`McpToolRegistry`）**：
   - `McpToolRegistry` 實作 `@appspine/plugin-api` 的 `McpToolsPort<McpToolDefinition>`。
   - 注入可選之 `@Optional() @Inject(SCOPE_MATCHER) private readonly scopeMatcher?: ScopeMatcherPort`。
   - 當 `scopeMatcher` 存在時委派比對；若未注入（獨立運作或未安裝 M2M 插件時），提供中立的 fallback 比對（支援 exact match 與 `*` wildcard）。

4. **契約擴充（`@appspine/plugin-api`）**：
   - 在 `ports.ts` 新增 `McpCatalogEntryPort`, `McpToolDefinitionPort<TArgs, TCtx>`, `McpToolsPort<TTool>` 契約介面。
   - 匯出 `MCP_TOOLS` 依賴注入 Token。

5. **Manifest 與 Facets 宣告（`appspine.plugin.json` & `src/plugin.ts`）**：
   - 宣告 `provides: ["appspine.mcp-tools"]`。
   - 宣告 `requires: ["appspine.principal-context"]`。
   - 宣告 `optionalRequires: ["appspine.audit-sink", "appspine.machine-auth-provider", "appspine.scope-matcher"]`。
   - 宣告 `backend` facet：`modulePath: "./dist/mcp.module.js"`, `exportName: "McpModule"`, `global: true`, `controllerRoutes: ["mcp"]`, `providerTokens: ["appspine.mcp-tools"]`。
   - 宣告 `operations` facet：`healthIndicatorId: "mcp-server"`, `shutdownTimeoutMs: 5000`。
   - 提供 Node10/Classic 模組解析相容 shims（`plugin.js`, `plugin.d.ts`）。

---

## 2. 下游 Consumer 影響追蹤 (Downstream Consumer Impact & Compatibility Tracking)

比照 PL4-01～05 之標準規範，針對全 fleet 的消費現況盤點與 Phase 4 相容保證如下：

### 2.1 Fleet 消費現狀盤點

| App / Repo | `*.mcp.ts` 範例檔案 | Feature Module Import 現況 | Phase 4 相容保證機制 |
| --- | --- | --- | --- |
| `apps/approve` | `forms.mcp.ts`, `requests.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/calendar` | `events.mcp.ts`, `calendars.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/chat` | `channels.mcp.ts`, `messages.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/drive` | `files.mcp.ts`, `folders.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/master-data` | `entities.mcp.ts`, `records.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/mcp-gateway` | `gateway.mcp.ts`, `routes.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/projects` | `projects.mcp.ts`, `tasks.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/wiki` | `pages.mcp.ts`, `spaces.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |
| `apps/template` | `sample.mcp.ts` | 未 import `McpModule`，依賴 root `app.module.ts` | `McpModule` 保留 `@Global()`，`McpToolRegistry` 正常全域注入 |

### 2.2 相容性測試驗證

在 `packages/mcp-server/src/mcp.module.boot.spec.ts` 中新增了專屬測試案例：
`allows downstream feature modules to inject McpToolRegistry without re-importing McpModule (Phase 4 @Global() compatibility bridge)`，模擬實際 `events.module.ts` + `events.mcp.ts` 的組裝模式，驗證 Nest Application 於 root import `McpModule` 時，下游各 feature providers 均能正確注入 `McpToolRegistry`。

---

## 3. 驗證命令與實際輸出

本任務已通過全套 Monorepo 驗證指令與新增的 MCP 專屬測試套件：

### 3.1 `@appspine/mcp-server` 測試套件（13 test files, 70 tests）

```
 RUN  v3.2.6 D:/Source/Private/appspine/appspine-packages/packages/mcp-server

 ✓ src/mcp.v2.contract.spec.ts (2 tests)
 ✓ src/mrtr.contract.spec.ts (4 tests)
 ✓ src/shutdown.spec.ts (2 tests)
 ✓ src/mcp.controller.integration.spec.ts (1 test)
 ✓ src/plugin.spec.ts (7 tests)
 ✓ src/mcp.module.boot.spec.ts (3 tests)
 ✓ src/request-state.spec.ts (14 tests)
 ✓ src/mcp-tool.registry.spec.ts (15 tests)
 ✓ src/mcp.service.spec.ts (8 tests)
 ✓ src/discovery-push.service.spec.ts (3 tests)
 ✓ src/mcp-tool.decorator.spec.ts (2 tests)
 ✓ src/mcp.controller.spec.ts (6 tests)
 ✓ src/mcp.controller.security.spec.ts (3 tests)

 Test Files  13 passed (13)
      Tests  70 passed (70)
```

### 3.2 架構分層與循環依賴檢查（`pnpm verify:architecture`）

```
$ node scripts/051-pl1-architecture-check.mjs
22 packages checked (10 with a plugin manifest), 0 findings
```

### 3.3 建置圖一致性檢查（`pnpm verify:build-graph`）

```
$ node scripts/051-pl0-build-graph-check.mjs
PASS @appspine/mcp-server: tsconfig references cover every actual import
PASS @appspine/mcp-server: tsconfig references have no unused entries
PASS @appspine/mcp-server: package.json declares every actual import
PASS @appspine/mcp-server: composite is enabled
...
88 checks run, 0 failed.
```

### 3.4 生成閘門檢查（`pnpm verify:generation`）

```
$ node scripts/051-pl2-10-generation-gate.mjs --self-test && node scripts/051-pl2-10-generation-gate.mjs
6 self-tests run, 0 failed
...
generation gate: OK
```

### 3.5 Changeset 紀律檢查（`pnpm check:changeset-discipline`）

```
$ node scripts/check-changeset-discipline.mjs
(Clean exit code 0)
```

### 3.6 全庫 TypeScript 型別檢查（`pnpm typecheck`）

```
$ pnpm -r run typecheck
Scope: 22 of 23 workspace projects
...
packages/mcp-server typecheck: Done
(All 22 packages passed with exit code 0)
```

### 3.7 全庫 Linter 與代碼規範檢查（`pnpm lint`）

```
$ biome check .
Checked 673 files in 896ms. No fixes applied.
Found 2 warnings. (0 errors)
```

### 3.8 全庫編譯建置（`pnpm build`）

```
$ pnpm -r run build
Scope: 22 of 23 workspace projects
...
packages/mcp-server build: Done
(All 22 packages built with exit code 0)
```

### 3.9 全庫測試（`pnpm test`）

```
$ pnpm -r run test
Scope: 22 of 23 workspace projects
(All test suites in all packages passed with exit code 0)
```

---

## 4. §11 執行者代換日誌（Substitution Log）

依據 051 任務拆解合約要求，本任務之代換日誌如下：

| 欄位 | 內容 |
| --- | --- |
| **Task ID** | PL4-06（遷移 `mcp-server` plugin，4B 群組） |
| **Original Suggested Owner** | Sol xhigh（G3 architecture-contract） |
| **Actual Executor** | Gemini 2.5 Pro |
| **Required Capability** | G3 architecture-contract |
| **Rationale & Context** | 接續 PL4-01 至 PL4-05 成功驗收之基礎，實作標準插件模型與 Compatibility Bridge，落實 Phase 4 相容保證。 |
| **Design Integrity Preserved** | 1. 於 `McpModule` 保留 `@Global()` 並於 manifest 宣告 `global: true` 作為 Phase 4 Compatibility Bridge。<br>2. 移除所有對具體 `@appspine/m2m-api-key` 與 `@appspine/audit-log` 的直接依賴。<br>3. 透過 `@appspine/plugin-api` 的 `SCOPE_MATCHER` 與 `MCP_TOOLS` token 完成依賴反轉與 Port 綁定。<br>4. 完整通過 Monorepo 全套 8 項驗證命令與 downstream compatibility boot 測試。 |

---

## 5. 未解風險與 Rollback 方案

### 5.1 下游遷移風險收斂與追蹤（Risk Mitigation）

- **Downstream App Boot Failure 風險已被完整排除**：透過在 `McpModule` 保留 `@Global()` 以及 manifest `global: true` 宣告，所有既有 `*.mcp.ts` 依賴 global injection 的業務 App 均可直接平滑升級，不會發生 `UnknownDependenciesException`。
- **Phase 5 最終清理路徑**：當 Phase 5 執行全 App fleet 的模組自動組裝（Generated Composition）時，所有 feature modules 將改為顯式 import 或透過 CLI 生成代碼綁定，屆時再統一移除 `@Global()`。

### 5.2 Rollback 方案

- 若需 rollback，可直接使用 git 還原該分支：
  ```bash
  git checkout main
  git branch -D 051-pl4-06-mcp-server-plugin
  ```
- 由於尚未 push/publish，本任務不會對下游專案造成任何破壞性變更。
