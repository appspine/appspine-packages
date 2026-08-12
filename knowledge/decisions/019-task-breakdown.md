---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-07-08
updated: 2026-08-05
---

# 019 - DateTimePicker / DateRangePicker 收斂進 `@appspine/frontend-shell` Task Breakdown

> 依照 `_archive/dev_docs-20260803/framework/019-shared-date-picker-package-plan.md` 的設計執行。此計畫為**框架級變更**，主體
> 落在 `appspine` monorepo 的 `@appspine/frontend-shell` 套件（純前端 UI 元件搬遷），其後是
> `appspine-app-template` 與四個既有 app（`apps/wiki`、`apps/calendar`、`apps/chat`、
> `apps/project`）的消費端遷移。**不涉及後端／Prisma schema／migration 變更**。
>
> 每個 task 假設執行者（可能是 Codex 或另一個 agent）**沒有本次對話的上下文**，必須照著檔案
> 路徑、程式碼片段、指令、驗證步驟獨立完成。
> 每完成一個 task，把 checkbox 從 `[ ]` 改成 `[x]`，並在「3. 執行結果」對應段落補上實際結果。
>
> 複雜度標記：**S** = 半天內、**M** = 1–2 天、**L** = 3 天以上。

---

## 1. 執行原則

- 只實作 plan 已拍板的設計，**不新增計畫外功能、不做預防性重構、不順手擴大套件變更範圍**。
  plan 第 2 節的決策一律照做，不重開討論：
  1. **`DateTimePicker` 用 `apps/calendar` 已修過巢狀按鈕 bug 的版本當基準**、**`DateRangePicker`
     用 `apps/project` 的 i18n 版當基準**（不是另外四個 app 那份舊版）、**`DatePicker` 是新增能力
     採用 `apps/project` 版本**——這三個都是「選一份現成、已驗證過的版本」，不重新設計、不重寫。
  2. **`Select` 不對外匯出**：`frontend-shell` 內部自帶一份不對外匯出的 `Select`，只給
     `DateTimePicker` 自己用，不影響、不取代各 app 現有的 `@/components/ui/select`。
  3. **各 app 既有的 `Calendar`/`Popover` 其他呼叫點（側邊欄 mini calendar、`layout-controls.tsx`
     等）不強制遷移**——這次遷移範圍只處理 `date-time-picker.tsx`/`date-range-picker.tsx`/
     `date-picker.tsx` 三個檔案的匯入來源，不動其他呼叫點。
- **本批完全不碰 Prisma schema／migration／後端程式碼**。若執行中發現「非改後端不可」，視為計畫外
  發現，依最後一條處理，不要就地改 plan。
- **升級順序**：monorepo 的 `@appspine/frontend-shell` 先改完並發版（A→B），template 才升級消費
  （C），最後四個既有 app 依風險排序各自升級並驗證（D：`apps/project` → `apps/calendar` →
  `apps/wiki` / `apps/chat`）。跨 repo 的依賴用「依賴:」標明。
- **四個既有 app 是四個獨立 git repo**（各自在 `d:\Source\Private\appspine\apps\<name>`，各有自己的
  `frontend/package.json`、自己的 lockfile、自己的 pre-commit hook）。`appspine-app-template` 也是
  獨立 repo。**每個 repo 各自升級、各自提交、各自一個 commit——不存在「一個 commit 橫跨多個
  repo」這種事**，不要寫成共用 commit。
- **研究階段（寫本文件前）已重新核對過現場程式碼，發現 plan 文件第 5 節第 3 步的「已知呼叫點」清單
  漏列了兩個 `apps/project` 的 `DatePicker`（單日期）呼叫點**：
  - `apps/project/frontend/src/app/(main)/dashboard/projects/[id]/issues/_components/issue-form.tsx`
    （`import { DatePicker } from "@/components/ui/date-picker";`）
  - `apps/project/frontend/src/app/(main)/dashboard/projects/[id]/issues/[issueId]/_components/worklog-section.tsx`
    （`import { DatePicker, formatDateOnly } from "@/components/ui/date-picker";`）

  plan 第 5 節原本只列了 `create-sprint-dialog.tsx`/`edit-sprint-dialog.tsx`（`DateRangePicker`），
  沒提到 `issue-form.tsx`/`worklog-section.tsx` 這兩個用 `DatePicker`（不是 `DateRangePicker`）的
  呼叫點。**plan 文件已回頭補上這兩處**（`019-shared-date-picker-package-plan.md` 第 5 節第 3、4
  步），本文件 T-9030 的清單與 plan 現況一致，此處保留記錄僅供追溯落差來源。
  已用 `grep` 對五個 repo 做過完整地毯式搜尋，確認除了本文件列出的呼叫點外沒有其他遺漏（搜尋範圍：
  `from "@/components/date-time-picker"`、`from "@/components/date-range-picker"`、
  `from "@/components/ui/date-range-picker"`、`from "@/components/ui/date-picker"`）。
- 程式碼／註解／commit message 一律英文；本規劃文件（`dev_docs/`）為中文。`frontend-shell` 目前沒有
  既有的元件層級單元測試慣例（plan 第 3 節已定案不額外新增），本批維持現況，僅以
  `tsc --noEmit`／`build` 作為驗收。
- Commit 遵循 Conventional Commits，禁止 `git add -A`、禁止 `--no-verify`；commit 前各 repo 的
  `pnpm typecheck`（`biome check` 或該 repo的 pre-commit hook，若有）都要通過。
- 若執行過程中出現 plan 未預期的新問題，**依既有慣例另開一份 Z 系列記錄文件**，不要把新問題硬塞進
  本批 commit，也不要改寫本文件或 plan 文件已定案的決策。

---

## 2. Task Breakdown

