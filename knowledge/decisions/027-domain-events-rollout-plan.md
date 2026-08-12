---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-17
updated: 2026-08-03
---

# 027 - Domain Events 推廣到剩餘業務 App（calendar/chat/drive/mcp-gateway/project）- 系統設計計畫

> 狀態：已完成。
>
> 範圍：`apps/calendar`、`apps/chat`、`apps/drive`、`apps/mcp-gateway`、`apps/project`
> 五個既有業務系統各自的 backend（+ 若該 app 決定接 admin UI 才動 frontend，非必要）與
> 本文件；不涉及 `@appspine/*` 共用套件本身——若執行中發現套件 core API 需要修改，依
> 026 的既定原則**停下來，開 Z0x 附件記錄，不擅自改套件**（套件變更需要另外走一次
> `@appspine/domain-events` 自己的版本/發版流程，不是本計畫範圍）。
>
> 來源：`026-domain-events-approve-plan.md` + `future_plans/Z20-domain-events-outbox.md`。
> 026 已完成 `@appspine/domain-events` 套件抽取（T-11000）、`apps/approve` 切換
> （T-11010）、第二個 app `apps/wiki` 實際採用（T-11020）、`appspine-app-template` 回填
> （T-11030）——套件 API 已在兩個真實 app 間驗證可攜、且新 fork 出去的 app 現在預設就有
> 空的 `DomainEventsModule` 骨架。本計畫是把同一套「最小垂直切片」模式套用到 026 執行
> 當時尚未涵蓋的五個既有 app（`apps/approve`/`apps/wiki` 已完成，不在本計畫範圍）。

---

## 1. 背景

026 H 組驗證了套件抽取後的可攜性，但只挑了一個「第二個 app」（wiki）當代表。剩下五個
既有業務 app（calendar、chat、drive、mcp-gateway、project）是在 026/H 組執行**之前**就
已經 fork 出去的，不會自動因為 `appspine-app-template` 的回填（T-11030）而拿到
`DomainEventsModule`——樣板回填只影響**之後**才 fork 的新 app。若要讓這五個既有 app
也用上 domain events，仍要對每個 app 各自重複一次 T-11020 那樣的「最小垂直切片」工作。

這五個 app 業務領域差異很大（行事曆、聊天、檔案、MCP 目錄服務、專案管理），不能假設
「隨便找一個欄位變更就套用」——每個 app 的第一個事件都要挑一個**真實、有意義**的狀態
轉換，理由與 T-11020 對 wiki 的要求一致（見該 task 執行紀錄）。

## 2. 決策摘要

1. **不做成單一巨大 task，逐 app 各自一個 task**：每個 app 的業務語境、既有交易邊界
   （是否已有 `$transaction`）、適合的候選事件都不同，混在一起做只會讓驗收標準模糊。
2. **候選事件由本計畫先做 desk-check 選定**（T-11100），而非留到執行時才決定——避免
   重演 026 G5 desk-check 與實際執行對象不一致的情況（G5 當時 desk-check 的是
   `apps/project` 的 `ProjectIssue.status_changed`，H 組實際卻選了 `apps/wiki`）。
3. **`apps/mcp-gateway` 可能沒有天然候選事件，允許該 app 的結論是「暫不採用」**：
   `mcp-gateway` 是 MCP 聚合/discovery 服務，其核心資料（`RegisteredApp`）是 admin
   註冊記錄，不是典型「業務物件狀態轉換」。不要為了湊數硬造一個沒有實際衍生副作用
   需求的事件——這正是 Z20 §4/026 反覆強調的「避免過早抽象」原則的延伸：套件抽取
   要等「真的需要」才做，同樣地，個別 app 採用與否也要等「真的有衍生副作用需求」才做。
4. **不強制每個 app都做完整版（webhook admin CRUD/加密 secret）**：比照 `apps/wiki`
   的最小垂直切片（env 設定固定 URL/secret，不做 subscription model/admin UI）。除非
   該 app 執行時判斷有更強的 admin 需求，否則預設走最小切片。
5. **套件本身不變**：五個 app 都直接依賴已發布的 `@appspine/domain-events`（目前
   `^0.1.1`），比照 apps/wiki 走 GitHub Packages registry 安裝，不做本地 file/link。

## 3. 各 App 候選事件（Desk-check 初稿，T-11100 執行時定案）

