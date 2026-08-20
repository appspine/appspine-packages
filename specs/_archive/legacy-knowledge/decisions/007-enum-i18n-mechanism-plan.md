---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-02
updated: 2026-08-03
---

# 007 - Enum i18n 機制規劃

> 起因：fork 之後的規範討論中，發現 `appspine-app-template` 的 Prisma enum（`PermissionPolicy`、`Permission`
> 等）在前端一律顯示原始英文字串（`DENY_ALL`、`USERS_READ`），完全沒有 i18n。比對過 `auranest` 的既有做法後
> （見下方「跟 auranest 對照」），auranest 確實把 enum 值翻譯出來了，但靠的是「每個 app 各自複製一份翻譯
> JSON、各自手動維護 enum 值清單陣列」，這正是 appspine 想避免的 monorepo-only 複製貼上模式（appspine 是
> 多 repo 架構，沒有「共用一份、順手改到別的 app」這種捷徑）。本文件規劃一個不會重蹈 auranest 覆轍、能被每個
> forked 業務系統重複使用的長期機制。
> 狀態：機制設計已定案供討論，尚未排 task breakdown（見文末「待確認事項」）。

## 背景

### 現況（已用 Explore agent 查證）

`backend/prisma/schema/` 目前有 3 個 enum：

| Enum | 值 | 現況 |
|---|---|---|
| `PermissionPolicy` | `DENY_ALL` / `READ_ALL` / `ALLOW_ALL` | Roles 頁面 Select/Badge 直接顯示原始字串 |
| `Permission` | `USERS_READ`/`USERS_CREATE`/`USERS_UPDATE`/`USERS_DELETE`/`API_KEYS_READ`/`API_KEYS_CREATE`/`API_KEYS_DELETE` | 同上，Checkbox 清單也是原始字串 |
| `AuditAction` | `CREATE`/`UPDATE`/`DELETE` | 還沒有對應前端頁面，尚未踩到這個問題 |

前端 `roles/types.ts` 裡的 `PERMISSION_OPTIONS`/`PERMISSION_POLICIES` 是**手動寫死的陣列**，程式碼註解自己承認
「Not fetched at runtime... Keep in sync manually」——這是跟 i18n 缺失同一類「靠人工同步、會漂移」的風險。

### 跟 auranest 對照

auranest（前身專案，10 個業務系統 app 共用一個 monorepo）已經處理過同樣的問題，查證結果：

| 面向 | auranest 的做法 | 問題 |
|---|---|---|
| enum 值清單 | 每個 app 的 `permission-matrix.tsx`、翻譯 JSON 都是**複製貼上再手動改**，`@auranest/ui` 等共用套件完全沒有共用的 enum 清單或翻譯 map | 10 個 app 各自一份，容易漂移，且這招只有 monorepo（能互相複製檔案）才成立 |
| 翻譯 key 命名 | `t(\`policy.${value}\`)` / `t(\`perm.${value}\`)`——key 直接用 enum 值當後綴，塞進「誰用到就放誰的 namespace」 | 命名慣例本身是合理、可驗證過的，appspine 值得沿用 |
| 有沒有自動檢查漏翻譯 | 沒有，純靠人工 review | 這正是本文件要補上的 |

**結論**：auranest 的「key = enum 值」命名慣例值得沿用，但「複製貼上維護」的部分不該照搬——appspine 是多 repo
架構，沒有 monorepo 的複製捷徑，必須做出真正可重複使用、不會漂移的機制。

### appspine 已有的基礎可以直接利用

`@appspine/metadata-schema` 套件的 `MetaService.buildMeta()` 已經會從 Prisma DMMF 讀出**完整的 enum 清單**
（`enums: EnumMeta[]`，每個 enum 含 `name` 跟 `values: EnumValueMeta[]`），目前用在兩個地方：

1. `backend/scripts/gen-data-dictionary.ts`：`new MetaService().buildMeta()`——**在 NestJS DI 環境外直接
   `new` 出來用**，證明這個 class 可以被任何 build-time 腳本直接呼叫，不需要跑起一個完整的 NestJS app。
2. `GET /metadata/schema` runtime endpoint（`meta.controller.ts`）。

這代表「enum 值清單」跟「翻譯是否完整」這兩件事，都可以複用同一套 DMMF 讀取邏輯，不需要重新寫一次 Prisma
schema parsing。

## 設計目標

