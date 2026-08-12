---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-29
updated: 2026-08-05
---

# Z25 - Ticket 化 Agent 工作流構想（聊天建立需求 → 核准 → Agent 執行 → 自動佈署 → 通知結案）

> 狀態：**記錄，未定案，暫緩**。2026-07-29 提出的構想，尚未排入任何正式編號計畫。使用者已明確
> 表示先落地 [`034-coolify-github-deployment-plan.md`](034-coolify-github-deployment-plan.md)，
> 這份構想先記錄避免遺忘，之後才回頭評估。

## 1. 構想內容

USER 與 AI Agent 聊天建立/修改需求 → 形成 Ticket → 資訊單位核准 → 進入 Todos →
Agent 分析執行 → 資訊單位審核 → 自動佈署 → 回覆 ticket 並通知 user → user 確認 → 結案。

## 2. 粗略對應到現有拼圖（尚未確認是否採用）

| 流程節點 | 對應現有元件 | 現況 |
|---|---|---|
| 聊天建立需求 | `apps/chat` | 已上線 |
| 形成 Ticket / Todos | `apps/project` 的 Todo/Ticket 概念 | 已上線，但沒有「Ticket」這個型別，需確認是否沿用既有型別 |
| 資訊單位核准／審核 | `apps/approve` 簽核流程 | 已上線；[`Z22-approve-admin-layout-redirect-not-firing.md`](../../apps/approve/knowledge/decisions/Z22-approve-admin-layout-redirect-not-firing.md) 的坑尚未解 |
| Agent 分析執行 | `apps/mcp-gateway`（025/031，一人一 key 跨 App agent 存取） | 已上線 |
| 自動佈署 | `_archive/dev_docs-20260803/auto-deploy/`（034 正式計畫 + Z03 技術參考，Coolify + GitHub） | 計畫已定案、task breakdown 已建立，尚未實際落地——**此構想的前置依賴** |
| 通知 user | [[041-shared-notification-capability-plan\|041]]（Shared Notification Capability / `@appspine/notification`） | Phase 1 已定案待執行；external delivery 另開後續計畫 |

## 3. 與過去嘗試的關係

這個構想的核心——「聊天生成需求 → agent 執行 → 跨 App 串接」——跟
`_archive/workspace-docs-023-024-20260715/` 記錄的 023、024 幾乎是同一件事：

- **023**（`023-external-interconnect-agent-team-plan.md`）蓋了一個完整的 `agent-team` 業務系統 +
  `appspine-discovery` 服務 + 對外介接層慣例，45/45 task 全數執行完成，之後於 2026-07-14 封存，
  commit 沒有留下封存原因。
- **024**（`024-chat-app-n8n-bot-integration-plan.md`）改用更輕量的 chat-app + n8n bot，刻意不依賴
  剛封存的 023 產物，用 Codex（非 Claude Code）執行，效果不佳，於 2026-07-15 回滾封存。底層的
  MCP adapter POC 本身驗證是 GO，代表卡關的不是介接技術本身。

目前線上唯一存活的相關產物是 `apps/mcp-gateway`（025/031），是否已經是 023 那個
`appspine-discovery`/interconnect 構想的精簡繼任者，未經確認。

**這次構想與 023/024 的差異**：不再另蓋一個 `agent-team` 業務系統，而是把既有六個業務 App
（chat / project / approve / mcp-gateway，加上尚未落地的 Z03 部署與 041 通知）當拼圖，用工作流
串起來。這個差異是否真的避開了 023/024 踩過的坑，尚未驗證。

## 4. 待確認問題（提出構想時留下，尚未回答）

1. Ticket 要塞進 `apps/project` 既有型別，還是需要類似當年 `appspine-discovery` 的協調層跨六個 App？
2. Agent 分析執行要直接用 Claude Code / Claude Agent SDK 接 `mcp-gateway` 執行，還是要另外找
   orchestration 工具（n8n 已在 024 驗證效果不好）？
3. 自動佈署要不要真的落地 Z03，還是先跳過手動部署，把流程跑通再說？（2026-07-29 已拍板：**先落地 Z03**）

## 5. 後續處理方向（未拍板）

- 待 Z03 落地後，回頭檢視第 4 節的三個問題，並用 023/024 的失敗經驗逐一檢視新方向是否真的避開
  同樣的坑，再決定是否排入正式編號計畫。
- 若決定推進，優先確認 Ticket 資料歸屬（項目 1）——這決定了後面 Agent 執行、審核、通知要串接
  哪一個 App 的資料模型。
