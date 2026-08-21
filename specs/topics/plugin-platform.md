---
type: topic
scope: cross-repo
status: active
created: 2026-08-20
updated: 2026-08-20
---

# 插件平台 (Plugin Platform) 規格與架構指南

本文件記錄 `appspine` 插件平台 (Plugin Platform 2.0.0) 的最終運作架構、核心元件與開發指引。

---

## 一、 核心概念與拓撲

插件平台採用 **「npm 套件安裝 + 顯式設定 + 建置期組裝 + 啟動時驗證 + 執行期 registry 擴充」** 的模型。

### 1.1 核心元件
- **Host (宿主)**：消費插件的業務系統 App。Host 通過 `appspine.plugins.json` 聲明啟用的插件與設定。
- **Capability Plugin (能力插件)**：封裝了後端 NestJS Module、前端 Facet/Slots、Prisma schema 局部與權限 Fixture 的獨立 npm 套件。
- **Preset (預設配置)**：一組官方推薦安裝的插件集合（如 `@appspine/preset-standard`），避免 Host 手工逐一配置基礎插件。
- **Facet (插件局部)**：一個插件依其部署環境，可分為 backend facet（NestJS 模組）、frontend facet（Next.js slots 組件）與 database facet（Prisma schemas）。
- **Manifest (`manifest.json`)**：聲明插件標識、版本、導出的 facets、需要的環境變數、相依性以及所要求的 RBAC 權限。
- **Lockfile (`appspine.plugin-lock.json`)**：CLI 工具在 `build` 階段解析完相依性後產出的鎖定檔案，確保 Host 與 100% 確定性的插件版本及設定一致。

---

## 二、 CLI 使用指引 (`plugin-cli`)

Host 專案與插件開發者皆透過 `@appspine/plugin-cli` 進行生命週期管理：

- **`plugin-cli add <plugin-name>`**：安裝指定插件，將其寫入 `appspine.plugins.json` 並更新相依性。
- **`plugin-cli remove <plugin-name>`**：安全移除插件，清理 runtime config 與 composition。
- **`plugin-cli list`**：列出當前啟用的所有插件、版本、健康狀態與導出的 facets。
- **`plugin-cli build`**：
  1. 解析 `appspine.plugins.json` 與相依插件的 manifests。
  2. 進行 `Prisma Schema` 組合，並將代碼發送至 `Prisma Generator`。
  3. 產生 NestJS 組裝入口與 Next.js 頁面路由代碼。
  4. 輸出 `appspine.plugin-lock.json`。
- **`plugin-cli doctor`**：靜態檢查是否有環境變數缺漏、循環相依、Prisma 模型衝突或重複的 NestJS Provider Token。

---

## 三、 Prisma Schema 組合機制

為了解決分散式插件擁有自己資料模型的需求，平台導入了建置期 schema 合併機制：

### 3.1 `owns` 與 `augments`
- **`owns` (主體模型)**：插件完全持有的資料庫實體。例如，`rbac` 插件擁有 `Role` 與 `UserRole` 模型。
- **`augments` (擴充模型)**：插件對 Host 或其他插件模型的擴充欄位。例如，`auth` 插件需要擴充 Host 的 `User` 模型，增加 `oidcSub` 欄位。

### 3.2 Prisma Composer 工作流
1. CLI 掃描所有啟用插件的 `*.prisma` 片段。
2. 檢查 `owns` 命名衝突（禁止重複宣告同名 Model）。
3. 將 `augments` 宣告的欄位安全地編譯合併至對應的主體 Model 中。
4. 輸出一個整體的 `schema.prisma` 到 Host 的 `prisma/` 目錄，供開發者進行 `prisma migrate` 與產生 Prisma Client。

---

## 四、 Permission Reconciler 與 Fixtures

權限在插件中是聲明式的，並在啟動時自動調和：

- **聲明式權限**：插件在其 `manifest.json` 中宣告所定義的權限與預設角色（如 `admin`、`user`）的對應關係。
- **Permission Reconciler**：
  - 後端開機 bootstrap 時，會讀取已安裝插件的權限 fixtures。
  - 將新權限增量寫入資料庫的 `Permission` 表，並將權限指派給對應的 `Role`。
  - 禁止靜默覆蓋與未授權的權限篡改，若有衝突（例如兩個插件搶佔同一個系統級 action），將在 doctor/開機時 fail-loud。

---

## 五、 Frontend Facet & Next.js Generator

前端整合不再需要手工修改 Next.js 的 pages 或 layout 結構：

- **Slot 模式**：前端 Shell 導出預定義的插槽（如 `Layout.Navigation`、`UserMenu.Dropdown`）。
- **Facet 註冊**：前端插件在其前端入口導出 React 元件，並聲明要掛載到哪一個 `Slot` 上。
- **Build-time Generator**：
  - Next.js 建置時，由 `@appspine/plugin-cli` 自動掃描並產生 `_generated-slots.tsx`，以靜態 import 的方式將 Facet 元件編譯進插槽中。
  - 這既保持了 Next.js 的 Tree Shaking 與伺服器端渲染 (SSR) 能力，又達到了解耦的插拔效果。
