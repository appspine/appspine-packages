---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-20
updated: 2026-08-03
---

# 029 - 共用套件與全部業務 App 程式清理、優化與重構 - 系統設計計畫

> 狀態：待確認事項已全部定案（見第 7 節），task breakdown 已建立於
> `_archive/dev_docs-20260803/framework/029-task-breakdown.md`（T-11300–11505，42 個 task），待執行。
> 動機：028（Domain Events 標準化）於 2026-07-19 收尾，六個業務 app 全數上線後首次全面健檢；
> 同時為下一個 app 開工前打底。**範圍：`appspine/packages/*`（12 個共用套件）+ 全部 7 個
> 業務 app（wiki/calendar/drive/chat/project/approve/mcp-gateway）+ `appspine-app-template`
> 同步落差，不含新業務功能、不含 Prisma schema 變更（除非測試過程挖出真實缺陷）。**
> 盤點方法：6 個獨立唯讀盤點（套件組 A/B、apps 組 A/B、template 同步落差、跨 app 重複邏輯）
> 於 2026-07-20 平行執行、交叉比對後整理成初版，再經 Opus 獨立審查找出優先度分軸不清、
> `audit-meta.ts` 重複份數算錯、工作包 B/D 隱藏衝突等問題並修正，方法侷限見第 6 節。

---

## 1. 背景

appspine 目前有 12 個共用套件、1 個 template repo、7 個已上線業務 app。003（套件重用盤點）、
020（框架休整）分別在 8 個套件初建時與 4 個 app 上線後做過健檢，但 020 之後 drive、approve
重 fork、mcp-gateway 全新上線，028 又把 domain-events 標準化推廣到全部六個既有 app——這些
變動之後從未做過一次橫跨「套件 + 全部 apps + template 同步」的整體盤點。本次盤點目的不是
回應特定 bug，而是主動找出：

1. 套件已經提供、但 app 端沒人遷移過去用的重複邏輯
2. 各 app 各自累積、彼此間又高度相似、該收斂進共用套件的樣板碼
3. 測試覆蓋的薄弱環節，尤其是複雜度與投資明顯不成比例的地方
4. template 與各 fork 之間的同步落差
5. 明顯的效能疑慮與其他小型技術債

## 2. 盤點結果總覽

> 優先度不是單一軸線：「殭屍套件清理」與「JWT_SECRET 安全預設」都便宜／風險低，但前者是
> 純清理、後者是**正式環境現正生效的安全誤設**，兩者不該用同一種「排入常規優先序」的方式
> 處理。以下先列一項應獨立於優先序、直接排 hotfix 的項目，再依優先度列其餘發現。

### 🚨 立即修復（不待 task breakdown 排程，建議直接開 hotfix）

| 發現 | 位置 | 說明 |
|---|---|---|
| `JWT_SECRET` 未設定時靜默 fallback 弱密鑰 | `appspine/packages/auth/src/jwt-verifier.service.ts:57` | `secret: process.env.JWT_SECRET ?? 'dev-secret'`——正式環境忘記設定環境變數不會啟動失敗，而是悄悄用寫死字串簽發/驗證 JWT。`@appspine/auth` 被全部 7 個 app 消費，此為現正生效的共用安全隱患，不是「未來可能回歸的缺陷」。修復方式：啟動時（或首次驗證時）偵測 `JWT_SECRET` 未設定即直接拋錯，不提供預設值。成本低、影響全部 app，應先於下方所有工作包執行。 |

### 🔴 高優先

