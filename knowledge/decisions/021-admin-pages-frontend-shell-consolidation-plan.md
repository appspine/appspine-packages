---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-09
updated: 2026-08-03
---

# 021 - Users / Roles / API Keys Admin 頁收斂進 `@appspine/frontend-shell` - 系統設計計畫

> 狀態：**已執行完成（2026-07-08）**。
> 範圍：**框架級變更**，落在 `appspine` monorepo 的 `@appspine/frontend-shell` 套件，其次是
> `appspine-app-template` 與四個既有 app（`apps/wiki`、`apps/calendar`、`apps/chat`、
> `apps/project`）的消費端遷移。**不涉及後端／Prisma schema 變更**——純前端元件搬遷，屬於
> `_archive/dev_docs-20260803/framework/020-framework-consolidation-plan.md` §6.1 已完成評估、本文件補上具體設計與執行
> 步驟（比照 019 之於 005 的模式：005/020 先決策「要做」，019/021 再落地怎麼做）。
> 動機來源：020 框架休整盤點時發現 users/roles/api-keys 三個 admin 頁在五個 repo
> （`appspine-app-template` + 四個既有 app）幾乎是 100% 拷貝，020 §6.1 已評估可行性並拍板
> 「強烈建議收斂」，且明文「預計在 approve / drive 等下一個業務系統開工前，另立新的編號計畫
> 實作」——`_archive/dev_docs-20260803/app-drive/013-drive-app-plan.md`（drive）已因此在文首標記「暫緩開工，待本計畫完成」。

---

## 1. 背景與問題

### 1.1 020 §6.1 的評估結論（前情提要）

`_archive/dev_docs-20260803/framework/020-framework-consolidation-plan.md` §6.1 盤點五份 admin 頁拷貝（`appspine-app-template`
+ wiki/calendar/chat/project）後結論「完全可行」，並建議在 `@appspine/frontend-shell` 內建立
`<UsersAdmin />`/`<RolesAdmin />`/`<ApiKeysAdmin />` 三個模組，透過 prop 注入 `apiPrefix`/
`apiClient` 對接各 app 路由。**本文件重新核實了實際程式碼**（020 當時只做評估，沒有讀到逐檔
細節），發現實際架構比 020 的草案更精細，需要調整搬遷方式，見第 2 節。

### 1.2 逐檔核實：重複度比 020 說的還要高

用 `diff` 直接比對五個 repo 的對應檔案，結果**逐檔位元組完全相同**（節錄）：

| 檔案 | 比對對象 | 結果 |
|---|---|---|
| `users/page.tsx` | wiki vs calendar | 完全相同 |
| `users/actions.ts` | wiki vs calendar | 完全相同 |
| `roles/page.tsx` | wiki vs project | 完全相同 |
| `roles/actions.ts` | wiki vs chat | 完全相同 |
| `api-keys/page.tsx` | wiki vs project | 完全相同 |
| `frontend/src/server/api-client.ts` | wiki vs chat | 完全相同 |
| `api-keys/types.ts` 的 `SCOPE_RESOURCES`/`SCOPE_ACTIONS` | wiki/calendar/chat/project 四份 | 完全相同（`["users","api-keys"]`/`["read","write"]`，尚未涵蓋各 app 自己的業務 scope，這是既有的獨立缺口，不在本計畫範圍，見第 2.3 節） |

**結論**：這三頁與其相依的 `_components/*`、`types.ts`、甚至連 `@/server/api-client.ts` 本身，
在四個既有 app 之間**沒有任何一處出現 app 各自演化的差異**——跟 019 當初「`apps/project` 已經
自己改良過」的情況不同，這次是純粹的樣板重複，沒有取捨版本基準的問題，遷移風險比 019 更低。

### 1.3 為什麼不能像 019 一樣整頁搬進套件（架構限制）

Next.js App Router 的 page 是**檔案系統路由**：`page.tsx`/`actions.ts`（`"use server"` 檔案）
物理上必須存在於各 app 自己的 `src/app/` 樹下，無法像純 UI 元件一樣單純用 `export from`
從套件"匯入一個路由"。因此即使程式碼完全相同，也**做不到「刪掉五份、只留套件一份」**這種
019 式的乾淨收斂，能做到的是「把可以脫離檔案系統路由邊界的部分搬進套件、把不能脫離的部分
瘦身成薄殼」，見第 2 節的具體切法。

