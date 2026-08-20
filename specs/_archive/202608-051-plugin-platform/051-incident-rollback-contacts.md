---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 - 發布事故應變、回滾指南與緊急聯絡名冊 (Incident & Rollback Contacts)

> 目的：建立 2.0.0 Stable Release 上線後之線上異常應變標準作業程序（SOP）、零風險回滾指引與緊急聯絡網絡。

---

## 1. 事故等級定義與通報機制

| 等級 | 定義 | 影響範圍 | 反應時效 (SLA) | 處理原則 |
|---|---|---|---|---|
| **S1 (Blocker)** | 應用程式無法開機、資料庫 Migration 失敗、全域認證/授權失效 | 全系統癱瘓或重大業務中斷 | 15 分鐘內應變 | 立即觸發 `APPSPINE_PLUGIN_MODE=0` 秒級回滾 |
| **S2 (Critical)** | 特定 Capability 功能異常（如 Domain Event 無法發送、通知遺失） | 單一核心能力受損 | 30 分鐘內應變 | 隔離該插件或降級處理 |
| **S3 (Major)** | 非核心頁面顯示錯誤、特定 Admin 路由警告、效能降級 | 局部非關鍵功能 | 2 小時內應變 | 評估 Hotfix 或發布補丁版本 |
| **S4 (Minor)** | JSDoc 提示錯誤、CLI 診斷格式警告、日誌冗餘 | 開發體驗與輕微缺陷 | 次一迭代修復 | 正常 Issue 排程修復 |

---

## 2. 快速回滾標準作業程序 (Rollback SOP)

### 方案 A：執行期秒級回滾（零程式碼改動，推薦首選）
若線上環境升級後出現開機異常或 DI 依賴衝突：
1. **注入環境變數**：
   ```bash
   APPSPINE_PLUGIN_MODE=0
   ```
2. **重啟應用程式容器**。
3. **驗證**：應用程式將立即略過 `AppspineGeneratedModule`，回退至 `AppModule` 傳統靜態相容載入，不破壞既有資料庫或中斷服務。

### 方案 B：套件版本降版回滾
若需將 `@appspine/*` 套件降版至既有版本：
1. 於 `package.json` 將 `@appspine/*` 版本降回上一穩定版本。
2. 執行 `pnpm install --frozen-lockfile`（或更新 lockfile）。
3. 執行 `pnpm appspine build` 重新組裝。
4. 重新建置並部署應用程式映像檔。

### 方案 C：資料庫相容性原則
- 插件平台 2.0.0 之 Prisma Composer 嚴禁在未經核准下產生 `DROP TABLE` / `DROP COLUMN`。
- 雙模式切換在資料庫層完全相容，回滾無需還原資料庫備份。

---

## 3. 故障診斷三步驟 (Triage Playbook)

```bash
# 步驟 1: 本機診斷插件狀態與衝突
pnpm appspine doctor

# 步驟 2: 檢查組裝產物與 Schema 是否飄移
pnpm appspine build --check

# 步驟 3: 驗證環境變數與資料庫連線（各 App 有自己的腳本，不是共用檔名；例如）
node scripts/051-pl5-04-wiki-canary.mjs        # wiki
node scripts/051-pl5-07-drive-real-bootstrap.mjs   # drive
```

---

## 4. 緊急應變與責任聯絡名冊 (Contacts)

| 職責領域 | 負責團隊 / 角色 | 代表 Agent / 人員 | 應變職責 |
|---|---|---|---|
| **Release Coordinator** | Platform Coordination | Gemini Coordinator | 發布流程控管、跨 Repo 狀態同步、回滾決策執行 |
| **Core Architecture** | Platform Lead | Sol max (G3) | 總體架構仲裁、重大 Gate 簽核、S1 事故根因決策 |
| **Capability Modules** | Core Developers | Terra / Claude (G2) | 插件程式碼 Hotfix、DI 容器修正、Codemod 維護 |
| **Review & Security** | Review & Governance | Claude Sonnet (G2/G3) | 獨立安全覆核、相容性邊界把關、公開 API 審核 |
| **On-call SRE** | Infrastructure Team | Appspine DevOps Group | CI/CD Pipeline、Docker Registry、npm 私有庫監控 |