| 發現 | 位置 | 說明 |
|---|---|---|
| 殭屍套件 | `appspine/packages/chatbot-contracts/` | 目錄只剩 `dist/`／`node_modules/`，無 `src/`、無 `package.json`。追查其唯一相關 commit `1dd1d67`（"Prepare shared bot package release"）**不在 `main` 分支歷史上**，只掛在孤兒 tag `@appspine/audit-log@0.5.0` 下——是 024（chat+n8n 整合，2026-07-15 因 Codex 測試不順回滾）留下的殘骸，未受版控、無任何 app 引用 |
| 套件已建好、無人遷移 | `frontend-shell` vs 全部 7 個 app | `frontend-shell/src/components/ui/select.tsx` 完整實作但**未在 `index.ts` 匯出**，導致 mcp-gateway/approve/drive/project/chat 共 5 個 app 各自複製一份近 192 行幾乎逐行相同的 `select.tsx`；`useIsMobile`（`hooks/use-mobile.ts`）、`layout-utils.ts`、`theme-utils.ts` 三支已存在於套件內，但 **7 個 app 全部**仍各自維護 byte-for-byte 相同的本地版本，沒有一個改用套件版本 |
| 安全關鍵路徑零測試 | `@appspine/auth` | 16 個原始檔僅 3 個 spec，guard（`admin.guard.ts`/`jwt-auth.guard.ts`）、strategy（`local.strategy.ts`/`oidc.strategy.ts`）、`auth.controller.ts` 完全沒有測試（`JWT_SECRET` fallback 見上方「立即修復」，不重複列於此） |
| approve app 測試/複雜度嚴重失衡 | `apps/approve` | `approval-instances.service.ts` 逾 1000 行（狀態機、樂觀鎖、代理簽核展開），backend **0 個單元測試**；`e2e/specs/` 只有共用的 `auth`/`m2m-api-key`/`rbac`，**沒有**「提交→逐步簽核→核准/駁回/撤回」的 golden-path e2e。對照 016 執行期間已發現並修復兩個真實併發/資料缺陷（Z14/Z15），目前狀態下同類問題若再發生無法被自動測試攔截。**本次盤點風險最高的單一發現，列為最優先執行項**（驗收標準見工作包 C） |
| drive／mcp-gateway e2e 缺口 | `apps/drive`、`apps/mcp-gateway` | 兩者都只有框架層 `auth`/`rbac`/`m2m-api-key` e2e，沒有涵蓋各自核心業務流程（drive 的上傳/資料夾/WOPI 編輯；mcp-gateway 的 `search_tools`/`call_tool` 轉發）的 golden-path 測試 |
| mcp-gateway 落後 template 且同步紀錄失真 | `apps/mcp-gateway` | `docs/template-sync.md` 的 Sync History 表格仍是佔位範例，從未真正記錄過一次同步，實測落後 template 18 個 commit（其餘 6 個 app 只落後 10 個）；套件版本新舊混雜（`mcp-server`/`m2m-api-key`/`metadata-schema` 已領先 template，但 **完全缺少 `@appspine/domain-events` 依賴**，`frontend-shell` 又明顯落後）——顯示曾有人手動個別升級套件，未走 agent-guide 的同步流程 |

### 🟡 中優先

