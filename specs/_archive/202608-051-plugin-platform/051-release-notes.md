---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 - `appspine` 插件平台 2.0.0 Release Notes

> 發布版本：**2.0.0 (Plugin Platform Stable Release)**  
> 適用範圍：`appspine-packages` 全套件（22 個套件）、`appspine-app-template` 與消費端業務系統（8 個 App）。  
> 核心設計依據：[051-plugin-platform-engineering-plan.md](051-plugin-platform-engineering-plan.md)。

---

## 1. 架構變革摘要

`appspine` 2.0.0 標誌著從傳統的「共用套件組合式框架」正式邁入「**建置期組裝、宣告式治理、執行期注入驗證的插件平台**」。

### 核心演進亮點：
1. **宣告式插件清單（Declarative Inventory）**：
   - 透過 `appspine.plugins.json` 明確定義 App 所啟用的官方插件、Preset 與 App-local 插件。
   - 支援 `preset-standard` 一鍵啟用 10 個核心官方能力（Identity, OIDC, RBAC, M2M, Audit, Domain Events, MCP, Meta, Notification, Health）。
2. **建置期安全組裝（Build-time Composition）**：
   - **Backend**：`appspine build` 自動生成 `appspine.generated.module.ts`，根據插件依賴 DAG 拓撲排序，消除手動接線失誤。
   - **Prisma Schema**：Prisma Composer 自動聚合各插件的 Schema 片段，提供零飄移（Zero-drift）保證與 Migration Plan Dry-run。
   - **Permissions**：Permission Reconciler 自動彙整 Manifest 所宣告之權限，生成一致的 Seed 與授權矩陣。
   - **Frontend**：自動生成插件路由、頁面掛載點與 Navigation Slots，落實 Capability UI Ownership。
3. **穩定介面與解耦（Port & Injection Tokens）**：
   - 核心能力全面轉向 Ports & Adapters 架構（如 `RBAC_POLICY`、`AUDIT_SINK`、`MCP_TOOLS`、`DOMAIN_EVENT_PUBLISHER`、`SCOPE_MATCHER`），插件間不再直接耦合具體服務類別。
4. **雙模式與平滑升級（Dual-mode Architecture）**：
   - 全面支援 Plugin Mode 為預設，同時保留 `APPSPINE_PLUGIN_MODE=0` Legacy Escape Hatch，確保生產環境具備即時零風險回滾能力。
5. **完整診斷與檢測工具（Developer Experience & Doctor）**：
   - 提供 `appspine doctor`，在開發與開機階段即時診斷插件依賴衝突、缺少環境變數、Schema 飄移與權限衝突。

---

## 2. 22 個套件發布版本清單

