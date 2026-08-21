---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-01
updated: 2026-08-03
---

# 005 - 共用 UI 元件與 i18n 計劃

> 本文件是 004 完成管理 UI（T-301~T-310）之後的下一階段執行計劃，範圍是把已驗證過的頁面模式（server-component
> + URL 參數分頁）抽出共用元件，並補上多語系機制。
> 狀態：計劃已定案，待 T-201~T-206（frontend-shell 套件骨架，交給 Codex）完成後再排 task breakdown。

## 背景

004 的 T-307~T-310 已經在瀏覽器實測驗證過一套列表頁模式：server component + 後端 `paginate()` + URL 參數
（`?page=&search=`），不是 client-side `@tanstack/react-table`。原本考慮參照 `auranest` 的作法，但實地檢查
`auranest` 的 `@auranest/ui` 與各 app 的列表頁後發現：

- auranest 沒有共用的 `<DataTable>` 元件，每個 app 的列表頁各自 `'use client'` + `useReactTable()` +
  `@tanstack/react-query`，欄位排序/篩選/分頁邏輯都是重複貼上，不是套件抽出來的。
- 真正共用的只有 `table-pagination.tsx`（純分頁按鈕）跟 `table-skeleton.tsx`，而且這兩個放在
  `auranest-app-template/frontend/src/components/`（跟著 template fork 複製，不是套件相依）。
- `@auranest/frontend-core` 跟 `@auranest/ui` 有明顯重疊（`use-current-user`、`lib/auth`、`i18n/config`、
  preferences store 兩邊都有），是套件邊界沒切乾淨的案例，appspine 要避免重蹈覆轍。

**結論**：appspine 繼續沿用 T-307~T-310 已驗證的 server-component 模式，不換成 client-side table library。
共用元件的範圍因此比 auranest 小很多。

另外，auranest 的 i18n 也不是真的用 `next-intl`（雖然列在 `peerDependency` 但實際沒被 import），是手刻的極簡
context-based provider，語系用 cookie 記錄、`getLocale()`/`setLocale()` server action 讀寫。appspine-app-template
現有的 `frontend/src/server/server-actions.ts` 已經有一模一樣形狀的 `getPreference<T>(key, allowed, fallback)` /
`setValueToCookie(key, value)`，用來存 `sidebar_variant` 等偏好設定 —— locale 可以直接套用這組既有 helper，不用
另外寫一份。

---

## 範圍

### A. 共用 UI 元件（併入 `@appspine/frontend-shell`）

不開新套件，理由：這些是表單/資料呈現層的小元件，跟 T-201~T-206 已規劃的「app shell 層」（DashboardShell /
ThemeSwitcher / UserNav）綁在同一個 peer 策略（shadcn primitive 由 app 端提供、套件不打包）下最省事，避免重演
`@auranest/frontend-core` vs `@auranest/ui` 切不乾淨的問題。

| 元件 | 說明 | 目前狀態 |
|---|---|---|
| `<ListSearchForm>` | search input + Search 按鈕的小 form | T-307 `users/page.tsx`、T-309 `api-keys/page.tsx` 各自重複一份完全一樣的 JSX |
| `<ListPagination>` | `page/totalPages` + Previous/Next 按鈕，`disabled` vs `asChild+Link` 的條件邏輯 | 同上，T-307/T-309 各自重複一份（含已修過的 `<Link>` disabled bug） |
| `<DateTimePicker>` | 日期時間選擇器，`calendar.tsx`（react-day-picker）+ `popover.tsx` + `date-fns`，仿 auranest 的組法 | T-309 目前用原生 `<input type="datetime-local">`，堪用但不精緻；換掉時要保留「參與原生 FormData」的能力（沿用 T-308 已驗證過的 shadcn `Select` 隱藏 `<select>` 參與 FormData 的模式，用一個 hidden input 同步） |

**不做**：DataTable（auranest 自己也沒有，各頁面各自組 `Table`/`TableBody`/`TableRow` 即可）、Select 的額外包裝
（shadcn `Select` 已經驗證可用，不需要 auranest 的 `app-select.tsx` 那種 nullable 便利層）。

### B. i18n（併入 `@appspine/frontend-shell`）

比照 auranest 的極簡模式搬過來，但用 appspine 既有的 `getPreference`/`setValueToCookie` 取代重寫一份
`getLocale`/`setLocale`：

