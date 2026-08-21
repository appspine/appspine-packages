---
type: topic
scope: cross-repo
status: active
created: 2026-07-01
updated: 2026-08-20
---

# 業務系統開發框架 - 基本框架規劃

> 本文件為新架構規劃的第一份文件，記錄「業務系統開發框架」的基本框架討論結果。
> 範圍：技術棧、Repo / 部署拓樸、框架基本功能清單。
> 狀態：基本框架規劃已定案，文末「後續待辦事項」三項已全部完成。

## 背景與目的

規劃一套全新的業務系統開發框架，作為日後新增各業務系統（如人資、文件協作、簽核、通訊等）的共同起點。
每個業務系統各自獨立開發、部署與維運，框架本身提供一致的基礎能力，避免每個系統各自重造輪子。

## 已確認決策

### 技術棧

延續以下技術棧，不重新評估：

- 後端：NestJS + Prisma
- 前端：Next.js + Tailwind CSS + shadcn/ui

### Repo / 部署拓樸

- **多 repo**：每個業務系統各自獨立 repo，而非單一 monorepo 內各自 fork。
- **資料庫各自獨立**：每個業務系統擁有自己的資料庫實例，不共用。
- 框架本身共用的能力（見下方「框架基本功能」）以**共用套件（npm package）**形式存在，由各業務系統各自引入、各自部署，**不設立中心化的管理服務或管理介面**。
- **共用套件本身採單一 monorepo**（repo：[appspine/appspine](https://github.com/appspine/appspine)），以 pnpm workspace 管理多個套件，namespace 為 `@appspine/*`（`@appspine/auth`、`@appspine/rbac`、`@appspine/audit-log`、`@appspine/mcp-server`、`@appspine/frontend-shell`、`@appspine/metadata-schema` 等）。理由：套件間互相依賴（RBAC 依賴 Auth、Audit Log 被多處呼叫），monorepo 可做跨套件原子變更與整合測試；純內部消費、無外部協作隔離需求，不需要拆 repo 換取的隔離性。搭配 Changesets 做各套件獨立版本管理，CI 採 path-based 過濾（Turborepo/Nx）避免無關套件被重複建置。
- **套件 registry 採 GitHub Packages**：已全面用 GitHub 管 repo，不需額外建置/維運 registry（npm private 需付費、自架 Verdaccio 需自行維運主機），現階段套件數量少、純內部消費，GitHub Packages 的 npm 相容介面已足夠，認證可沿用 GitHub token。
- **與 Enterprise Master Data App 的釐清**：`appspine-app-template` fork 出來的業務 app 裡，允許少數被指定為「某資料網域的 canonical owner」（例如組織/人員、料號主檔，見 `_archive/dev_docs-20260803/app-master-data/033-master-data-app-plan.md`，
原探索文件 Z18／Z20 已封存至 `_archive/future-plans-Z18-20260722/`／
`_archive/future-plans-Z20-20260722/`）——這類 app 本身仍是獨立 repo/DB/部署的普通業務 app，不是框架新增的中心服務；差別只在於其他業務 app 把它的 API 當作 reference data 來源使用，而非互相對等的業務資料。判斷某資料是否適合拉出來當 master-data app 的門檻：① 天然被多個業務 app 共同參照，② 該資料一致性的價值高於各 app 各自維護的彈性。不符合這兩點的資料仍留在各業務 app 自己的交易資料裡，不要為了「看起來共用」就往外拉，否則又走回中心化平台老路。

### App 範本機制

- **不採用 code generator CLI**：框架能力已套件化，新系統的演進透過套件版本升級而非範本同步合併，範本只需負責一次性骨架產生。
- **每個業務系統 1 個 repo**，內含 `frontend/`、`backend/` 子目錄（比照 AuraNest `apps/<name>/` 的結構，但提升為獨立 repo，不放在 monorepo 底下），不拆成前後端各自獨立的 repo。
- **單一合併 template repo**（[appspine/appspine-app-template](https://github.com/appspine/appspine-app-template)，private，已設為 GitHub template repo），新系統用「Use this template」一次拿到前後端起點：
  - `frontend/`：內容來自 `blank_shadcn_app`。`blank_shadcn_app` 是通用前端起點，非 appspine 專屬（其他專案也會直接使用），本身保留不動、不搬進 appspine 工作目錄底下，不直接設為 appspine 的 template repo。
  - `backend/`：內容來自既有 `auranest` 專案的 `apps/auranest-app-template/backend`（NestJS + Prisma），移除 `sync` module（屬於 AuraNest 自己的業務邏輯，非通用框架骨架）；保留 Prisma 設定、`gen-data-dictionary.ts`、`common/interceptors`、Docker/nest-cli 設定。
- 合併後的 template repo 內預先裝好共用套件、附最小可運行範例 wiring，新系統建立後改 package name / env 即可啟動。

### 身份/權限細節

- **OIDC-only**（_archive/dev_docs-20260803/framework/035）：local auth（帳密登入、`JWT_SECRET`/`JwtModule`、
  帳密管理 UI）已全面廢止，`AUTH_MODE` 環境變數目前只接受 `oidc` 一種值——保留這個變數名稱
  （而非直接拔掉）是因為它同時還控制開機時的 log 訊息與少數尚未清理的相容性程式碼路徑，拔變數
  本身不是本次廢止的範圍。
  - 身份識別一律交給**既有外部 IdP（Keycloak）**，多個系統都指向同一個 Keycloak 即可拿到 SSO
    效果；本機開發環境共用 `dev-infra/` 底下的 dev Keycloak（見該目錄 README）。
  - 首次登入時以 email 比對本地 `User` 資料表，找不到就即時建立（JIT provisioning）——不再有
    獨立的「註冊」流程。
  - 角色指派（RBAC）UI 維持手動管理、不隨 `AUTH_MODE` 自動從 OIDC claim 帶入。
  - **與「不設立中心化管理服務」原則的釐清**：此處的中心化是指 appspine 框架本身不額外蓋一個身份管理服務（不走 AuraNest V2 自建 Admin Center 那條路）；接的 Keycloak 是既有外部基礎設施，不算框架自建的中心服務，兩者不衝突。
  - 正式環境要換哪家 IdP 供應商、是否導入 Enterprise-Managed Authorization/ID-JAG，屬於未來
    規劃範圍，035 僅處理「框架程式碼層級 local auth 廢止」，不涉及這些決策。
- **M2M API Key 使用情境**：給外部第三方串接用（如 n8n、AI agent 等），非業務系統間互call。
  - scope 採 `resource:action` 格式（例如 `employees:read`、`documents:write`），跟 RBAC 角色脫鉤，建立 key 時手動勾選 scope 清單。
  - scope 粒度與 MCP Server 暴露的 tool 對齊：每個 MCP tool 註冊時宣告所需 scope，呼叫前由 M2M API Key 套件檢查，對照表由 MCP Server 套件維護。
  - 每把 key 各自設定速率限制（流量特性因第三方而異）。
  - Key 格式採可辨識前綴、雜湊儲存、明碼只在建立當下顯示一次；支援到期日與同一整合多把 key 並存，以利零停機輪替。

### AI 整合細節

- **Metadata Schema API**：
  - 資料來源統一為 Prisma DMMF（沿用既有 AuraNest 專案 `gen-data-dictionary.ts` 的做法：從 `Prisma.dmmf.datamodel` 讀取 models/enums、欄位型別與 `///` 文件註解）。
  - 兩種產出共用同一套轉換邏輯（抽成 `@appspine/metadata-schema` 套件內的函式，避免兩邊各自維護一份邏輯）：
    1. **Build-time**：產生 `docs/data-dictionary.md` 靜態文件，供開發時人類／coding agent 閱讀 repo 用。
    2. **Runtime**：另提供 `GET /metadata/schema` REST endpoint（路徑前綴慣例見 002「API 設計規範」），輸出 JSON，供沒有 repo 存取權的外部 agent（n8n、MCP client 等）在執行期查詢；套用 M2M API Key scope（如 `metadata:read`）做存取控制，避免未授權第三方取得完整資料結構。
- **MCP tool 產生方式**：By app 自行產生，框架（共用套件）只提供基礎能力與開發入口（tool 註冊機制、scope 檢查 middleware 等），不強制自動產生 tool。
- **MCP Server transport**：採 Streamable HTTP（非 stdio），因應外部 AI agent（n8n 等）連線需求，與 M2M API Key 驗證同層接入。

### 對外介接層細節

> 來源：_archive/workspace-docs-023-024-20260715/023-external-interconnect-agent-team-plan.md (歷史封存)
> 第 2 節，經三輪對抗性審查定案。這層談的**不是**業務系統間互相呼叫（appspine 不走這條
> 路線），而是單一 app 如何被外部呼叫方（n8n、AI agent 等）安全、一致、可預期地串接；
> 跨 app 的組合/編排邏輯發生在外部呼叫方那一端，appspine 本身不做 app 之間的橫向溝通。

- **發現服務（Metadata Schema API 可發現性）**：純目錄/發現服務（control-plane），把每個
  app 的 MCP tool 清單、scope、metadata endpoint 匯總成一份總覽供外部呼叫方查詢；**不做
  請求代理**（data-plane），實際呼叫工具時仍直接連到各 app 自己的 MCP server、用各 app
  自己核發的 M2M key。資料流採推送制（各 app 主動推送自己的能力清單，各自獨立推送
  token，endpoint 位置變更需挑戰驗證），發現服務本身不持有任何一把有實際存取權限的 key；
  查詢需要 `catalog:read` scope 的 M2M key，不開放匿名查詢。部署上從
  `appspine-app-template` fork 成一個輕量 app，沿用現成 auth/M2M 基礎設施；v1 範圍上限
  只做目錄+推送+查詢。
- **MCP tool 命名前綴慣例**：跨 app 統一命名前綴（例如 `wiki_*`、`calendar_*`），讓外部
  呼叫方一眼辨識工具來源於哪個 app；由共用套件 `@appspine/mcp-server` 在 tool 註冊時檢查
  /強制前綴格式，compile-time／註冊時檢查，非新增 runtime 服務。既有 tool 名稱遷移採雙重
  註冊過渡期（新舊名稱並存 2 個 minor 版本，且稽核日誌中舊名稱呼叫次數需歸零，兩條件皆
  滿足才移除舊名稱）。
- **稽核關聯 id header 慣例**：外部呼叫方呼叫任何 app 時，可附帶自訂 HTTP header（例如
  `X-Appspine-Workflow-Id`），值由呼叫方自行決定/產生，各 app 稽核日誌記錄機制多存這個
  附加欄位；對一般外部呼叫方為**可選、非強制、不受信任**（僅供除錯/人工串連，不做中心化
  聚合，appspine 不新增服務去收集/查詢跨 app 日誌）。
- **與 010 acting-user 機制的區別（為何不適用於 AI Agent 情境）**：010 的 acting-user
  綁定是靜態的（管理員在 key 建立時設定，存於 `ApiKey` 資料列），且明文規定綁定對象必須
  是 service account、禁止綁真人，理由是防止「持有 key 的人無人值守假冒該員工寫入」。
  這代表 010 無法支援「每次呼叫可指定不同代理身份」這種動態情境（例如 AI agent 平台，
  一把 key 服務多個真人使用者的多次對話）——不擴充 010 去支援這個情境，改用兩層歸責模型：
  目標 app 端稽核只記錄 M2M key 綁定的 service account 身份，真人歸責改由呼叫方自己的
  系統（例如 AI agent 平台自己的對話紀錄）持有，事後透過稽核關聯 id 兩段查詢串接。

### 框架基本功能

| 類別 | 項目 | 備註 |
|---|---|---|
| 身份/權限 | OIDC-only（local auth 已廢止） | 透過共用 Auth 套件實作，各系統各自部署、各自接同一個 Keycloak；細節見上方「身份/權限細節」 |
| 身份/權限 | RBAC（角色／權限管理） | 同上，共用套件提供；權限模型（`permissionPolicy`/`permissions`）與 Guard 邏輯見 002「API 設計規範」 |
| 身份/權限 | M2M API Key（含 scope、速率限制） | 同上，共用套件提供；使用情境與 scope 設計見上方「身份/權限細節」，Guard chain 順序見 002「API 設計規範」 |
| 治理 | System / Audit Log | 記錄「誰改了什麼」的業務稽核軌跡；現階段各系統各自獨立儲存，以單體 app 思考為出發點，不集中收集，集中收集機制留待未來另外設計 |
| AI 整合 | Metadata Schema API | 唯讀，提供 AI agent 可解析的資料結構描述；資料來源與兩種產出方式見上方「AI 整合細節」 |
| AI 整合 | MCP Server | 將系統內 CRUD 能力包裝成可執行的 MCP tool；產生方式與 transport 見上方「AI 整合細節」 |
| 維運 | Health Check | 服務本身健康狀態檢查端點，與 Audit Log 不同層次 |
| 前端 | 共用前端 Shell 元件 | Dashboard layout、側欄、麵包屑、主題切換等；以既有的乾淨 Next.js + shadcn/ui 起點（`blank_shadcn_app`）為基礎發展。`blank_shadcn_app` 是基於 [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) 建立的空白前端範本，已獨立成 repo（[antonylu0826/blank_shadcn_app](https://github.com/antonylu0826/blank_shadcn_app)），非 monorepo 內的目錄 |
| 測試 | E2E 測試骨架（共用套件） | 內容：①Playwright config factory ②種子帳號登入 fixture（含 storageState 快取）③共用「框架層」Golden Path regression spec（登入、RBAC 擋未授權路由、M2M API Key 驗證）④CI 條件式 e2e job（僅在該系統有 `e2e/` 目錄時觸發） |

## 後續待辦事項

> 方向已定案，以下是尚待實際執行的項目，非開放討論。

- [x] 建立全新的合併 template repo [appspine/appspine-app-template](https://github.com/appspine/appspine-app-template)（private，已設為 GitHub template repo）：`frontend/` 內容來自 `blank_shadcn_app`（未修改），`backend/` 內容來自 `auranest-app-template/backend`（移除 `sync` module，移除所有 `@auranest/backend-core` 引用）。
- [x] 在 [appspine/appspine](https://github.com/appspine/appspine) 建立 pnpm workspace 骨架，設定 GitHub Packages 發布流程（Changesets + CI）。
- [x] `appspine-app-template` 內預先裝好 `@appspine/*` 共用套件、接上最小可運行範例 wiring。八個套件（`common`/`auth`/`rbac`/`m2m-api-key`/`audit-log`/`health-check`/`metadata-schema`/`mcp-server`）從既有 `auranest` 專案 `packages/@auranest/backend-core` 盤點重用後實作完成、發布到 GitHub Packages，並接進 `appspine-app-template`，實際跑過 migration/seed/開機/API 驗證。詳見內部歸檔的 003-shared-package-reuse-plan.md。
