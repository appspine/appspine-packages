---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-08
updated: 2026-08-03
---

# 019 - DateTimePicker / DateRangePicker 收斂進 `@appspine/frontend-shell` - 系統設計計畫

> 狀態：已完成（14/14）
> 範圍：**框架級變更**，落在 `appspine` monorepo 的 `@appspine/frontend-shell` 套件，其次是
> `appspine-app-template` 與四個既有 app（`apps/wiki`、`apps/calendar`、`apps/chat`、
> `apps/project`）的消費端遷移。**不涉及後端／Prisma schema 變更**——純前端元件搬遷，
> 屬於補完 `_archive/dev_docs-20260803/framework/005-shared-ui-i18n-plan.md` 當初規劃但沒有真正落地的一塊。
> 動機來源：012（calendar app）執行完的手動測試與 bug 修復過程中，發現 `DateTimePicker`
> 有一個巢狀 `<button>` 的 hydration bug，因為這個元件是「用 app-template fork 機制複製」
> 而不是「套件相依」，同一段程式碼在 `appspine-app-template`、`apps/calendar`、
> `apps/wiki`、`apps/project`、`apps/chat` 五個地方各有一份，必須手動修五次。盤點時同時
> 發現 `apps/project` 早就獨立改良過自己那份 `DateRangePicker`（加上 `DatePicker` +
> `useDateFnsLocale()` 兩個 i18n 相關的新東西），但這個改良從未回饋到其他四個地方——
> 「共用元件沒有真的共用」這件事已經造成兩種相反方向的實際損害：bug 要修五次、改良傳不出去。

---

## 1. 背景與問題

### 1.1 005 早就決定要做，但沒做完

`_archive/dev_docs-20260803/framework/005-shared-ui-i18n-plan.md` 第 39-46 行明確列出三個要併入 `@appspine/frontend-shell`
的共用元件：`<ListSearchForm>`、`<ListPagination>`、`<DateTimePicker>`。目前 `frontend-shell`
的 `src/index.ts` 確認前兩個已經做了（`list-pagination.ts`、`list-search-form.ts`），唯獨
`DateTimePicker` 沒有——它變成先在 `appspine-app-template/frontend/src/components/` 寫一份，
後續四個既有 app 各自 fork 出去時把這份檔案原封不動複製了一份，從此各自獨立、沒有任何相依關係。

### 1.2 這次實際付出的代價：同一個 bug 改五次

012 執行期間發現 `date-time-picker.tsx` 的 popover 觸發按鈕（`PopoverTrigger asChild` 包一個
`<Button>`）裡面，又塞了一個「清除」用的 `<button>`——`<button>` 巢狀 `<button>` 是不合法的
HTML，會觸發 React hydration error。這個問題在 `appspine-app-template`、`apps/calendar`、
`apps/wiki`、`apps/project`、`apps/chat` 五份完全一樣的檔案裡都存在，最後是五個 repo 各自
手動 `Edit` + `git commit` 修一次（commit：`appspine-app-template@9167c34`、
`apps/calendar@aa50f8e`、`apps/wiki@a65ecbe`、`apps/project@b2e5e2a`、`apps/chat@0ce13e7`）。

### 1.3 反方向的代價：`apps/project` 的改良從未傳出去

盤點五份 `date-time-picker.tsx`/`date-range-picker.tsx` 時發現 `apps/project` 額外有：

- `apps/project/frontend/src/components/ui/date-range-picker.tsx`——比
  `apps/project/frontend/src/components/date-range-picker.tsx`（跟其他四個 app 一樣的舊版）
  多了 `placeholder`/`align`/`className`/`disabled` props，而且用 `useDateFnsLocale()`
  依目前語系把按鈕文字（`format(..., { locale: dateFnsLocale })`）跟 `<Calendar locale=...>`
  都正確 i18n 化。
- `apps/project/frontend/src/components/ui/date-picker.tsx`——一個獨立的單日期選擇器
  （`DatePicker` + `parseDateOnly`/`formatDateOnly` + `useDateFnsLocale()`），另外四個 app
  完全沒有這個元件，`apps/project` 自己在 sprint 起訖日期用得到才自己補的。
- `useDateFnsLocale()`：`() => { const locale = useLocale(); return locale === "zh-TW" ? zhTW : enUS; }`，
  只有 8 行，卻精準解決了這次 012 執行時另外遇到的問題——`DateTimePicker` 彈出的 popover
  裡那個 `<Calendar>` 月曆本身沒有吃到 `zh-TW` 語系（星期標題、月份名稱仍是英文），
  跟 012 那次順手修的「calendar app 側欄 mini calendar 沒 i18n」是同一類問題，
  `apps/project` 半年前就把這個修法做出來了，只是没人知道、也沒地方讓其他 app 撿到。

