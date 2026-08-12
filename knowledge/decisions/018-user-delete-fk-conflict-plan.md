---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-07
updated: 2026-08-03
---

# 018 - 刪除使用者遇到外鍵約束時的錯誤處理 - 系統設計計畫

> 狀態：已完成（9/9）
> 範圍：**框架級修正**，落在 `appspine` monorepo 的 `@appspine/auth` 套件，其次是
> `appspine-app-template` 與四個既有 app（`apps/wiki`、`apps/calendar`、`apps/chat`、
> `apps/project`）的依賴版本升級。**不涉及 Prisma schema/migration 變更**——這是純
> TypeScript 服務層邏輯修正，沒有新欄位、沒有新關聯，屬於比
> `_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md` 小很多的變更。
> 動機來源：017 執行完後的手動測試清理過程中，刪除幾個測試帳號時發現：只要目標使用者
> 曾經在 chat 裡發過訊息，刪除會直接被資料庫外鍵擋下來，`UsersService.remove()` 沒有
> 攔截這個例外，最終以未經轉換的 Prisma 錯誤呈現給前端（`GlobalExceptionFilter` 接手後
> 變成一個沒有實質內容的 500「Internal server error」）。這次順手也修掉「刪除已離職/已
> 移除測試帳號後，DM 對話變成幽靈項目」的問題（chat repo commit `873adb8`），但「刪除
> 曾發過訊息的使用者會直接炸掉」這個更根本的問題留到這份文件處理。

---

## 1. 背景與問題

`@appspine/auth` 的 `UsersService.remove()`（`appspine/packages/auth/src/users/users.service.ts`
最後幾行）目前是：

```ts
async remove(id: string) {
  await this.findById(id);
  await this.prisma.user.delete({ where: { id } });
}
```

沒有任何前置檢查、沒有 try/catch。`User` 這個 model 在 `@appspine/auth` 自己的
`user.prisma` fragment 裡只有兩個關聯（`userRoles`、`actingApiKeys`），但每個業務 app
會在自己的 schema 裡新增大量指回 `User` 的關聯，其中不少沒有指定 `onDelete`（Postgres
預設等同 `RESTRICT`：外鍵約束擋下刪除）。實測盤點四個既有 app：

| App | 會擋下刪除的關聯（`onDelete` 未指定，等同 Restrict） | 會被 cascade 清掉、不會擋刪除的關聯 |
|---|---|---|
| `apps/chat` | `ChatMessage.sender`、`ChatMessageRevision.editor`、`ChatAttachment.uploader` | `ChatChannelMember.user`、`ChatDmParticipant.user`、`ChatMention.mentionedUser`、`ChatReaction.user`、`ChatPushSubscription.user`（皆 Cascade）；`ChatChannel.createdBy`、`ChatIncomingWebhook.createdBy`（皆 SetNull） |
| `apps/wiki` | `WikiSpace.createdBy`、`WikiSpaceMember.user`、`WikiPage.createdBy`、`WikiPage.updatedBy`、`WikiPageVersion.savedBy`、`WikiAttachment.uploadedBy`（**6 個**，全部會擋） | 無 |
| `apps/calendar` | 無 | `Calendar.owner`、`CalendarEvent.owner`（皆 Cascade） |
| `apps/project` | `ProjectIssue.reporter`、`ProjectComment.author`、`ProjectWorklog.user` | `ProjectMember.user`（Cascade）；`Project.lead`、`ProjectMember.addedBy`、`ProjectIssue.assignee`（皆 SetNull） |
| `appspine-app-template`（框架 baseline） | `ApiKey.actingUser`（來自 `@appspine/m2m-api-key`，本來就是刻意設計的 Restrict，見 010 第 4 節政策） | — |

**結論：`wiki` 曝險最大（6 個會擋刪除的關聯），`chat`/`project` 各 3 個，`calendar`
完全不受影響。** 這代表「刪除一個曾經在系統裡留下任何內容的使用者」這個管理員操作，在
wiki、chat、project 三個 app 上幾乎必然會炸——只有從沒發過內容的全新帳號能被真的刪除
（這正是這次意外發現問題的原因：我們刪除的是從沒發過訊息的測試帳號，才沒踩到這個坑；
若刪除的是已經在 chat 裡發過訊息的帳號，會直接看到一個內容是「Internal server error」
的 500，看不出真正原因）。

