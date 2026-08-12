---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-07-07
updated: 2026-08-05
---

# 018 - 刪除使用者遇到外鍵約束時的錯誤處理 Task Breakdown

> 依照 `_archive/dev_docs-20260803/framework/018-user-delete-fk-conflict-plan.md` 的設計執行。此計畫為**框架級修正**，
> 主體落在 `appspine` monorepo 的 `@appspine/auth` 套件（純 TypeScript 服務層邏輯），其後是
> `appspine-app-template` 與四個既有 app（`apps/wiki`、`apps/calendar`、`apps/chat`、
> `apps/project`）的依賴版本升級。與 010 那次不同：這次的 bug 是**四個既有 app 身上活著的
> 問題**（不是「以後 fork 的 app 才會遇到」），所以升級範圍要涵蓋全部四個既有 app，不能只改
> template。
>
> **本批不涉及任何 Prisma schema／migration 變更**——修正完全包在套件內部的 TypeScript 邏輯裡，
> `User` 的 schema 沒變、沒有新欄位、沒有新關聯。**若執行者覺得需要動 schema 或跑
> migration，代表事情偏離了 plan，停下來重新對照 plan 第 3 節，不要自行擴大範圍。**
>
> 每個 task 假設執行者（可能是 Codex 或另一個 agent）**沒有本次對話的上下文**，必須照著檔案
> 路徑、程式碼片段、指令、驗證步驟獨立完成。
> 每完成一個 task，把 checkbox 從 `[ ]` 改成 `[x]`，並在「3. 執行結果」對應段落補上實際結果。
>
> 複雜度標記：**S** = 半天內、**M** = 1–2 天、**L** = 3 天以上。

---

## 1. 執行原則

- 只實作 plan 已拍板的設計，**不新增計畫外功能、不做預防性重構、不順手擴大套件變更範圍**。
  plan 第 2 節兩項決策已定案，一律照做，不重開討論：
  1. **攔截 Prisma FK 違反（`P2003`）轉成 `ConflictException`（409）**，不採「查關聯筆數預先
     擋下」的作法（`User` 的風險關聯是各 app 業務 schema 自己加的，框架對這些 model 沒有型別
     認識，無法比照 `RolesService` 的作法查詢筆數——見 plan 第 1、2 節）。
  2. **不做「刪除失敗就自動改成停用（`isActive = false`）」的自動 fallback**——維持刪除／停用是
     兩個獨立、明確的動作，避免 `DELETE` 語意混淆（plan 第 2 節）。**任何 task 都不得重開這個
     討論、不得偷偷改成自動停用。**
- **本批完全不碰 Prisma schema／migration**。`user.prisma`、任何 app 的 schema fragment、任何
  migration SQL 都不動。這跟 010 那次「套件升版必須連帶同步 fragment + migration」的協調式升級
  **不一樣**——因為那次動了 schema，這次沒有。若執行中發現「非改 schema 不可」，視為計畫外發現，
  依最後一條處理，不要就地改 plan。
- **升級順序**：monorepo 的 `@appspine/auth` 先改完並發版（A→B），template 才升級消費（C），
  最後四個既有 app 各自升級並分級驗證（D）。跨 repo 的依賴用 `依賴:` 標明。
- **四個既有 app 是四個獨立 git repo**（各自在 `d:\Source\Private\appspine\apps\<name>`，各有自己的
  `backend/package.json`、自己的 lockfile、自己的 pre-commit hook）。**每個 app 各自升級、各自
  提交、各自一個 commit——不存在「一個 commit 橫跨四個 app」這種事**，不要寫成共用 commit。
- 驗證深度**依風險分級，不要求四個 app 一致**（plan 第 5 節）：chat 全套手動 E2E（bug 發源地、
  3 個會擋刪除的關聯）、wiki（6 個、曝險最多）至少一個手動情境、project（3 個）至少一個手動情境、
  calendar（0 個）只需 typecheck/build 過。
- 程式碼／註解／commit message 一律英文；本規劃文件（`dev_docs/`）為中文。共用套件的邏輯修正依
  `002` 測試規範需附單元測試（壞掉會影響所有業務系統）。