---

## 2. 決策：搬什麼、怎麼搬

### 2.1 搬進 `@appspine/frontend-shell` 的部分（表格 + 對話框 + 型別，佔現有程式碼量的大宗）

| 分類 | 現有位置（以 wiki 為例） | 搬遷後 |
|---|---|---|
| 表格呈現（header/欄位/badge，目前內嵌在 `page.tsx`） | `users/page.tsx` 第 63-129 行等 | 拆成 `<UsersTable>`/`<RolesTable>`/`<ApiKeysTable>`，純呈現、可在 Server Component 內直接使用（不需要 `"use client"`），props 吃資料陣列 + 已綁定好的 action 函式（給內部的 RowActions 用）+ `currentUserId`（users 用來擋自我刪除） |
| Client 互動元件 | `_components/create-user-dialog.tsx`、`user-row-actions.tsx`、`create-role-dialog.tsx`、`role-row-actions.tsx`、`create-api-key-dialog.tsx`、`api-key-row-actions.tsx`、`created-api-key-reveal.tsx` | 原封不動搬（本來就只依賴 `@appspine/frontend-shell` 的 `useTranslations`/`DateTimePicker` 與 shadcn primitive，`../actions` 改成吃 props 傳入的 action 函式，見 2.2 節） |
| 型別 | 三份 `types.ts`（`UserRow`/`RoleRef`/`RoleOption`/`RoleRow`/`ApiKeyRow`/`CreateApiKeyResponse`/`ServiceAccountOption`/`SCOPE_RESOURCES`/`SCOPE_ACTIONS`） | 全部搬（1.2 節已核實四個 app 完全相同，包含 `SCOPE_RESOURCES`/`SCOPE_ACTIONS`——這是 M2M scope 格式本身的框架常數，不是各 app 業務 scope，見 2.3 節的既有缺口說明） |

新的套件內部路徑：`packages/frontend-shell/src/components/admin/`（`users-table.tsx`、
`create-user-dialog.tsx`、`user-row-actions.tsx`、`roles-table.tsx`、`create-role-dialog.tsx`、
`role-row-actions.tsx`、`api-keys-table.tsx`、`create-api-key-dialog.tsx`、
`api-key-row-actions.tsx`、`created-api-key-reveal.tsx`、`types.ts`）。

### 2.2 Action 函式：保留「`"use server"` 檔案留在各 app」，但共用實際邏輯（避免再次 020 式重複）

`"use server"` 指令必須在檔案層級宣告，且各 app 的 `actions.ts` 目前 import 各自的
`@/server/api-client`（模組別名 `@/` 只在各 app自己的 tsconfig paths 內成立，套件編譯後的
`dist/` 無法用同一個別名解析回消費端專案）——這是第 1.3 節提到的邊界，無法用 019 的方式整個
刪掉。**採用的做法**：把 try/catch＋`ApiError` 訊息轉換這段目前在 12 個 action function 裡
重複的邏輯，抽成 `@appspine/frontend-shell` 匯出的**純函式**（不带 `"use server"`，只是一般
async 工具函式），各 app 的 `actions.ts` 瘦身成呼叫轉發：

```ts
// packages/frontend-shell/src/components/admin/actions-core.ts（純函式，非 "use server"）
export interface ApiFetchLike {
  <T>(path: string, init?: RequestInit): Promise<T>;
}
export async function createUserRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const roleIds = formData.getAll("roleIds").map(String);
  try {
    await apiFetch("/users", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
        name: formData.get("name") || undefined,
        isServiceAccount: formData.get("isServiceAccount") === "on",
        roleIds: roleIds.length > 0 ? roleIds : undefined,
      }),
    });
  } catch (err) {
    return { error: isApiError(err) ? err.message : "Failed to create user" };
  }
  return {};
}
```

```ts
// apps/wiki/frontend/.../users/actions.ts（瘦身後，"use server" 留在這裡）
"use server";
import { revalidatePath } from "next/cache";
import { createUserRequest } from "@appspine/frontend-shell";
import { ApiError, apiFetch } from "@/server/api-client";

export async function createUserAction(formData: FormData) {
  const result = await createUserRequest(apiFetch, (e): e is { message: string } => e instanceof ApiError, formData);
  if (!result.error) revalidatePath("/dashboard/users");
  return result;
}
```