| 套件名稱 | 發布版本 | 角色分類 | 說明 |
|---|---|---|---|
| `@appspine/plugin-api` | `1.1.0` | Platform Core | 插件 Manifest Schema (v1)、Tokens、Ports 與型別定義 |
| `@appspine/plugin-host-nest` | `2.0.0` | Platform Core | NestJS 插件宿主引擎、動態模組載入器、中立 Principal Context |
| `@appspine/plugin-cli` | `2.0.0` | Platform Core | `appspine` CLI 工具（build, doctor, init, plugin 管理） |
| `@appspine/plugin-testkit` | `2.0.0` | Platform Core | 插件測試工具箱、孤立 DI 模擬器、契約校驗器 |
| `@appspine/preset-standard` | `2.0.0` | Platform Core | 官方標準能力預設組合包（含 10 大核心插件） |
| `@appspine/identity-core` | `2.0.0` | Capability | 身分管理核心（使用者模型、CRUD、管理者防護） |
| `@appspine/oidc-auth` | `2.0.0` | Capability | OIDC 認證、JWT 驗證器、委派授權 Trust Profile |
| `@appspine/rbac` | `5.0.0` | Capability | 角色與權限控制（RBAC Policy Port、動態角色矩陣） |
| `@appspine/m2m-api-key` | `6.0.0` | Capability | 機器對機器 API Key 認證、速率限制、Scope Matcher |
| `@appspine/domain-events` | `9.0.0` | Capability | 領域事件匯流排、Webhook 訂閱、Delivery 重試引擎 |
| `@appspine/notification` | `1.0.0` | Capability | 通知中心服務、輪詢控制器、收件匣隔離 |
| `@appspine/mcp-server` | `1.0.0` | Capability | Model Context Protocol 工具註冊器與中繼控制端點 |
| `@appspine/metadata-schema` | `1.0.0` | Capability | 擴充欄位中繼資料定義、列舉多國語系校驗 |
| `@appspine/health-check` | `1.0.0` | Capability | 系統健康檢查端點、資料庫與相依性探針 |
| `@appspine/audit-log` | `1.1.0` | Capability | 稽核日誌寫入端點、`AUDIT_SINK` 介面實作 |
| `@appspine/oidc-delegation` | `0.4.0` | Capability | 服務間 OIDC 委派 Token 交換與客戶端代理 |
| `@appspine/master-data-client` | `0.2.0` | Connector | 主檔資料客戶端連接器 |
| `@appspine/auth` | `7.0.0` | Transition | 舊版相容門面（Transition-only Facade，標記 `@deprecated`） |
| `@appspine/frontend-shell` | `0.17.0` | Foundation | 前端通用 UI 元件、版面配置、主題切換與 API Client |
| `@appspine/common` | `0.3.4` | Foundation | 基礎共用工具函式與 Prisma 基礎模組 |
| `@appspine/e2e-kit` | `1.0.2` | Tooling | 端對端測試工具集與測試容器輔助 |
| `@appspine/integration-contracts` | `0.4.0` | Foundation | 跨應用整合契約規範與通訊協定介面 |

---

## 3. 重大變更與破壞性改動（Breaking Changes & Deprecations）

1. **`@appspine/auth` 正式列入過渡期門面（Deprecation Window）**：
   - 所有原先從 `@appspine/auth` 匯出的符號皆已加上 `@deprecated` 註解。
   - 建議使用者改由專屬套件匯入（`@appspine/identity-core`、`@appspine/oidc-auth`、`@appspine/plugin-host-nest`、`@appspine/rbac`）。
2. **Capability UI 元件由各插件前端 Facet 獨立提供**：
   - 原位於 `@appspine/frontend-shell` 的業務 Admin 元件（UsersTable, RolesTable, ApiKeysTable, DomainEventsTable 等）已移至各插件的 `./frontend` subpath。
   - 提供自動化 Codemod 腳本（`scripts/051-pl3-frontend-migration-codemod.mjs`）協助遷移。
3. **中立認證 Guard 取代特定套件 Guard**：
   - `@appspine/m2m-api-key` 的 `JwtOrApiKeyGuard` 已標記廢棄，全面改用 `@appspine/plugin-host-nest` 的中立 `AppspineAuthGuard`。
4. **`@Global()` 模組宣告相容性橋接**：
   - `RbacModule`、`McpModule`、`ApiKeysModule`、`AuditLogModule` 上的 `@Global()` 裝飾器為 Phase 4/5 過渡橋接，預計於下一個 Major 版本移除。

---

## 4. 遷移指南（Migration Guide）

若現有 App 欲從 1.x 升級至 2.0.0：
1. **安裝 CLI 與 Preset**：
   ```bash
   pnpm add -D @appspine/plugin-cli@^2.0.0
   pnpm add @appspine/preset-standard@^2.0.0 @appspine/plugin-host-nest@^2.0.0 @appspine/plugin-api@^1.1.0
   ```
2. **初始化宣告式清單**：
   建立 `appspine.plugins.json` 並宣告啟用 `"preset:standard"`。
3. **執行建置與組裝**：
   ```bash
   pnpm appspine build
   ```
4. **驗證系統健康狀態**：
   ```bash
   pnpm appspine doctor
   ```
5. **在 AppModule 中引入生成模組**：
   以 `AppspineGeneratedModule` 取代分散的手工 import。
