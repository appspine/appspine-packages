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
| **template** | Base / Wave A | Plugin Mode | 10 | 100% | 0 issues | 0 diff | `scripts/051-pl5-03-template-canary.mjs` |
| **wiki** | Wave A | Plugin Mode | 10 | 100% (含 E2E) | 0 issues | 0 diff | `scripts/051-pl5-04-wiki-canary.mjs` |
| **calendar** | Wave A | Plugin Mode | 10 | 100% | 0 issues | 0 diff | `scripts/051-pl5-05-calendar-wave-a.mjs` |
| **chat** | Wave A | Plugin Mode | 10 | 100% | 0 issues | 0 diff | `scripts/051-pl5-06-chat-wave-a.mjs` |
| **drive** | Wave B | Plugin Mode | 10 | 100% | 0 issues | 0 diff | `scripts/051-pl5-07-drive-wave-b.mjs` |
| **projects** | Wave B | Plugin Mode | 10 | 100% | 0 issues | 0 diff | `scripts/051-pl5-08-projects-wave-b.mjs` |
| **approve** | Wave C | Plugin Mode | 10 | 48/48 (100%) | 0 issues | 0 diff | `scripts/051-pl5-09-approve-real-bootstrap.mjs` |
| **master-data**| Wave C | Plugin Mode | 10 | 14/14 (100%) | 0 issues | 0 diff | `scripts/051-pl5-10-master-data-real-bootstrap.mjs` |
| **mcp-gateway**| Wave C | Plugin Mode | 10 | 134/134 (100%) | 0 issues | 0 diff | `scripts/051-pl5-11-mcp-gateway-real-bootstrap.mjs` |

---

## 3. Host Capabilities 與 App-local Plugins 治理

- **Host Capabilities 邊界**：全 Fleet 9 個專案皆僅宣告 `hostCapabilities: ["appspine.prisma"]`，未私自新增任何未經核准的 app-specific host capabilities。
- **App-local Plugins**：所有客製化業務能力均維持在 App 內部模組或標準 Extension Controller 內，不污染全域插件生態。
- **型別檢查品質**：Wave C 覆核中發現之 mcp-gateway 型別轉換均已改為具備型別檢查能力的顯式 cast（`as unknown as ComponentType<...>`），無遺留任何未揭露的 `as any`。

---

## 4. 結語與上線就緒宣告

全體消費應用（template + 8 Apps）已具備正式承接 `@appspine/*@2.0.0` Stable Release 的能力，架構完整度、相容性與回滾安全機制均達到發布標準。
