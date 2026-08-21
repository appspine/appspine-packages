---
type: decision
scope: single-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-10
updated: 2026-08-10
---

# 045 - `apps/drive` 白板功能（Excalidraw 整合）- 系統設計計畫

> [!success] 決策狀態
> **已定案，可排入執行。** Task breakdown 見 [log.md](../log.md)。本計畫把最初的白板構想
> 討論收斂定案，範圍收斂為「單機開白板、能存進 Drive、能匯出 PNG/SVG」，明確排除多人即時協作
> 與樂觀鎖等更大範圍的能力。
>
> [!important] 覆核修正（2026-08-10）
> 定案後派出一輪對抗性覆核（逐檔核對程式碼），發現初版低估了後端範圍：Drive 目前**沒有任何
> API 能替換既有檔案的內容**（WOPI `putFile` 與 `restoreVersion` 都不適用，見 §4.2），且上傳
> 白名單會直接擋掉 `.excalidraw`（見 §4.1）。這兩項原本被寫成「Phase 2 查證」或「backend 視情況
> 小幅調整」，實際上是必須新建的後端能力，本版已據此改寫 §4、§5.3、§7 並更新 task breakdown。
> 另外縮圖功能因為在 Drive 現有程式碼中找不到任何寫入或顯示路徑，屬於會半途而廢的範圍膨脹，
> 已從 v1 移除（見 §4.3）。

## 1. 決策摘要

