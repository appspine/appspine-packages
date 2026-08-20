---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 - Fleet 升級結論與最終驗收總結 (Fleet Upgrade Conclusion)

> 範圍：`appspine-app-template` 與 8 個下游消費應用（`wiki`, `calendar`, `chat`, `drive`, `projects`, `approve`, `master-data`, `mcp-gateway`）。  
> 基準狀態：Phase 5 全 Wave（Wave A、Wave B、Wave C 及 PL5-13/14）完成。

---

## 1. 升級總體結論

經過 Phase 5 三波漸進式 Rollout（Wave A: template / wiki / calendar / chat；Wave B: drive / projects；Wave C: approve / master-data / mcp-gateway），全 Fleet 9 個專案已 100% 完成以下工程升級：

1. **Plugin Mode 預設啟用**：
   - 9/9 專案皆已於 `appspine.plugins.json` 宣告使用 `@appspine/preset-standard@^2.0.0`。
   - 9/9 專案之 `AppModule` 皆已切換為匯入自動生成的 `AppspineGeneratedModule`。
2. **零架構飄移（Zero Drift）**：
   - `pnpm appspine build --check` 在 9/9 專案中皆達到 100% 一致性，Prisma Schema、Permissions 與 Routes 完全受控。
3. **診斷無異常（Zero Issues）**：
   - `pnpm appspine doctor` 在 9/9 專案中皆回報 `10 enabled plugins, 0 issues detected`。
4. **真實資料庫開機驗證**：
   - 9/9 專案皆通過拋棄式 PostgreSQL 容器之真實開機、Prisma migration dry-run 與 seed 驗證。
5. **雙模式回滾演練通過**：
   - 9/9 專案之 `APPSPINE_PLUGIN_MODE=0` escape hatch 皆通過 dual-mode DI 與啟動測試，回滾途徑暢通。

---

## 2. Fleet 升級狀態核對總表

| 應用專案 | Wave | 預設模式 | 啟用插件數 | 測試通過率 | Doctor 狀態 | Schema Drift | 驗證腳本 |
|---|---|---|---|---|---|---|---|
| **template** | Base / Wave A | Plugin Mode | 10 | 11/11 (100%) | 0 issues | 0 diff | `scripts/051-pl5-03-template-canary.mjs`¹ |
| **wiki** | Wave A | Plugin Mode | 10 | 25/25 (100%) | 0 issues | 0 diff | `scripts/051-pl5-04-wiki-canary.mjs`¹ |
| **calendar** | Wave A | Plugin Mode | 10 | 100% | 0 issues | 0 diff | `scripts/051-pl5-05-calendar-wave-a.mjs` |
| **chat** | Wave A | Plugin Mode | 10 | 100% | 0 issues | 0 diff | `scripts/051-pl5-06-chat-wave-a.mjs` |
| **drive** | Wave B | Plugin Mode | 10 | 40/40 (100%) | 0 issues | 0 diff | `scripts/051-pl5-07-drive-real-bootstrap.mjs` |
| **projects** | Wave B | Plugin Mode | 10 | 136/136 (100%) | 0 issues | 0 diff | `scripts/051-pl5-08-projects-real-bootstrap.mjs` |
| **approve** | Wave C | Plugin Mode | 10 | 48/48 (100%) | 0 issues | 0 diff | `scripts/051-pl5-09-approve-real-bootstrap.mjs` |
| **master-data**| Wave C | Plugin Mode | 10 | 14/14 (100%) | 0 issues | 0 diff | `scripts/051-pl5-10-master-data-real-bootstrap.mjs` |
| **mcp-gateway**| Wave C | Plugin Mode | 10 | 134/134 (100%) | 0 issues | 0 diff | `scripts/051-pl5-11-mcp-gateway-real-bootstrap.mjs` |

---

## 3. Host Capabilities 與 App-local Plugins 治理

- **Host Capabilities 邊界**：全 Fleet 9 個專案皆僅宣告 `hostCapabilities: ["appspine.prisma"]`，未私自新增任何未經核准的 app-specific host capabilities。
- **App-local Plugins**：所有客製化業務能力均維持在 App 內部模組或標準 Extension Controller 內，不污染全域插件生態。
- **型別檢查品質**：Wave C 覆核中發現之 mcp-gateway 型別轉換均已改為具備型別檢查能力的顯式 cast（`as unknown as ComponentType<...>`），無遺留任何未揭露的 `as any`。

> ¹ **Claude 獨立覆核附註（2026-08-20）**：PL5-14 執行時重跑了這兩支腳本作為「最終驗證」，但這兩支腳本
> 沿用 Wave A 的本機 tarball override 方法，不是 PL5-14 要求的「registry clean consumer（用 canary
> tarball 或已發布版本，不要用本機 tarball 模擬）」；執行後在這兩個 repo 留下未 commit 的
> `%TEMP%` 路徑污染（已由 Claude revert）。這不代表 template／wiki 的發布就緒狀態有問題——兩者的
> HEAD commit（`5e035aa`、`cd4db0a`）在 Gate G5A 已經用真正的 registry 安裝＋真實 Docker 開機驗證過，
> 從那之後兩個 repo 都沒有新 commit，狀態不變，所以上面的 100% 通過率仍然成立；只是這欄位標示的驗證
> 方法本身不是 PL5-14 這次真正該用的方法，記錄下來避免以後又拿這兩支舊腳本當「乾淨 registry 驗證」
> 用。

---

## 4. 結語與上線就緒宣告

全體消費應用（template + 8 Apps）已具備正式承接 `@appspine/*@2.0.0` Stable Release 的能力，架構完整度、相容性與回滾安全機制均達到發布標準。
