---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 v3.0.0 Legacy Removal：M1／M2 執行報告

日期：2026-08-20

範圍：M1 Migration Tooling、M2 Consumer Fleet Zero-Legacy

硬性停點：未執行 M3，未刪除 legacy export、未移除 capability `@Global()`、未 bump／publish／push。

## 1. 結論

- M1 codemod、fixtures、semantic self-test、dry-run 與實際寫入模式已交付。
- M2 的 template + 8 Apps 已從 PL5-13 baseline 389 筆收斂到 0 筆。
- 九個 consumer 均已移除主動 `@appspine/auth` import、直接 manifest dependency 與 workspace override。
- 九個 consumer 的 backend typecheck、frontend typecheck、backend build、backend test 均通過。
- 九個 consumer 均已實際走到 Nest `app.listen()`；Chat 另驗證 Socket.IO polling handshake。
- 所有 consumer 與 migration tooling 都已 commit；未 push。
- M3 尚不可開始：仍須 Claude 獨立覆核、使用者另行明確授權，並決定是否修正 Chat canary 在 Windows 的 graceful-signal harness。

## 2. M1 交付

主要檔案：

- `scripts/051-v3-backend-auth-migration-codemod.mjs`
- `fixtures/051-v3-backend-auth-migration-codemod/backend-auth.json`
- `fixtures/051-v3-backend-auth-migration-codemod/semantic.json`

工具支援：

- `--root <dir>`：指定 consumer root。
- `--dry-run`：逐檔列出 before／after，不寫入。
- `--self-test`：驗證 golden fixture、semantic parity、轉換後語法、file-atomic manual stop、dry-run 不寫入、實際寫入與 idempotence。
- 不安全檔案採 file-atomic：同檔任一 case 需人工判斷時，整檔不寫入並以 `[MANUAL]` 列出位置與原因。
- 保留 import alias；`JwtOrApiKeyGuard as X` 轉為 `AppspineAuthGuard as X`。
- 除 backend auth 對照表外，也處理 telemetry 指定的 capability frontend `./frontend` subpath。

核准對照：

| 舊來源／symbol | 新來源 |
| --- | --- |
| `JwtUser`、`ApiKeyUser`、`CurrentUser`、`resolveActingUserId` | `@appspine/plugin-host-nest` |
| `SYSTEM_ADMIN_ROLE`、`SYSTEM_USER_ROLE`、`AdminGuard` | `@appspine/identity-core` |
| `JwtVerifierService` 與其他 OIDC-specific exports | `@appspine/oidc-auth` |
| `JwtOrApiKeyGuard` | `@appspine/plugin-host-nest` 的 `AppspineAuthGuard` |
| frontend capability UI／types | 各 capability package 的 `./frontend` |

`AuthModule` 最終刻意列為人工決策，不自動拆成兩個 module。校準時證明 facade 的全域 DI 語意無法由字面拆分保證：root dual-mode 與 feature-module import 需要不同遷移方式。訊息會要求使用者在 `preset-standard` plugin mode 與經 Nest DI 覆核的 direct modules 之間選擇。

### M1 驗證

| 指令／檢查 | 結果 |
| --- | --- |
| `node scripts/051-v3-backend-auth-migration-codemod.mjs --self-test` | PASS；8 組斷言涵蓋 fixture、semantic parity、syntax、manual stop、dry-run、write、idempotence |
| scratch dry-run | before／after diff 正確，`Get-FileHash` 前後一致 |
| scratch actual run | 寫入預期 owner imports；第二次執行為 0 change |
| `pnpm exec biome check ...` | PASS |
| M1 implementation commit | `44469f5f9cfbbe386654d98413fbc939cf526edc` |

## 3. M2 telemetry 收斂

每個 repo 都先 dry-run、再 actual run、再重跑 fleet scanner；actual codemod 當時均為 0 manual。發現 `AuthModule` DI 差異後，fleet 以人工 plugin-only composition 收斂，工具本身則加嚴為 manual stop。

| 步驟 | Fleet legacy 筆數 |
| --- | ---: |
| baseline | 389 |
| template 後 | 381 |
| wiki 後 | 330 |
| calendar 後 | 303 |
| chat 後 | 230 |
| drive 後 | 180 |
| projects 後 | 119 |
| approve 後 | 74 |
| master-data 後 | 42 |
| mcp-gateway 後 | 0 |

