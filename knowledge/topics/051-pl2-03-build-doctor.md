---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL2-03 — `build`／`doctor` 與 catalog diagnostics

> Task：`PL2-03`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL2-02](051-pl2-02-cli-commands.md)、PL1-06（host lifecycle／catalog）、PL1-07（architecture checker）。
> Changeset：`.changeset/051-phase2-build-doctor.md`。

---

## 1. 產生物框架，不只是一支指令

`build` 交付的是**框架**加**一個具體 generator**。框架寫一次，PL2-05（Nest composition）、PL2-06
（Prisma schema）、PL2-07（permission plan）各自註冊一個 generator 函式，不必各自重寫確定性與 drift 規則。

三個性質，依重要性排序：

1. **確定性**——同樣輸入產生同樣 bytes。做不到的話，「drift」的意思就變成「有人重跑過 generator」，
   那是雜訊，CI 會學會忽略它。測試以「同一份 inventory 兩種順序，產生的檔案 byte 相同」證明。
2. **自我描述**——每個 artefact 記錄它來自哪組輸入的 digest，`build --check` 因此能說**為什麼**過期，
   而不只是說它過期。
3. **是輸出，不是原始碼**——檔案裡寫明不要手改，而 drift check 是讓這句話有效力的東西。

### 1.1 `sourceDigest` 為什麼不只是 resolution digest

artefact 也依賴各 manifest 自己的 digest 與 inventory 的原始寫法。即使解算出來的順序碰巧一樣，
其中任何一個變了就必須讓輸出失效。所以 `sourceDigest` = canonical(inventory entries + resolution digest
+ 每個 manifest 的 name/version/digest)。

### 1.2 三種 drift 分得出來

| 情況 | 判斷依據 | 訊息 |
|---|---|---|
| 從沒產生過 | 檔案不存在 | `it has never been generated` |
| 輸入變了 | 檔案記錄的 `sourceDigest` ≠ 目前算出來的 | `the inventory or a manifest changed since it was written` |
| generator 變了 | 記錄的 digest **相同**但 bytes 不同 | `the generator changed since it was written` |

第三種是實務上最容易誤判的：升級 CLI 之後所有 App 都會 drift，操作者需要知道那不是他們改壞的。

## 2. `.appspine/generated/catalog.json`

PL2-03 能端到端完成的那個 generator：manifest 層面能知道的 catalog。與 PL2-04 的
`appspine.plugin-lock.json`（committed、reviewed）不同，這是**產生物**，可重生、被 drift 檢查。

每筆記錄 key／pluginId／package name+version／digest／manifestDigest／status／required／
provides／requires／unresolvedOptional／configRef／**env key 名稱與旗標**／routes／providerTokens／
prismaModels／healthIndicatorId。

**永遠不含任何值。** 測試把 `process.env.OIDC_CLIENT_SECRET` 設成哨兵字串再斷言它不出現在檔案裡，
而 `OIDC_CLIENT_SECRET` 這個**名字**必須出現——這正是計畫 §7「只顯示名稱，不顯示值」的兩面。

停用的 entry 會被列出並標 `disabled`，而不是消失。一份看不到停用項目的 catalog，會讓操作者以為
那筆設定不存在。

## 3. `build` 拒絕從壞掉的圖產生

inventory 解不開就不產生任何檔案，回 `RESOLUTION_FAILED`。從壞掉的 graph 產生 artefacts，會做出一批
**看起來權威、但描述一個開不起來的 App** 的檔案——而 `doctor` 接下來還會拿它們當比較基準。

`--check` 走的是**同一段產生程式碼**，只是比較而不寫入。一個與 generator 不同路徑的 drift 檢查，
只能告訴你兩者不一致，永遠說不出哪一邊才對。

## 4. `doctor` 的詞彙紀律

計畫 §7 列出 `doctor` 至少要回報的東西。全部都可以從 manifest、inventory 與 env key 的**名字**回答——
不讀值、不開機、不載入 plugin。

最重要的一條紀律是**不假裝知道執行期狀態**：

- `enabled`／`disabled` 是 inventory 事實 → `doctor` 直接回報。
- `failed`／`degraded` 是 boot 結果 → 每一筆的 `runtimeState` 一律是 `unknown-until-boot`。

沒跑過 lifecycle 卻回報「degraded」的工具，產出的是沒人能據以行動的輸出。這條由測試釘住。

env key 檢查只看 `key in process.env`，**從不讀值**。測試設好 `OIDC_ISSUER` 再斷言它的值不出現在
任何輸出裡，同時 `OIDC_CLIENT_SECRET`（沒設的那個）的名字必須被報出來。

### 4.1 exit code 的優先順序

drift 有自己的 code（`DRIFT_DETECTED`），因為修法是「跑 build」而不是「改輸入」。但**任何其他 error
都比它優先**：inventory 解不開時叫操作者去 rebuild，是把人帶往錯的方向。這條也有測試。

### 4.2 presets 會讓整份報告被標為不完整

inventory 宣告了還不能展開的 preset 時，`doctor` 明說「以下內容忽略了它們，所以並不完整」。給出一份
看起來完整的部分報告，比拒絕回答更糟。

## 5. 驗證

```bash
pnpm --filter @appspine/plugin-cli test   # 85 tests（PL2-03 新增 18）
```

涵蓋拆解點名的每一項：generated artifact build、enabled/disabled 狀態、missing env key 名稱、
route／token／model 進 catalog、digest／drift、preset expansion diagnostics。另加：

- byte 穩定（連跑兩次零改寫）與**順序無關**（兩種 inventory 順序產生相同檔案）。
- `.appspine/generated/` 內不相干的檔案不會被動到。
- 整輪 `build`／`doctor` 都不載入任何 plugin package（測試 App 裡每個安裝的 package 都有一個
  載入即 throw 的 `index.js`）。

## 6. 已知限制

- 目前只有一個 generator。`build` 的價值要等 PL2-05／06／07 註冊各自的 generator 才完整。
- `doctor` 不檢查 API／peer 版本相容——那需要讀 consumer 的 `package.json` 與已安裝版本做 range 比對，
  與 `051-pl1-architecture-check.mjs` 的職責重疊；統一由哪一邊做，留給 PL2-10 的 CI gate 決定。
- 「package 與 manifest digest 不一致」目前只在 catalog 記錄兩個 digest，尚未比對 lockfile（PL2-04）。
- preset 與實際解析版本的偏移（計畫 §7 最後一項）要等 PL2-08。
- `doctor` 不回報 duplicate permission；permission facet 由 PL2-07 擁有。duplicate route／token／
  model 由 resolver 在解算時就擋下，因此會以 resolver 的 diagnostic 出現，不是 `doctor` 自己的。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-03 |
| Actual agent | Claude Opus 5（拆解建議 Terra high + Gemini review operator usability；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Gemini provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-03-build-doctor` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §5；`packages/plugin-cli/src/commands/build-doctor.spec.ts` |
| 已知風險 | §6 |
| Rollback | 刪除 `packages/plugin-cli/src/generate.ts`、`src/commands/build.ts`、`src/commands/doctor.ts`、`src/commands/build-doctor.spec.ts`、`src/commands/test-support.ts`、`.changeset/051-phase2-build-doctor.md`、本文件；還原 `src/cli.ts` 的 `version`、`src/commands/index.ts`、`src/index.ts`、`tsconfig.build.json` 的 exclude |