**結論**：現有的「fork 時複製一份、之後各自演化」模式，已經不是理論上的風險，而是正在發生的
現象——bug 各自修、功能各自長，`apps/project` 的 `useDateFnsLocale()` 其實就是這次 019
要解決的問題的現成答案，不需要重新設計，直接採用即可。

---

## 2. 決策：搬什麼、怎麼搬

### 2.1 移入 `@appspine/frontend-shell` 的元件（四個）

| 元件 | 採用哪一版當作基準 | 說明 |
|---|---|---|
| `DateTimePicker` | `apps/calendar` 這次已修過巢狀按鈕 bug 的版本 | 五份裡功能相同，選一份已經修好的當基準即可，不用重寫 |
| `DateRangePicker` | `apps/project` 的 `components/ui/date-range-picker.tsx`（i18n 版），**不是**另外四個 app 那份舊版 | 舊版沒有 `useDateFnsLocale()`，功能上是被取代的一方 |
| `DatePicker` | `apps/project` 的 `components/ui/date-picker.tsx` | 另外四個 app 目前沒有這個元件，屬於新增能力，不是四選一 |
| `useDateFnsLocale()` | `apps/project` 的 `components/ui/date-picker.tsx` 裡那 4 行 | `DateTimePicker`/`DateRangePicker`/`DatePicker` 三個都要用它把彈出的 `<Calendar>` 接上目前語系 |

`DateTimePicker` 併入時要順便補上 `apps/project` 那套 i18n 處理（目前 `DateTimePicker` 內部
的 `<Calendar mode="single" .../>` 沒有傳 `locale`，跟 `DateRangePicker` 舊版是一樣的缺口）。

### 2.2 一併打包進 `frontend-shell` 的底層依賴：`Calendar`、`Popover`

上述四個元件共同依賴 shadcn 的 `Calendar`（`react-day-picker` 包裝）跟 `Popover`
（`radix-ui` 包裝）。`frontend-shell` 目前的 `ui/` 資料夾已經有自帶打包的
`avatar`/`button`/`collapsible`/`dropdown-menu`/`input`/`separator`/`sheet`/`sidebar`/
`skeleton`/`tooltip`（不是 peer，是套件自己內含一份），比照同一個既有慣例，新增
`ui/calendar.tsx`、`ui/popover.tsx` 到套件裡並從 `index.ts` 匯出。

**新增 peerDependencies**：`frontend-shell` 目前的 `peerDependencies` 沒有 `date-fns`、
`react-day-picker`（已核對 `package.json`）。這次要新增這兩個。版本比照四個既有 app
目前一致使用的版本：`date-fns@^4.4.0`、`react-day-picker@^10.0.1`（五個 app 都已經是這個
版本，不需要額外升級任何 app 的版本才能相容）。

### 2.3 刻意不動的部分

- **`Select` 不搬進 `frontend-shell`**：`DateTimePicker` 內部的時/分選單用得到 `Select`，
  但 `Select` 在每個 app 裡另外還有 6~10 處完全無關的用法（表單欄位選單等），搬遷成本遠
  大於效益，而且 005 當初就明確決定「不做 Select 的額外包裝」。做法：`frontend-shell`
  內部自帶一份不對外匯出的 `Select`（只給 `DateTimePicker` 自己用），不影響、不取代
  各 app 現有的 `@/components/ui/select`。
- **各 app 既有的 `Calendar`/`Popover` 其他用途不強制遷移**：盤點發現 `Popover` 在
  `layout-controls.tsx`（四個 app 都有）、`message-item.tsx`／`push-preference-toggle.tsx`
  （`apps/chat`）另有用途；`Calendar` 在 `apps/calendar` 的側邊欄 mini calendar
  （`calendar-sidebar.tsx`）另有用途。這次遷移範圍只處理
  `date-time-picker.tsx`/`date-range-picker.tsx`/`date-picker.tsx` 這三個檔案的匯入來源，
  不動其他呼叫點——避免遷移範圍擴大到跟這次動機無關的既有功能，增加回歸風險。
  未來若要把 `layout-controls.tsx` 等處也換成吃 `frontend-shell` 的 `Popover`/`Calendar`，
  另開文件處理，不在 019 範圍內。

---

## 3. `appspine` monorepo 變更（`@appspine/frontend-shell`）

- **新增檔案**：
  - `packages/frontend-shell/src/components/ui/calendar.tsx`（從 `apps/calendar` 的
    `src/components/ui/calendar.tsx` 搬過去，不需要修改邏輯）
  - `packages/frontend-shell/src/components/ui/popover.tsx`（同上，任一 app 的版本皆可，
    五份應該完全一致，遷移前用 `diff` 確認）
  - `packages/frontend-shell/src/components/ui/select.tsx`（同上，僅供套件內部
    `DateTimePicker` 使用，不從 `index.ts` 匯出）
  - `packages/frontend-shell/src/components/date-time-picker.tsx`（基準：2.1 節）
  - `packages/frontend-shell/src/components/date-range-picker.tsx`（基準：`apps/project`
    的 i18n 版，2.1 節）
  - `packages/frontend-shell/src/components/date-picker.tsx`（基準：`apps/project`，
    含 `DatePicker`、`useDateFnsLocale`、`parseDateOnly`、`formatDateOnly`，2.1 節）