| App | Model / 欄位 | 候選事件 | 備註 |
| --- | --- | --- | --- |
| `apps/calendar` | `CalendarEvent.status`（`CalendarEventStatus`: CONFIRMED/TENTATIVE/CANCELLED） | `CalendarEvent.status_changed` | 取消行程是典型「該通知外部系統」的場景 |
| `apps/chat` | `ChatChannel.archivedAt` | `ChatChannel.archived_changed` | 頻道封存/解封存是明確的二元狀態轉換；避免跟即時訊息（已有 WebSocket 即時推送）搶戲——只挑頻道生命週期事件，不碰訊息本身 |
| `apps/drive` | `DriveFile.isTrashed` | `DriveFile.trash_status_changed` | 移至垃圾桶/還原是明確的布林轉換；不挑 `version`（WOPI 存檔）——那個欄位變更太頻繁，噪音大於價值 |
| `apps/project` | `ProjectIssue.status`（`ProjectIssueStatus`） | `ProjectIssue.status_changed` | 直接複用 026 G5 desk-check 已寫好的草稿（`_archive/dev_docs-20260803/domain-events/026-t-10970-gate-review.md` G5 小節），含 snapshot／wiring 範例 |
| `apps/mcp-gateway` | `RegisteredApp`（無明顯狀態欄位，只有 admin 註冊/更新端點資訊） | 待 T-11100 決定，允許結論為「暫不採用」 | 若 T-11100 desk-check 找不到有衍生副作用需求的真實轉換，記錄理由並跳過，不強造事件 |

T-11100 執行時要重新核對這份初稿：desk-check 需要看過該 app 對應 service 的既有交易
邊界（是否已有 `$transaction`，如果沒有，跟 T-11020 對 wiki 的處理方式一樣——把「業務
寫入 + `record()`」包進新的 `$transaction`，其餘 fire-and-forget 副作用維持原樣）。

## 4. 執行原則（沿用 002/026 慣例）

- 每個 app 是獨立 repo，程式碼變更 commit 進該 app 自己的 repo；本文件與
  `027-task-breakdown.md` 的 checkbox/執行結果 commit 進 workspace repo。
- 002 慣例、production-grade 標準不變（i18n 完整、瀏覽器實測——若該 app 決定加 admin
  UI 才適用；純 backend 最小切片不強制前端改動）。
- `record()` 必須跟業務寫入同一個 transaction；handler 冪等；事件常數 `as const`；
  schema pattern 用文件 + drift-check，不注入 schema——比照
  `_archive/dev_docs-20260803/framework/002-app-dev-conventions.md`「Domain Events 使用慣例」小節與
  `appspine-app-template/docs/domain-events.md`。
- 遇到計畫外問題（尤其「疑似需要改套件 core API」）依既有慣例開 Z0x 附件記錄，不擅自
  繞過或硬做。
- 每完成一個 task，checkbox 從 `[ ]` 改 `[x]`，並在 `027-task-breakdown.md`「3. 執行
  結果」補上實際結果（含 commit SHA、驗證輸出摘要）。

## 5. 驗收標準（逐 app 共通）

比照 T-11020 對 `apps/wiki` 的驗收標準：

- 加 `domain-events.prisma`（複製套件 `docs/prisma-model.md` 的區塊），過 drift-check。
- 接線該 app 選定的**一個**真實事件，`record()` 與業務寫入同一 transaction。
- 註冊**一個**真實 handler（預設 `webhook.post`，env 設定固定 URL/secret）。
- Dispatcher 起機（`DomainEventDispatcherOptions` 走注入 + env，比照 wiki/approve）。
- **核心驗收**：全程不修改 `@appspine/domain-events` 套件本身的任何檔案。
- 驗證：該 app 事件落地→delivery→handler 全流程走通（mock 或真實 echo-server 皆可）；
  該 app 既有功能不受影響；typecheck/lint/測試綠。
- `apps/mcp-gateway` 若 desk-check 結論是不採用，驗收改為「決策與理由記錄清楚」，不
  要求程式碼變更。

## 6. 風險與待決事項

- **chat 的即時性與 domain events 的非同步性可能產生語意重疊**：`ChatChannel` 已有
  WebSocket 即時通知機制，`archived_changed` 事件的消費者（webhook）與既有即時推送
  是兩條不同管道，服務對象不同（外部系統 vs. 前端即時 UI），執行時要在 desk-check
  階段講清楚兩者不衝突，避免變成同一件事被通知兩次的誤解。
- **drive 的 `version` 欄位是否該有事件**：目前決定不挑它當第一個事件（噪音大），但
  之後若有「檔案更新後通知外部系統」的真實需求，可以是本計畫之後的自然擴充，不在
  本批範圍。
- **mcp-gateway 若最終決定不採用，不代表永久排除**：跟 026 對 template 回填的態度一致
  ——等真的有需求（例如未來要在 discovery 目錄變動時通知外部整合者）再重新評估，不
  現在硬做。

詳細 task 拆解、複雜度標記、依賴關係與實際執行結果見 `027-task-breakdown.md`。

