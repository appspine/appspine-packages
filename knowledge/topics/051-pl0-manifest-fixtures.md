---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL0-05 — Manifest／Inventory／Config／Lifecycle Acceptance Fixtures

> Task: `PL0-05`（見 [051 拆解 §4](../decisions/051-plugin-platform-engineering-task-breakdown.md#pl0-05-凍結-manifestinventoryconfiglifecycle-acceptance-fixtures)）。
> Owner（實際執行）：Claude Sonnet（G2，文件建議 owner：Claude Sonnet G2；Sol G3 gate、Gemini blind-spot
> audit 併入 Gate G0 統一處理，見末尾 Execution Log）。
> 依賴：[PL0-03 分類與命名 registry](051-pl0-package-classification.md)、[PL0-04 identity matrix](051-pl0-identity-responsibility-matrix.md)。

`@appspine/plugin-api` 尚未存在（PL1-01 才建立），因此本 task 交付的是「凍結的 schema + fixture +
純資料驗證器」，不是真正的插件 runtime。fixture 本身是純 JSON，驗證器只做結構與語意檢查，**不載入或
執行任何插件程式碼**（符合拆解 §4 驗收條件「fixture 不執行插件 runtime code 即可解析」）。PL1-04 實作
manifest loader 時必須至少通過本文件列出的全部 fixture，若屆時發現規則需要調整，先回來修訂本文件與
schema，不得在 PL1-04 私自改變 contract。

## 1. 交付物

| 檔案 | 用途 |
|---|---|
| [`knowledge/contracts/051-manifest-v1.schema.json`](../contracts/051-manifest-v1.schema.json) | `appspine.plugin/v1` manifest 的 JSON Schema（draft 2020-12），涵蓋 [051 計畫 §4.1](../decisions/051-plugin-platform-engineering-plan.md) 的 `PluginManifestV1` interface |
| [`fixtures/051-manifest-v1/positive/*.json`](../../fixtures/051-manifest-v1/positive)（6 個） | 合法 manifest 範例 |
| [`fixtures/051-manifest-v1/negative/*.json`](../../fixtures/051-manifest-v1/negative)（9 個） | 違反單一規則的 manifest，每個標註預期失敗代碼 |
| [`fixtures/051-manifest-v1/lifecycle/*.json`](../../fixtures/051-manifest-v1/lifecycle)（3 個） | required/optional failure 與 shutdown ordering 的 inventory-level 驗收資料 |
| [`fixtures/051-manifest-v1/index.json`](../../fixtures/051-manifest-v1/index.json) | fixture 清單 + 每個 negative fixture 的預期失敗代碼 |
| [`scripts/051-pl0-manifest-fixture-check.mjs`](../../scripts/051-pl0-manifest-fixture-check.mjs) | 驗證器：**直接載入並解釋** `051-manifest-v1.schema.json`（自寫的 JSON Schema draft 2020-12 子集直譯器，見第 3 節）做結構檢查，加上獨立的語意檢查（§3.2），比對 `index.json` 宣告的預期結果 |

```bash
node scripts/051-pl0-manifest-fixture-check.mjs
```

執行結果：**20 項檢查全數 PASS**（6 positive + 9 negative + 3 lifecycle + fixture index completeness +
schema self-test，逐一比對預期結果，見下方第 5 節完整輸出）。

## 2. 涵蓋的已核准決策（對照拆解 §4 PL0-05 要求逐項核對）

| 要求 | 對應 fixture |
|---|---|
| facets | `positive/rbac-full-facets.json`（5 個 facet 全部出現）；`negative/missing-facet.json`（空 `facets`） |
| engine ranges | 全部 positive fixture 的 `engine`；`negative/invalid-engine-range.json`（`"latest"` 不是合法 range） |
| provides/requires | 全部 fixture；`negative/provides-conflicts-contradiction.json` |
| optional（`optionalRequires`） | `positive/master-data-client-multiple.json` |
| conflicts | `positive/oidc-auth-interactive-provider.json`；`negative/interactive-provider-missing-conflicts.json` |
| replaces | `positive/app-local-replaces-override.json`；`negative/replaces-missing-exact-target.json` 強制 plugin/facet/contribution 精確 target；`negative/official-plugin-replaces.json` 強制只有 app-local distribution 可替換 |
| singleton/multiple | `positive/*`（多數 singleton）／`positive/master-data-client-multiple.json`（multiple） |
| required/optional failure | `lifecycle/required-plugin-failure-aborts-boot.json`／`lifecycle/optional-plugin-failure-degrades.json`；後者會載入 master-data manifest 並驗證 instance isolation + readiness/catalog/alert degraded policy |
| configRef | `positive/master-data-client-multiple.json`（`configSchema.configRef`） |
| secret redaction | `positive/master-data-client-multiple.json`（`secret: true`）；`negative/secret-not-redacted.json` |
| lifecycle | `lifecycle/*`（含 `reverse-order-shutdown.json`） |

未在計畫原文逐字列出、但 PL0-05 認為必須有 fixture 的兩個語意規則，一併凍結於 schema/checker：

- **`unknown-field` 政策**（`negative/unknown-top-level-field.json`）：manifest v1 對頂層欄位採
  `additionalProperties: false`，呼應 [051 計畫 §9](../decisions/051-plugin-platform-engineering-plan.md)
  「production 只允許...digest 相符的插件」的嚴格 parsing 立場。
- **自我衝突偵測**（`negative/provides-conflicts-contradiction.json`）：manifest 不得在 `conflicts`
  中列出自己的 plugin ID（見 §3.2 第 2 點的命名空間更正說明）。

## 3. 驗證器實作（`scripts/051-pl0-manifest-fixture-check.mjs`）

### 3.1 結構檢查：直接解釋 schema 檔案，不是重寫規則

**更正（獨立 review 發現，初版設計缺陷）**：初版 checker 完全沒有讀取
`knowledge/contracts/051-manifest-v1.schema.json`，而是手寫一份「規則子集」重新實作結構檢查，導致
schema 檔案本身完全沒有自動化覆蓋——獨立 review 餵入一個同時違反 4 條 schema 規則的 manifest
（`id` pattern、`engine.node` required、`engine.appspinePluginApi` pattern、`configSchema`
`additionalProperties`），初版 checker 回報 `errors: []`。

修正為 `validateAgainstSchema()`：一個直接讀取並直譯 schema 檔案的最小 JSON Schema draft 2020-12
子集直譯器，支援 schema 實際用到的部分（`type: object/array/string/boolean`、`const`、`enum`、
`pattern`、`minLength`、`minProperties`、`required`、`properties`、`additionalProperties`、`items`、
`uniqueItems`）；遇到子集以外的 schema 語法會直接 `throw`，刻意選擇「大聲失敗」而非「安靜地少驗證」。
腳本結尾新增一個 self-test（`schema violations in 4+ fields are all caught`），把獨立 review 餵入的
同一個違規 manifest 固化成回歸測試，防止這個問題再次發生而不被發現。

### 3.2 語意檢查規則（`validateSemantics`，schema 本身無法表達的跨欄位規則）

1. `provides` 含 `appspine.interactive-auth-provider` 時，`conflicts` 不得為空（[051 計畫 §6.3](../decisions/051-plugin-platform-engineering-plan.md)：「`oidc-auth` 與未來的 `local-auth` 都提供唯一的
   `appspine.interactive-auth-provider`，v1 manifest 宣告彼此 conflicts」）。
2. **更正（獨立 review 發現，命名空間錯誤）**：初版規則檢查「`provides` 與 `conflicts` 有相同的
   capability 名稱」，但依 [051 計畫 §6.3](../decisions/051-plugin-platform-engineering-plan.md) 的範例
   （`oidc-auth` 宣告 `conflicts: ["local-auth"]`），**`conflicts` 存放的是 plugin ID，不是 capability
   名稱**——與 `provides`（capability 名稱陣列）根本是不同命名空間，兩者比對永遠不可能命中，等於一條
   永遠不會觸發的死規則。已改為唯一在 schema 之外仍有意義的跨欄位檢查：**manifest 不得在 `conflicts`
   中宣告與自己 `id` 相同的 plugin ID**（`negative/provides-conflicts-contradiction.json` 已改為測試
   這個情境，plugin id `broken-notification-fork` 自己的 `conflicts` 陣列裡出現
   `"broken-notification-fork"`）。schema 本身也同步更新：`conflicts` 陣列項目改用與 `id` 相同的
   plugin ID pattern（`^[a-z][a-z0-9-]*$`），不再是任意字串。
3. `environment` 條目的 `key` 若匹配 `SECRET|PASSWORD|TOKEN|API_KEY|CREDENTIAL`，必須標記 `secret: true`
   （[051 計畫 §9](../decisions/051-plugin-platform-engineering-plan.md)：「config diagnostics 必須依宣告做
   secret redaction」；此規則抓的是「忘記標記」，PL1-04 實作真正的 loader 時仍需要更完整的 redaction
   policy，本規則只是 Phase 0 最低限度防線）。

4. manifest 有 `replaces` 時，`distribution` 必須是 `app-local`；schema 同時要求 target 的 plugin、facet、
   contribution 與 reason 全部存在。正式 loader 還必須用 inventory/package provenance 驗證
   `distribution`，不能只相信 manifest 自我宣告。

PL1-04 實作正式 loader 時，這四條規則必須至少保留（可以加嚴，不可以放寬），否則需要先修訂本文件並
說明理由。真正的 production loader 應該改用成熟的 JSON Schema 函式庫（例如 ajv）而非本文件的最小
直譯器——後者是 Phase 0 在沒有新增 runtime dependency 的前提下唯一可行的「真的讀 schema」作法。

## 4. 已知限制（Phase 0 範圍內刻意不做的事）

- schema 的 `facets.*` 內容目前是 `{"type": "object"}` 空殼；facet 貢獻的實際欄位（例如 `backend` 的
  `providers`／`controllers`／`exports` 清單）留給 PL1-06（backend）、PL3-02（frontend）、PL2-06
  （prisma）、PL2-07（permissions）分別定義，PL0-05 不預先發明。
- 沒有 digest／tamper 偵測 fixture——那是 PL1-04（canonicalization/digest）與 PL2-04（plugin lockfile）
  的範圍，manifest v1 schema 本身不含 digest 欄位。
- lifecycle fixture 會驗證 inventory instance、failure stage、required/optional outcome、optional manifest
  的 isolation/degraded policy、reverse shutdown order 與正整數 timeout；但不驗證「host 實際執行後是否
  真的產生這個結果」——host 尚不存在，PL1-06 完成後才能把三個 fixture 接上 integration test。

## 5. 執行輸出（決定性驗證）

```text
$ node scripts/051-pl0-manifest-fixture-check.mjs
PASS positive/health-check-minimal.json
PASS positive/audit-log-with-prisma.json
PASS positive/rbac-full-facets.json
PASS positive/master-data-client-multiple.json
PASS positive/oidc-auth-interactive-provider.json
PASS positive/app-local-replaces-override.json
PASS negative/missing-schema-version.json
PASS negative/unknown-top-level-field.json
PASS negative/invalid-engine-range.json
PASS negative/missing-facet.json
PASS negative/interactive-provider-missing-conflicts.json
PASS negative/secret-not-redacted.json
PASS negative/provides-conflicts-contradiction.json
PASS negative/replaces-missing-exact-target.json
PASS negative/official-plugin-replaces.json
PASS lifecycle/required-plugin-failure-aborts-boot.json
PASS lifecycle/optional-plugin-failure-degrades.json
PASS lifecycle/reverse-order-shutdown.json
PASS fixture index covers every JSON fixture exactly once
PASS self-test: schema violations in 4+ fields are all caught

20 fixtures checked, 0 failed.
```

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL0-05 |
| Actual agent | Claude Sonnet 5（G2） |
| Required class | G2；文件建議 Sol（G3）做 contract gate、Gemini 做 blind-spot audit |
| Substitution reason | 本 session 無獨立 Sol/Gemini provider；G3 gate 與 blind-spot audit 併入 Gate G0 統一由獨立 review agent 執行（見 [051-pl0-gate-g0.md](051-pl0-gate-g0.md)），非本 task 內自行核准 |
| Independent reviewer | Claude Opus（general-purpose agent，2026-08-18，Gate G0 blind-spot audit）——發現本文件初版兩處嚴重缺陷：(1) checker 從未讀取 schema 檔案，餵入 4 條規則同時違反的 manifest 得到 `errors: []`；(2) `provides`／`conflicts` 語意規則比對錯誤命名空間（capability 名稱 vs. plugin ID），永遠不會觸發。兩者均已修正，見 §3 |
| Tools | repo read/write（Read/Write/Bash），純資料操作，未觸碰任何既有 runtime 程式碼 |
| Evidence | 第 5 節完整執行輸出（17 項含新增 self-test）；schema／fixture／checker 三者互相引用一致；獨立 review 覆核後修正的兩處見上一列 |
| 已知風險 | 見第 4 節；facet 內部欄位、digest、真正 host 整合測試都不在本 task 範圍，必須傳遞給對應 Phase 1/2 task；replacement 的 app-local provenance 必須由正式 loader 獨立核實 |
| Rollback | 刪除 `fixtures/051-manifest-v1/`、`knowledge/contracts/051-manifest-v1.schema.json`、`scripts/051-pl0-manifest-fixture-check.mjs`、本文件 |
