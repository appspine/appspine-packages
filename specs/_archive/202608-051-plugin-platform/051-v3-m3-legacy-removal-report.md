---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 v3 Legacy Removal：M3 執行報告

日期：2026-08-20

範圍：M3 Clean Removal、canary fleet 驗收、stable publish、stable fleet 驗收。

授權邊界：使用者在 Claude 完成 M1／M2 覆核後明確要求 Codex 接續執行 M3。本輪已執行 breaking
removal 與 GitHub Packages publish；**未執行任何 `git push`**。

## 1. 結論

- `packages/auth` 已刪除；workspace、build graph、README、consumer fixture 與 lockfile 均不再依賴它。
- `RbacModule`、`McpModule`、`ApiKeysModule`、`AuditLogModule` 已移除 `@Global()`；九個 consumer
  以顯式非 global `AppspinePlatformModule`／feature imports 完成 DI 接線。
- `JwtOrApiKeyGuard`、frontend-shell 過渡 capability UI／auth subpaths、deprecated v1 domain-event
  webhook sender 已從正式 public API 移除。
- canary 與 stable 均已發布至 `npm.pkg.github.com`；10 個 stable `latest` tags 已逐項核對，registry
  metadata 中沒有 `workspace:*`。
- template + 8 Apps 的 telemetry 為 0；18 個 typecheck、18 個 production build、9 組 backend test、
  9 個真實 disposable runtime bootstrap 全部通過。
- 九個 consumer 已切到 stable 精確版本並 commit；v3 snapshot 已封存。所有 repo 維持本機分支，未 push。

## 2. 平台移除內容

### 2.1 Backend 與 DI

- 刪除 `packages/auth` compatibility facade。
- 移除四個 capability module／manifest 的 global bridge。
- `@appspine/m2m-api-key` 不再輸出 `JwtOrApiKeyGuard`；controller 改用
  `@appspine/plugin-host-nest` 的 `AppspineAuthGuard`。
- 更新 non-global module tests，直接驗證 imports／exports 與真實 Nest composition。
- 修正 CommonJS declarations，以 TypeScript `resolution-mode` 保持 CJS／ESM published subpaths 可載入。

九個 consumer 均使用顯式 platform wrapper。真實開機另外抓到並修正兩個 module-boundary 缺口：

- Projects 的 comments、tasks、projects、label feature modules 顯式 import platform wrapper，讓
  `McpToolRegistry` 可解析。
- Master Data 的 `OrgMcpModule` 顯式 import platform wrapper。

### 2.2 Frontend 與 webhook ownership

- `@appspine/frontend-shell` 只保留 capability-neutral shell、actions-core request helpers 與 plugin
  catalog；Users／Roles／API Keys／Domain Events／Notification／OIDC UI 已由各 capability `./frontend`
  subpath 擁有。
- 已移除 frontend-shell 的過渡 login、auth error、notification subpaths 與 legacy exports。
- deprecated `postDomainEventWebhook()` sender 已移除；payload／signature primitives 與 v2 sender／
  verifier 保留。
- Wiki、Calendar、Chat、Drive、Approve、Master Data 為既有 v1-shaped receiver contract 各自保留
  `backend/src/domain-events/app-local-webhook.ts`。此 adapter 維持既有 HMAC、SSRF 防護、DNS pinning、
  timeout 與 response drain 行為，但 ownership 已回到 App；新 external integration 使用 v2 contract。

## 3. 發布版本

本計畫的「v3」是平台移除里程碑；monorepo 仍遵守既有 Changesets independent-versioning 契約，
因此各套件依自己的現有 major 與 peer dependency 連鎖決定正式版本，不強迫全部名為 `3.0.0`。

| Package | Canary | Stable / `latest` |
| --- | --- | --- |
| `@appspine/audit-log` | `2.0.0-canary.0` | `2.0.0` |
| `@appspine/domain-events` | `10.0.0-canary.0` | `10.0.0` |
| `@appspine/frontend-shell` | `1.0.0-canary.0` | `1.0.0` |
| `@appspine/health-check` | `1.0.2-canary.0` | `2.0.0` |
| `@appspine/identity-core` | `2.0.2-canary.0` | `3.0.0` |
| `@appspine/m2m-api-key` | `7.0.0-canary.0` | `7.0.0` |
| `@appspine/mcp-server` | `2.0.0-canary.0` | `2.0.0` |
| `@appspine/notification` | `1.0.2-canary.0` | `2.0.0` |
| `@appspine/oidc-auth` | `2.0.2-canary.0` | `3.0.0` |
| `@appspine/rbac` | `6.0.0-canary.0` | `6.0.0` |

`health-check`、`identity-core`、`notification`、`oidc-auth` 的 stable major 高於 canary base，是
Changesets 對 `frontend-shell@1` stable peer dependency breaking range 的正確連鎖 bump，不是人工
壓低或任意改版。