- **`src/index.ts`**：新增五行 `export * from` （`ui/calendar`、`ui/popover`、
  `date-time-picker`、`date-range-picker`、`date-picker`；`ui/select` 不匯出，見 2.3 節）。
- **`package.json`**：`peerDependencies` 新增 `"date-fns": "^4.4.0"`、
  `"react-day-picker": "^10.0.1"`；`devDependencies` 同步新增，供套件自己 `typecheck`/`build`
  使用（比照現有 `radix-ui`/`lucide-react` 等其餘 peer 的 devDependencies 慣例）。
- **`DateTimePicker` 內部**：`<Calendar mode="single" selected={date} onSelect={handleDateSelect} />`
  補上 `locale={useDateFnsLocale()}`，補齊 2.1 節提到的 i18n 缺口。
- **單元測試**：`frontend-shell` 目前沒有既有的元件層級測試慣例（純 UI 元件，跟
  `@appspine/auth`/`@appspine/rbac` 這種有商業邏輯的套件不同），這次不額外新增測試框架，
  維持現況（僅 `tsc --noEmit` 作為驗收）。

---

## 4. 版本與發版

`@appspine/frontend-shell` 從 `0.2.2` 升到 **`0.3.0`**（minor，不是 patch）——這次新增了
四個新的匯出元件跟兩個新的 peerDependencies，是新增能力而不是修正既有行為，符合 semver
對 minor 版本的定義。用 Changesets 切版，changeset 說明需要包含「新增 `date-fns`/
`react-day-picker` peerDependency」這件事，讓消費端在升版時能提前注意到（雖然五個 app
目前版本都已相容，不需要額外裝新套件，但仍要在 changeset 裡寫清楚，避免之後有新 app
用不同版本的 `date-fns`/`react-day-picker` fork 時漏掉）。

---

## 5. `appspine-app-template` 與四個既有 app 的消費端遷移步驟

**與 018 情況類似**：`appspine-app-template`、`apps/wiki`、`apps/calendar`、`apps/chat`、
`apps/project` 五個地方都要各自遷移，各自獨立 commit（各自的 git repo）。順序建議先
`appspine-app-template`（確保未來新 fork 的 app 從一開始就是套件版），再依風險排序四個既有
app：`apps/project`（要驗證「换成套件版的 `DateRangePicker`/`DatePicker` 後，sprint
起訖日期功能不能壞掉」，風險最高，因為它是唯一目前正在用「進階版」的 app）→
`apps/calendar`（`event-form-modal.tsx` 剛在 012 接上 `DateTimePicker`，要確保換成套件版後
一樣能正確運作，且時區換算邏輯——012 那次修的全天事件時區 bug——不受影響）→ `apps/wiki`／
`apps/chat`（只用在 API Key 到期時間欄位，範圍小，風險低）。

每個 repo 的具體步驟（五個地方完全一樣，僅路徑不同）：

1. **升級套件**：`frontend/package.json` 的 `@appspine/frontend-shell` 版本改成 `^0.3.0`，
   `pnpm install`。
2. **刪除本地檔案**（不需要保留、不需要相容 shim，直接刪）：
   - `frontend/src/components/date-time-picker.tsx`
   - `frontend/src/components/date-range-picker.tsx`（`apps/project` 額外要刪
     `frontend/src/components/ui/date-range-picker.tsx` 跟
     `frontend/src/components/ui/date-picker.tsx` 這兩個進階版，因為它們已經是 019
     移植進套件的基準，套件版就是它們本身，不是「換一個新的」）
3. **改匯入路徑**：全專案搜尋 `from "@/components/date-time-picker"`、
   `from "@/components/date-range-picker"`、`from "@/components/ui/date-range-picker"`
   （僅 `apps/project`）、`from "@/components/ui/date-picker"`（僅 `apps/project`），
   全部改成 `from "@appspine/frontend-shell"`。已知呼叫點（遷移時用 grep 重新確認一次，
   數量可能隨時間增加）：
   - 五個 app 的 `(admin)/api-keys/_components/create-api-key-dialog.tsx`（`DateTimePicker`）
   - `apps/calendar` 的 `calendar/_components/event-form-modal.tsx`（`DateTimePicker`）
   - `apps/project` 的 `sprints/_components/create-sprint-dialog.tsx`、
     `edit-sprint-dialog.tsx`（`DateRangePicker`，型別 `DateRange` 也要改從
     `@appspine/frontend-shell` 匯入，而不是原本的 `react-day-picker`）
   - `apps/project` 的 `projects/[id]/issues/_components/issue-form.tsx`、
     `projects/[id]/issues/[issueId]/_components/worklog-section.tsx`（`DatePicker`，
     `worklog-section.tsx` 同時也用到 `formatDateOnly`，一併改從 `@appspine/frontend-shell`
     匯入；這兩處是 019 task-breakdown 展開時重新 grep 才找到的，本文件初版遺漏，遷移時
     以這裡補上的清單為準）
