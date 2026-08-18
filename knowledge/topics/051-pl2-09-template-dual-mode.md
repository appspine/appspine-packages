---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL2-09 — template 雙模式 host + preset

> Task：`PL2-09`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> Repo：`appspine-app-template`（branch `051-pl2-09-dual-mode-host`）＋ 本 repo 的驗證腳本。
> 依賴：[PL2-05](051-pl2-05-generated-composition.md)～[PL2-08](051-pl2-08-preset-standard.md)。
> Changeset：`.changeset/051-phase2-doctor-input-parity.md`（本 task 在 template 上抓到的 CLI bug）。

---

## 1. 為什麼要雙模式

**回退必須便宜，否則沒人敢往前走。** 有了雙模式，從 plugin mode 退回去不需要 migration、不需要改資料、
不需要第二次部署——舊的接線還在，而且還被測試著。這個性質比「把舊清單刪掉比較乾淨」值錢得多。

預設是 legacy，也是刻意的：**升級 package** 與 **改變組裝方式** 是兩個各自可回退的步驟，不該綁在一起。

```bash
APPSPINE_PLUGIN_MODE=1   # 走 plugin host
# 其他值（含未設定）維持手工 import
```

## 2. template 的改動

| 檔案 | 內容 |
|---|---|
| `backend/appspine.plugins.json` | 一個 preset，由 CLI 展開成一般 entry |
| `backend/src/appspine.config.ts` | 那些 plugin 讀的值，僅此而已 |
| `backend/src/app.module.ts` | 一份 App 自有的 module 清單 + 兩份 capability 清單並排 |
| `backend/src/app.module.spec.ts` | 兩種模式都要組得起來 |
| `docs/plugin-mode.md` | 操作說明 |

`app.module.ts` 把 App 自有的（logging、Prisma、本 App 的業務 module）抽成一份不隨模式改變的清單，
**唯一會變的東西因此在 diff 裡看得見**。`RbacModule`／`ApiKeysModule`／`MetaModule`／`McpModule`
在兩種模式下都手工接線——它們要到 Phase 4 才有 manifest，**明列出來勝過把差異藏起來**。

### 2.1 backend 才是 host 眼中的「App」

`appspine.plugins.json` 放在 `backend/`，產生物落在 `backend/.appspine/generated/`。
`src/appspine.config.ts` 以 `../.appspine/generated/backend/composition` import 它。一開始放在 repo 根，
結果 backend 的相對路徑對不上——這是實際跑出來才發現的。

### 2.2 `hostCapabilities` 是名字，不是物件

resolver 只需要 capability **名稱**可被滿足；真正的物件透過 Nest 到達 plugin。`PrismaModule` 與
`RbacModule` 在過渡期都是 `@Global()`，所以 `PrismaService` 與 `RBAC_POLICY` 本來就在 scope 裡。
051 決策 3 在 Phase 4 移除那些 global 時，**這一行就必須變成真正的 provider bridge**——config 裡有註解寫著。

### 2.3 OIDC 的三個值由 App 轉發

`oidc-auth` 的 manifest 把 `OIDC_ISSUER`／`OIDC_AUDIENCE`／`OIDC_JWKS_URL` 宣告為 environment key，
而它的 config schema 又要求這三個值。**這不是矛盾，是分工在運作**：operator 設環境變數、App 決定它們
落在哪個 config 分支、plugin 在開機時驗證結果。轉發是 App 的工作，正因為只有 App 知道自己的部署方式。

三者都是 `secret: false`。真正的憑證永遠不會出現在這個檔案裡——plugin 自己去讀環境。

## 3. 驗證方式：把 template 複製到 temp 再裝 tarball

template 從 registry 取 `@appspine/*`，而 Phase 2 的 package **尚未發布**（發布是 PL5 的 gate）。
所以不可能就地驗證，除非提前發布，或把 `file:` 依賴 commit 進一個別人會 fork 的 repo。