每個 app 的 `actions.ts` 從目前 ~80 行（users）/~60 行（roles）/~90 行（api-keys）瘦身到每個
action 4-6 行的純轉發，共 12 個 action（users 4 個、roles 3 個、api-keys 3 個 + create 各 1
個，實際數字依現有函式清單）。**`revalidatePath` 的路徑字串（`/dashboard/users` 等）四個
app 也完全相同**，但這一行留在各 app 檔案裡，不試圖跨套件呼叫（`next/cache` 的
`revalidatePath` 本來就是呼叫端所在路由樹的相對操作，硬要包進套件反而增加理解成本，效益
不足以承擔風險）。

### 2.3 刻意不動的部分

- **`page.tsx`/`actions.ts` 檔案本身不能刪**：第 1.3 節說明的 Next.js 路由邊界限制，每個 app
  仍需保留這兩個檔案，只是大幅瘦身（`page.tsx` 從 ~140 行降到抓資料 + 呼叫
  `<UsersTable>`/`<RolesTable>`/`<ApiKeysTable>` 的 ~40 行；`actions.ts` 降到純轉發）。
- **`@/server/api-client`、`@/i18n/server`、`@/server/current-user`、`@/server/list-url` 不搬**：
  雖然 1.2 節核實這幾個模組目前四個 app 也完全相同，但它們是 `appspine-app-template` 既有的
  「app 基礎設施」層，不是「admin 頁專屬」的重複——真的要收斂需要重新評估這幾個模組要不要
  整層抽成獨立套件，是遠超本計畫範圍的另一個決策，**不在此處理**（若未來要做，應另開文件，
  類比本次「005 決定要做、019/021 才落地」的模式）。
- **`@/lib/i18n/enum-label` 不搬**：roles 頁用到，但這是通用 enum i18n 輔助函式（007 機制的
  一部分），不是 admin 頁專屬，維持現狀。
- **`SCOPE_RESOURCES`/`SCOPE_ACTIONS` 目前只涵蓋 `["users","api-keys"]`，未涵蓋各 app 自己的
  業務 scope（如 `wiki-spaces:read`）**：這是核實時發現的既有缺口（建立 API Key 的 UI 目前
  選不到業務 scope），**不在本計畫範圍內修正**——本計畫只搬遷現狀，不修既有功能缺口，若要修
  需要先設計一個「各 app 業務 scope 目錄從哪來」的機制（例如擴充 `/metadata/schema`），另開
  文件處理。
- **i18n 訊息 key 不動**：`users`/`roles`/`apiKeys`/`common`/`enums` namespace 的訊息 key
  結構维持現狀留在各 app 的 `messages/{en,zh-TW}.json`，套件內的元件一樣呼叫既有的
  `useTranslations(namespace)`（`@appspine/frontend-shell` 既有機制，`ListSearchForm` 等
  已經是這個模式，不需要新設計）。

---

## 3. `appspine` monorepo 變更（`@appspine/frontend-shell`）

- **新增 shadcn primitive**（目前 `src/components/ui/` 沒有的七個，`dropdown-menu`/`select`/
  `popover`/`calendar` 已存在不用重複加）：`dialog.tsx`、`alert-dialog.tsx`、`checkbox.tsx`、
  `label.tsx`、`field.tsx`、`table.tsx`、`badge.tsx`。搬遷前用 `diff` 核對四個既有 app 的版本
  一致（比照 019 §3 對 `calendar.tsx`/`popover.tsx` 的做法），任一 app 的版本皆可當基準。
- **新增 `src/components/admin/`**：
  - `types.ts`（`UserRow`、`RoleRef`、`RoleOption`、`RoleRow`、`ApiKeyRow`、
    `CreateApiKeyResponse`、`ServiceAccountOption`、`SCOPE_RESOURCES`、`SCOPE_ACTIONS`）
  - `actions-core.ts`（12 個純函式，2.2 節模式，每個對應現有 12 個 action 的邏輯本體）
  - `users-table.tsx`、`create-user-dialog.tsx`、`user-row-actions.tsx`
  - `roles-table.tsx`、`create-role-dialog.tsx`、`role-row-actions.tsx`
  - `api-keys-table.tsx`、`create-api-key-dialog.tsx`、`api-key-row-actions.tsx`、
    `created-api-key-reveal.tsx`
  - Table 元件的 action 函式改由呼叫端（各 app 的 `page.tsx`）以 props 傳入（Server Component
    可以直接把 import 自本地 `"use server"` `actions.ts` 的函式引用往下傳給 Client Component，
    這是 Next.js 既有支援的模式，不需要額外機制）。