在 `apps/drive` 新增白板檔案類型：使用者可以像建立 Office 文件一樣建立一份白板，用
[Excalidraw](https://github.com/excalidraw/excalidraw)（MIT 授權）畫布自由繪圖/寫字/擺放圖形，
存進既有的 `DriveFile` 通用檔案模型（可搬移資料夾、可分享、有版本歷史），不建立新的資料模型
或新的儲存後端，但需要新建一組白板專用的內容讀寫 API（見 §4.2）。

原本三項待決事項的最終決定：

1. **匯出**：v1 就支援匯出 PNG/SVG，使用 Excalidraw 內建的 `exportToBlob`/`exportToSvg`，不是
   延後項目。
2. **編輯衝突保護**：v1 不做鎖定或樂觀鎖，採「後存覆蓋前存」——新的白板存檔動作**故意不**套用
   `restoreVersion` 既有的樂觀鎖（`updateMany({ where: { id, version } })`，衝突時丟
   `ConflictException`），單純以 `where: { id }` 覆蓋。理由不是「跟 Drive 現有大部分非 Office
   檔案類型一致」（查證後：目前**沒有任何**非 Office 檔案類型是可以站內編輯的，全部只能預覽/
   下載，不存在可比較的先例），而是假設白板為單人編輯情境，且 scene JSON 是整份文件的
   snapshot，沒有可合併的欄位層級語意，做樂觀鎖只會把「使用者可理解的最後寫入為準」變成
   「使用者看不懂的 409 錯誤」。若之後出現真實的多人同時編輯需求，另開新計畫評估。
3. **React 19 相容性**：已查證 `@excalidraw/excalidraw@0.18.1` 的
   `peerDependencies` 明確宣告 `react: '^17.0.2 || ^18.2.0 || ^19.0.0'`，與
   `apps/drive/frontend` 目前使用的 `react@19.2.7`／`react-dom@19.2.7` 相容。這只是 declared
   peer dependency 相容，Phase 1 scaffold 仍必須實際安裝並跑一次 render smoke test，不能只憑
   `npm view` 的查證結果跳過。

## 2. 範圍與明確排除

### 2.1 v1 範圍

- 建立空白白板檔案、開啟既有白板檔案編輯、存檔。
- 白板內容沿用 Drive 既有版本歷史機制（存檔前把舊版另存一份），但存檔動作走新的白板專用
  內容 API（見 §4.2），不套用既有的樂觀鎖。
- 匯出目前開啟中的白板為 PNG 或 SVG，供不使用 Excalidraw 的人查看。
- 「新建檔案」下拉選單新增白板項目，UI 模式與現有 Office 範本一致。
- 檔案列表的白板圖示與顏色（見 §6）。
- `zh-TW`／`en` 完整 i18n，UI/UX 品質達到與 Drive 其他功能一致的正式產品品質（見 §6）。

### 2.2 明確排除（不是 v1 blocker，也不預留 schema）

- **多人即時協作編輯**：Excalidraw 官方即時協作（`excalidraw-room`）需要獨立的 WebSocket 房間
  伺服器，是獨立的基礎設施決定。045 完全不評估、不設計、不預留相關欄位或 API。
- **編輯鎖定／樂觀鎖**：不重用 `DriveFile.lockToken`/`lockedBy`/`lockedAt`（那是為 Collabora
  WOPI 鎖定語意設計的欄位，協定假設不同），也不套用 `restoreVersion` 的樂觀鎖模式，不另外
  設計簡化版鎖定機制。
- **縮圖**：v1 不產生、不儲存、不顯示白板縮圖（見 §4.3 的查證與理由）。
- **批次匯出／自動匯出**：只在使用者主動於編輯器內操作時觸發匯出，不做背景批次產生 PNG/SVG。
- **WOPI 整合**：Excalidraw 不說 WOPI 協定，不進 Collabora iframe 路徑，不受
  `COLLABORA_EXTENSIONS` 判斷式管轄。

這些排除項目若之後出現真實需求，各自另開新的 decision plan，不得在 045 執行期間擴大範圍。

## 3. 技術基線查證

| 項目 | 查證結果 |
| --- | --- |
| `apps/drive/frontend` 目前 React 版本 | `react@^19.2.7`、`react-dom@^19.2.7`（`apps/drive/frontend/package.json`） |
| `@excalidraw/excalidraw` 最新穩定版 | `0.18.1` |
| `@excalidraw/excalidraw@0.18.1` peerDependencies | `react: '^17.0.2 \|\| ^18.2.0 \|\| ^19.0.0'`、`react-dom` 同版本範圍 |
| 結論 | Declared peer dependency 相容；Phase 1 仍須實際安裝並跑 render smoke test，才能視為完整驗證（見 §7 Phase 1） |

## 4. 資料模型與後端 API

不修改 `DriveFile` Prisma schema。白板存成一種新的檔案類型：

```text
mimeType: application/vnd.excalidraw+json
副檔名:   .excalidraw
內容:     Excalidraw scene JSON，透過 StorageService.putObject/getObject 存取
版本:     沿用既有 DriveFileVersion（存新版前把舊版另存一份），不新增欄位
```

`DriveFile.lockToken`/`lockedBy`/`lockedAt` 三欄位不被白板使用，維持 null。

### 4.1 上傳白名單

`apps/drive/backend/src/drive/files/files.controller.ts` 的 `ALLOWED_UPLOAD_EXTENSIONS`（副檔名
白名單，非 mimeType 白名單，Multer `fileFilter` 強制執行、不符回 422）與其前端鏡像
`apps/drive/frontend/src/lib/upload-extensions.ts` 目前都沒有 `excalidraw`，會直接擋掉白板檔案
上傳。兩份清單都要新增 `"excalidraw"`，並更新 `files.controller.ts` 422 錯誤訊息字串。這是已
確認的必要變更，不是「查證看要不要調整」。

### 4.2 白板內容讀寫 API（新建）

查證結果：Drive 目前**沒有任何**通用的「替換既有檔案內容」端點。

- `PATCH /drive/files/:id`（`file.dto.ts`）只能改 `name`／`folderId`，不能改內容。
- `wopi.controller.ts` 的 `putFile` 能寫新內容，但受 `WopiTokenGuard` 保護，需要 Collabora
  核發的 WOPI token，且會檢查 `lockToken`——不適用白板（§2.2 已排除）。
- `POST /drive/files/:id/versions/:versionId/restore` 只能把**既有版本**復原成目前版本，不接受
  新的 request body 內容。
- `GET /drive/files/:id/download` 回傳的是 MinIO 預簽 URL（`{ url }`），目前所有消費者都是
  `<img src>`／`<iframe src>`／`<a download>`，從未被瀏覽器端 `fetch()` 讀取過內容；白板編輯器
  要讀 scene JSON 內容，若沿用這條路徑會變成對 MinIO origin 的跨網域 XHR，需要額外設定 MinIO
  CORS（目前完全沒有設定）。

因此 045 新建兩個白板專用端點，直接以後端 stream 內容，不經過預簽 URL、不需要 MinIO CORS：

```text
GET  /drive/files/:id/contents   讀取目前內容（後端 stream，比照 downloadVersion/getThumbnail 的模式）
PUT  /drive/files/:id/contents   覆蓋目前內容（存檔）
```

兩者都套用與 `PATCH /drive/files/:id` 相同的 guard 組合（`RequirePermissions(Permission.DRIVE_FILE_READ`
或 `DRIVE_FILE_UPDATE)`、`Scopes("drive-files:read"` 或 `"drive-files:write")`、
`SpaceMemberGuard` + `RequireSpaceRole(VIEWER`/`EDITOR, "file-param")`）。

`PUT .../contents` 的行為：

- 副檔名白名單限制為 `excalidraw`（不是任意檔案都能用這條路徑改內容），且明確拒絕任何屬於
  `COLLABORA_EXTENSIONS` 的副檔名，避免繞過 WOPI 鎖定機制改寫 Office 文件內容。
- 沿用 `restoreVersion` 的交易模式（同一個 transaction 內：把目前內容存成一筆
  `DriveFileVersion`，再更新 `DriveFile.storagePath`/`size`/`version`），**但依 §1 決定 2 不套用
  `restoreVersion` 的樂觀鎖 `where: { id, version: currentVersion }`**，一律以 `where: { id }`
  覆蓋——第二次寫入蓋掉第一次，不丟 `ConflictException`。
- 沿用 `FilesService.upload()` 已有的 `maxUploadBytes`（環境變數 `MAX_UPLOAD_BYTES`，預設
  100 MB）大小檢查。另外在前端存檔前與後端寫入前都加一道更低的 scene 專用上限（建議
  20 MB，遠低於一般檔案上限；Excalidraw scene 若內嵌 base64 圖片，膨脹速度比一般文件快很多，
  巨大 scene 對前端 canvas 也是可感知的效能問題，不只是後端儲存問題）。
- 寫入前對 request body 做最小結構檢查（`type === "excalidraw"`、`elements` 為陣列），格式不符
  回 400，不是讓 Excalidraw loader 直接炸掉。scene JSON 本身視為不透明 blob，只被 Excalidraw
  自己的 loader 解析、不會被當 HTML render，不需要額外的內容消毒。

### 4.3 縮圖：v1 不做

查證結果：`thumbnailPath` 目前只有在 `FilesService.upload()` 對圖片 mimeType（jpeg/png/webp/gif）
用 `sharp` 產生，沒有任何端點能在上傳之後更新它；Drive 前端目前也沒有任何畫面讀取或顯示
`thumbnailPath`（`share/[token]/page.tsx` 有一個未使用的型別欄位，檔案列表一律用
`getFileIcon()` 顯示副檔名圖示）。原始構想（存檔時用 `exportToBlob` 產生縮圖存進
`thumbnailPath`）沒有寫入端點也沒有顯示端，屬於會半途而廢的範圍膨脹，v1 明確不做；白板檔案
在列表中改用 §6 的固定圖示／顏色識別，不靠縮圖。若之後 Drive 整體要補上縮圖顯示能力，屬於另一
個獨立計畫，不在 045 內回頭加。

## 5. 前端整合

### 5.1 新建檔案入口

`new-doc-button.tsx` 的 `TEMPLATES` 陣列新增一個白板項目。與現有三個 Office 範本不同的是，
白板範本**不需要**從 `/templates/sample.*` 下載一份靜態範本檔——直接在前端建立一份空白
Excalidraw scene JSON（`{ type: "excalidraw", elements: [], appState: {} }` 的最小合法結構）
當作上傳內容，仍走既有的 `POST /drive/files/upload`（該端點本來就接受任意副檔名白名單內的
內容，建立新檔不需要走 §4.2 的內容覆蓋 API），避免多維護一份靜態範本檔案。

### 5.2 開檔路由判斷

`COLLABORA_EXTENSIONS` 目前唯一的前端消費者是 `folder-browser.tsx`（`ext in set -> Collabora
iframe`／`不在 -> PreviewDialog`）；`new-doc-button.tsx` 建檔完成後是直接硬編開啟路徑
（`/editor/files/${id}/edit`），不經過這個判斷式。因此需要調整的地方是：

- `folder-browser.tsx` 的判斷式新增第三條分支：`ext === "excalidraw" -> 白板編輯器路由`。
- `new-doc-button.tsx` 白板範本的開檔導向直接寫成白板編輯器路由（跟它現有的硬編路徑寫法一致，
  不需要額外抽象）。

白板副檔名不得加入 `COLLABORA_EXTENSIONS` 集合本身。

### 5.3 白板編輯器頁面

新增路由 `apps/drive/frontend/src/app/(editor)/editor/whiteboard/[id]/edit/page.tsx`（必須放在
`(editor)` route group 底下才能繼承 `(editor)/layout.tsx` 的登入檢查——這是目前該子樹**唯一**的
auth gate，因為 Next.js 16 + next-auth v5 beta 的已知問題導致 middleware 無法使用，放錯位置
會變成未登入使用者能看到頁面外殼）。此頁面：

- 用 `next/dynamic` + `ssr: false` 動態載入 Excalidraw React 元件（Excalidraw 依賴 canvas，
  不能 SSR）。
- 進入頁面時呼叫 §4.2 新增的 `GET /drive/files/:id/contents` 讀取目前 scene JSON 並載入畫布，
  對回傳內容做 §4.2 描述的最小結構檢查，格式不符時顯示明確錯誤而不是讓畫布空白當機。
- 提供明確的「儲存」動作（不依賴 WOPI 的自動 save-on-close 語意），呼叫
  `PUT /drive/files/:id/contents`；前端在送出前檢查 §4.2 的 scene 大小上限，超過時提示使用者
  而不是直接送出讓後端拒絕。
- 提供「匯出 PNG」「匯出 SVG」兩個動作，呼叫 Excalidraw 的 `exportToBlob`/`exportToSvg` 觸發
  瀏覽器下載，純前端行為，不上傳到 Drive、不另存為 Drive 檔案、不重新進入上傳/內容 API。
- 開啟連結沿用 `folder-browser.tsx` 現有 Office 文件連結的 `target="_blank"
  rel="noopener noreferrer"` 行為，跟既有開檔體驗一致。

### 5.4 套件體積

Excalidraw 元件必須透過 `next/dynamic` 做 code-split，只在白板編輯器路由載入，不得讓其他
Drive 頁面的 bundle 因此變大。Phase 1 scaffold 驗收時必須確認這一點（見 §7）。

## 6. UI/UX 與 i18n 品質門檻

白板功能必須達到與 Drive 其他功能一致的正式產品品質，不接受 template/demo/半成品：

- `drive-item-row.tsx` 的 `EXTENSION_ICONS`／`EXTENSION_ICON_COLORS` 新增 `excalidraw` 項目
  （建議用一個尚未被其他類型使用的 icon 與色系，例如 `PenTool` + amber，與現有 Office/圖片/
  影片色系區隔），不得讓白板檔案落到通用的 `File` 灰色圖示。
- 新建選單項目、編輯器頁面 toolbar、儲存/匯出按鈕、loading/error/儲存失敗/格式錯誤狀態全部
  使用 `zh-TW`／`en` locale messages，不得硬編碼文字。
- 儲存中、儲存成功、儲存失敗（含網路錯誤、格式錯誤、超過大小上限）、匯出中都要有明確、
  非阻斷式的使用者回饋（沿用 Drive 既有的 toast/loading 慣例，例如 `new-doc-button.tsx` 目前
  使用 `sonner` 的模式）。
- Light/dark mode 下 Excalidraw 畫布本身的配色與 Drive shell 的主題切換不衝突、不出現對比度
  問題。
- Desktop 為主要使用情境；至少在 tablet 尺寸下工具列與畫布不可溢出或不可操作。

## 7. 執行階段

### Phase 1 - 相容性驗證與 scaffold

- 在 `apps/drive/frontend` 實際安裝 `@excalidraw/excalidraw`，於一個隔離頁面完成 render smoke
  test（畫圖、存取 scene JSON、`exportToBlob`/`exportToSvg` 三個動作都要驗證）。
- 確認 `next/dynamic` + `ssr: false` 動態載入沒有 hydration 或建置錯誤。
- 確認新增依賴後的 production build 只在白板路由載入 Excalidraw chunk（bundle 分析）。
- 若相容性驗證失敗，本計畫在此階段中止並回頭修正決策，不進入 Phase 2。

### Phase 2 - 後端內容存取與白名單

- 依 §4.1 擴充後端與前端的上傳副檔名白名單，新增 `excalidraw`，更新錯誤訊息字串。
- 依 §4.2 新建 `GET`/`PUT /drive/files/:id/contents` 兩個端點：guard 組合、副檔名限制
  （僅 `excalidraw`，拒絕 `COLLABORA_EXTENSIONS`）、版本快照交易（不套用樂觀鎖）、大小上限、
  最小結構檢查全部到位並有對應測試。

### Phase 3 - 前端功能實作

- 實作 §5 的新建入口、路由判斷分支、白板編輯器頁面（讀取/儲存改呼叫 §4.2 新端點）、匯出動作。
- 依 §6 補上檔案圖示/顏色。
- 完成 `zh-TW`／`en` i18n 與 §6 的其餘 UI/UX 品質項目。

### Phase 4 - 驗收

- 完整 golden path：新建白板 -> 畫圖 -> 存檔 -> 關閉重開 -> 內容還在 -> 搬移資料夾 -> 分享 ->
  匯出 PNG/SVG。
- 版本歷史：存檔多次後，舊版本可從 `DriveFileVersion` 正確還原。
- 後存覆蓋前存驗證：兩個分頁同時開啟並修改同一份白板，各自存檔，預期第二次寫入直接覆蓋第一次、
  不丟例外或 409——這是在驗證 §4.2「刻意不套用樂觀鎖」的決策確實照此實作，不是要另外做鎖定。
- Light/dark、desktop/tablet、`zh-TW`/`en` 走過一次完整 UI/UX 檢查。

## 8. 完成定義

- 使用者能在 Drive 建立、開啟、編輯、存檔、搬移、分享一份白板檔案，且流程與既有 Office
  文件類型的使用體驗一致。
- 白板檔案沿用 `DriveFile` 通用模型與既有版本歷史，沒有新增 schema；內容讀寫透過 §4.2 新增的
  白板專用 API，不經過預簽 URL、不需要 MinIO CORS 設定。
- 匯出 PNG/SVG 可用。
- 沒有引入鎖定機制、樂觀鎖、縮圖或即時協作基礎設施。
- `zh-TW`／`en` 與 UI/UX 品質達到 §6 門檻，沒有 template placeholder 或硬編碼文字。

## 9. 相關文件

- `apps/drive/backend/prisma/schema/drive.prisma`
- `apps/drive/backend/src/storage/storage.service.ts`
- `apps/drive/backend/src/drive/files/files.controller.ts`
- `apps/drive/backend/src/drive/files/files.service.ts`
- `apps/drive/frontend/src/components/new-doc-button.tsx`
- `apps/drive/frontend/src/lib/collabora-extensions.ts`
- `apps/drive/frontend/src/lib/upload-extensions.ts`
- `apps/drive/frontend/src/components/drive-item-row.tsx`
- `apps/drive/frontend/src/app/(editor)/layout.tsx`
