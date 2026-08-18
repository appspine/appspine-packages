---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL2-01 — `@appspine/plugin-cli` 與設定 schema

> Task：`PL2-01`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[Gate G1](051-pl1-gate-g1.md)。
> Changeset：`.changeset/051-phase2-plugin-cli.md`。
> 本 task 只交付 CLI 的**外殼**；`add`／`remove`／`list`／`validate` 見 [PL2-02](051-pl2-02-cli-commands.md)，
> `build`／`doctor` 是 PL2-03。

---

## 1. 為什麼先做外殼

拆解把 PL2-01（package + schema + config/secret 邊界 + exit code + 診斷格式）與 PL2-02（實際指令）分開，
理由在實作時變得很具體：**exit code 與 `--json` 格式一旦被 CI 依賴就是契約**。若讓每個指令 task 各自
決定「什麼算 usage error」「`--json` 長什麼樣」，第一個上線的指令就會把後面的都綁死在一個沒人設計過的
形狀上。

所以 `runCli` 的 command table 目前是空的，由後續 task 註冊：

```ts
runCli(argv, { commands: [addCommand, removeCommand, ...] })
```

`runCli` 是 `argv` + 注入的 IO 的純函式，**回傳** exit code，不呼叫 `process.exit`；只有 `bin.ts` 會。
於是每個指令（包含應該失敗的那些）都能在測試裡 in-process 執行而不會把 runner 一起帶走。

## 2. `appspine.plugins.json`

schema 在 `packages/plugin-cli/src/schema/appspine.plugins.v1.json`，`schemaVersion` 為
`appspine.plugins/v1`，`additionalProperties: false`。

| 欄位 | 用途 |
|---|---|
| `plugin` | package name（`@appspine/health-check`）或裸 plugin id（`health-check`）|
| `instanceId` | 穩定的安裝識別；改名是 migration，不是調設定 |
| `enabled` | 是否組裝 |
| `required` | `true` 時 lifecycle 失敗會中止啟動；`false` 只有 manifest 宣告 `optionalFailurePolicy` 才合法 |
| `configRef` | 指向 App config 的 dotted path。**是引用，不是值，更不是 secret** |
| `presets` | 從 v1 就宣告，但目前**非空即拒絕**（見 §2.2）|

**沒有**版本欄位。`pnpm-lock.yaml` 是版本的唯一真相（051 決策 10），在這裡再寫一次只會製造第二個會漂移
的來源。

### 2.1 schema 擋不到的三條規則

結構驗證（Ajv）與語意規則**都會跑**，即使前者已經失敗——理由和 PL1-04 一樣：一次只回報一個問題，會把
修設定變成一輪一次的猜謎。

- `duplicate-instance`：`health-check` 與 `@appspine/health-check` 是同一個 instance key。resolver 也會
  擋，但編輯這個檔案的人不該為了知道這件事而先跑一次 resolve。
- `disabled-optional-entry`（info）：`enabled: false` + `required: false` 沒有任何效果，通常是殘留。
- `presets-not-supported`：見下。

### 2.2 presets 為什麼是「拒絕」而不是「忽略」

`presets` 的展開是 PL2-08。在那之前，安靜地忽略它會讓 `plugin validate` 對一份**並不描述 App 實際執行
內容**的 inventory 回報通過——這是這個工具能做的最糟的事。因此 `parseInventory()` 回報 error，
`toResolverInventory()` 直接拋錯。欄位仍寫進 v1 schema，這樣今天寫下的 inventory 在 PL2-08 之後仍然讀得懂。

### 2.3 canonical 寫入

排序後的 entries、固定 key 順序、兩格縮排、LF、結尾換行。目的是**可 review 的 diff**：兩個開發者跑
`plugin add` 必須產生相同 bytes，而加一個 plugin 必須顯示為新增一個區塊，不是整份檔案重排。
`round-trips` 測試斷言「讀進來再寫出去」零變化。

## 3. Config 與 secret 邊界

051 計畫 §7 分四個 owner。CLI 看得到的只有兩條邊，它就只守這兩條：