| 發現 | 位置 | 說明 |
|---|---|---|
| `audit-meta.ts` 全部 7 個 app 重複 | wiki／calendar／drive／chat／approve／mcp-gateway 的 `backend/src/audit-meta.ts`，project 的 `backend/src/common/audit-meta.ts` | 幾乎逐字重複，應收斂進 `@appspine/audit-log` 或 `common`。（原始盤點誤算成「四份」，複查後確認是全部 7 個 app 都有，project 因路徑帶 `common/` 子目錄被最初的 glob 漏掉——這類路徑變體正是純讀取式盤點容易低估重複規模的地方，見第 6 節「盤點方法侷限」） |
| `recordAudit()` 重複 | `m2m-api-key/api-keys.controller.ts` vs `rbac/roles.controller.ts` | fire-and-forget 寫 audit log 的邏輯高度重複，只差 entityType 與少量欄位 |
| `header-breadcrumbs.tsx` 結構同構 | 全部 7 個 app 的 `dashboard/_components/sidebar/header-breadcrumbs.tsx` | wiki/drive 幾乎完全一致，其餘略有 drift（chat 版本連風格都跟其他不同），適合抽成 `frontend-shell` 的參數化元件 |
| `metadata-schema` 核心邏輯零測試 | `packages/metadata-schema/src/meta.service.ts` | `buildMeta`/`deriveScopes` 解析 Prisma DMMF、推導 scope catalog，只有 `enum-i18n.test.ts` 一份週邊測試，核心邏輯完全沒有單元測試 |
| template 領先 6 個 app 10 個 commit | wiki/calendar/drive/chat/project/approve | 主要是 domain-events 整合進 template、metadata-backed API key scopes、`mcp-server`/`m2m-api-key`/`metadata-schema` 版本 bump，`docs/template-sync.md` 記錄誠實但尚未 replay |
| backend 單元測試普遍掛零 | wiki/drive/chat/project/approve | 僅 calendar 有 1 個（`events.service.spec.ts`）、mcp-gateway 有 5 個（覆蓋率最好） |
| 效能：drive 回收桶遞迴 N+1 | `apps/drive/backend/src/folders/folders.service.ts::emptyTrash()` | 對每個已刪除頂層資料夾逐一 `findUnique` + 遞迴 `removeRecursive`，缺 batch 化 |
| 效能：chat 推播通知 N+1 | `apps/chat/backend/src/.../push-notification.listener.ts` | `resolveRecipients`/`sendNotifications` 對每個 recipient 迴圈內逐一 `await`，未用 `Promise.all` |
| 效能：calendar 事件查詢缺下界 | `apps/calendar/backend/src/events/events.service.ts::list()` | `masterEvents` 只限制 `startAt < rangeEnd`，無下界，年代久遠的重複事件會被整批撈出 |
| 套件內部依賴宣告方式不統一 | `auth`/`audit-log`/`domain-events` 的 `package.json` | 同樣是「內部套件互相依賴」，有的用 `dependencies`、有的用 `peerDependencies + devDependencies`，沒有統一慣例 |

### 🟢 低優先

| 發現 | 位置 | 說明 |
|---|---|---|
| `use-lg.ts` 全複製且無人使用 | 全部 7 個 app 的 `hooks/use-lg.ts` | byte-for-byte 相同的 `useIsLg`（1024px breakpoint），但 7 個 app **都沒有任何地方實際呼叫它**——複製貼上的死碼，已於第 7 節定案直接刪除（工作包 A） |
| README 殘留 template 段落 | calendar/project/approve 的 `README.md` | 仍留著「Forking this template」段落，未依 checklist 移除 |
| `@types/node` 版本不一致 | `packages/e2e-kit/package.json`（`^22.20.0`） | 其餘套件（audit-log/auth/common/domain-events）用 `^22.10.0` |
| wiki 頁面樹全量查詢 | `apps/wiki/backend/src/pages/pages.service.ts` | `getTree`/`listDeleted`/`collectDescendantIds` 一次 `findMany` 撈整個 space，大型 space 有效能隱憂，但目前規模可接受 |
| project Kanban board 無上限查詢 | `apps/project/backend/src/boards/boards.service.ts:200` | 同上，目前規模可接受，先記錄觀察 |

## 3. 非目標

- 不新增任何業務功能。
- 不做 Prisma schema 變更，除非執行測試補強過程中挖出真實缺陷（比照 020 的原則）。
- `webhook-post.handler.ts` 在 wiki/calendar/drive/chat/project 與 approve 之間的**整體架構**
  差異，已由 `_archive/dev_docs-20260803/domain-events/028-domain-events-standardization-plan.md` 明確記載為刻意設計（approve
  走 DB 驅動的多訂閱模式），**不列入本次收斂範圍**。但這條排除只涵蓋架構層級——5 個 app 內
  `fetch`/`redact`/`buildWebhookPayload` 這段約 50 行純邏輯是跟 `audit-meta.ts` 同一類「業務
  無關的樣板碼重複」，標準應該一致：若判斷值得收斂就該跟 `audit-meta.ts` 一起放進工作包 B，
  若判斷不值得（規模小、抽出來的間接層成本可能大於收益）則應明講理由，而不是含糊寫「僅記錄
  供未來參考」。**本文件的判斷是：值得收斂**，已併入工作包 B（見下方）。