**已排除的可能性**：`UsersService.remove()` 沒辦法用 `@appspine/rbac` 的
`RolesService.remove()` 那種「查詢關聯筆數，筆數 > 0 就擋下」的作法（`roles.service.ts`
第 201-212 行）——那個作法能成立是因為 `Role` 的關聯對象（`UserRole`、`ApiKey`）都是
框架自己定義的 model，`RolesService` 在編譯期就知道要查哪些表。`User` 的情況不同：
真正會擋下刪除的關聯（`ChatMessage.senderId`、`WikiPage.createdById` 等）是**各 app 業務
schema 自己加的**，`@appspine/auth` 對這些 model 完全沒有型別層級的認識，沒辦法寫出
「查 `prisma.chatMessage.count(...)`」這種程式碼——這是共用套件的先天限制，不是可以
「順手」解決的細節，直接影響第 2 節的決策方向。

---

## 2. 決策：攔截 Prisma FK 違反（P2003），轉換成明確的 409 錯誤；不做「自動改停用」

`UsersService.remove()` 改成：

```ts
async remove(id: string) {
  await this.findById(id);

  try {
    await this.prisma.user.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ConflictException(
        "This user still has records referencing them elsewhere in the system and cannot be permanently deleted. Deactivate the account instead.",
      );
    }
    throw error;
  }
}
```

（`Prisma` 從 `@prisma/client` import，`dms.service.ts` 等既有程式碼已有相同 import
慣例。）

**這個作法不需要框架知道是哪個 app、哪個關聯擋下了刪除**——`P2003` 是 Prisma 對
「外鍵約束違反」這個情境的通用錯誤代碼，跟哪個 model、哪個 app 無關，正好對應第 1 節
「框架不可能知道 app 業務 model」這個限制。訊息刻意寫成不含資料庫細節（不暴露原始 FK
constraint 名稱給使用者），但明確告訴管理員「這個帳號還有東西掛著、用停用代替」。

**決策：不做「刪除失敗就自動改成停用（`isActive = false`）」這種自動 fallback**。
理由：
1. `isActive` 的停用機制已經完整存在——`UsersService.update()` 本來就支援
   `isActive`，`appspine-app-template`/`apps/chat` 的前端 Users 管理頁本來就有獨立的
   「停用/啟用」選單項目（`user-row-actions.tsx` 第 41-47、95-97 行，`actions.ts` 的
   `setUserActiveAction`），跟「刪除」是兩個平行、獨立的動作，管理員已經有現成的路徑可以
   手動選擇。
2. 讓一個 `DELETE` 呼叫在失敗時「悄悄改做別的事」並回傳成功，會讓 API 語意變得意外
   （呼叫端以為刪除了，實際上只是被停用；稽核紀錄上「刪除」跟「停用」的界線也會模糊）。
   維持「`DELETE` 失敗就是失敗、回傳清楚的錯誤，交給人自己決定下一步」比較符合現有慣例
   （`002`/`conventions.md` 的錯誤回應格式本來就是設計給「明確拒絕 + 說明原因」這種模式
   用的，不是給「自動轉換行為」用的）。

---

## 3. `appspine` monorepo 變更（僅 `@appspine/auth`）

- **`appspine/packages/auth/src/users/users.service.ts`**：`remove()` 改成第 2 節的
  寫法。若檔案目前沒有 import `Prisma`（從既有程式碼看只 import 了
  `PrismaService`/其他 DTO 型別），需要新增 `import { Prisma } from "@prisma/client";`。
- **單元測試**：`users.service.ts` 目前沒有既有的 spec 檔案（研究階段確認過，
  `appspine/packages/auth/src/users/` 底下沒有 `.spec.ts`）。新增
  `users.service.spec.ts`，至少涵蓋：
  1. 正常情況（無關聯）：`remove()` 呼叫 `prisma.user.delete` 且不拋錯。
  2. Prisma 拋出 `PrismaClientKnownRequestError`（`code: "P2003"`）時：`remove()`
     轉換成 `ConflictException`，訊息符合第 2 節的文字。
  3. Prisma 拋出其他種類的錯誤（例如 `P2025` record not found，理論上不會發生因為
     `findById` 已經先查過，但仍應驗證「非 P2003 的錯誤要原樣往上拋，不能被這個
     catch block 吞掉」）。
- **不需要改 `users.controller.ts`**：`ConflictException` 是標準 Nest exception，
  `GlobalExceptionFilter` 已經知道怎麼處理成 409 + 訊息，controller 端什麼都不用動。
- **不需要改 `user.prisma`／不需要任何 migration**：這次修正完全不碰 schema。

---

## 4. 版本與發版

只有 **`@appspine/auth`** 一個套件變更，用 Changesets 切一個 **patch** version（這是
既有行為的 bug 修正——「刪除失敗時回傳的錯誤內容」改變了，但沒有新增能力、沒有改變
函式簽名，語意上是 patch，不是 minor；若執行時認為應該算 minor，可自行調整，這裡不是
硬性規定）。不像 010 那次三個套件同批發版，這次只動一個套件，也不需要在 changeset
裡附 schema fragment 的變更說明（沒有 schema 變更可講）。