- **`src/index.ts`**：新增對應的 `export * from` （7 個 UI primitive 中，`dialog`/`alert-dialog`/
  `checkbox`/`label`/`field`/`table`/`badge` 皆對外匯出——跟 019 的 `ui/select` 不同，這幾個
  primitive 在 admin 頁以外沒有跟既有匯出衝突的疑慮；`admin/` 底下全部匯出）。
- **`package.json`**：本次搬遷用到的 shadcn primitive 與既有 peerDependencies
  （`radix-ui`/`lucide-react`/`class-variance-authority`/`clsx`/`tailwind-merge`）已涵蓋，
  **預期不需要新增 peerDependency**（`field`/`table`/`badge` 等都是 Tailwind + Radix 既有能力
  的組合，不像 019 引入 `date-fns`/`react-day-picker` 這種全新第三方套件）；執行時仍需实际
  `pnpm install` 核對一次，若发现需要新 peer 依赖再依 019 §3 的模式补上。
- **單元測試**：跟 019 一致，`frontend-shell` 是純 UI 元件套件，不新增測試框架，維持
  `tsc --noEmit` 驗收（020 §2.4 已明文排除）。

---

## 4. 版本與發版

`@appspine/frontend-shell` 從 `0.3.1`（019 完成後的版本）升到 **`0.4.0`**（minor）——新增
一批匯出元件與型別，不影響既有匯出的行為，符合 semver minor 的定義。Changesets 說明需要點名
新增的 `admin/*` 匯出與七個新 shadcn primitive，方便未來的 approve/drive 等新 app 直接使用
這批元件（而不是像過去五個 repo一樣重新複製）。

---

## 5. `appspine-app-template` 與四個既有 app 的消費端遷移步驟

比照 019 §5 的模式，各自獨立 repo、各自獨立 commit。**風險排序**：由於第 1.2 節已核實四個
app 完全零差異（不像 019 的 `apps/project` 有獨立演化版本要驗證不能壞掉），四個既有 app的
遷移風險彼此相同，順序可以單純照「業務重要度／改動頻率」排：`appspine-app-template`
（確保新 fork 從一開始就是套件版）→ `apps/wiki` → `apps/calendar` → `apps/chat` →
`apps/project`（無特別優先順序考量）。

每個 repo 的具體步驟：

1. **升級套件**：`frontend/package.json` 的 `@appspine/frontend-shell` 版本改成 `^0.4.0`，
   `pnpm install`。
2. **刪除本地檔案**（不保留、不做相容 shim）：
   - `(admin)/users/_components/create-user-dialog.tsx`、`user-row-actions.tsx`
   - `(admin)/roles/_components/create-role-dialog.tsx`、`role-row-actions.tsx`
   - `(admin)/api-keys/_components/create-api-key-dialog.tsx`、`api-key-row-actions.tsx`、
     `created-api-key-reveal.tsx`
   - 三份 `types.ts` 內搬遷過去的型別/常數（若該檔案清空則整份刪除；若還有 app 自己需要的
     型別殘留則保留檔案只刪對應片段——依核實結果，目前三份 `types.ts` 應該可以整份刪除）
3. **瘦身 `page.tsx`**：改成呼叫 `<UsersTable>`/`<RolesTable>`/`<ApiKeysTable>`（從
   `@appspine/frontend-shell` 匯入），資料抓取（`apiFetch`/`getTranslations`）邏輯不變。
4. **瘦身 `actions.ts`**：改成呼叫 `@appspine/frontend-shell` 的 `*Request` 純函式 + 本地
   `revalidatePath`，見 2.2 節範例。
5. **改匯入路徑**：全專案搜尋原本 `from "./_components/..."`、`from "../types"` 的呼叫點，
   確認都已改成從 `@appspine/frontend-shell` 匯入（page.tsx 內對 Table 元件的呼叫、
   dialogs/row-actions 之間互相的型別引用）。