- `domain-events.module.ts` 在 5 個 app 間的重複屬於 NestJS DI 邊界的必要接線碼，**不收斂**。
- 021 之後的分頁收斂（`ListPagination`）已落實良好，本地 `components/ui/pagination.tsx` 是
  shadcn primitive 非業務重複，**不處理**。

## 4. 工作包

> 執行順序建議：**「立即修復」的 `JWT_SECRET` hotfix 與工作包 C 中的 approve 測試補強項目
> 風險最高，優先於其他所有工作包執行**（見第 5 節）。其餘工作包（A/B/C 其餘/D/E/F/G）依
> 第 5 節順序進行，彼此間依賴較弱，可視人力平行推進，但工作包 B、D、E 之間有第 5 節說明的
> 執行序限制，不是完全自由平行。

### 工作包 A｜殭屍套件與立即清理

- 移除 `appspine/packages/chatbot-contracts/`（024 回滾殘骸，非版控內容，直接刪除本機目錄）。
- 移除全部 7 個 app 的 `hooks/use-lg.ts`（死碼，已於第 7 節定案直接刪除，不收斂進套件）。
- 清除 calendar/project/approve README 殘留的「Forking this template」段落。

### 工作包 B｜共用邏輯收斂

> **重要**：`appspine-app-template` 本身沒有 `audit-meta.ts`、也沒有匯出版 `select.tsx` 消費
> 方式（複查確認 template 沒有這些檔案）。也就是說，如果本工作包只把「既有 7 個 app」改成
> 消費套件版本，`appspine-app-template` 卻沒有同步改成同樣的消費方式，**下一個 fork 出去的
> 新 app 會重新複製一份**，這次清理就不會 stick。以下每一項收斂，都必須包含「同步進
> `appspine-app-template`」的子任務，不能只改 7 個既有 app。

- `frontend-shell/src/index.ts` 補上 `select.tsx` 的匯出，7 個 app **與 template** 改回從套件
  匯入，刪除本地複製檔（mcp-gateway/approve/drive/project/chat 共 5 份 app 端 + template 端）。
- 7 個 app **與 template** 的 `hooks/use-mobile.ts`、`lib/preferences/layout-utils.ts`、
  `theme-utils.ts` 全數改為從 `@appspine/frontend-shell` 匯入，刪除本地版本。
- `header-breadcrumbs.tsx` 抽成 `frontend-shell` 的參數化元件（`<HeaderBreadcrumbs labels={...}
  dynamicPrefixes={...} />`），7 個 app **與 template** 遷移消費，順手抹平 chat 版本已 drift 的
  實作差異。
- `audit-meta.ts`（**全部 7 個 app**，見第 2 節更正後的數字）收斂進 `@appspine/audit-log` 或
  `common`，template 若之後要新增 audit meta 相關骨架也改成消費套件版本。
- `m2m-api-key`/`rbac` 的 `recordAudit()` 重複邏輯收斂進 `@appspine/audit-log`。
- wiki/calendar/drive/chat/project 5 個 app 的 `webhook-post.handler.ts` 中
  `fetch`/`redact`/`buildWebhookPayload` 純邏輯（約 50 行）收斂進共用套件（不動架構，只抽
  這段無業務耦合的 helper），template 同步改用套件版本。
- `@appspine/*` 套件間內部依賴宣告方式統一（`dependencies` vs `peerDependencies`，取一種慣例
  並回填 `auth`/`audit-log`/`domain-events`）。

### 工作包 C｜測試補強（approve 優先，見第 5 節執行順序）