1. **前端不寫死 enum 值清單**——避免 `PERMISSION_OPTIONS` 這類「手動同步」陣列繼續存在或再長出新的。
2. **翻譯 key 命名統一、不重複**——同一個 enum 值不管被幾個頁面用到，只翻譯一次。
3. **漏翻譯要能被自動抓到**——新增 enum 值時忘記補翻譯，要在 commit 前就擋下來，不是等使用者或 QA 發現。
4. **機制本身要能被每個 forked 業務系統重複使用**——不是這個 repo 專屬的一次性修法，邏輯核心放在共用套件。

## 機制設計

### A. Enum 值來源：前端改吃 `GET /metadata/schema`，不再寫死陣列

`roles/types.ts` 的 `PERMISSION_OPTIONS`/`PERMISSION_POLICIES` 改成 runtime fetch `/metadata/schema`
（`@appspine/metadata-schema` 已經回傳 `enums` 陣列，不需要新開發任何 API）。下拉選單、checkbox 清單直接來自
這支 API 的回應。好處：新增 `Permission` 值時，Prisma schema 改完、`prisma generate` 一跑，前端清單自動跟上，
不用再改一個平行的前端陣列。

### B. 翻譯 key 慣例：獨立 `enums` i18n namespace，key = `<EnumName>.<VALUE>`

新增一個獨立的 `enums.json`（en / zh-TW，比照現有 `roles.json`/`users.json` 之類的 namespace 檔案結構），
key path 統一是 `<EnumName>.<VALUE>`，例如 `PermissionPolicy.DENY_ALL`、`Permission.USERS_READ`。

**跟 auranest 的差異**：auranest 把翻譯塞進「誰用到就放誰的 namespace」（`roles.policy.DENY_ALL`），如果同一個
enum 之後被另一個頁面用到，要嘛重複翻譯一次、要嘛沒翻譯。appspine 用獨立 namespace，一個 enum 值只有一個
翻譯來源，不管被幾個頁面引用都查同一個 key，不會漂移。

小 helper（非必要但建議，放 `frontend/src/lib/i18n/enum-label.ts`）：
```ts
export function enumLabel(t: (key: string) => string, enumName: string, value: string): string {
  return t(`${enumName}.${value}`);
}
```
避免每個頁面自己手打 template string、容易拼錯 enum 名稱。

### C. 自動檢查機制：Prisma enum ⟷ i18n JSON 一致性 gate

新增一支檢查邏輯，比對「Prisma DMMF 目前有的所有 enum + 值」跟「`enums.json`（**每一個** locale，`en` 跟
`zh-TW` 都要）目前有的 key」，任何缺漏就 fail（fail-loud，呼應 `scaffold-init.mjs` 的 `expectedCount`
設計原則——缺一個翻譯就整個擋下，不做「印警告但放行」）。

- **邏輯核心放共用套件**：在 `@appspine/metadata-schema` 新增一個 export（例如
  `collectEnumTranslationGaps(meta: SchemaMeta, dictionaries: Record<string, Record<string, unknown>>): string[]`），
  複用套件裡已經有的 DMMF enum 讀取邏輯，回傳「哪些 `<EnumName>.<VALUE>` 在哪個 locale 缺翻譯」的清單。
  這是本機制「能被每個 forked repo 重複使用」的關鍵——邏輯只寫一次，隨套件版本更新，所有 fork 出去的業務
  系統都吃得到。
- **每個 app 只需要一支薄 wrapper**：比照 `gen-data-dictionary.ts` 的模式，新增
  `backend/scripts/check-enum-i18n.ts`，讀自己 repo 的 `frontend/messages/*.json`，呼叫上面的共用函式，
  有缺漏就印出清單並以非零 exit code 結束。
- **掛載點**：比照現有 `tsc --noEmit`/`biome check`，掛在 husky pre-commit hook。這是純靜態檢查（讀 Prisma
  schema + 讀 JSON 檔），不需要 DB、不需要跑伺服器，跑起來很快，適合放 pre-commit 而不是另開一個 CI job。

### D. 適用範圍：所有 Prisma enum，不限於目前已經有 UI 的

`AuditAction` 目前沒有對應的前端頁面，但一樣要求翻譯存在——呼應 002 對 Prisma `///` 文件註解「所有
model/enum 都必填，不分現在有沒有 UI 使用」的既有慣例精神。翻譯這件事在 schema 定義的當下就該完成，不要
等 UI 真的做出來、開發者才想起來要補一次。

## 文件產出（forker 要看到的東西）