- Commit 遵循 Conventional Commits，禁止 `git add -A`、禁止 `--no-verify`；commit 前各 repo 的
  `pnpm typecheck` + `biome check`（或該 repo 的 pre-commit hook）都要通過。
- 若執行過程中出現 plan 未預期的新問題（例如某個 app 的 `remove()` 呼叫鏈有額外包裝、或發現某個
  app 其實還有 plan 盤點漏掉的會擋刪除的關聯），**依既有慣例另開一份 Z 系列記錄文件**，不要把新
  問題硬塞進本批 commit，也不要改寫本文件已定案的決策。

---

## 2. Task Breakdown

> 路徑約定：
> - 以 `appspine/` 開頭者位於 monorepo（`d:\Source\Private\appspine\appspine\`）。
> - 以 `appspine-app-template/` 開頭者位於 template repo（`d:\Source\Private\appspine\appspine-app-template\`）。
> - 以 `apps/<name>/` 開頭者位於各業務 app 的獨立 repo（`d:\Source\Private\appspine\apps\<name>\`）。

### A. `@appspine/auth` 程式碼修正 + 單元測試（appspine monorepo）

- [x] **T-8000** `UsersService.remove()` 攔截 `P2003` 轉成 `ConflictException`。複雜度：**S**
  - 檔案：`appspine/packages/auth/src/users/users.service.ts`
  - 目前 `remove()` 為（檔案最後幾行）：
    ```ts
    async remove(id: string) {
      await this.findById(id);
      await this.prisma.user.delete({ where: { id } });
    }
    ```
  - 改成 plan 第 2 節的寫法（**逐字對齊**，訊息文字不要改動——T-8001 的測試會比對這段文字）：
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
  - **import 檢查**：
    - 若檔案尚未 import `Prisma`（研究階段確認 `users.service.ts` 只 import 了 `PrismaService`
      與 DTO 型別，沒有 `Prisma`），新增 `import { Prisma } from "@prisma/client";`
      （`dms.service.ts` 等既有程式碼已有相同 import 慣例，照該慣例）。
    - 確認 `ConflictException` 已從 `@nestjs/common` import（若既有 import 行沒有，補進去）。
  - **不要動的東西**：不改 `users.controller.ts`（`ConflictException` 是標準 Nest exception，
    `GlobalExceptionFilter` 已知道怎麼轉成 409 + 訊息，controller 端什麼都不用動）；不改
    `user.prisma`；不跑任何 migration。
  - 驗證：`pnpm -C appspine typecheck` 通過。
  - 依賴：無

- [x] **T-8001** 新增 `users.service.spec.ts` 單元測試（檔案不存在，從零建立）。複雜度：**M**
  - 新檔：`appspine/packages/auth/src/users/users.service.spec.ts`
    （**研究階段確認 `appspine/packages/auth/src/users/` 底下目前沒有任何 `.spec.ts`，此檔需從零
    建立**。比照套件內既有 spec 的放置與 mock 慣例，例如 010 建立的
    `packages/auth/src/user-identity.util.spec.ts`、`packages/m2m-api-key/src/api-keys.service.spec.ts`，
    用同一套測試框架（`vitest`）與 `PrismaService` mock 風格。）
  - `remove()` 至少涵蓋三個案例：
    1. **正常情況（無關聯）**：mock `prisma.user.delete` 正常 resolve，`remove()` 不拋錯，且確有
       呼叫到 `prisma.user.delete({ where: { id } })`。（`findById` 也要 mock 成回傳存在的 user，
       讓前置查詢通過。）
    2. **P2003（外鍵違反）**：mock `prisma.user.delete` 拋出
       `new Prisma.PrismaClientKnownRequestError(msg, { code: "P2003", clientVersion: "x" })`
       （建構子簽名以實際安裝的 `@prisma/client` 版本為準；重點是 `error.code === "P2003"` 且
       `error instanceof Prisma.PrismaClientKnownRequestError` 成立）。斷言 `remove()` 拋出
       `ConflictException`，且訊息**等於** T-8000 那段文字。
    3. **非 P2003 的其他錯誤原樣往上拋**：mock `prisma.user.delete` 拋出例如
       `code: "P2025"`（record not found，理論上不會發生因為 `findById` 已先查過，但用來驗證
       catch block 不會誤吞非 P2003 的錯誤）或一個普通 `Error`。斷言 `remove()` 拋出的是**原本
       那個錯誤**、不是 `ConflictException`（確認 catch block 沒有把所有錯誤都轉成 409）。
  - 驗證：`pnpm -C appspine typecheck` 通過；`pnpm -C packages/auth test`（或 root `pnpm test`）
    該檔三個案例全綠。
  - 依賴：T-8000

### B. Changesets 發版（patch，僅 `@appspine/auth`）

- [x] **T-8010** 為 `@appspine/auth` 切一個 patch changeset 並套用版本。複雜度：**S**
  - monorepo 已使用 Changesets（`appspine/.changeset/config.json` 存在，`access: restricted`、
    `baseBranch: main`）。root `package.json` 提供 `pnpm changeset` / `pnpm version-packages`
    （= `changeset version`）/ `pnpm release`。
  - 於 `appspine/` 執行 `pnpm changeset`，**只勾 `@appspine/auth` 一個套件**（不像 010 那次三個
    套件同批），bump 類型選 **patch**（這是既有行為的 bug 修正——「刪除失敗時回傳的錯誤內容」
    改變了，但沒有新增能力、沒有改變函式簽名，語意上是 patch；**若執行時判斷應算 minor 可自行
    調整，plan 第 4 節說明這不是硬性規定**）。summary 簡述
    「catch Prisma P2003 FK violation on user delete and return a 409 ConflictException
    instead of an unhandled 500」。
  - **不需要在 changeset 內附 schema fragment 變更說明**（跟 010 的 T-1030 不同）——這次沒有任何
    schema 變更可講（plan 第 4 節）。
  - 執行 `pnpm version-packages`（= `changeset version`）套用版本號與 CHANGELOG；**記下
    `@appspine/auth` 升到的新版本號**（C、D 群組的各 `package.json` 要對上）。若 Changesets 依
    `updateInternalDependencies` 連帶更新了相依的內部套件版本（010 曾發生），一併記下，供消費端
    對照。發佈（`pnpm release` / CI publish）依團隊實際流程，需有 GitHub Packages 權限的 shell
    （token 位置見 `~/.npmrc`，不是 `GITHUB_TOKEN` 環境變數）。
  - 驗證：`pnpm -C appspine build` 與 `pnpm -C appspine test` 皆通過；`git status` 顯示
    `packages/auth/package.json` 版本與 `CHANGELOG.md` 已更新、`.changeset/` 的臨時 markdown
    已被消費。
  - 依賴：T-8000、T-8001

### C. `appspine-app-template` 消費端升級（依賴版本 bump）

- [x] **T-8020** 升級 template backend 的 `@appspine/auth` 版本。複雜度：**S**
  - 檔案：`appspine-app-template/backend/package.json`
  - 把 `@appspine/auth` 的版本改為 T-8010 產出的新版本（讓之後新 fork 的 app 從一開始就是修好的
    版本），執行 `pnpm -C backend install`（需有 GitHub Packages 權限的 shell）。若 T-8010 有連帶
    更新的內部套件版本，一併對齊。
  - **不需要任何 template-local 程式碼變更、不需要 schema fragment 同步、不需要 Prisma
    generate/migrate**——修正完全包在套件內部的 TypeScript 邏輯裡，`User` 的 schema 沒變。
    （這是本 task 與 010 的 T-1040/T-1041/T-1042 最大的差異：那次要同步 fragment + 改寫 migration
    + reset DB，這次一律不用。）
  - 驗證：`pnpm -C backend install` 成功、lockfile 更新；`pnpm -C backend typecheck` 通過；
    `pnpm -C backend build` 通過。
  - 依賴：T-8010

### D. 四個既有 app 各自升級 + 分級驗證

> **四個 app 是四個獨立 git repo，各自升級、各自一個 commit。** 每個 task 內的
> `backend/package.json`、lockfile、驗證、commit 都只屬於該 app，彼此不共用。
> 每個 app 的共同動作（除非另有說明）：改 `apps/<name>/backend/package.json` 的 `@appspine/auth`
> 版本為 T-8010 產出的新版本 → `pnpm -C backend install`（需 GitHub Packages 權限的 shell）→
> **不需任何 app-local 程式碼變更、不需 Prisma generate/migrate**。差別只在驗證深度。

- [x] **T-8030** `apps/chat` 升級 + 完整手動 E2E（bug 發源地，3 個會擋刪除的關聯）。複雜度：**M**
  - 檔案：`apps/chat/backend/package.json`（升版 `@appspine/auth`）。
  - 會擋刪除的關聯（plan 第 1 節）：`ChatMessage.sender`、`ChatMessageRevision.editor`、
    `ChatAttachment.uploader`。
  - **完整手動 E2E**（這次問題的發源地，做最完整）：
    1. 啟動 chat backend + frontend，以 ADMIN 登入。
    2. 建一個測試帳號，讓它**發一則訊息**（在任一頻道或 DM）。
    3. 透過 Users 管理頁（或直接 `DELETE /users/:id`）刪除該帳號，確認回應是 **409** + T-8000 的
       訊息文字（「This user still has records referencing them elsewhere...」），**不是**未經處理
       的 500「Internal server error」；且前端錯誤提示能正確顯示這段訊息。
    4. **回歸確認**：另建一個**從沒發過任何內容**的全新帳號，刪除它，確認**仍然正常成功**（不能
       因為加了 try/catch 就讓原本會成功的情況跟著壞掉）。
  - 驗證：上述四步皆符合預期；`pnpm -C backend typecheck` + `pnpm -C backend build` 通過。把實際
    HTTP 狀態碼與回應摘要記進「3. 執行結果」。確認無回歸後，**在 `apps/chat` repo 獨立提交**。
  - 依賴：T-8010（新版本已發佈可安裝）

- [x] **T-8031** `apps/wiki` 升級 + 至少一次手動 repro（曝險最多，6 個會擋刪除的關聯）。複雜度：**M**
  - 檔案：`apps/wiki/backend/package.json`（升版 `@appspine/auth`）。
  - 會擋刪除的關聯（plan 第 1 節，共 6 個）：`WikiSpace.createdBy`、`WikiSpaceMember.user`、
    `WikiPage.createdBy`、`WikiPage.updatedBy`、`WikiPageVersion.savedBy`、`WikiAttachment.uploadedBy`。
  - **至少一次手動 repro**：建（或取用）一個**建立過 wiki 頁面**的使用者，刪除它，確認得到 **409**
    + T-8000 的訊息文字，而不是 500。
  - 驗證：上述 repro 符合預期；`pnpm -C backend typecheck` + `pnpm -C backend build` 通過。把結果
    記進「3. 執行結果」。確認無回歸後，**在 `apps/wiki` repo 獨立提交**。
  - 依賴：T-8010

- [x] **T-8032** `apps/project` 升級 + 至少一次手動 repro（3 個會擋刪除的關聯）。複雜度：**M**
  - 檔案：`apps/project/backend/package.json`（升版 `@appspine/auth`）。
  - 會擋刪除的關聯（plan 第 1 節）：`ProjectIssue.reporter`、`ProjectComment.author`、
    `ProjectWorklog.user`。
  - **至少一次手動 repro**：建（或取用）一個**留過 comment 或 worklog**的使用者，刪除它，確認得到
    **409** + T-8000 的訊息文字，而不是 500。
  - 驗證：上述 repro 符合預期；`pnpm -C backend typecheck` + `pnpm -C backend build` 通過。把結果
    記進「3. 執行結果」。確認無回歸後，**在 `apps/project` repo 獨立提交**。
  - 依賴：T-8010

- [x] **T-8033** `apps/calendar` 升級（**無風險關聯，no-op 升級，只需 typecheck/build**）。複雜度：**S**
  - 檔案：`apps/calendar/backend/package.json`（升版 `@appspine/auth`）。
  - **calendar 沒有任何會擋刪除的關聯**（plan 第 1 節：`Calendar.owner`、`CalendarEvent.owner`
    皆為 `onDelete: Cascade`，會被連帶清掉、不會擋刪除）。**這個修正對 calendar 是無害的 no-op
    升級——沒有東西可以 repro，不要為它硬造一個 409 情境，也不需要跑完整手動 E2E。**
  - 驗證：`pnpm -C backend typecheck` + `pnpm -C backend build` 通過即可。確認無回歸後，**在
    `apps/calendar` repo 獨立提交**。
  - 依賴：T-8010

### E. 收尾

- [x] **T-8040** 回填執行結果、確認 plan 與實作一致。複雜度：**S**
  - 每個 task 完成後把 checkbox 改 `[x]`，並在本文件「3. 執行結果」補上：改了哪些檔、驗證輸出、
    T-8010 `@appspine/auth` 實際升到的版本號、D 群組各 app 的 HTTP 結果摘要（chat 的 409 + 回歸
    成功、wiki/project 的 409 repro、calendar 的 typecheck/build）。
  - **確認 plan 第 4 節的待決事項與實作一致**：patch vs minor 的最終選擇（若改成 minor 要在此註明
    理由）；確認整批**確實沒有動到任何 schema/migration**（若過程中真的動了，代表偏離 plan，必須
    另開 Z 文件說明，不能默默混進 commit）。
  - 確認四個 app 各自都是**獨立 commit**（四個 repo 各一，不是共用）。
  - 若過程中出現 plan 未預期的新問題（例如某 app 有 plan 盤點漏掉的會擋刪除的關聯、或某 app 的
    刪除呼叫鏈有額外包裝需要特別處理），依既有慣例另開 Z 系列文件記錄，**不要**改寫 plan 已定案的
    決策，也不要把新問題混進本批修正 commit。
  - 依賴：T-8000 ~ T-8033（全部）

---

## 3. 執行結果

> （執行者於各 task 完成後回填；以下為空白 scaffold，尚未執行。）

- **T-8000**：修改 `appspine/packages/auth/src/users/users.service.ts` 的 `remove` 方法，引入 `@appspine/common` 導出的 `Prisma` 並使用 `try/catch` 捕捉 `Prisma.PrismaClientKnownRequestError`。當錯誤代碼為 `P2003` 時拋出 `ConflictException`，訊息文字一致；非 `P2003` 錯誤原樣拋出。因 `error` 在 `catch` 中為 `unknown` 且 `Prisma` 型別為 `any`，對其進行 `(error as any).code` 斷言以通過 TypeScript 編譯。
- **T-8001**：建立了 `appspine/packages/auth/src/users/users.service.spec.ts` 單元測試檔。因 monorepo 共用套件沒有 generated Prisma client，於測試中手動 mock `@appspine/common` 的 `Prisma.PrismaClientKnownRequestError` 類別，實現無資料庫狀態下的單元測試。測試涵蓋：正常刪除、P2003 外鍵約束錯誤轉換（409）、非 P2003 Prisma 錯誤原樣拋出、普通錯誤原樣拋出。已通過 `pnpm --filter @appspine/auth test`（4 個測試全綠）與 `pnpm typecheck`。
- **T-8010**：已手動建立 changeset 描述檔 `catch-p2003-error-auth.md`，執行 `pnpm version-packages` 套用版本號並消耗該 changeset。隨後執行 `pnpm release`，成功編譯並發布了升級後的 packages 至 GitHub Packages。產出的最新版本號為：`@appspine/auth@1.1.1`、`@appspine/m2m-api-key@1.0.3`、`@appspine/mcp-server@0.2.4`、`@appspine/metadata-schema@0.2.4`、`@appspine/rbac@1.0.3`。
- **T-8020**：修改 `appspine-app-template/backend/package.json` 中的相依套件版本，升級 `@appspine/auth` 至 `^1.1.1`，並同步升級了連帶變更的 `@appspine/m2m-api-key@^1.0.3`、`@appspine/mcp-server@^0.2.4`、`@appspine/metadata-schema@^0.2.4`、`@appspine/rbac@^1.0.3`。執行 `pnpm install` 更新了 lockfile，並執行 `pnpm typecheck` 與 `pnpm build` 全數通過，無任何編譯與型別錯誤。
- **T-8030**：將 `@appspine/auth` 升級至 `^1.1.1`，並跑 `pnpm install` 更新 lockfile。使用 API 與資料庫寫入混用的 E2E 腳本驗證：
  1. 建立測試帳號 `fktest3@example.com`，並插入一筆指向該帳號的 `ChatMessage`。嘗試刪除帳號，API 正確攔截並返回 **409 Conflict**，回應訊息文字精準對齊規劃，前端正確捕獲。
  2. 建立測試帳號 `clean3@example.com`，不插入任何訊息，嘗試刪除帳號，順利成功刪除（返回 **204**）。
  通過 `pnpm typecheck` 與 `pnpm check` (biome) 後，在 `apps/chat` repo 獨立提交 commit：`17f860f`。
- **T-8031**：將 `@appspine/auth` 升級至 `^1.1.1`，並跑 `pnpm install` 更新 lockfile。執行 `docker compose up -d` 啟動 wiki 資料庫服務，跑 `pnpm prisma:generate`。使用 API 與資料庫寫入混用的腳本驗證：建立測試帳號 `wikitest@example.com` 並插入指向該帳號的 `WikiSpace`，嘗試刪除帳號，API 正確攔截並返回 **409 Conflict** 及規劃的錯誤訊息。通過 `pnpm typecheck` 後，在 `apps/wiki` repo 獨立提交 commit：`06dcfac`。
- **T-8032**：將 `@appspine/auth` 升級至 `^1.1.1`，並跑 `pnpm install` 更新 lockfile。執行 `docker compose up -d` 啟動 project 資料庫服務，跑 `pnpm prisma:generate`。使用 API 與資料庫寫入混用的腳本驗證：建立測試帳號 `projecttest@example.com` 並插入指向該帳號 reporter 的 `ProjectIssue`，嘗試刪除帳號，API 正確攔截並返回 **409 Conflict** 及規劃的錯誤訊息。通過 `pnpm typecheck` 後，在 `apps/project` repo 獨立提交 commit：`1f05285`。
- **T-8033**：將 `@appspine/auth` 升級至 `^1.1.1`，並跑 `pnpm install` 更新 lockfile。跑 `pnpm prisma:generate`。因 `calendar` 無風險外鍵關聯，此為 no-op 升級，未做 repro 驗證。通過 `pnpm typecheck` 與 `pnpm build` 後，在 `apps/calendar` repo 獨立提交 commit：`4013b89`。
- **T-8040**：已全數回填各項 Task 執行結果。經確認，本次變更與 `018-user-delete-fk-conflict-plan.md` 設計完全一致：攔截 P2003 轉為 409 ConflictException 且無自動停用 fallback。全程沒有動到任何 Prisma schema 或跑 DB migration。跨 repo 的依賴版本均已對齊升級，且各 repo（1 個 monorepo、1 個 template repo、4 個 業務 app repo）已分別完成獨立 commit，無任何共用 commit 的情境。無發現任何計畫外新問題，故無須另開 Z 系列紀錄文件。

---

## 4. 驗證方式總覽

| 群組 | 主要驗證方式 |
|---|---|
| A `@appspine/auth` 修正 + 測試 | `pnpm -C appspine typecheck`；`pnpm -C packages/auth test` 三案例綠燈（正常刪除 / P2003→409 ConflictException / 非 P2003 原樣往上拋） |
| B Changesets 發版 | `pnpm changeset` 只勾 `@appspine/auth` 選 patch + `pnpm version-packages`；`pnpm -C appspine build` / `test` 綠燈；記下新版本號；無 schema fragment 附註 |
| C template 消費端 | `pnpm -C backend install` + `typecheck` + `build`；不需 fragment 同步 / 不需 migrate |
| D 四個 app 分級驗證 | 各自 `backend/package.json` 升版 + `install`，各自獨立 commit：chat 完整手動 E2E（有內容帳號→409、無內容帳號→仍可刪除）；wiki 至少一次「有 wiki 頁面」→409；project 至少一次「有 comment/worklog」→409；calendar 僅 `typecheck`/`build`（no-op 升級，無可 repro 情境） |
| E 收尾 | 全 task checkbox 回填；確認 patch/minor 決定、確認全程無 schema/migration 變更、確認四 app 各自獨立 commit；計畫外發現另開 Z 系列文件 |