- **approve app**（最高優先）：`approval-instances.service.ts` 狀態機/樂觀鎖/代理簽核核心邏輯
  補單元測試；新增「提交→逐步簽核→核准/駁回/撤回」golden-path e2e，仿照其他 app 既有的
  `*-golden-path.spec.ts` 命名慣例。**驗收標準明確化**：`_archive/dev_docs-20260803/app-approve/Z14-approval-
  step-timestamps-gap.md`、`Z15-optimistic-lock-race-condition.md` 記錄的兩個歷史真實缺陷情境
  （欄位轉錄疏漏、樂觀鎖並發雙重核准）**必須各有至少一個對應的迴歸測試案例**，作為本項目的
  最低完成門檻，不可只寫 happy path 就視為完成。
- `@appspine/auth` 的 guard/strategy/controller 補單元測試；`jwt-verifier.service.ts` 的
  `JWT_SECRET` 未設定情境改為啟動時直接拋錯，不再靜默 fallback 弱密鑰。
- `@appspine/metadata-schema` 的 `meta.service.ts`（`buildMeta`/`deriveScopes`）補核心邏輯單元
  測試。
- drive、mcp-gateway 補各自核心業務流程的 golden-path e2e（drive：上傳/資料夾/WOPI 編輯；
  mcp-gateway：`search_tools`/`call_tool`）。
- wiki/drive/chat/project 的 backend service 層依風險排序陸續補單元測試（不追求覆蓋率數字，
  比照 020 §2 的原則：補在風險最高、之後會被反覆依賴的地方）。

### 工作包 D｜template 同步（既有 6 個 app）

- wiki/calendar/drive/chat/project/approve：依 `docs/agent-guide.md` 的「Template change
  propagation」流程，replay template 領先的 10 個 commit（domain-events 整合、metadata-backed
  API key scopes、套件版本 bump），完成後更新各自 `docs/template-sync.md`。
- **10 個 commit 不是 6 個 app 的等量工作**：chat 的 `header-breadcrumbs.tsx` 已知比其他 app
  drift 更多（見第 2 節），replay 前先逐 app 快速比對實際差異範圍，不要假設 6 個 app 工作量
  相同、齊頭排程。

### 工作包 E｜mcp-gateway 同步重建（獨立於工作包 D）

> mcp-gateway 的體量與風險明顯大於其他 6 個 app 的「replay 10 commit」，且問題本質不同（同步
> 紀錄從未真正使用過、套件版本新舊混雜、依賴缺項），獨立成一個工作包，不與工作包 D 混排。

- 重建同步基準：`docs/template-sync.md` 目前 Sync History 仍是佔位範例，先確認實際對應的
  template commit，寫入真實紀錄。
- 補上缺少的 `@appspine/domain-events` 依賴、升級 `frontend-shell` 到與其他 app 對齊的版本。
- 完成上述基礎修復後，才 replay 落後的 18 個 commit（比其他 6 app 多，需個別評估每個 commit
  對 mcp-gateway 既有客製（如 Gateway Bindings Panel）的影響）。

### 工作包 F｜效能修正

- drive `emptyTrash()` 改 batch 化，避免逐一 `findUnique` + 遞迴查詢。
- chat 推播通知 `resolveRecipients`/`sendNotifications` 改用 `Promise.all` 併發。
- calendar `events.service.ts::list()` 的 `masterEvents` 查詢補下界條件。

### 工作包 G｜小整理

- `e2e-kit` 的 `@types/node` 版本對齊其餘套件（`^22.10.0`）。
- wiki 頁面樹查詢、project Kanban board 查詢先記錄觀察，暫不動工（目前規模可接受，待實際
  資料量出現問題再處理，避免過度工程）。

## 5. 建議執行順序

1. **`JWT_SECRET` hotfix**（「立即修復」項）——成本最低、風險最高（現正生效的安全誤設），
   不等 task breakdown 排程，優先於一切其他工作。
2. **工作包 C 的 approve 測試補強**（單元測試 + 簽核流程 golden-path e2e，含 Z14/Z15 迴歸
   測試案例）——本次盤點風險最高的單一結構性項目，其次執行。
