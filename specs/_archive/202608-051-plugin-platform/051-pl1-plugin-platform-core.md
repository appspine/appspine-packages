---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL1-01/02/03/04/05/06/11 — 最小平台核心

> Tasks：`PL1-01`（plugin-api）、`PL1-02`（plugin-testkit）、`PL1-03`（host 骨架）、`PL1-04`（manifest
> loader）、`PL1-05`（dependency resolver）、`PL1-06`（Nest host lifecycle／catalog／diagnostics）、
> `PL1-11`（authentication strategy registry／principal bridge）。
> 見 [051 拆解 §5](../decisions/051-plugin-platform-engineering-task-breakdown.md#5-phase-1--最小平台核心與三種試點)。
> 依賴：[Gate G0](051-pl0-gate-g0.md)。
> 本文件只涵蓋 Phase 1 的平台核心。其餘 task 見 [PL1-07／14](051-pl1-architecture-and-consumer-checks.md)、
> [PL1-08／09](051-pl1-pilot-plugins.md)、[PL1-10／12／13](051-pl1-identity-auth-split.md)；
> 完整 task ledger 與 workspace gate 見 [PL1 執行紀錄](051-pl1-execution-log.md)，gate 判定見
> [Gate G1](051-pl1-gate-g1.md)。

---

## 1. 三個新 package 與它們的邊界

| Package | 版本 | 角色 | 不做什麼 |
|---|---|---|---|
| `@appspine/plugin-api` | 1.0.0 | manifest 型別與 JSON Schema、capability registry、stable tokens 與最小 port 介面、`definePlugin()`、lifecycle／diagnostic contract、loader、resolver、runtime | 不依賴 Nest／Prisma／Next／React；root barrel 不碰 `node:fs` |
| `@appspine/plugin-testkit` | 1.0.0 | manifest／inventory builder、fake capability、lifecycle harness 與 recorder、catalog／diagnostic assertions | 不依賴 host（否則與 PL1-03 形成 cycle）、不綁定測試 runner |
| `@appspine/plugin-host-nest` | 1.0.0 | Nest 組裝、lifecycle 執行、catalog／health、authentication strategy registry、principal context | 不反向依賴任何 capability plugin |

`plugin-api` 起版 **1.0.0** 而非 repo 慣例的 `0.1.0`：PL0-05 fixtures 已凍結
`engine.appspinePluginApi: "^1.0.0"`，0.x 會讓每個既有 fixture 的 engine 檢查失敗，而 fixtures 是
frozen contract，不能為了版號慣例改動。

## 2. 已核准範圍內、但屬於實作判斷的決定

拆解沒有指定這幾件事的落點，以下是本次的選擇與理由；若後續 Phase 要改，請先回來更新本節。

| 決定 | 選擇 | 理由 |
|---|---|---|
| loader／resolver 放哪個 package | `@appspine/plugin-api` 的 `./loader`／`./resolver` subpath | 兩者都與框架無關，而 PL2-01 的 `plugin-cli` 需要它們但不該因此拉進 NestJS；PL1-06（Nest-specific）依賴 PL1-05 的順序也指向「resolver 不屬於 host」 |
| lifecycle 引擎放哪裡 | `@appspine/plugin-api` 的 `./runtime` subpath | testkit 必須能驅動 lifecycle，但不能依賴 host（PL1-03 依賴 PL1-02）。放在 host 會逼出第二份實作，而 PL0-05 lifecycle fixtures 的存在正是為了避免兩份實作各自漂移 |
| manifest 的單一真相 | 每個 plugin 同時有 `appspine.plugin.json`（發布物）與 `src/plugin.ts` 內的同名常數，由該 package 自己的 spec 斷言兩者 deep-equal | `rootDir: ./src` 讓 TypeScript 無法 import package 根目錄的 JSON；`__dirname` 在 vitest ESM 下不可靠。強制性的重複比「執行期讀檔」更安全，也讓 CLI 仍能不執行任何 package code 就讀到 manifest |
| JSON Schema 驗證函式庫 | Ajv 2020 | Gate G0 §7 明確把「改用 ajv 或等價函式庫」交給 PL1-04 |
| lifecycle 執行順序 | 逐 instance 跑 `validate → register → ready`，而非逐 stage 掃全部 instance | `fixtures/051-manifest-v1/lifecycle/required-plugin-failure-aborts-boot.json` 期望後續 instance 是 `not-reached`；逐 stage 會讓它們停在 `validated`，與凍結期望不符 |
| host 的 auth 基礎設施 | 抽成 `AppspineAuthInfrastructureModule` 普通 Nest module，dynamic host module 與 `@appspine/auth` facade 都 import 它 | Nest 對同一個 module class 只建立一份 instance，因此兩種 wiring 共用同一個 strategy registry；若各自 provide，"只能有一個 interactive provider" 會退化成「每個 registry 各一個」 |
| principal context 的實作 | `AsyncLocalStorage` + `APP_INTERCEPTOR`，而非 request-scoped provider | request scope 具有傳染性，會把所有注入它的 provider 變成 per-request，跨插件影響效能與語意 |

## 3. Manifest schema：對 PL0-05 凍結契約的「細化」而非改寫

`packages/plugin-api/src/schema/appspine.plugin.v1.json` 與
[`knowledge/contracts/051-manifest-v1.schema.json`](../contracts/051-manifest-v1.schema.json) 的關係由
`packages/plugin-api/src/schema.spec.ts` 強制：

- 非 `facets` 的每一個 top-level property **逐鍵 deep-equal**；
- top-level property 名單、`required`、`additionalProperties: false`、`type` 全等；
- `facets` 容器的 `minProperties`／`additionalProperties` 與五個 facet 名稱集合全等；
- `frontend`／`prisma`／`permissions` 維持 `{"type":"object"}`（PL3-02／PL2-06／PL2-07 才擁有）；
- 只有 `backend`／`operations` 被收緊——這正是 PL0-05 schema 自己寫明「their exact shape is defined by
  PL1-06」的兩個 facet。

**PL0-05 fixtures 全數通過**：6 個 positive 零 error，9 個 negative 各自出現 index 宣告的
`expectedFailure` code。為了做到後者，loader 在結構驗證失敗時**仍會執行語意規則**——
`official-plugin-replaces.json` 同時有空 backend facet（結構）與非 app-local 的 `replaces`（語意），
只回報第一個會讓凍結期望失效，也會讓修 manifest 變成一次一輪的猜謎。

## 4. Loader 與 resolver 的實際規則

### 4.1 Loader（PL1-04）

- 結構：Ajv 2020 對 shipped schema 驗證，錯誤 code 沿用 PL0-05 詞彙（`required-field-missing`、
  `unknown-field`、`invalid-engine-range`、`empty-facets`…）。
- 語意：PL0-05 的四條（interactive provider 未宣告 conflicts、self-conflict、replaces 非 app-local、
  secret-looking env key 未標 secret）**原封保留**，另加：host-owned capability 被 plugin `provides`、
  自我 requires、`replaces` 指向自己、worker／healthIndicator／metricsPrefix 命名空間不符（PL0-03 §4）、
  未登記 capability（預設 warning，`strictCapabilityRegistry` 下升為 error）。
- Engine：三個問題分開回報——range 本身無效（`invalid-engine-range`）、host 版本不滿足
  （`engine-range-unsatisfied`）、兩個 range 完全沒有交集（`engine-range-no-intersection`）。
  刻意不對 host 值做 `semver.coerce`：`coerce('^10.0.0')` 會得到 `10.0.0`，把 range 檢查悄悄變成
  版本檢查並回報錯誤的原因。
- Digest：canonical JSON（key 排序、陣列順序保留）→ sha256。`manifestDigest` 只涵蓋 manifest；
  `digest` 併入 package name/version，是 PL2-04 lockfile 要記的值。傳入 `expectedDigest` 可偵測竄改。
- **不執行 plugin code**：`loader.spec.ts` 放一個會 `throw` 的 `health.module.js` 在 fixture package
  內，載入 manifest 仍不得拋錯。
- 錯誤訊息只含欄位路徑與安全的字面值；malformed JSON 不回傳檔案內容（測試以 `hunter2` 斷言）。

### 4.2 Resolver（PL1-05）

輸入 inventory + manifests + host capabilities，輸出 `order`／`instances`／`providers`／`disabled`／
`digest`。已實作並有測試的規則：unknown plugin、duplicate instance、singleton cardinality、
optional 但無 `optionalFailurePolicy`、configRef 不符、app-local 卻來自官方 scope、plugin conflicts、
duplicate capability provider、host capability 被覆寫、`replaces` 目標未啟用、missing required
capability、unresolved optional（info）、dependency cycle、以及 route／provider token／worker／
health indicator／Prisma model 的重複貢獻。

確定性由兩件事保證：inventory 與 manifests 先排序才處理；Kahn 拓撲排序的每一輪 frontier 以 instance
key 字典序展開。`resolution ordering` 一節用 3 個 inventory × 3 個 manifest 的**全部 36 種排列**斷言
order 與 digest 完全一致。

兩者的關係在 Gate G1 獨立 review 中被更正過：它們**互為備援**，單獨拿掉任一個，全部測試仍然綠——
也就是說當時沒有任何測試在保護個別機制。現在 `orders by instance key, not by the inventory sort key`
用唯一一組兩者會給出不同答案的輸入（instanceId 排在 `default` 之前的 multi-instance plugin）把
**frontier 排序**釘成權威來源，拿掉它會紅。inventory 預排序保留為 defence-in-depth，但它今天對
`order` 沒有可觀察的影響，程式碼註解已如實標示，不再宣稱「兩者都有測試」。

同一個 `cardinality: multiple` plugin 的多個 instance 會共用 backend module class 與 Prisma model，
這不是衝突；route／token／worker 則仍視為衝突，因為它們真的會撞——這正是 PL0-03 §4 要求 multi-instance
必須 instance-qualify 這三者的原因。

## 5. Host 行為（PL1-06）與 authentication（PL1-11）

`createAppspineModule(config)` 在 Nest bootstrap 前依序完成 051 計畫 §4.3 的 1～5 步：config 驗證
（失敗只回報 configRef 路徑與 parser 訊息，不回顯值）、engine／conflict／cardinality、
provides/requires 解算、cycle 與確定性排序、Dynamic Module 組裝。第 6 步 catalog／diagnostics 由
`AppspinePluginHost` 在 injector 建好之後完成。

`packages/plugin-host-nest/src/host/host.spec.ts` 用**真實 Nest application context**（`Test…compile()`
+ `init()`／`close()`，不需要 HTTP adapter）覆蓋：正常 boot 與 catalog、capability 綁到 stable token
後能在 lifecycle hook 取用、required capability 缺失時整個組裝失敗、duplicate route 在 Nest 看到之前
就被擋下、config 驗證不外洩 secret、catalog 內 secret 已 redact、同步 factory 回傳 Promise 時要求改用
async 入口、required 失敗中止啟動且後續 instance 標 `not-reached`、optional 失敗降級、`app.close()`
反序釋放資源、以及「沒有 hot unload API」。

PL1-11 的 registry 允許 interactive 與 machine 並存、拒絕第二個 interactive provider（錯誤訊息指向
account-linking 而不是「再註冊一次」）、以 id 排序而非註冊順序決定嘗試順序。三個中立 guard 的
fail-closed 行為都有測試，其中最重要的一條是：**strategy 若認得憑證但判定無效，錯誤直接往外拋，
不會 fall through 到較弱的 strategy**——否則一個過期的登入會變成另一種身分的請求。

## 6. 驗證

```bash
pnpm --filter @appspine/plugin-api test        # 104 tests
pnpm --filter @appspine/plugin-testkit test    # 16 tests
pnpm --filter @appspine/plugin-host-nest test  # 31 tests
```

三者皆通過；完整 workspace gate 見 [PL1 執行紀錄](051-pl1-execution-log.md)。

## 7. 已知限制

- `plugin-api` 的 `./runtime` 是本次新增的第四個 subpath，拆解文件未預期它存在（理由見 §2）。
- catalog 目前只有 in-process 讀取介面；`/admin/plugins` 端點屬於 PL3-10。
- host 尚未消費 PL2-05 的 generated composition：`config/composition.ts` 已凍結型別，實際 generator
  是 PL2-05 的工作。
- `definePlugin()` 的 `AnyDefinedPlugin` 上界用了 `any`（有 biome-ignore 與理由）：`TConfig` 同時出現在
  factory 參數（逆變）與 parser 回傳（協變），沒有任何具體型別能同時是兩者的父型別。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL1-01、PL1-02、PL1-03、PL1-04、PL1-05、PL1-06、PL1-11 |
| Commit | `4c0ce5f`（branch `051-plugin-platform-phase0-phase1`）——Phase 0 與 Phase 1 合併為單一 commit，偏離見 [Gate G1 §1](051-pl1-gate-g1.md) |
| Actual agent | Claude Opus 5（單一 session 依序執行；拆解建議的 Sol xhigh／Terra high 未接入，屬 §11 替代） |
| Required class | G3（PL1-01／04／05／06／11）、G2（PL1-02／03） |
| Substitution reason | 本 session 無獨立 Sol／Terra provider；使用者要求直接執行 Phase 1 |
| Independent reviewer | 見 [Gate G1](051-pl1-gate-g1.md) |
| Tools | repo read/write、pnpm、vitest、tsc、biome |
| Evidence | 本文件 §3～§6；`packages/plugin-api/src/**/*.spec.ts`、`plugin-testkit/src/testkit.spec.ts`、`plugin-host-nest/src/**/*.spec.ts` |
| 已知風險 | §7；reviewer 獨立性見 [Gate G1](051-pl1-gate-g1.md) §1 |
| Rollback | 刪除 `packages/plugin-api`、`packages/plugin-testkit`、`packages/plugin-host-nest`、對應的 root `tsconfig.json` references 與 `.changeset/051-phase1-plugin-platform-core.md` |