最終重跑：

- `node scripts/051-pl5-13-deprecation-telemetry.mjs --self-test`：9/9 PASS。
- `node scripts/051-pl5-13-deprecation-telemetry.mjs`：`0 legacy usages identified across fleet`。
- 最終對九個 repo 重跑 codemod `--dry-run`：全部 `0 file(s) would change, 0 file(s) require manual review`。
- manifest／workspace 精確 `rg`：`No direct @appspine/auth manifest or workspace override entries remain.`

## 4. Fleet handoff

所有 repo 都實際執行：

- `pnpm -C backend typecheck`
- `pnpm -C frontend typecheck`
- `pnpm -C backend build`
- `pnpm -C backend test`
- `git diff --check`
- 對應既有 real-bootstrap／canary script

| Repo | 主要 diff | Test 結果 | Real boot | 最終 HEAD（`git log -1 --format="%H"`） |
| --- | --- | ---: | --- | --- |
| appspine-app-template | auth owner imports、frontend capability imports、plugin-only AppModule／DI test、移除直接 auth dependency／override、更新 plugin-mode 文件 | 5 files／10 tests PASS | `051-g4-template-real-bootstrap.mjs` PASS；real migrations + `app.listen()` | `04b825c2765effafe23ff4aad3b23ce35852d9d3` |
| wiki | 同上；local domain-events DTO 延伸 canonical capability row types | 4 files／24 tests PASS | `051-pl5-04-wiki-canary.mjs` PASS | `29ae1e52b7cbe771c1da569034eb646278064049` |
| calendar | 同上；local domain-events DTO 對齊；DI test timeout 明確設為 15 秒以容納 cold graph composition | 4 files／21 tests PASS | `051-pl5-05-calendar-wave-a.mjs` PASS | `a0a98a4806262cee003a75b52bde757a3a231d82` |
| chat | auth／frontend imports、domain-events DTO、plugin-only composition；feature `AuthModule` 改為共享單一非 global `AppspinePlatformModule`，讓 WebSocket gateway 取得 host 匯出的 verifier | 6 files／38 tests PASS | 實際 `app.listen()` PASS、HTTP 404、Socket.IO handshake 200；原腳本最後的 Windows graceful-signal 斷言見 §6 | `273b4987734af5fdb01672d487e22fd9d0899734` |
| drive | auth／frontend imports、domain-events DTO、plugin-only composition；real-boot 不再設定 retired mode flag | 9 files／39 tests PASS | `051-pl5-07-drive-real-bootstrap.mjs` PASS（Postgres + MinIO） | `57f0d0840f78680cfb84ec6617cfc8db7f4f173a` |
| projects | auth／frontend imports、notification owner imports、plugin-only composition；real-boot 不再設定 retired flag | 29 files／135 tests PASS | `051-pl5-08-projects-real-bootstrap.mjs` PASS | `daa87edc5fe9e89f9c43c05b3d8ef3d7b3759e0c` |
| approve | auth／frontend／notification imports、domain-events DTO、plugin-only composition；real-boot 不再設定 retired flag | 4 files／47 tests PASS | `051-pl5-09-approve-real-bootstrap.mjs` PASS | `f0025e78967c21c23dab4578f0b918be5a29a8aa` |
| master-data | auth／frontend imports、plugin-only composition；補齊 frontend capability direct dependencies；real-boot 不再設定 retired flag | 4 files／13 tests PASS | `051-pl5-10-master-data-real-bootstrap.mjs` PASS | `fb99f734852f672aff9782e6843c5eb0d021f12b` |
| mcp-gateway | auth／frontend imports、plugin-only composition；補齊 frontend capability direct dependencies；real-boot 不再設定 retired flag | node:test 131 + Vitest 2 PASS | `051-pl5-11-mcp-gateway-real-bootstrap.mjs` PASS | `f311f43614af13cc3893cb8a9d3b3c81df12df95` |

上表的「主要 diff」是類型摘要，不是用樣板推測；實際 changed files 已由各 repo 的 `git status`、`git diff --name-only` 與 commit summary 核對。九個 consumer 最終 working tree 均為 clean。