1. **inventory 只放引用。** `configRef` 是 dotted path。長得像值的（含空白、`://`、PEM header、32 字元以上
   的 base64／hex、`ghp_`／`sk_`／`xoxb-` 這類前綴）一律拒絕，code `secret-value-in-inventory`。
   **診斷訊息絕不回顯那段文字**——如果它是因為真的被貼了 secret 才觸發，把它印出來等於把憑證送進這個
   檢查本來要阻止它進入的那份 CI log。另有 `secret-looking-config-ref`：路徑片段本身命名了 secret
   （`oidc.clientSecret`）。
2. **build-time 只要求 secret env key「有宣告」。** 從不要求、也從不讀取 production 值。
   `environmentRequirements()` 只讀 manifest，完全不碰 `process.env`——測試把
   `process.env.OIDC_CLIENT_SECRET` 設成一個哨兵值再斷言它不出現在輸出裡。

第三條邊——`appspine.config.ts` 裡的實際值——**刻意不在範圍內**。那是 TypeScript，為了檢查它而執行 App
的程式碼，是拿一個真實保證去換一點方便。值的驗證在 host 開機時做，schema 就在那裡。

### 3.1 CLI 不改寫 TypeScript

計畫 §7 寫明 CLI 不得以脆弱的文字替換修改任意 TypeScript。`configStub(manifest)` 因此產生**一段文字**
讓開發者自己 review 後貼進去，每個 CLI 不可能知道的值都留 `TODO`，並列出 env key 的名稱與
required／secret 旗標（永遠不含值）。「產生一段沒人會自動套用的文字」是設計，不是缺陷。

## 4. Exit code 與 `--json`

exit code 依「呼叫者接下來該做什麼」分類，不是依「哪個檢查失敗」。「你的 inventory 不合法」與
「inventory 合法但解不開」需要不同反應，所以是不同 code；兩種不同的 resolution 衝突不需要，所以共用一個，
靠 diagnostic `code` 區分。

| Code | Name | 意義 |
|---:|---|---|
| 0 | `OK` | 成功 |
| 1 | `INTERNAL_ERROR` | CLI 自己壞了。**永遠不用於它應該偵測的情況** |
| 2 | `USAGE` | 未知指令／參數／flag；什麼都沒讀也沒寫 |
| 3 | `VALIDATION_FAILED` | 輸入格式不對：inventory、manifest、configRef、secret 邊界 |
| 4 | `RESOLUTION_FAILED` | 輸入都合法但組不起來 |
| 5 | `DRIFT_DETECTED` | 產生物與現況不符（PL2-03／PL2-05）。修法是「重跑 build」不是「改輸入」 |
| 6 | `NOT_FOUND` | 沒有這個 plugin／instance／preset |
| 7 | `CONFLICT` | 現況沒問題，但這次**編輯**會弄壞 inventory |

新增 code 是 minor；改變既有數字的意義是 breaking。測試以字面值逐一斷言整張表，不是從實作推導。

`--json` 輸出 `appspine.cli-result/v1` 單一 document，含 `exitCodeName`（腳本應比對名字而非數字）。
文字與 JSON **由同一個物件產生**：一份會與操作者螢幕上看到的內容漂移的 `--json`，比沒有 `--json` 更糟。
未知 flag 是 `USAGE` 錯誤而非忽略——`--frce` 被安靜吃掉，等於一個以為自己開了 force 的腳本。

## 5. 「不執行 plugin code」怎麼證明

計畫 §9 要求 manifest parsing 不執行 package code，CLI 不得執行未驗證的 plugin runtime。兩個測試：

1. **地雷**：在 App 目錄放一個載入即 `throw` 的 `plugin.js` 與一個同樣會 throw 的 `appspine.config.ts`，
   讀取 inventory 仍必須成功。
2. **能力不存在**：掃描本 package 全部非 spec 原始碼，斷言沒有任何 `import(`、`require(`、
   `child_process`／`execSync`／`spawnSync`。地雷只證明測試走過的路徑；這一條證明整個能力在發布的原始碼裡
   就不存在。

## 6. 驗證

```bash
pnpm --filter @appspine/plugin-cli test   # 42 tests
node scripts/051-pl1-architecture-check.mjs
```

`plugin-cli` 已登記為 `FOUNDATION_PACKAGES`（不得依賴任何 capability plugin），architecture checker
21 packages 0 findings。完整 workspace gate 見 §8。