4. **驗證**：`pnpm typecheck`/`pnpm build` 過即可作為基本驗收；`apps/project` 因為是唯一
   換掉「已經在用的進階功能」的 app，額外要手動開一次 sprint 建立/編輯表單，確認日期範圍
   選擇、語系切換（`zh-TW`/`en`）都正常，並額外手動開一次 issue 表單與 worklog 區塊確認
   `DatePicker` 選日期正常；`apps/calendar` 額外要手動開一次「新增事件」
   表單，確認 `DateTimePicker` 選日期時間、儲存後時間正確（比照 012 執行時已經驗證過的
   方式：用 curl 直接查 API 回傳的 `startAt`/`endAt` 對照畫面上選的時間）。
5. **各自獨立 commit**，訊息比照這次 019 動機（可參考 `date-time-picker.tsx` 巢狀按鈕修正
   commit 的写法：先講清楚問題，再講解法）。

---

## 6. 高階執行順序（供後續 task-breakdown 展開）

```
appspine monorepo：
  1. @appspine/frontend-shell：
     a. 新增 ui/calendar.tsx、ui/popover.tsx、ui/select.tsx（第 3 節）
     b. 新增 date-time-picker.tsx、date-range-picker.tsx、date-picker.tsx（採用
        apps/project 的 i18n 版當基準，第 2.1、3 節）
     c. DateTimePicker 內部補上 useDateFnsLocale() 的 Calendar locale（第 2.1 節）
     d. index.ts 新增五個匯出（select 不匯出）
     e. package.json 新增 date-fns/react-day-picker peerDependencies（第 3 節）
     f. tsc --noEmit 驗收
  2. Changesets：minor version（0.3.0），changeset 裡寫明新增的 peerDependencies
  3. 發版

appspine-app-template：
  4. 依第 5 節步驟遷移（升級套件、刪本地檔案、改匯入路徑、typecheck/build 驗收）

apps/project → apps/calendar → apps/wiki → apps/chat（依第 5 節排序，各自獨立 repo）：
  5. 依第 5 節步驟遷移
  6. 依第 5 節「驗證」段落做對應深度的手動測試
  7. 確認無回歸後各自獨立提交
```

---

## 7. 決策記錄

| 決策點 | 結論 | 詳見 |
|---|---|---|
| 要不要開一個新的 `@appspine/date-picker` 套件，還是併入既有的 `frontend-shell` | 併入 `frontend-shell`——延續 005 當初的決定（不開 `@appspine/ui`），且這幾個元件本來就是表單層級的小元件，沒有獨立成套件的理由 | 005 全文、第 2.1 節 |
| `DateRangePicker`/`DatePicker` 要不要重新設計 | 不要——直接採用 `apps/project` 已經做好、且有 i18n 支援的版本當基準，這是現成、已驗證過的答案 | 第 1.3、2.1 節 |
| `Calendar`/`Popover` 要不要打包進套件 | 要，比照 `frontend-shell` 現有其他 shadcn primitive（Button/Sheet 等）都是自帶打包、不是 peer 的既有慣例 | 第 2.2 節 |
| `Select` 要不要打包進套件並對外匯出 | 不對外匯出——只在套件內部給 `DateTimePicker` 自己用；`Select` 在各 app 另有 6~10 處無關用途，不搬 | 第 2.3 節 |
| 各 app 既有的 `Calendar`/`Popover` 其他呼叫點（側邊欄 mini calendar、`layout-controls.tsx` 等）要不要一起換成套件版 | 不要——超出這次動機（重複 bug 修復）的範圍，另開文件處理，避免擴大回歸風險 | 第 2.3 節 |
| 版本要 patch 還是 minor | minor（0.3.0）——新增匯出元件跟新增 peerDependency，不是修正既有行為 | 第 4 節 |
| 四個既有 app 遷移順序 | `apps/project` 優先（唯一在用進階版功能，風險最高）→ `apps/calendar`（012 剛接上 `DateTimePicker`，需要重新驗證）→ `apps/wiki`／`apps/chat`（僅用於 API Key 到期欄位，風險低） | 第 5 節 |

若之後執行過程中出現新的待決問題，比照既有慣例在此文件補充，或另開 Z 系列記錄文件。