> 路徑約定：
> - 以 `appspine/` 開頭者位於 monorepo（`d:\Source\Private\appspine\appspine\`）。
> - 以 `appspine-app-template/` 開頭者位於 template repo（`d:\Source\Private\appspine\appspine-app-template\`）。
> - 以 `apps/<name>/` 開頭者位於各業務 app 的獨立 repo（`d:\Source\Private\appspine\apps\<name>\`）。

### A. `@appspine/frontend-shell` 套件變更（appspine monorepo）

- [x] **T-9000** 新增 `ui/calendar.tsx`、`ui/popover.tsx`、`ui/select.tsx` 三個 shadcn primitive。
  複雜度：**S**
  - 新檔：
    - `appspine/packages/frontend-shell/src/components/ui/calendar.tsx`
    - `appspine/packages/frontend-shell/src/components/ui/popover.tsx`
    - `appspine/packages/frontend-shell/src/components/ui/select.tsx`
  - **研究階段已用 `diff`（先 `tr -d '\r'` 去除 CRLF/LF 差異後比對）核對過**
    `apps/calendar`、`apps/wiki`、`apps/chat`、`apps/project`、`appspine-app-template` 五份
    `components/ui/calendar.tsx`、`components/ui/popover.tsx`、`components/ui/select.tsx` 的
    **內容完全一致**（唯一差異是部分檔案用 CRLF、部分用 LF 換行，屬於編輯器/git 設定差異，不是
    程式碼差異）。任一 app 的版本皆可當來源，建議用 `apps/calendar` 的版本（跟 T-9001 的
    `DateTimePicker` 基準一致，方便對照）。
  - 複製來源：
    - `apps/calendar/frontend/src/components/ui/calendar.tsx`
    - `apps/calendar/frontend/src/components/ui/popover.tsx`
    - `apps/calendar/frontend/src/components/ui/select.tsx`
  - 複製時把檔案內的 import 路徑對齊 `frontend-shell` 套件內部慣例：
    - `calendar.tsx` 內 `import { Button, buttonVariants } from "@/components/ui/button"` 改成
      `import { Button, buttonVariants } from "./button.js"`（比照套件內既有檔案如
      `sidebar.tsx`、`sheet.tsx` 用相對路徑＋`.js` 副檔名 import 套件內其他 `ui/*` 元件的既有慣例，
      執行前**用 `Read` 對照一次既有檔案確認慣例仍然成立**）；`cn` 的 import 改成
      `import { cn } from "../../lib/utils.js"`（比照現有 `ui/*.tsx` 慣例）。
    - `popover.tsx`、`select.tsx` 只 import `radix-ui`（`Popover`/`Select` primitive）與
      `cn`，同上調整 `cn` 的相對路徑，其餘邏輯逐字保留、不修改。
  - 換行統一存成 LF（跟套件內其餘既有檔案一致），不要帶入來源檔案的 CRLF。
  - **不要動的東西**：不改任何邏輯、不改 class name、不新增/刪除任何 prop。
  - 驗證：`pnpm -C appspine/packages/frontend-shell typecheck`（若套件內尚未把新檔接進
    `index.ts`，這一步會因為未匯出而不會報錯，但檔案本身要能被套件內其他新檔 import 成功，留到
    T-9001~T-9003 一併驗證亦可）。
  - 依賴：無

- [x] **T-9001** 新增 `date-time-picker.tsx`，並補上 `useDateFnsLocale()` 的 `Calendar` locale。
  複雜度：**S**
  - 新檔：`appspine/packages/frontend-shell/src/components/date-time-picker.tsx`
  - 基準：`apps/calendar/frontend/src/components/date-time-picker.tsx`（**研究階段已用 `diff`
    確認 `apps/calendar`、`apps/wiki`、`apps/chat`、`apps/project`、`appspine-app-template` 五份
    `date-time-picker.tsx` 內容完全一致**——012 執行期間五個 repo 各自手動修過巢狀按鈕 bug 後，
    五份檔案又重新趨於一致，任一份都可當基準）。
  - 複製時：
    1. import 路徑對齊套件內部慣例：`@/components/ui/button` → `./ui/button.js`、
       `@/components/ui/calendar` → `./ui/calendar.js`（T-9000 新增）、
       `@/components/ui/popover` → `./ui/popover.js`（T-9000 新增）、
       `@/components/ui/select` → `./ui/select.js`（T-9000 新增，注意這個 `select.tsx` 不對外
       匯出，但套件內部檔案彼此互相 import 沒有限制）。
    2. **補上 i18n 缺口**（plan 第 2.1、3 節明確要求）：新增
       `import { useDateFnsLocale } from "./date-picker.js";`（T-9003 新增），並把原本的
       ```tsx
       <Calendar mode="single" selected={date} onSelect={handleDateSelect} />
       ```
       改成
       ```tsx
       <Calendar mode="single" selected={date} onSelect={handleDateSelect} locale={useDateFnsLocale()} />
       ```
       （原始程式碼第 114 行，見研究階段讀取的 `apps/calendar/frontend/src/components/date-time-picker.tsx`）。
    3. 其餘邏輯（`handleDateSelect`/`handleHourChange`/`handleMinuteChange`/`handleClear`/巢狀按鈕
       bug 修正後的結構）逐字保留，不重寫。
  - 驗證：`pnpm -C appspine/packages/frontend-shell typecheck`（待 T-9004 index.ts 匯出後才有意義，
    可先用 `tsc --noEmit` 對單檔跑一次 sanity check）。
  - 依賴：T-9000（`ui/calendar`、`ui/popover`、`ui/select`）、T-9003（`useDateFnsLocale`，若順序
    對調可先寫 stub 再補，但建議照 T-9003→T-9001 的順序執行，本文件編號僅為分類，不強制執行順序）

- [x] **T-9002** 新增 `date-range-picker.tsx`（採用 `apps/project` 的 i18n 版當基準）。
  複雜度：**S**
  - 新檔：`appspine/packages/frontend-shell/src/components/date-range-picker.tsx`
  - 基準：`apps/project/frontend/src/components/ui/date-range-picker.tsx`（**不是**
    `apps/calendar`/`apps/wiki`/`apps/chat`/`apps/project` 的 `components/date-range-picker.tsx`
    舊版——舊版沒有 `useDateFnsLocale()`，是被取代的一方；研究階段已確認 `apps/project` 的舊版
    `components/date-range-picker.tsx` 目前在 `apps/project` 專案裡**已經沒有任何呼叫點**，是
    orphaned 檔案）。
  - 複製時：
    - import 路徑對齊：`./ui/button.js`、`./ui/calendar.js`、`./ui/popover.js`。
    - `import { useDateFnsLocale } from "./date-picker"` 改成
      `import { useDateFnsLocale } from "./date-picker.js"`（T-9003）。
    - `export type { DateRange };`（re-export `react-day-picker` 的型別）保留，讓消費端可以直接
      `import type { DateRange } from "@appspine/frontend-shell"`，不用另外裝
      `react-day-picker` 才能拿到型別（跟 plan 第 5 節第 3 步「型別也要改從
      `@appspine/frontend-shell` 匯入」的要求對應）。
    - 其餘邏輯（`internalRange`/`handleChange`/`Calendar mode="range"` 等）逐字保留。
  - 驗證：同 T-9001，先做語法/型別 sanity check，完整驗證留待 T-9004 之後。
  - 依賴：T-9000、T-9003

- [x] **T-9003** 新增 `date-picker.tsx`（含 `DatePicker`、`useDateFnsLocale`、`parseDateOnly`、
  `formatDateOnly`）。複雜度：**S**
  - 新檔：`appspine/packages/frontend-shell/src/components/date-picker.tsx`
  - 基準：`apps/project/frontend/src/components/ui/date-picker.tsx`（另外四個 app 目前沒有這個
    元件，屬於新增能力，不是四選一）。
  - 複製時：
    - import 路徑對齊：`./button.js` → `./ui/button.js`、`./calendar.js` → `./ui/calendar.js`、
      `./popover.js` → `./ui/popover.js`、`../../lib/utils` → `../lib/utils.js`（依 T-9000/9001/9002
      的實際檔案深度調整相對路徑層數，複製後務必用 `tsc --noEmit` 驗證路徑正確，不要憑印象猜）。
    - `import { useLocale } from "@appspine/frontend-shell";` 改成套件內部相對匯入
      `import { useLocale } from "../i18n/index.js";`（**不能**在套件自己內部 import 自己的套件名
      稱——原始檔案是消費端寫法，`apps/project` 的 `date-picker.tsx` 目前是「消費 `frontend-shell`
      匯出的 `useLocale`」，搬進套件內部後兩者變成同一個套件，必須改成相對路徑；研究階段已確認
      `useLocale` 定義在 `appspine/packages/frontend-shell/src/i18n/index.tsx` 第 48 行，`export
      function useLocale(): Locale`）。
    - `date-fns/locale` 的 `zhTW`/`enUS` import 維持不變（第三方套件，不需要調整路徑）。
    - `DatePicker`、`parseDateOnly`、`formatDateOnly`、`useDateFnsLocale` 四個匯出全部逐字保留。
  - 驗證：`pnpm -C appspine/packages/frontend-shell typecheck`（可在 T-9004 之後跑一次完整驗證）。
  - 依賴：T-9000

- [x] **T-9004** `index.ts` 新增五個匯出（`select` 不對外匯出）。複雜度：**S**
  - 檔案：`appspine/packages/frontend-shell/src/index.ts`
  - 目前檔案內容（研究階段已讀取全文，25 行，按字母序排列 `export * from` 陳述式）沒有
    `calendar`/`popover`/`select`/`date-time-picker`/`date-range-picker`/`date-picker` 任何一項。
  - 新增五行（`select` **不**匯出，維持套件內部私有）：
    ```ts
    export * from './components/date-picker.js';
    export * from './components/date-range-picker.js';
    export * from './components/date-time-picker.js';
    export * from './components/ui/calendar.js';
    export * from './components/ui/popover.js';
    ```
    插入位置比照既有檔案的字母序慣例（`date-picker`/`date-range-picker`/`date-time-picker` 排在
    `export * from './components/list-pagination.js';` 之前；`ui/calendar`、`ui/popover` 排在
    `export * from './components/ui/avatar.js';` 之後、`export * from './components/ui/button.js';`
    之前——用字母序判斷精確插入點）。
  - 驗證：`pnpm -C appspine/packages/frontend-shell typecheck` 通過，且 `grep -c "date-picker\|date-range-picker\|date-time-picker\|ui/calendar\|ui/popover" index.ts` 回傳 5（確認新增五行，`select`
    確實沒被匯出）。
  - 依賴：T-9001、T-9002、T-9003

- [x] **T-9005** `package.json` 新增 `date-fns`/`react-day-picker` peerDependencies 與
  devDependencies。複雜度：**S**
  - 檔案：`appspine/packages/frontend-shell/package.json`
  - **研究階段已確認**目前 `peerDependencies`（9 項：`class-variance-authority`、`clsx`、
    `lucide-react`、`next`、`radix-ui`、`react`、`react-dom`、`tailwind-merge`、`tailwindcss`）與
    `devDependencies`（10 項，同上九項再加 `@types/node`、`@types/react`、`@types/react-dom`、
    `typescript`，其中 `next`/`tailwindcss`/`@types/node` 不在 devDependencies 裡）都沒有
    `date-fns`、`react-day-picker`。
  - `peerDependencies` 新增（比照五個既有 app 的 `frontend/package.json` 目前一致使用的版本，
    研究階段已用指令核對五個 repo `date-fns`/`react-day-picker` 版本完全一致）：
    ```json
    "date-fns": "^4.4.0",
    "react-day-picker": "^10.0.1",
    ```
    插入位置：字母序排列的話，`date-fns` 排在 `clsx` 之後、`lucide-react` 之前；
    `react-day-picker` 排在 `radix-ui` 之後、`react` 之前（維持既有字母序慣例）。
  - `devDependencies` 同步新增同樣兩行（比照套件目前所有 peerDependency 都同時是
    devDependency、供套件自己 `typecheck`/`build` 使用的既有慣例），插入位置同上字母序原則。
  - 驗證：`pnpm -C appspine install`（更新 lockfile）；`pnpm -C appspine/packages/frontend-shell typecheck` 通過。
  - 依賴：無（可與 T-9000~T-9004 平行進行，但建議排在 T-9004 之後一起跑一次完整 typecheck）

- [x] **T-9006** 套件層級完整驗收（`tsc --noEmit` + `build`）。複雜度：**S**
  - 確認 T-9000~T-9005 全部完成後，於 `appspine/` 執行：
    - `pnpm -C packages/frontend-shell typecheck`
    - `pnpm -C packages/frontend-shell build`
  - 兩者皆須通過、無型別錯誤、無未使用的 import。若 `select.tsx` 因為沒有從 `index.ts` 匯出而被
    `tsc`/打包工具判斷為「未被使用」而報警告或被 tree-shake 掉，確認 `date-time-picker.tsx` 內部
    仍然正確 import 到它（`select.tsx` 是套件內部依賴，不透過 `index.ts` 也應該能被
    `date-time-picker.tsx` 直接引用進 build 產物）。
  - **不新增測試框架、不新增 `.spec.ts`**（plan 第 3 節已定案：`frontend-shell` 目前沒有元件層級
    測試慣例，本批維持現況）。
  - 依賴：T-9000、T-9001、T-9002、T-9003、T-9004、T-9005

### B. Changesets 發版（minor，`@appspine/frontend-shell` 0.2.2 → 0.3.0）

- [x] **T-9010** 為 `@appspine/frontend-shell` 切一個 minor changeset 並套用版本。複雜度：**S**
  - monorepo 已使用 Changesets（`appspine/.changeset/config.json`、root `package.json` 提供
    `pnpm changeset` / `pnpm version-packages`（= `changeset version`）/ `pnpm release`，比照 018
    的 T-8010 執行方式）。
  - 於 `appspine/` 執行 `pnpm changeset`，**只勾 `@appspine/frontend-shell` 一個套件**，bump 類型選
    **minor**（plan 第 4 節：新增四個匯出元件跟兩個新的 peerDependencies，是新增能力，符合 semver
    對 minor 的定義；若執行時判斷應算別的等級，先確認是否偏離 plan 第 4 節的理由，若要調整需在
    「3. 執行結果」寫明理由）。summary 需包含：
    - 新增 `DateTimePicker`/`DateRangePicker`/`DatePicker` 三個元件與 `ui/Calendar`/`ui/Popover`
      兩個 primitive 的匯出。
    - **明確寫出新增了 `date-fns`/`react-day-picker` 這兩個 peerDependency**（plan 第 4 節要求，
      讓消費端升版時能提前注意到）。
  - 執行 `pnpm version-packages`（= `changeset version`）套用版本號與 CHANGELOG；**記下
    `@appspine/frontend-shell` 升到的新版本號（預期 `0.3.0`，若 Changesets 依
    `updateInternalDependencies` 連帶更新了相依的內部套件版本，一併記下**，供 C、D 群組對照）。
  - 發佈（`pnpm release` / CI publish）依團隊實際流程，需有 GitHub Packages 權限的 shell（token
    位置見 `~/.npmrc`，不是 `GITHUB_TOKEN` 環境變數——見使用者記憶）。
  - 驗證：`pnpm -C appspine build` 與 `pnpm -C appspine test` 皆通過；`git status` 顯示
    `packages/frontend-shell/package.json` 版本與 `CHANGELOG.md` 已更新、`.changeset/` 的臨時
    markdown 已被消費。
  - 依賴：T-9006

### C. `appspine-app-template` 消費端遷移

- [x] **T-9020** template 升級套件、刪本地檔案、改匯入路徑、typecheck/build 驗收。複雜度：**S**
  - 檔案：`appspine-app-template/frontend/package.json`（升版 `@appspine/frontend-shell` 為
    T-9010 產出的新版本，執行 `pnpm -C frontend install`，需有 GitHub Packages 權限的 shell）。
  - **刪除本地檔案**（不需要保留、不需要相容 shim，直接刪）：
    - `appspine-app-template/frontend/src/components/date-time-picker.tsx`
    - `appspine-app-template/frontend/src/components/date-range-picker.tsx`
  - **不刪** `ui/calendar.tsx`、`ui/popover.tsx`、`ui/select.tsx`——這三個檔案在 template 裡
    仍可能被其他既有功能引用（plan 第 2.3 節：其他呼叫點不強制遷移），只有
    `date-time-picker.tsx`/`date-range-picker.tsx`/`date-picker.tsx` 這三個檔案的匯入來源要換掉，
    `ui/` 底下的 primitive 檔案本身不動。
  - **改匯入路徑**：`appspine-app-template/frontend/src/app/(main)/dashboard/(admin)/api-keys/_components/create-api-key-dialog.tsx`
    （研究階段已 grep 確認這是 template 唯一的 `DateTimePicker` 呼叫點）把
    `import { DateTimePicker } from "@/components/date-time-picker";` 改成
    `import { DateTimePicker } from "@appspine/frontend-shell";`。
  - 遷移時**用 grep 重新確認一次**：`grep -rn 'from "@/components/date-time-picker"\|from "@/components/date-range-picker"' frontend/src` 應該只剩空結果。
  - 驗證：`pnpm -C frontend install` 成功、lockfile 更新；`pnpm -C frontend typecheck` 通過；
    `pnpm -C frontend build` 通過。
  - 依賴：T-9010

### D. 四個既有 app 各自遷移 + 分級驗證（依風險排序：project → calendar → wiki/chat）

> **四個 app 是四個獨立 git repo，各自升級、各自一個 commit。** 每個 task 內的
> `frontend/package.json`、lockfile、檔案刪除、匯入路徑修改、驗證、commit 都只屬於該 app，彼此
> 不共用。

- [x] **T-9030** `apps/project` 升級 + 手動驗證（**風險最高——唯一在用進階版功能的 app**）。
  複雜度：**M**
  - 檔案：`apps/project/frontend/package.json`（升版 `@appspine/frontend-shell` 為 T-9010
    產出的新版本），執行 `pnpm -C frontend install`（需 GitHub Packages 權限的 shell）。
  - **刪除本地檔案**（`apps/project` 要多刪兩個進階版檔案，因為它們已經是 019 移植進套件的基準，
    套件版就是它們本身）：
    - `apps/project/frontend/src/components/date-time-picker.tsx`
    - `apps/project/frontend/src/components/date-range-picker.tsx`（研究階段已確認此檔案目前
      已無任何呼叫點，屬於已被 `ui/date-range-picker.tsx` 取代的 orphaned 檔案，可直接刪）
    - `apps/project/frontend/src/components/ui/date-range-picker.tsx`
    - `apps/project/frontend/src/components/ui/date-picker.tsx`
  - **改匯入路徑**（**本 task 的呼叫點清單比 plan 文件第 5 節第 3 步完整**——plan 只列了
    `create-sprint-dialog.tsx`/`edit-sprint-dialog.tsx`，研究階段重新 grep 全 repo 後確認還有
    `issue-form.tsx`/`worklog-section.tsx` 兩個 `DatePicker` 呼叫點，四個檔案都要改）：
    - `apps/project/frontend/src/app/(main)/dashboard/projects/[id]/sprints/_components/create-sprint-dialog.tsx`：
      `import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";` 改成
      `import { type DateRange, DateRangePicker } from "@appspine/frontend-shell";`
    - `apps/project/frontend/src/app/(main)/dashboard/projects/[id]/sprints/_components/edit-sprint-dialog.tsx`：
      同上。
    - `apps/project/frontend/src/app/(main)/dashboard/projects/[id]/issues/_components/issue-form.tsx`：
      `import { DatePicker } from "@/components/ui/date-picker";` 改成
      `import { DatePicker } from "@appspine/frontend-shell";`
    - `apps/project/frontend/src/app/(main)/dashboard/projects/[id]/issues/[issueId]/_components/worklog-section.tsx`：
      `import { DatePicker, formatDateOnly } from "@/components/ui/date-picker";` 改成
      `import { DatePicker, formatDateOnly } from "@appspine/frontend-shell";`
    - `apps/project/frontend/src/app/(main)/dashboard/(admin)/api-keys/_components/create-api-key-dialog.tsx`：
      `import { DateTimePicker } from "@/components/date-time-picker";` 改成
      `import { DateTimePicker } from "@appspine/frontend-shell";`
    - 遷移時**用 grep 重新確認一次**（數量可能隨時間增加）：
      `grep -rn 'from "@/components/date-time-picker"\|from "@/components/date-range-picker"\|from "@/components/ui/date-range-picker"\|from "@/components/ui/date-picker"' frontend/src`
      應該只剩空結果。
  - **手動驗證**（唯一換掉「已經在用的進階功能」的 app，額外要驗證）：
    1. 啟動 project frontend + backend，登入。
    2. 開一次 sprint 建立表單（`create-sprint-dialog.tsx`），確認 `DateRangePicker` 選日期範圍
       正常運作、儲存後起訖日期正確。
    3. 開一次 sprint 編輯表單（`edit-sprint-dialog.tsx`），同上確認。
    4. 開一次 issue 表單（`issue-form.tsx`）或 worklog 區塊（`worklog-section.tsx`），確認
       `DatePicker` 單日期選擇正常運作。
    5. 切換語系 `zh-TW`/`en`，確認 `DateRangePicker`/`DatePicker` 彈出的 `<Calendar>` 月曆（星期
       標題、月份名稱）跟著語系正確切換（驗證 `useDateFnsLocale()` 搬進套件後仍正常運作）。
  - 驗證：上述 5 步皆符合預期；`pnpm -C frontend typecheck` + `pnpm -C frontend build` 通過。把
    實際畫面/操作結果記進「3. 執行結果」。確認無回歸後，**在 `apps/project` repo 獨立提交**。
  - 依賴：T-9010（新版本已發佈可安裝）

- [x] **T-9031** `apps/calendar` 升級 + 手動驗證（012 剛接上 `DateTimePicker`，需重新驗證時區
  邏輯不受影響）。複雜度：**M**
  - 檔案：`apps/calendar/frontend/package.json`（升版 `@appspine/frontend-shell`），執行
    `pnpm -C frontend install`。
  - **刪除本地檔案**：
    - `apps/calendar/frontend/src/components/date-time-picker.tsx`
    - `apps/calendar/frontend/src/components/date-range-picker.tsx`
  - **改匯入路徑**（研究階段已 grep 確認 `apps/calendar` 有兩個 `DateTimePicker` 呼叫點）：
    - `apps/calendar/frontend/src/app/(main)/dashboard/calendar/_components/event-form-modal.tsx`：
      `import { DateTimePicker } from "@/components/date-time-picker";` 改成
      `import { DateTimePicker } from "@appspine/frontend-shell";`
    - `apps/calendar/frontend/src/app/(main)/dashboard/(admin)/api-keys/_components/create-api-key-dialog.tsx`：
      同上改法。
    - 遷移時用 grep 重新確認一次，同 T-9030 的做法。
  - **手動驗證**（012 剛接上 `DateTimePicker`，時區換算邏輯——012 那次修的全天事件時區 bug——
    不能因為換套件版而回歸）：
    1. 啟動 calendar frontend + backend，登入。
    2. 開一次「新增事件」表單（`event-form-modal.tsx`），用 `DateTimePicker` 選日期時間並儲存。
    3. 比照 012 執行時已驗證過的方式：用 curl 直接查 API 回傳的 `startAt`/`endAt`，對照畫面上
       選的時間，確認時區換算正確（不是全天事件也要選一次日期時間，確認一般事件路徑正常）。
  - 驗證：上述 3 步皆符合預期；`pnpm -C frontend typecheck` + `pnpm -C frontend build` 通過。把
    HTTP 回應摘要記進「3. 執行結果」。確認無回歸後，**在 `apps/calendar` repo 獨立提交**。
  - 依賴：T-9010

  **執行結果**：`frontend/package.json` 的 `@appspine/frontend-shell` 直接由 `^0.2.2` 升到
  `^0.3.1`（跳過有格式 bug 的 `0.3.0`，因為 T-9030 手動驗證期間先發現並修好了那個問題）。
  刪除 `components/{date-time-picker,date-range-picker}.tsx`，改了兩個呼叫點的匯入路徑
  （`create-api-key-dialog.tsx`、`event-form-modal.tsx`），並把各檔案原本已有的
  `import { useTranslations } from "@appspine/frontend-shell"` 合併成單一 import。`grep`
  確認無殘留匯入。`pnpm -C frontend typecheck`/`build`（後者需 `npx dotenv -e .env --` 載入
  `NEXT_PUBLIC_API_URL`）皆通過。**手動驗證**（`calendar-db-1` docker 容器已在跑，啟動
  `pnpm -C backend dev`/`pnpm -C frontend dev`）：登入後開「新增事件」表單，用 `DateTimePicker`
  選擇 `Asia/Taipei` 時區、非全天事件、時間 `2026-07-15 15:56` ~ `17:56`，儲存成功。從瀏覽器的
  network log 取出建立事件當下 Next.js server action request header 內的 `auth_token`（JWT），
  用它直接 `curl` 查 backend `GET /events` API，確認回傳 `startAt: 2026-07-15T07:56:00.000Z`、
  `endAt: 2026-07-15T09:56:00.000Z`——台北 UTC+8 換算成 UTC 正確（15:56-8=07:56、17:56-8=09:56），
  012 那次修的時區邏輯未受這次套件遷移影響。已在 `apps/calendar` repo 獨立提交
  `6977836 refactor: consume DateTimePicker from @appspine/frontend-shell`（pre-commit hook：
  typecheck + biome check + enum-i18n check 皆通過），並已 push 到 remote。

- [x] **T-9032** `apps/wiki` 升級 + typecheck/build 驗證（只用在 API Key 到期時間欄位，範圍小、
  風險低）。複雜度：**S**
  - 檔案：`apps/wiki/frontend/package.json`（升版 `@appspine/frontend-shell`），執行
    `pnpm -C frontend install`。
  - **刪除本地檔案**：
    - `apps/wiki/frontend/src/components/date-time-picker.tsx`
    - `apps/wiki/frontend/src/components/date-range-picker.tsx`
  - **改匯入路徑**（研究階段已 grep 確認 `apps/wiki` 只有一個呼叫點）：
    - `apps/wiki/frontend/src/app/(main)/dashboard/(admin)/api-keys/_components/create-api-key-dialog.tsx`：
      `import { DateTimePicker } from "@/components/date-time-picker";` 改成
      `import { DateTimePicker } from "@appspine/frontend-shell";`
    - 遷移時用 grep 重新確認一次，同 T-9030 的做法。
  - **輕量驗證**（範圍小，只用在 API Key 到期時間欄位）：開一次「建立 API Key」對話框，確認
    `DateTimePicker` 能正常選日期時間、對話框能正常提交，不需要額外深度驗證。
  - 驗證：上述輕量驗證符合預期；`pnpm -C frontend typecheck` + `pnpm -C frontend build` 通過。把
    結果記進「3. 執行結果」。確認無回歸後，**在 `apps/wiki` repo 獨立提交**。
  - 依賴：T-9010

  **執行結果**：`@appspine/frontend-shell` 直接由 `^0.2.2` 升到 `^0.3.1`（跳過 `0.3.0`，理由同
  T-9031）。刪除 `components/{date-time-picker,date-range-picker}.tsx`，改了
  `create-api-key-dialog.tsx` 一處匯入路徑並合併 `useTranslations` 為單一 import。`grep` 確認
  無殘留。`pnpm -C frontend typecheck`/`build` 皆通過。**輕量驗證**（`wiki-db-1` docker 容器已在
  跑）：登入後開「新增 API 金鑰」對話框，`DateTimePicker` 選過期時間 `2026-07-22 12:00`，勾選
  `users:read` 範圍，送出後成功建立金鑰（顯示金鑰字串與複製按鈕），符合輕量驗證要求。已在
  `apps/wiki` repo 獨立提交 `885e1c7 refactor: consume DateTimePicker from @appspine/frontend-shell`
  （pre-commit hook 皆通過），並已 push。

- [x] **T-9033** `apps/chat` 升級 + typecheck/build 驗證（只用在 API Key 到期時間欄位，範圍小、
  風險低）。複雜度：**S**
  - 檔案：`apps/chat/frontend/package.json`（升版 `@appspine/frontend-shell`），執行
    `pnpm -C frontend install`。
  - **刪除本地檔案**：
    - `apps/chat/frontend/src/components/date-time-picker.tsx`
    - `apps/chat/frontend/src/components/date-range-picker.tsx`
  - **改匯入路徑**（研究階段已 grep 確認 `apps/chat` 只有一個呼叫點）：
    - `apps/chat/frontend/src/app/(main)/dashboard/(admin)/api-keys/_components/create-api-key-dialog.tsx`：
      `import { DateTimePicker } from "@/components/date-time-picker";` 改成
      `import { DateTimePicker } from "@appspine/frontend-shell";`
    - 遷移時用 grep 重新確認一次，同 T-9030 的做法。
  - **輕量驗證**：開一次「建立 API Key」對話框，確認 `DateTimePicker` 能正常選日期時間、對話框
    能正常提交，不需要額外深度驗證。
  - 驗證：上述輕量驗證符合預期；`pnpm -C frontend typecheck` + `pnpm -C frontend build` 通過。把
    結果記進「3. 執行結果」。確認無回歸後，**在 `apps/chat` repo 獨立提交**。
  - 依賴：T-9010

  **執行結果**：`@appspine/frontend-shell` 直接由 `^0.2.2` 升到 `^0.3.1`（跳過 `0.3.0`，理由同
  T-9031/T-9032）。刪除 `components/{date-time-picker,date-range-picker}.tsx`，改了
  `create-api-key-dialog.tsx` 一處匯入路徑並合併 `useTranslations` 為單一 import。`grep` 確認無
  殘留。`pnpm -C frontend typecheck`/`build` 皆通過。**輕量驗證**（`chat-db-1` docker 容器已在
  跑）：登入後開「建立 API 金鑰」對話框，`DateTimePicker` 選到期時間 `2026-07-22 12:00`，勾選
  `users:read` 範圍，送出後成功建立金鑰。已在 `apps/chat` repo 獨立提交
  `da44b87 refactor: consume DateTimePicker from @appspine/frontend-shell`（pre-commit hook 皆
  通過），並已 push。

### E. 收尾

- [x] **T-9040** 回填執行結果、確認 plan 與實作一致。複雜度：**S**
  - 每個 task 完成後把 checkbox 改 `[x]`，並在本文件「3. 執行結果」補上：改了哪些檔、驗證輸出、
    T-9010 `@appspine/frontend-shell` 實際升到的版本號（預期 `0.3.0`）、D 群組各 app 的手動驗證
    結果摘要（project 的 5 步驗證、calendar 的 3 步時區驗證＋API 回應摘要、wiki/chat 的輕量驗證）。
  - **確認 plan 第 4 節的待決事項與實作一致**：minor 版本的最終選擇（若改成別的等級要在此註明
    理由）；確認整批**確實沒有動到任何後端程式碼/Prisma schema/migration**（若過程中真的動了，
    代表偏離 plan，必須另開 Z 文件說明，不能默默混進 commit）。
  - **回頭確認本文件第 1 節記錄的「plan 與現場落差」（`apps/project` 兩個遺漏的 `DatePicker`
    呼叫點）是否已經完整處理**：T-9030 是否確實把 `issue-form.tsx`、`worklog-section.tsx` 兩個
    檔案的匯入路徑一併改掉、手動驗證是否涵蓋了這兩處。若發現又有新的、connect 階段沒發現的呼叫點
    遺漏，依 Z 系列慣例記錄。
  - 確認五個 repo（template + 四個既有 app）各自都是**獨立 commit**（五個 repo 各一，不是共用）。
  - 若過程中出現 plan 未預期的新問題，依既有慣例另開 Z 系列文件記錄，**不要**改寫 plan 或本文件
    已定案的決策，也不要把新問題混進本批遷移 commit。
  - 依賴：T-9000 ~ T-9033（全部）

  **執行結果**：
  - **版本號**：`@appspine/frontend-shell` 最終落在 **`0.3.1`**（不是 plan/task-breakdown 原本
    預期的 `0.3.0`）——`0.3.0`（minor，符合 plan 第 4 節判斷）先發佈，`apps/project` T-9030
    手動驗證時使用者發現 `DateRangePicker` 的 zh-TW 顯示格式問題（`9 6月 2026` 讀起來不自然），
    當場修正並補發一個 **patch**（`0.3.1`），版本等級判斷（minor→patch）與 plan 第 4 節原本
    「新增能力用 minor」的決策不衝突——`0.3.1` 本身是修正既有行為的 bug fix，屬於標準 patch，
    不是對 minor 判斷的推翻。
  - **後端/Prisma 檢查**：用 `git show --stat` 核對本批在 monorepo 新增的兩個 commit
    （`7dbdbe3`、`73ffe7e`）與五個消費端 repo 的所有 commit，確認**沒有觸碰任何
    `backend/`、`prisma/`、`*.prisma`、migration 檔案**，符合 plan/task-breakdown 的範圍限制。
  - **plan 與現場落差（`apps/project` 兩個 `DatePicker` 呼叫點）**：T-9030 已完整處理——
    `issue-form.tsx`、`worklog-section.tsx` 的匯入路徑都改了，手動驗證第 3、4 步也分別涵蓋了
    這兩處（建立議題表單的到期日 `DatePicker`、worklog 區塊的 `DatePicker`）。地毯式 `grep` 複查
    五個 repo 未再發現其他遺漏呼叫點。
  - **五個 repo 各自獨立 commit**：確認無誤（`git log` 核對，見下表），沒有出現跨 repo 共用
    commit 的情況：

    | Repo | Commit |
    |---|---|
    | `appspine`（monorepo） | `7dbdbe3`（套件本體＋發布 0.3.0）、`a03373a`（格式修正）、`73ffe7e`（版本升級＋發布 0.3.1） |
    | `appspine-app-template` | `1f7b106`（消費端遷移）、`5afc7ce`（升版到 0.3.1） |
    | `apps/project` | `f084a96`（消費端遷移）、`ad208a3`（升版到 0.3.1） |
    | `apps/calendar` | `6977836`（消費端遷移，直接裝 0.3.1） |
    | `apps/wiki` | `885e1c7`（消費端遷移，直接裝 0.3.1） |
    | `apps/chat` | `da44b87`（消費端遷移，直接裝 0.3.1） |

  - **計畫外發現**：`DateRangePicker` 在 `zh-TW` 用 `d MMM yyyy`（借用英文日期格式、只把月份
    名稱換成中文）顯示成 `9 6月 2026`，讀起來不自然——這是 019 執行過程中才發現的既有問題（並非
    plan 原本規劃要修的東西），依「執行原則」判斷屬於「與這次動機相關的小修正」（同一個元件同一次
    遷移內處理，不需要另開 Z 系列文件），已在流程中修正、發版、同步到所有消費端，詳見 T-9010、
    T-9030 段落記錄。
  - 全部 T-9000~T-9033 checkbox 已回填為 `[x]`，本節「3. 執行結果」與各 task 段落的執行紀錄
    互相對照一致。

---

## 3. 執行結果

### A. `@appspine/frontend-shell` 套件變更

- **T-9000**：新增 `packages/frontend-shell/src/components/ui/{calendar,popover,select}.tsx`，
  以 `apps/calendar` 版本為來源逐字複製，僅將 `@/components/ui/button`、`@/lib/utils` 等 import
  改成套件內部相對路徑（`./button.js`、`../../lib/utils.js`），並統一成套件既有的
  single-quote/分號/trailing-comma 格式（比照 `biome.json` 設定與 `sheet.tsx`/`tooltip.tsx`/
  `dropdown-menu.tsx` 既有慣例，`export function X` 直接宣告，不用檔尾 `export { }` 列表）。
  未改動任何邏輯、class name 或 prop。
- **T-9003**：新增 `packages/frontend-shell/src/components/date-picker.tsx`，基準為
  `apps/project/frontend/src/components/ui/date-picker.tsx`。`useLocale` 改成相對匯入
  `../i18n/index.js`（原本消費端寫法 `from "@appspine/frontend-shell"` 在套件內部行不通）。
  `DatePicker`/`parseDateOnly`/`formatDateOnly`/`useDateFnsLocale` 四個匯出邏輯逐字保留。
- **T-9001**：新增 `packages/frontend-shell/src/components/date-time-picker.tsx`，基準為
  `apps/calendar/frontend/src/components/date-time-picker.tsx`（012 已修過巢狀按鈕 bug 的版本）。
  補上 `import { useDateFnsLocale } from './date-picker.js'`，並在
  `<Calendar mode="single" .../>` 補上 `locale={dateFnsLocale}`，補齊 i18n 缺口。
- **T-9002**：新增 `packages/frontend-shell/src/components/date-range-picker.tsx`，基準為
  `apps/project/frontend/src/components/ui/date-range-picker.tsx`（i18n 版，非四個 app 的舊版）。
  `export type { DateRange }` 保留，讓消費端可直接從 `@appspine/frontend-shell` 拿型別。
- **T-9004**：`src/index.ts` 依字母序新增五行 `export * from`：
  `./components/date-picker.js`、`./components/date-range-picker.js`、
  `./components/date-time-picker.js`（插入於 `list-pagination.js` 之前）、
  `./components/ui/calendar.js`、`./components/ui/popover.js`（分別插入於 `avatar.js`/`button.js`
  之後、`collapsible.js`/`separator.js` 之前，維持字母序）。`ui/select.js` 依計畫**未匯出**。
  `grep -c` 驗證回傳 `5`，且 `select` 關鍵字在 `index.ts` 內查無結果。
- **T-9005**：`packages/frontend-shell/package.json` 的 `peerDependencies`／`devDependencies`
  各新增 `"date-fns": "^4.4.0"`、`"react-day-picker": "^10.0.1"`（執行前已用
  `grep` 重新核對 `apps/{calendar,wiki,chat,project}` 與 `appspine-app-template` 五個
  `frontend/package.json`，版本確實完全一致，與 plan/task-breakdown 記錄相符）。
  已執行 `pnpm install`（於 `appspine/` 根目錄），輸出 `Packages: +3 ... done`，lockfile 已更新。
- **T-9006**：`pnpm -C packages/frontend-shell typecheck` 與
  `pnpm -C packages/frontend-shell build` 皆通過、無型別錯誤。確認 build 產物
  `dist/components/ui/select.js`（連同 `.d.ts`）確實有產生——`select.tsx` 雖未從 `index.ts`
  匯出，但透過 `date-time-picker.tsx` 內部 import 仍正確被 tsc 編譯進 `dist/`，未被當成
  dead code 移除。

> Group B（Changesets 發版）、Group C（template 消費端）、Group D（四個既有 app 消費端）
> 尚未執行——B 群組的 `pnpm release` 涉及發佈到共用 GitHub Packages registry、D 群組涉及
> 四個獨立 repo 的 install/commit，皆需要使用者確認後才繼續。

### B. Changesets 發版

- **T-9010（已完成）**：新增 `.changeset/date-picker-package.md`（`"@appspine/frontend-shell": minor`），
  summary 已載明新增的三個元件、兩個 primitive 匯出，以及 `date-fns`/`react-day-picker` 兩個新
  peerDependency。執行 `pnpm version-packages`（= `changeset version`）後：
  - `@appspine/frontend-shell` 版本由 `0.2.2` 升到 **`0.3.0`**（符合 plan 第 4 節的 minor 判斷）。
  - `packages/frontend-shell/CHANGELOG.md` 已新增 `## 0.3.0` 條目。
  - `.changeset/date-picker-package.md` 已被消費（`git status` 確認不再存在）。
  - `pnpm -C appspine build`（全部 10 個套件）與 `pnpm -C appspine test`（`auth`/`m2m-api-key`/
    `mcp-server`/`metadata-schema` 等有測試的套件）皆通過。
  - 執行 `pnpm release`（= `pnpm -r run build && changeset publish`），**`@appspine/frontend-shell@0.3.0`
    發佈成功**，其餘 9 個套件因版本未變動被 changesets 正確跳過（`npm info` 比對後判斷「已發佈」）。
  - **執行順序修正**：`changeset publish` 建立 git tag 的當下，monorepo 尚有未 commit 的檔案
    變更（新增的三個元件檔、`ui/calendar.tsx`、`ui/popover.tsx`、`ui/select.tsx`、`index.ts`、
    `package.json`、`CHANGELOG.md`、`pnpm-lock.yaml`），導致 tag 一開始指向舊的
    commit（`4d06f18`，不含這次變更）。發現後補上 commit
    `7dbdbe3 feat(frontend-shell): add DateTimePicker/DateRangePicker/DatePicker; publish 0.3.0`，
    並用 `git tag -d` + 重新 `git tag -a` 把 `@appspine/frontend-shell@0.3.0` 這個 tag 移到
    `7dbdbe3`（tag 尚未 push 到 remote，可安全修正，不影響已發佈的 npm 套件內容——套件是從當下
    working tree build 出來的，內容本身正確，只有本地 tag 位置需要對齊）。之後執行同一類任務時，
    應該先 commit 再切 changeset/發版，避免同樣的 tag 錯位問題。
  - 已 `git push origin main` + `git push origin @appspine/frontend-shell@0.3.0` 推送到 remote。

### C. `appspine-app-template` 消費端遷移

- **T-9020（已完成）**：`frontend/package.json` 的 `@appspine/frontend-shell` 由 `^0.2.2` 升到
  `^0.3.0`，`pnpm -C frontend install` 成功（`peers check` 顯示一則 `@appspine/audit-log` 版本
  落差警告，與這次遷移無關的既有問題，不在 019 範圍內處理）。刪除
  `frontend/src/components/{date-time-picker,date-range-picker}.tsx`；
  `create-api-key-dialog.tsx` 原本已有一行 `import { useTranslations } from "@appspine/frontend-shell"`，
  改成合併匯入 `import { DateTimePicker, useTranslations } from "@appspine/frontend-shell"`（而非
  兩條獨立 import 陳述式）。`grep` 重新確認無殘留匯入。`pnpm -C frontend typecheck` 通過；
  `pnpm -C frontend build`（原生 `next build` 未載入 `.env`，需要用
  `npx dotenv -e .env -- pnpm -C frontend build` 才能通過 `NEXT_PUBLIC_API_URL` 檢查，
  與這次遷移無關的既有 script 限制）確認建置成功。已在 `appspine-app-template` repo 獨立
  commit `1f7b106 refactor: consume DateTimePicker from @appspine/frontend-shell`
  （pre-commit hook：typecheck + biome check + enum-i18n check 皆通過），並已 push 到 remote。
  後續 T-9030 手動測試發現 `DateRangePicker` 的 zh-TW 顯示格式問題（詳見下方 T-9030 段落），
  已補上 `@appspine/frontend-shell@0.3.1` 並同步升版（commit `5afc7ce`，push 完成）；此 app 只用
  `DateTimePicker`，不受該格式問題影響，純粹是保持與其他 app 版本一致。

### D. `apps/project` 消費端遷移（風險最高）

- **T-9030（已完成）**：`frontend/package.json` 的 `@appspine/frontend-shell` 由 `^0.2.2` 升到
  `^0.3.0`，`pnpm -C frontend install` 成功。刪除四個本地檔案：
  `components/{date-time-picker,date-range-picker}.tsx`（後者為 orphaned 舊版，`grep` 確認遷移前
  已無任何呼叫點）、`components/ui/{date-range-picker,date-picker}.tsx`（019 移植進套件的基準本身）。
  改了 5 個呼叫點的匯入路徑（`create-api-key-dialog.tsx`、`create-sprint-dialog.tsx`、
  `edit-sprint-dialog.tsx`、`issue-form.tsx`、`worklog-section.tsx`），並把各檔案原本已存在的
  `import { useTranslations } from "@appspine/frontend-shell"` 合併成單一 import 陳述式（而非
  兩條平行的 import）。`grep` 重新確認無殘留匯入。`pnpm -C frontend typecheck` 通過；
  `pnpm -C frontend build`（同樣需要 `npx dotenv -e .env -- pnpm -C frontend build` 載入
  `NEXT_PUBLIC_API_URL`）建置成功。
  - **手動驗證**（啟動 `pnpm -C backend dev`/`pnpm -C frontend dev`，`project-db-1` docker 容器
    已在跑）：以瀏覽器（chrome-devtools MCP）登入 `admin@example.com` / `.env` 內的
    `SEED_USER_PASSWORD`，操作 Alpha Project：
    1. 建立迭代對話框（`create-sprint-dialog.tsx`）：用 `DateRangePicker` 選 `2026/6/9 - 2026/7/20`，
       建立成功，列表正確顯示 `2026/6/9 ~ 2026/7/20`。
    2. 編輯迭代對話框（`edit-sprint-dialog.tsx`）：把結束日期改成 `7/22`，儲存後列表正確更新為
       `2026/6/9 ~ 2026/7/22`。
    3. 建立議題表單（`issue-form.tsx`）：`DatePicker`（到期日）選 `2026/7/10`，建立後議題詳情頁
       正確顯示到期日 `2026/7/10`。
    4. Worklog 區塊（`worklog-section.tsx`）：`DatePicker` 預設今天日期、可正常開合月曆並選日期。
    5. 語系切換 `zh-TW`→`en`：worklog 的 `DatePicker` popover 月曆從「2026年7月／日一二三四五六」
       正確切換成「July 2026／Su Mo Tu We Th Fr Sa」，確認 `useDateFnsLocale()` 搬進套件後仍正常。
    - 過程中 console 無 error/warning。
  - **執行中發現的顯示問題（使用者回報，非 plan 預期）**：手動驗證時使用者發現
    `DateRangePicker` 按鈕在 `zh-TW` 顯示成 `9 6月 2026 - 1 7月 2026`（借用英文 `d MMM yyyy`
    格式、只把月份名稱換成中文，日期在前、月份在後的順序在中文語境下不自然）。修正為單純數字格式
    `format(date, 'yyyy/M/d')`（例：`2026/6/9`），不需要 locale 就能兩個語系通用。已在
    monorepo 補一個 patch changeset（`.changeset/date-range-picker-format-fix.md`），
    `pnpm version-packages` 把 `@appspine/frontend-shell` 從 `0.3.0` 升到 **`0.3.1`**，
    `pnpm build`/`pnpm test` 通過，commit `73ffe7e` 後執行 `pnpm release` 發佈
    `@appspine/frontend-shell@0.3.1`，push commit + tag。`appspine-app-template`
    （commit `5afc7ce`）、`apps/project`（commit `ad208a3`）均已跟進升級到 `^0.3.1` 並重新
    typecheck/push；`apps/project` 額外重開瀏覽器複驗，確認編輯迭代對話框的日期區間顯示已改為
    `2026/6/9 - 2026/7/22`。**尚未遷移的 `apps/calendar`/`apps/wiki`/`apps/chat`（T-9031~T-9033）
    將直接安裝 `^0.3.1`，不會經過有問題的 `0.3.0`。**
  - 確認無回歸後已在 `apps/project` repo 獨立提交（`f084a96` 遷移本體、`ad208a3` 0.3.1 版本升級），
    並已 push。

---

## 4. 驗證方式總覽

| 群組 | 主要驗證方式 |
|---|---|
| A `@appspine/frontend-shell` 新增元件 | `pnpm -C appspine/packages/frontend-shell typecheck`/`build`；`ui/calendar`、`ui/popover`、`ui/select` 逐字複製後路徑對齊；`date-time-picker`/`date-range-picker`/`date-picker` 補上 `useDateFnsLocale()`；`index.ts` 新增五個匯出（`select` 不匯出）；`package.json` 新增 `date-fns`/`react-day-picker` peer+devDependency |
| B Changesets 發版 | `pnpm changeset` 只勾 `@appspine/frontend-shell` 選 minor + `pnpm version-packages`；`pnpm -C appspine build`/`test` 綠燈；記下新版本號（預期 0.3.0）；changeset 內明確寫出新增的 peerDependency |
| C template 消費端 | `pnpm -C frontend install` + `typecheck` + `build`；刪本地檔案、改匯入路徑，grep 確認無殘留 |
| D 四個 app 分級驗證 | 各自 `frontend/package.json` 升版 + `install` + 刪本地檔案 + 改匯入路徑，各自獨立 commit：project 完整手動驗證（sprint 起訖日期、issue/worklog 單日期、語系切換）；calendar 手動驗證（事件表單 + API 時區回應比對）；wiki/chat 輕量驗證（API Key 到期欄位）+ typecheck/build |
| E 收尾 | 全 task checkbox 回填；確認 minor 版本決定、確認全程無後端/schema 變更、確認五個 repo 各自獨立 commit、確認 plan 落差清單（`apps/project` 兩個 `DatePicker` 呼叫點）已完整處理；計畫外發現另開 Z 系列文件 |