| 項目 | 說明 |
|---|---|
| `Locale` type / `locales` / `defaultLocale` | `["zh-TW", "en"] as const`，預設 `zh-TW` |
| `buildAllMessages(en, zhTW)` | 型別安全的 shape helper，回傳 `Record<Locale, Messages>`；套件不擁有翻譯字串，字串留給各 app 的 `messages/en.json` / `messages/zh-TW.json` |
| `I18nProvider` + `useTranslations(namespace)` + `useLocale()` | 手刻 React context，不引入 `next-intl`（auranest 也沒真的用到它，省一個相依） |
| locale 讀取 | Server Component 直接呼叫既有 `getPreference("locale", locales, defaultLocale)`，不寫新的 `getLocale()` |
| locale 寫入 | Client 端 Server Action 包一層 `setValueToCookie("locale", next)` + `redirect`/`refresh` |
| `<LocaleSwitcher currentLocale={locale}>` | dropdown menu，樣式比照現有 `ThemeSwitcher`，放進 header（`dashboard/layout.tsx` 的 header 右側，`ThemeSwitcher` 旁邊） |

**Template 端改動**：
- `frontend/src/app/layout.tsx`（root layout）：呼叫 `getPreference("locale", ...)`，包一層 `<I18nProvider>`
- `frontend/messages/en.json`、`frontend/messages/zh-TW.json`：翻譯字典骨架
- `frontend/src/i18n/messages.ts`：`export const allMessages = buildAllMessages(en, zhTW)`（跟 auranest 同名同形狀）

**既有頁面回頭債（這輪一起補，不留到之後）**：
T-302~T-310 目前所有 UI 文字（Login 表單、Users/Roles/API Keys 三頁的 label/button/error message、sidebar
`Administration` 分組、breadcrumb 文字）都是寫死英文字串。i18n 落地後要一次性把這些換成 `useTranslations()` key，
量不大（估計 5~8 個檔案），但要注意：
- Server Component（`page.tsx`）沒有 `useTranslations()` hook 可用（那是 client context），錯誤訊息與靜態文字
  若需要在 server 端組字串，要嘛把該區塊拆成 client 元件，要嘛額外提供一個 server 端可用的翻譯讀取方式
  （auranest 沒有這個問題是因為它的列表頁全部是 client component）。**這是本計劃裡最大的技術不確定性，
  T-2xx task breakdown 時要先花一個 task 把這個問題定案**，不要假設能直接照搬 auranest 的 hook 用法。
- `header-breadcrumbs.tsx` 目前是純字串查表（`BREADCRUMB_LABELS`），换成 i18n key 查表即可，改動小。

---

## 執行順序

```
T-201~T-206（frontend-shell 套件骨架，交給 Codex）── 先完成、先驗證 peer 策略走得通
  └── T-207+（本計劃的範圍，下一輪 task breakdown）
        ├── i18n 基礎設施（Locale/Provider/messages 骨架 + server component 翻譯方案定案）
        ├── 共用 UI 元件（ListSearchForm / ListPagination / DateTimePicker）
        └── 既有頁面回頭改用 i18n（Login / Users / Roles / API Keys / sidebar+breadcrumb）
```

刻意跟 T-201~T-206 分開排，不合併成同一份 task breakdown：T-201~T-206 是先驗證「frontend-shell 套件骨架 +
peer 邊界策略」走不走得通，範圍已經夠大；如果把 UI 元件跟 i18n 一次全部塞進去，之後出問題會很難判斷是骨架本身
的問題還是新元件的問題。

---

## 已確認的技術決策

| 問題 | 決策 |
|---|---|
| 列表頁要不要換成 client-side tanstack table | 不換，維持 T-307~T-310 的 server-component + URL 參數分頁 |
| 共用 UI 元件放哪個套件 | 併入 `@appspine/frontend-shell`，不開新的 `@appspine/ui` |
| i18n 現在做還是緩做 | 現在做 |
| i18n 要不要用 next-intl | 不用，比照 auranest 手刻極簡 context provider，省一個相依 |
| locale 讀寫機制 | 沿用既有 `getPreference()`/`setValueToCookie()`，不重寫 |
| 支援語系 | `zh-TW`（預設）+ `en` |
| 既有頁面（T-302~T-310）文字要不要一起改成 i18n | 要，這輪一起補，不留到之後 |
| 跟 Codex 的 T-201~T-206 要不要合併成同一輪 task breakdown | 不合併，等 T-201~T-206 完成後再排下一輪 |

## 完成後的狀態

- 三個管理頁面 + Login 頁面共用的搜尋/分頁邏輯不再各自重複貼上一份
- API Key 建立表單的到期時間欄位有正常的日期時間選擇器
- 整個框架有 zh-TW / en 雙語系機制，且不是半吊子（新舊頁面文字都走 i18n，不是只有新頁面）
- 下一步：`@appspine/e2e-kit`（T-401~T-406，同樣交給 Codex）