6. **驗證**：`pnpm typecheck`/`pnpm build` 通過；瀏覽器手動走一次三頁的 golden path（比照
   020 §2.3 各 app 已有的 admin 頁使用方式，非新功能，只需確認搬遷後行為不變）：
   - Users：建立使用者、改角色、停用/啟用、標記/取消服務帳號、刪除（含「不能刪自己」擋下）。
   - Roles：建立角色、編輯角色（含 ADMIN 角色的權限唯讀鎖定）、刪除（含「仍被使用中不能刪」
     擋下）。
   - API Keys：建立（含 scopes 勾選、`DateTimePicker` 到期時間、acting user 下拉）、
     一次性顯示 key 的複製流程、停用/啟用、改 acting user、刪除。
7. **各自獨立 commit**，訊息可比照本次動機（020 盤點發現的重複、021 執行收斂）。

---

## 6. 高階執行順序（供後續 task-breakdown 展開）

```
appspine monorepo：
  1. @appspine/frontend-shell：
     a. 新增七個 shadcn primitive（dialog/alert-dialog/checkbox/label/field/table/badge，第 3 節）
     b. 新增 components/admin/types.ts（第 2.1、3 節）
     c. 新增 components/admin/actions-core.ts（12 個純函式，第 2.2 節）
     d. 新增 components/admin/*-table.tsx、create-*-dialog.tsx、*-row-actions.tsx、
        created-api-key-reveal.tsx（第 2.1、3 節）
     e. index.ts 新增對應匯出
     f. tsc --noEmit 驗收
  2. Changesets：minor version（0.4.0）
  3. 發版

appspine-app-template：
  4. 依第 5 節步驟遷移（升級套件、刪本地檔案、瘦身 page.tsx/actions.ts、typecheck/build 驗收）

apps/wiki → apps/calendar → apps/chat → apps/project（依第 5 節，各自獨立 repo）：
  5. 依第 5 節步驟遷移
  6. 依第 5 節「驗證」段落做三頁 golden path 手動測試
  7. 確認無回歸後各自獨立提交

收尾：
  8. 更新 _archive/dev_docs-20260803/app-drive/013-drive-app-plan.md、013-task-breakdown.md 的「執行前置依賴」註記，
     解除暫緩開工狀態（本計畫完成後 drive 才能從 template fork）
  9. dev_docs/INDEX.md 狀態行更新（重跑 generate-index.mjs）
```

---

## 7. 決策記錄

| 決策點 | 結論 | 詳見 |
|---|---|---|
| 020 §6.1 草案的 `<UsersAdmin apiPrefix="/api" />` 整頁式元件，還是拆更細的表格+對話框？ | 拆更細——Next.js App Router 的 page/actions 有檔案系統路由與 `"use server"` 邊界限制，整頁式元件做不到，見第 1.3 節 | 第 1.3、2.1 節 |
| Action 邏輯要不要也搬進套件？ | 邏輯（try/catch/錯誤轉換）搬成純函式，但 `"use server"` 宣告與 `revalidatePath` 呼叫留在各 app，避免跨套件的 Server Action 邊界增加不必要的複雜度與風險 | 第 2.2 節 |
| `@/server/api-client` 等 app 基礎設施模組要不要一併收斂？ | 不要——雖然核實後也是四個 app 完全相同，但這是比 admin 頁更大範圍的另一個決策，超出本計畫範圍 | 第 2.3 節 |
| `SCOPE_RESOURCES`/`SCOPE_ACTIONS` 目前只有 `users`/`api-keys`、未涵蓋各 app 業務 scope，要不要順手修 | 不要——本計畫只搬遷現狀，既有功能缺口需要先設計「業務 scope 目錄來源」機制，另開文件 | 第 2.3 節 |
| 版本要 patch 還是 minor | minor（0.4.0）——新增匯出元件，不影響既有行為 | 第 4 節 |
| 四個既有 app 遷移順序 | 無特別風險排序（核實後四個 app 完全零差異，不像 019 有「進階版」需要優先驗證），依現況慣例排 wiki → calendar → chat → project | 第 5 節 |
| drive（013）/approve（016）什麼時候可以開工 | 本計畫完成、`appspine-app-template` 消費新版 admin 頁之後——013 已標記暫緩、待本計畫完成後解除 | 文首、第 6 節第 8 步 |

若執行過程中出現新的待決問題，比照既有慣例在此文件補充，或另開 Z 系列記錄文件。