這件事的規範跟其他 002 慣例一樣，需要同時出現在兩個地方：

1. **`_archive/dev_docs-20260803/framework/002-app-dev-conventions.md`**：新增一節「Enum / i18n 慣例」，內容涵蓋：
   - enum 值一律走 `GET /metadata/schema` 撈，前端不寫死陣列（呼應 A）
   - 翻譯 key 命名慣例 `enums.<EnumName>.<VALUE>`，獨立 namespace（呼應 B）
   - pre-commit 會擋沒翻譯的新 enum 值，新增 enum 時記得同步補 `enums.json`（呼應 C）
   - 在「新增 CRUD 模組標準流程」第 1 步（Backend - Schema）補一句提醒：新增的 enum 值需要同步在
     `enums.json` 補翻譯，pre-commit 會檔。
2. **`appspine-app-template/docs/conventions.md`**：把上述規則的英文版同步搬過去（比照 002 文件開頭「之後
   修改本文件時，記得同步檢查 conventions.md 是否也要更新」的既有機制，不整段複製、保持自包含）。
3. **檢查腳本本身**：`backend/scripts/check-enum-i18n.ts` 這支薄 wrapper 隨 template 一起 fork 到每個新
   repo（跟 `gen-data-dictionary.ts`、`scaffold-init.mjs` 一樣的邏輯——是「隨 repo 出貨」的一部分，不是外部
   工具）。

## 已確認的技術決策

| 問題 | 決策 |
|---|---|
| enum 值清單放前端寫死還是 runtime fetch | Runtime fetch `/metadata/schema`，理由：避免 auranest 「手動同步陣列」的已知漂移風險 |
| 翻譯 key 命名空間 | 獨立 `enums` namespace，不塞進個別功能頁面的 namespace，避免同一 enum 被翻譯兩次、內容不一致 |
| 檢查腳本掛載點 | Husky pre-commit hook，不另開 CI job（純靜態檢查、夠快） |
| 適用範圍 | 全部 Prisma enum，不管現在有沒有對應 UI |
| 檢查邏輯放哪裡 | 核心邏輯放 `@appspine/metadata-schema`（共用套件），每個 app repo 只放一支薄 wrapper 腳本 |
| 缺翻譯時的行為 | Fail-loud（pre-commit 直接擋），不是印警告放行 |

## 跟 auranest 對照（總結）

| 面向 | auranest | appspine（本機制） | 為什麼不一樣 |
|---|---|---|---|
| enum 值清單 | 前端寫死陣列，10 個 app 各自維護 | Runtime 撈 `/metadata/schema` | 多 repo 架構沒有複製捷徑，必須是真正共用 |
| 翻譯 key | 塞進使用該 enum 的頁面 namespace，可能重複 | 獨立 `enums` namespace，一個值一個 key | 避免同一 enum 在不同頁面被翻譯兩次、互相漂移 |
| 自動檢查漏翻譯 | 沒有，純靠人工 review | Pre-commit gate，複用 `@appspine/metadata-schema` | auranest 沒解決這塊，這次直接補上 |

## 待確認事項（task breakdown 前需要拍板）

- `enums.json` 的翻譯，要不要在檢查腳本失敗時，順便印出「目前哪些 `<EnumName>.<VALUE>` 缺翻譯」的完整清單
  （方便開發者直接照著填），還是只回報「有缺漏，去看 diff」？
- `Permission` enum 的翻譯，跟 M2M API Key 的 `resource:action` scope 字串（衍生自 model 名稱，不是這個
  enum 本身）要不要放進同一個 `enums` namespace，還是分開處理？這兩者目前是不同機制（一個是 Prisma enum，
  一個是 `deriveScopes()` 從 model 名稱動態產生），可能不需要用同一套翻譯 key 慣例。
- `@appspine/metadata-schema` 新增 `collectEnumTranslationGaps()` 這個 export，要不要順便讓它也能偵測
  「翻譯裡有、但 Prisma schema 裡已經不存在」的孤兒 key（enum 值被刪除後翻譯忘記清）？這是加分項，不是
  這次機制要解決的核心問題，可以留到之後再看要不要做。

## 下一步

待上述「待確認事項」拍板後，可比照 004/005/006 的模式排一份 `007-task-breakdown.md`，把「A（前端改 fetch）
／B（獨立 namespace + 補翻譯）／C（共用套件 export + 每個 app 的 wrapper 腳本 + pre-commit 掛載）／文件產出」
拆成可逐一 commit 的 task。