## 7. 已知限制

- command table 是空的；本 task 不交付任何實際指令。
- `presets` 只有 schema，沒有展開（PL2-08）。
- `configStub()` 只依 manifest 產生骨架；它不知道 plugin 的 config schema 內部欄位，因為那是
  執行期的 zod schema，讀它就要載入 plugin code。PL2-03 的 `doctor` 會在**開機後**回報缺少的欄位。
- `CREDENTIAL_SHAPED` 是 heuristic，不是保證。真正的契約是「inventory 只放路徑」；這條規則只是把最常見的
  誤貼擋下來。
- CLI 尚未讀取任何 manifest（`checkConfigBoundary` 的 manifests 參數目前由呼叫者提供）；從 package 解析
  manifest 是 PL2-02 的工作。
- 本文件原本寫「CLI 只寫一個檔案」。[PL2-02](051-pl2-02-cli-commands.md) 讓 `add` 也會寫
  `package.json` 的 `dependencies`（計畫 §7 step 3 要求的）。正確的說法是：**寫入面是兩個宣告式 JSON
  檔案，而且永遠不碰 TypeScript**。`writeInventory` 本身仍然只寫 inventory，那條測試依然成立。

## 8. Workspace gate

本 task 起恢復拆解 §1.1 的「一個 task 一個 branch」——branch `051-pl2-01-plugin-cli`。

| 指令 | 結果 |
|---|---|
| `pnpm lint` | ✅ 539 files |
| `pnpm build` | ✅ 21 packages |
| `pnpm typecheck` | ✅ 21 packages |
| `pnpm test` | ✅ **840 tests / 21 packages**（新增 42） |
| `pnpm verify:phase0` | ✅ 84 checks |
| `pnpm verify:phase1` | ✅ self-test 13/13、architecture 21 packages 0 findings、clean consumer 7/7 |
| `pnpm verify:snapshot` | ✅ byte-identical（116051 bytes，`fixtures/051-pl2-baseline/`） |
| `pnpm check:changeset-discipline` | ✅ |
| `node scripts/lint-knowledge.js` | ✅ |
| `git diff --check` | ✅ |

### 8.1 順帶修掉的兩件事

| 事項 | 說明 |
|---|---|
| snapshot baseline 的封存規則 | `scripts/051-pl0-snapshot.mjs` 原本只拒絕覆寫 PL0 基線。Gate G1 通過後 PL1 基線也成為 gate 證據，因此改為 `SEALED_BASELINES` 集合：PL0 與 PL1 都不可重生，`verify:snapshot` 改為檢查**當期** phase 的 `fixtures/051-pl2-baseline/snapshot.json`。每個 phase 在自己的 gate 封存自己的那份 |
| `packages/plugin-api/src/diagnostics.ts` 的 4 個 raw NUL byte | `sortDiagnostics` 的 key 分隔符直接寫了 0x00 位元組而非 `\u0000` escape。行為相同，但那讓整個檔案在 grep／diff／review 工具眼中變成 binary——控制字元因此可以躺在一份已 review 過的原始碼裡而沒人看得到。已改為 escape，並以 Python（不是 grep，grep 會跳過 binary 檔）掃過整個 repo 確認沒有其他處 |

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-01 |
| Actual agent | Claude Opus 5（拆解建議 Terra xhigh + Sol review config/security boundary；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Sol provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收；本 task 的 handoff 尚未被獨立 reviewer 接受 |
| Branch | `051-pl2-01-plugin-cli` |
| Commit | `b75516d` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §2～§5；`packages/plugin-cli/src/cli.spec.ts`（42 tests）；architecture checker 21 packages 0 findings |
| 已知風險 | §7 |
| Rollback | 刪除 `packages/plugin-cli`、`fixtures/051-pl2-baseline/`、`.changeset/051-phase2-plugin-cli.md`、本文件；還原 root `tsconfig.json` reference、root `package.json` 的 `verify:snapshot` baseline、`scripts/051-pl1-architecture-check.mjs` 的 `FOUNDATION_PACKAGES`、`scripts/051-pl0-snapshot.mjs` 的 `SEALED_BASELINES` |