`scripts/051-pl2-09-template-dual-mode.mjs` 因此把 template 複製到暫存目錄、在那裡指向打包好的 tarball、
把整套跑一遍。template repo 保留乾淨可 review 的 diff，證據是真的。與 PL1-14 clean consumer 同樣的理由：
workspace symlink 證明不了 consumer 實際裝到什麼。

實際跑過的：

```text
tsc -b → pnpm pack ×20 → copy template → pnpm install（tarball overrides）
→ prisma generate → appspine build → appspine build --check（乾淨）→ appspine doctor（乾淨）
→ backend typecheck → nest build → vitest：9 tests passed
```

`backend typecheck` 這一步**正是 PL2-05 記為「未完成」的那一項**：產生出來的 composition.ts 真的被
TypeScript 編譯過了。

### 3.1 途中修掉的三個真問題

| # | 問題 | 修法 |
|---|---|---|
| 1 | `pluginMode()` 宣告成 `DynamicModule[]`，但也回傳普通 module class | 改為 `NonNullable<ModuleMetadata["imports"]>` |
| 2 | pnpm 的 `overrides` **不套用到自動安裝的 peer**——`metadata-schema` → `m2m-api-key` → peer `plugin-host-nest` 讓 frontend 去 registry 抓一個不存在的 package | 把全部 tarball 加進 root devDependencies，讓 peer 已經是實際存在、由 file: 解析的依賴 |
| 3 | **`doctor` 的 GenerationInput 少了 preset provenance**，於是它對一個剛 build 完的 App 回報 4 個 artefact 過期、4 個 lockfile finding | 改成與 `build` 完全相同的輸入，並在 `preset.spec.ts` 新增回歸測試（拿掉修正該測試立刻紅）|

第 3 個是真正重要的：**一個會亂叫的診斷工具，是一個人們會學會忽略的診斷工具**。它只有在對著真實 App
跑起來時才會現形，這就是 PL2-09 存在的價值。

## 4. 尚未完成的部分（重要）

- **template 的改動已 staged 但未 commit。** 該 repo 的 pre-commit hook 會跑完整 typecheck，而
  `@appspine/plugin-host-nest` 等尚未發布、裝不起來，所以 hook **必然失敗**。沒有繞過 hook：那個失敗
  是真的，repo 現在確實 typecheck 不過。commit 要等 PL5 發布後。
- **沒有跑 E2E。** 拆解的驗收寫「plugin mode 與 legacy mode API/E2E parity」。目前只證明到
  **兩種模式的 DI graph 都組得起來**（`compile()`，不需要資料庫）——那正好抓到 missing provider、
  duplicate route、unsatisfied capability。真正的 API/E2E parity 需要 Postgres + Keycloak，屬 PL2-10
  的 CI matrix 與 PL5 rollout。
- fresh fork 重建：腳本每次都是全新複製 + 全新 install，所以「fresh fork 可重建」這一項成立；
  但沒有從 git clone 開始跑過。
- rollback 演練只做到「切回 legacy 仍能組裝」，沒有實際部署過。

## 5. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-09 |
| Actual agent | Claude Opus 5（拆解建議 Terra xhigh + Gemini integration review；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Gemini provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-09-template-dual-mode`（本 repo）、`051-pl2-09-dual-mode-host`（template，**未 commit**）|
| Tools | repo read/write、pnpm、pnpm pack、vitest、tsc、nest build、prisma generate、biome |
| Evidence | §3 的完整流程；`pnpm verify:template-dual-mode` |
| 已知風險 | §4，尤其前兩項 |
| Rollback | 刪除 `scripts/051-pl2-09-template-dual-mode.mjs`、`.changeset/051-phase2-doctor-input-parity.md`、本文件；還原 root `package.json` 的 `verify:template-dual-mode`、`plugin-cli` 的 `commands/doctor.ts`；template branch 直接丟棄（未 commit）|