Changesets 在 publish 時先把 stable tags 建在當時的 implementation HEAD；stable version commit
完成後，10 個尚未 push 的本機 stable tags 已重新指向 `475a431ac466cfa624e0ea2b1d9ba9093088a2f6`。
canary tags 保持指向 canary implementation commit `057c121`。

## 4. Fleet commits

每個 repo 有兩段 M3 history：第一段是 canary migration／code change，第二段是 stable registry
版本、lockfile、生成物與現行文件。下表記錄 stable 最終 HEAD：

| Repo | Stable HEAD |
| --- | --- |
| `appspine-app-template` | `f248db6038d31a135df57ced58ae144cae977072` |
| `wiki` | `4393228af60f75f7cb1e6ce37032e3ba0665eb33` |
| `calendar` | `e815fcbedf7f6946039d1c75b6599b2738b74689` |
| `chat` | `6ff213a4be708673bdba6795fe66e30008017354` |
| `drive` | `c2dfc89bad5b98b5fbaca7435abf37351834c414` |
| `projects` | `2e1db0596da498af84af89d075a523f525248944` |
| `approve` | `7d0f4df585d879f5b90ae9a839d249f0f2c00b40` |
| `master-data` | `5165336884cccfb0d9a9072792b167d90b0d8dec` |
| `mcp-gateway` | `e59aaf801d0eee8775051e37bfb3e81520eac67e` |

Platform commits：

- `057c121`：刪除 legacy platform surfaces、完成 non-global module 與 public API removal。
- `475a431ac466cfa624e0ea2b1d9ba9093088a2f6`：stable versions／changelogs、fleet bootstrap harness、
  v3 snapshot 與 release state。

## 5. 可重現驗證

| Gate | 結果 |
| --- | --- |
| package `lint`／`typecheck`／`test`／`build` | PASS；lint 僅 2 個既有 warnings、2 個 infos，0 errors |
| clean consumer | PASS；12 個 packed packages，7/7 checks，包含 CJS、ESM、declarations、Nest boot、negative composition、v3 removed-surface assertions |
| registry | 10 個 `latest` 精確命中上表 stable 版本；dependencies／peerDependencies `workspace:*` = 0 |
| deprecation self-test | 9/9 PASS |
| fleet telemetry | `0 legacy usages identified across fleet`（baseline 389 → 0） |
| frozen install | 9/9 PASS |
| backend／frontend typecheck | 18/18 PASS |
| backend test／build | 9/9 + 9/9 PASS |
| frontend production build | 9/9 PASS |
| Appspine generated artifacts | 每 repo 10 enabled、0 unresolved、0 stale、0 lock findings |
| disposable runtime bootstrap | 9/9 PASS，均為真實 `node dist/src/main.js` + HTTP 200；Drive 另含 MinIO |
| v3 snapshot | self-test PASS；`150814` bytes byte-identical |
| `git diff --check`／consumer pre-commit hooks | 9/9 PASS |

第一次以三組並行重跑 stable gate 時，Chat 的第一個 DI test 在 `5.075s` 超過原本 `5s` timeout，
同檔另一項與其餘 37 tests 通過。未放寬 timeout；改為單 repo 串行後 38/38 通過，後續真實 bootstrap
也通過。判定為並行資源競爭校準事件，不是產品缺陷。

Wiki 的 `pnpm peers check` 仍會顯示既有 TipTap 3.25／3.27 與 Tailwind typography peer 訊息；其來源
在 M3 前的 lockfile 已存在，且 stable frontend typecheck／production build 均通過，本輪未擴大範圍
進行非必要升級。

## 6. Governance substitution log

| Actual agent | Required class | Substitution reason | Calibration | Independent reviewer | Evidence |
| --- | --- | --- | --- | --- | --- |
| OpenAI Codex（GPT-5 系列；介面未揭露更細 model ID／推理強度） | Core Engineering：Terra／Claude（G2）；計畫另列 Claude Sonnet 為 independent auditor | 使用者在 Claude 完成 M1／M2 覆核後，明確要求 Codex 接續執行 M3 | canary publish → 9 repo install／typecheck／test／build／real boot → stable publish → registry metadata → 9 repo stable frozen install／build／real boot；並以 clean consumer 與 telemetry 雙重校準 | 本輪未另行安排 M3 independent review；不得把 M1／M2 的 Claude 覆核延伸宣稱為 M3 覆核 | package commits、九個 consumer HEAD、registry `latest`、7/7 clean consumer、9/9 runtime bootstrap，詳見 §4／§5 |

## 7. 邊界與 rollback

- 未執行 `git push`、未建立 PR、未 merge；所有 commits 與 tags 目前只在本機。
- 依使用者已核准的 ADR 修正，不再支援 `APPSPINE_PLUGIN_MODE=0` 原地切回 legacy wiring。
- rollback 為回到前一個 container image／git tag 後重新部署；registry 已發布版本不可刪除或覆寫。