## 5. 校準中抓到並修正的真實問題

### 5.1 `AuthModule` 不能字面拆分

Template legacy-mode test 首次失敗於 `ApiKeysService` 無法解析 `Symbol(appspine.identity-store)`。原因是 `AuthModule` facade 原為 global composition；單純換成 `IdentityCoreModule + OidcAuthModule` 不保證同一 visibility。處置：九個已完成 plugin rollout 的 App 移除 dual-mode legacy branch，固定使用 plugin host；codemod 對 `AuthModule` 改為 manual stop。

### 5.2 Capability frontend type 漂移

Wiki／Calendar 首次 frontend typecheck 顯示 local `DomainEventDelivery` 缺少 canonical `domainEventId`、`lastAttemptAt`、`updatedAt`。Chat／Drive／Approve 的同型檔案一併對齊，改為延伸 `@appspine/domain-events/frontend` canonical row types，保留各 App 額外欄位，沒有使用 `as any`。

### 5.3 Chat feature-module provider visibility

Chat 單元 DI compile 通過，但 real boot 證明 sibling feature module 無法直接看見 root plugin composition 匯出的 class provider。處置：新增非 global `AppspinePlatformModule` wrapper；AppModule 與 ChatModule 明確 import 同一 composition，未重新引入 `AuthModule` 或重複建立 OIDC module。修正後 real boot 與 WebSocket handshake 通過。

## 6. 已知風險與限制

1. Chat 未修改版 `051-pl5-06-chat-wave-a.mjs` 在 Windows 上可完成 package install、artifact check、doctor、typecheck、build、38 tests、Prisma push、Nest `app.listen()` 與 Socket.IO handshake；最後用 `child.kill('SIGTERM')` 驗證 graceful shutdown 時，Windows 直接終止 child，腳本因看不到 hook log 而 exit 1。曾以 IPC 將同一 `SIGTERM` 送入 Node event loop 做校準，hook log、process exit、port release 三項斷言皆通過；該腳本修改已依本次範圍要求撤回，未納入 commit。這是測試 harness 的跨平台限制，不是啟動失敗，但在 M3 前應由 reviewer 決定是否另案修正。
2. pnpm 每次執行會提示 committed project `.npmrc` 的 `${NODE_AUTH_TOKEN}` expansion warning；未顯示 token 值，且不影響離線 lockfile、typecheck、build、test 或 real boot。
3. real-bootstrap 顯示 Prisma 6 的 `package.json#prisma` deprecation warning；與本次 legacy import migration 無關。
4. lockfile 仍可因 transitive compatibility package 出現 `@appspine/auth`；M2 的完成條件是 consumer 不再主動 import／宣告 direct dependency，M3 才會移除 package／exports。

## 7. Governance substitution log（§11）

| Actual agent | Required class | Substitution reason | Calibration | Independent reviewer | Evidence |
| --- | --- | --- | --- | --- | --- |
| OpenAI Codex（GPT-5 系列；本執行介面未揭露更細 model ID／推理強度） | Terra implementation role／G2 級實作 | 本環境未提供 Terra；依使用者明確指示由 Codex 執行 M1／M2 | telemetry scanner self-test、codemod semantic fixture、scratch dry-run／write／idempotence、九 repo typecheck／build／test、九 repo real boot；Template 與 Chat 的真實 DI 問題均由校準抓出後修正 |  | M1 `44469f5f9cfbbe386654d98413fbc939cf526edc`；九個 consumer HEAD 見 §4；Claude 後續獨立覆核待執行 |

## 8. M3 前置條件

技術面 fleet telemetry 已為 0，但 governance 前置條件尚未全部滿足：

- Claude 必須獨立覆核本報告、codemod manual-stop 行為、九個 consumer commits 與 Chat Windows harness 限制。
- 只能由 reviewer 更新 `051-plugin-platform-engineering-task-breakdown.md`／`051-legacy-removal-plan.md` 的完成狀態；本次未改任何 checkbox。
- 使用者須另行明確授權 breaking M3。
- 在授權前不得刪除 legacy exports／packages、移除 capability `@Global()`、bump 3.0.0、publish 或 push。