3. 工作包 A（殭屍套件與小清理，成本低可快速完成）。
4. **工作包 B（共用邏輯收斂，含同步進 template 的子任務）**——建議先於工作包 D/E 執行，且
   必須連同 template 一起改，理由：template 本身沒有 `audit-meta.ts`/套件版消費方式，若只改
   7 個既有 app 不改 template，工作包 D/E 的 replay 會把 app 又拉回舊寫法，兩個工作包互相
   抵銷；先讓 template 成為「收斂後的正確狀態」，D/E 的 replay 才不會製造新的落差。
5. 工作包 C 其餘項目（auth 測試、metadata-schema 測試、drive／mcp-gateway e2e）可與工作包 B
   平行推進。
6. **工作包 D（既有 6 個 app 的 template 同步）**——在工作包 B 完成、template 已是收斂後狀態
   之後執行，避免 replay 時跟 B 的改動衝突。
7. **工作包 E（mcp-gateway 同步重建）**——體量與風險大於工作包 D，建議在工作包 D 取得經驗
   後再執行，且需個別評估每個 commit 對其既有客製的影響，不可比照 D 的節奏。
8. 工作包 F、G 視人力狀況穿插執行，無強依賴。

## 6. 盤點方法侷限

本文件的盤點結果來自 6 個獨立、純唯讀（read/grep 為主）的 agent 平行審查，經 Opus 第二意見
審查後發現至少一處實質誤差：`audit-meta.ts` 原始盤點誤算為「四份重複」，複查後是全部 7 個
app（`project` 的路徑帶 `common/` 子目錄，被最初的檔名 pattern 漏掉）。這類路徑變體造成的
低估，是純讀取式盤點的已知弱點之一。除此之外，本次盤點方法本身沒有涵蓋、留給下次盤點或
另開文件處理的類型：

- **執行期行為**：N+1 查詢、效能疑慮都是靠讀程式碼判斷可能有問題，沒有實際 profiling 或
  生產環境流量數據佐證「多痛」，工作包 F 的優先度是保守估計。
- **跨套件整合測試缺口**：本次盤點的測試覆蓋盤點是套件/app 各自獨立看，沒有評估「套件版本
  升級後，多個套件組合在一起是否仍相容」這類整合層級的測試缺口。
- **依賴/供應鏈安全**：只抓到 `@types/node` 版本漂移這類表面不一致，沒有做 CVE 掃描或
  vulnerable dependency 稽核。
- **系統性 secret/authz 掃描**：`JWT_SECRET` fallback 是盤點 agent 讀 `auth` 套件時剛好讀到，
  不是專門做 secret-in-code 或 authz 邊界掃描找出來的，不能排除其他套件/app 有類似情況未被
  發現。
- **Prisma migration/schema drift**：本次盤點刻意不涉入 schema，但也因此沒有檢查各 app 的
  migration 歷史是否有值得注意的 drift。

這些不是本次 029 的範圍，但列在此處供下次盤點（或有人專門想做安全/效能稽核時）參考，避免
誤以為 029 的盤點結果代表「全面健檢」。

## 7. 待確認事項（已定案）

1. **`use-lg.ts` 去留**：✅ 直接刪除。7 個 app 都複製了這支 hook 但目前沒有任何地方呼叫，
   視為死碼清理；以後真有 responsive 需求再仿照 `use-mobile.ts` 的 pattern 新增即可，
   工作包 A 移除全部 7 份，不併入工作包 B 的收斂範圍。
2. **測試補強的深度**：✅ 不設數字覆蓋率門檻，延續 020 的原則——補在風險最高、之後會被
   反覆依賴的地方。approve 額外要求 Z14/Z15 兩個歷史缺陷情境必備迴歸測試案例（見工作包
   C），作為唯一的具體驗收底線。
3. **task breakdown 的 Task ID 區間**：INDEX.md 目前用到 T-11290（028），`029-task-
   breakdown.md` 從 T-11300 起分配。