---

## 5. `appspine-app-template` 與四個既有 app 的消費端升級

**與 010 的情況不同**：010 當時只需要升級 template（wiki 等 app 那時都還沒 fork 出去，
比照文件本身「新 app 之後升級套件版本消費即可」的說法）。這次不一樣——**wiki/chat/
project 這三個 app 現在已經在生產／開發環境跑著，而且這個 bug 現在就是活的**（不是
「以後 fork 的 app 才會遇到」），所以這次的升級範圍要包含全部四個既有 app，不能只改
template。

- **`appspine-app-template/backend/package.json`**：升級 `@appspine/auth` 到新版本
  （讓之後新 fork 的 app 從一開始就是修好的版本）。
- **`apps/wiki/backend/package.json`**、**`apps/chat/backend/package.json`**、
  **`apps/calendar/backend/package.json`**、**`apps/project/backend/package.json`**：
  各自升級 `@appspine/auth` 版本並 `pnpm install`。**不需要任何 app-local 程式碼變更、
  不需要 Prisma generate/migrate**——修正完全包在套件內部的 TypeScript 邏輯裡，`User`
  的 schema 本身沒變。
- 驗證深度依風險分級，不是四個 app 都要做一樣完整的手動 E2E（見第 6 節「執行順序」與
  待決事項）：
  - **`apps/chat`**（這次問題的發源地，且有 3 個會擋刪除的關聯）：完整手動驗證——
    建一個會發訊息的測試帳號，發一則訊息，透過 Users 管理頁刪除該帳號，確認回應是
    409 + 第 2 節的訊息文字（不是未經處理的 500），且前端錯誤提示正確顯示；同時
    確認「從沒發過內容的帳號」刪除仍然正常成功（不能因為加了 try/catch 就讓原本會
    成功的情況也跟著壞掉）。
  - **`apps/wiki`**（曝險關聯最多，6 個）：至少手動驗證一次「使用者建立過 wiki 頁面後
    被刪除」會得到 409 而不是 500。
  - **`apps/project`**：至少手動驗證一次「使用者留過 comment 或 worklog 後被刪除」
    會得到 409 而不是 500。
  - **`apps/calendar`**：沒有任何會擋刪除的關聯，`pnpm typecheck`/`pnpm build` 過
    即可，不需要額外手動情境測試（這個修正對 calendar 來說是無害的 no-op 升級）。

---

## 6. 高階執行順序（供後續 task-breakdown 展開）

```
appspine monorepo：
  1. @appspine/auth：users.service.ts 的 remove() 改寫（第 2、3 節）+ 新增
     users.service.spec.ts 單元測試
  2. Changesets：patch version，發版

appspine-app-template：
  3. backend/package.json 升級 @appspine/auth

apps/wiki, apps/calendar, apps/chat, apps/project（四個既有 app，各自獨立 repo）：
  4. 各自 backend/package.json 升級 @appspine/auth，pnpm install
  5. 依第 5 節的驗證深度分級：
     - chat：完整手動 E2E（有內容的帳號→409；無內容的帳號→仍可刪除成功）
     - wiki：至少驗證一次「有 wiki 頁面的帳號」→409
     - project：至少驗證一次「有 comment/worklog 的帳號」→409
     - calendar：typecheck/build 過即可
  6. 確認無回歸後，四個 app 各自獨立提交（各自的 git repo，各自的 commit）
```

---

## 7. 決策記錄

| 決策點 | 結論 | 詳見 |
|---|---|---|
| 用「查關聯筆數預先擋下」還是「catch Prisma FK 錯誤」 | 後者——`User` 的風險關聯是各 app 業務 schema 自己加的，框架對這些 model 沒有型別認識，無法比照 `RolesService` 的作法查詢筆數 | 第 1、2 節 |
| 刪除失敗時要不要自動 fallback 成停用 | 不要——維持刪除/停用是兩個獨立、明確的動作，避免 `DELETE` 語意混淆 | 第 2 節 |
| 升級範圍是否只做 template（比照 010） | 不是——這次是既有 app 身上活著的 bug，四個既有 app 都要升級，不能只顧未來新 fork 的 app | 第 5 節 |
| 四個 app 的驗證深度是否要一致 | 不要求一致——按風險關聯數量分級，chat 全套 E2E，wiki/project 各驗證一個情境，calendar 只需 build 過 | 第 5 節 |

若之後執行過程中出現新的待決問題，比照既有慣例在此文件補充，或另開 Z 系列記錄文件。

