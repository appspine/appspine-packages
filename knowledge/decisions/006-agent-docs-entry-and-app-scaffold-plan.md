---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-01
updated: 2026-08-03
---

# 006 - Agent 文件入口機制與 App Scaffold 計劃

> 本文件規劃兩件互相關聯但跟 005（共用 UI 元件與 i18n）主題不同的事：(1) CLAUDE.md / AGENTS.md 兩個
> agent 入口檔案的「多入口、單一原始文件」機制，範圍涵蓋 workspace 跟 template 兩層；(2) 從
> `appspine-app-template` 生出新業務系統 repo 的 scaffold 機制，參考 `auranest/scripts/scaffold-app.mjs`
> 但要處理 appspine 跟 auranest 架構上的關鍵差異（多 repo vs monorepo）。
> 狀態：待確認事項已全部定案，可排 task breakdown。

## 背景

目前 workspace 根目錄同時存在 `CLAUDE.md` 跟 `AGENTS.md`，兩份內容**逐字重複**（41 行一模一樣）。這是因為
Claude Code 讀 `CLAUDE.md`、Codex 等工具讀 `AGENTS.md`，但沒有理由維護兩份一樣的內容 —— 之後只要改一邊忘了
改另一邊，就會出現兩份文件互相矛盾的狀況。Gemini CLI 目前已經預設會讀 `AGENTS.md`，不需要另外準備一份
`GEMINI.md`，所以入口檔案就維持 `CLAUDE.md` + `AGENTS.md` 兩份，不用考慮第三份。

`appspine-app-template` 目前**完全沒有** `CLAUDE.md` / `AGENTS.md`，只有一份 `README.md`
（面向人類的 quick start）。這代表現在用 GitHub「Use this template」fork 出去的業務系統 repo，也不會帶有任何
agent 入口文件 —— 每個業務系統要嘛沒有 agent guide，要嘛日後各自土法煉鋼各寫一份，彼此不一致。要讓「以後 fork
出去的 app 都有統一的 agent 文件」，機制必須先落地在 template 端，而不是等 app fork 出去後再補。

另外，`appspine`（框架套件 monorepo，`packages/` 下有 audit-log / auth / common / e2e-kit / frontend-shell /
health-check / m2m-api-key / mcp-server / metadata-schema / rbac 十個套件）目前**沒有任何文件** —— 沒有
README.md，沒有 CLAUDE.md/AGENTS.md，外部（或未來的 Claude Code session）進到這個 repo 完全沒有入口可看。
workspace 根目錄則有 CLAUDE.md/AGENTS.md，但沒有 README.md（README 是給人類第一眼看的，CLAUDE.md/AGENTS.md
是給 agent 看的，兩者受眾不同，workspace 根目錄目前只顧到後者）。

**auranest 的 `scaffold-app.mjs` 不能照搬**，關鍵差異在架構：auranest 是 monorepo（`apps/auranest-<name>/`
都在同一個 repo 裡），scaffold 腳本用 `fs.cpSync` 把 template 目錄複製成新的 app 目錄，還要處理「同一台機器上
多個 app 同時跑」的 port 分配問題，並更新 monorepo 根目錄 README 的 fleet table。appspine 是**多 repo**
（`_archive/dev_docs-20260803/framework/001-app-framework-plan.md` 明定「每個業務系統各自獨立 repo，而非單一 monorepo 內各自 fork」），
新 repo 是透過 GitHub「Use this template」建立的，不是本地檔案複製 —— scaffold 腳本能做的事，是在**新 repo
被建立、clone 下來之後**，於新 repo 內執行的「初始化」腳本（改 app 名稱、`.env` 的 `APP_NAME`、README 標題、
agent 文件的 app positioning 段落等），而不是「複製 template 目錄」這個動作本身（那一步已經被 GitHub 的
「Use this template」做掉了）。

---

## 範圍

### A. Workspace 端：多入口單一文件機制

| 項目 | 說明 |
|---|---|
| 入口檔案 | `CLAUDE.md`（Claude Code）、`AGENTS.md`（Codex、Gemini CLI 及其他遵循 AGENTS.md 慣例的工具）兩份都留著，但都改成精簡入口 |
| 原始內容位置 | 新增 `docs/agent-guide.md`（workspace 根目錄新開 `docs/`，跟 `dev_docs/` 分開 —— `dev_docs/` 放規劃文件，`docs/` 放給 agent 讀的現況文件），兩個入口檔案目前的完整內容原封不動搬過去 |
| 入口檔案內容 | 每份只留 1 個標題 + 1～2 句話指向 `docs/agent-guide.md`，例如：`See [docs/agent-guide.md](../../docs/agent-guide.md) for the full guide.` |
| 維護方式 | 之後只改 `docs/agent-guide.md`，兩個入口檔案不會再變動（除非要新增別的 agent 工具） |

`docs/agent-guide.md` 這個路徑/檔名在 workspace、template（B 節）、`appspine` 框架 monorepo（E 節）三處統一
使用同一個名字，讓三處看起來是同一套機制、不是各取各的名字。

### B. Template 端：套用同樣機制

| 項目 | 說明 |
|---|---|
| 新增檔案 | `appspine-app-template` 根目錄新增 `CLAUDE.md` / `AGENTS.md`（目前都不存在）+ `docs/agent-guide.md` |
| 內容來源 | 不是複製 workspace 的 `docs/agent-guide.md`（那份講的是 workspace 本身的目錄結構，跟 app repo 无關），而是新寫一份面向「業務系統 repo 自己」的內容：技術棧、`@appspine/*` 套件用法、`_archive/dev_docs-20260803/framework/002-app-dev-conventions.md` 的關鍵慣例（新增 CRUD 模組流程、命名慣例等，用連結或摘要帶到，app repo 自己沒有 `dev_docs/`） |
| App Positioning 佔位段落 | 比照 auranest 的作法，文件裡留一個 `## App Positioning` 段落 + scaffold 腳本自動填入的 TODO 佔位（見 C 節），fork 出去的第一件事就是把這段填成該業務系統的實際定位 |
| 跟 README.md 分工 | `README.md` 保持面向人類的 quick start（現有內容不動），`CLAUDE.md`/`AGENTS.md` + `docs/agent-guide.md` 面向 agent，兩者不重複貼同樣的 quick start 步驟，agent guide 用連結指回 README 的 quick start 即可 |

### C. Scaffold 機制

比照 `auranest/scripts/scaffold-app.mjs` 的「token 替換 + 失敗即報錯（`expectedCount` 檢查）」設計原則，
但拿掉不適用 appspine 架構的步驟：

| auranest 的步驟 | appspine 對應做法 |
|---|---|
| `fs.cpSync` 複製 template 目錄到 `apps/<name>` | **不需要** —— GitHub「Use this template」已經做掉這一步，開發者 clone 下來的就已經是獨立 repo |
| 自動配 port（掃描 `apps/*/.env.example` 找空的 `BACKEND_PORT`） | **不需要** —— 本地開發不會同時跑多個業務系統 repo，維持 template 的預設 port（3900/3901/23900）即可，scaffold 腳本不用管 port |
| 更新 monorepo 根 README 的 fleet table | **不需要** —— appspine 沒有 monorepo 層級的 app 清單這個概念（每個業務系統是獨立 repo），也確認不需要另外開一份 workspace 端的業務系統登記文件（見「已確認的技術決策」） |
| 產生 `.github/workflows/ci-<name>.yml`（monorepo 用 path filter 區分各 app 的 CI） | **不需要** —— template 已經自帶 `.github/workflows/e2e.yml`，fork 出去的 repo 原封不動繼承，不用 path filter（整個 repo 就是一個 app） |
| 改 `.env.example` 的 `BACKEND_PORT`/`FRONTEND_PORT`/`DATABASE_URL` 等 port | **不需要**，port 維持 template 預設值不變 |
| 改 `app-config.ts` 的 `name`/`title`/`copyright`/`description` | **需要**，appspine 有對應的 `frontend/src/config/app-config.ts`（沿用同樣機制） |
| 改 `CLAUDE.md` 的標題 + App Positioning 佔位 | **需要**，改成同時處理 `CLAUDE.md`/`AGENTS.md`（B 節新增的兩份入口檔案標題都要換，`docs/agent-guide.md` 的 App Positioning 段落只有一份，改一次即可） |
| 改根 `README.md` 標題 | **需要** |
| 改 `frontend/package.json`、`backend/package.json` 的 `name` | **需要** —— 目前分別是 `studio-admin`（沿用 blank_shadcn_app 原名，未改過）跟 `@app/backend`（泛用預設值），fork 時應該換成該業務系統的名稱 |
| `.env.example` 的 `APP_NAME` | **需要**，目前預設值是 `appspine-app-template`（寫死在 audit log 的 `appName` 欄位），fork 時必須換 |
| `docs/data-dictionary.md` 重新產生 | **需要**，但用現有的 `pnpm -C backend schema:docs` 指令即可，scaffold 腳本不用自己做，跑完 token 替換後在 checklist 裡提示執行 |

**執行位置**：腳本放在 `appspine-app-template/scripts/scaffold-init.mjs`，隨 template 一起被 fork
到每個新 repo（跟 auranest 的腳本留在 monorepo 裡不同，這裡腳本本身也是「被複製出去」的一部分）。開發者
fork + clone 新 repo 後，在新 repo 內執行一次 `node scripts/scaffold-init.mjs --name ... --display-name ...`。
腳本只需要處理「單一目標目錄（自己所在的 repo 根目錄）」的 token 替換，不用像 auranest 那樣接受一個
`<short-name>` 去算出 `apps/auranest-<short-name>` 目標路徑。

**跟 template README.md 現有「Forking this template」手動清單的關係**：`appspine-app-template/README.md`
目前已經有一段手動清單（改 package.json name、設 APP_NAME、加 Prisma model、跑 migration、重新產生
data-dictionary）。這次的 scaffold 腳本是把清單裡「純文字取代」的部分自動化（package.json name、APP_NAME、
README/CLAUDE.md 標題、app-config.ts），不會、也不該自動化「加 Prisma model」這種需要開發者自己設計 schema
的步驟 —— 跑完腳本後印出的 checklist，內容基本上就是現有 README 清單去掉已自動化的項目。

### D. Template 自己的文件結構

| 現況 | 決策 |
|---|---|
| `README.md`（quick start，面向人類） | 保留，不用大改，B 節提到的「跟 agent guide 分工」需要小補一句話互相連結 |
| `docs/data-dictionary.md`（自動產生，不可手改） | 不動 |
| 沒有 `CLAUDE.md`/`AGENTS.md`、沒有 `docs/agent-guide.md` | 新增，見 B 節 |

Template 端不需要額外開一份「架構文件」—— `docs/agent-guide.md` 本身就是那份文件，不用再分裂出第三種文件
類型。

### E. appspine 相關 repo 的文件結構現況盤點

| 位置 | 現況 | 決策 |
|---|---|---|
| workspace 根目錄（`d:\Source\Private\appspine\`） | 有 `CLAUDE.md`/`AGENTS.md`，沒有 `README.md`，有 `dev_docs/` | 補一份 `README.md`（面向人類：這個資料夾是什麼、裡面三個子目錄分別是什麼、連到 `docs/agent-guide.md` 跟 `dev_docs/`），內容跟 `docs/agent-guide.md` 不重複 —— README 給人類 30 秒看懂結構，agent-guide 給 agent 的工作規則 |
| `appspine`（框架套件 monorepo，`packages/*`） | 完全沒有文件：沒有 `README.md`、沒有 `CLAUDE.md`/`AGENTS.md`、沒有 `docs/` | 補齊：根 `README.md`（monorepo 是什麼、`packages/` 下十個套件各自是做什麼的一覽表、怎麼 build/test）+ `CLAUDE.md`/`AGENTS.md` + `docs/agent-guide.md`（套件開發慣例，例如：新增套件的標準流程、跟 `appspine-app-template` 的相依方向、release/版本策略——這些如果已經在 `_archive/dev_docs-20260803/framework/003-shared-package-reuse-plan.md` 講過，agent-guide 用連結帶到，不重複整段複製） |
| `appspine-app-template` | 見 C／D 節 | — |

`appspine`（框架套件 monorepo）的 `docs/agent-guide.md` 走「薄文件、連結為主」：只放套件一覽表跟開發慣例的
**要點**（新增套件的標準流程、跟 `appspine-app-template` 的相依方向等），細節決策內容用連結指回
`_archive/dev_docs-20260803/framework/003-shared-package-reuse-plan.md`，不把 003 的內容整段摘要進來重複維護一份。這份 repo 目前完全
沒有文件，內容量可能不小，建議 task breakdown 時獨立拆一個 task，不要跟 A/B/C 的入口機制改動塞在同一個
task 裡。

---

## 已確認的技術決策

| 問題 | 決策 |
|---|---|
| CLAUDE.md/AGENTS.md 現有的逐字重複要不要消除 | 要，改成兩份入口檔案 + 一份 `docs/agent-guide.md` 原始文件 |
| 要不要加 GEMINI.md | 不加，Gemini CLI 目前已預設讀取 `AGENTS.md`，不需要額外的入口檔案 |
| Codex 需不需要額外的入口檔案 | 不需要，`AGENTS.md` 本身就是 Codex 吃的慣例檔名 |
| auranest scaffold-app.mjs 的「複製 template 目錄」步驟要不要照搬 | 不要，appspine 是多 repo，這一步由 GitHub「Use this template」處理 |
| auranest scaffold-app.mjs 的「自動配 port / 更新 fleet table / 產生 ci-<name>.yml」要不要照搬 | 不要（多 repo 架構下這些 monorepo 特有的問題不存在），本地開發不會同時跑多個業務系統 repo，port 維持 template 預設值 |
| scaffold 腳本放哪 | `appspine-app-template/scripts/scaffold-init.mjs`，隨 template fork 到每個新 repo，在新 repo 內執行一次 |
| scaffold 腳本要不要自動化「加 Prisma model」等需要開發者設計的步驟 | 不要，只自動化純文字 token 替換，其餘留在 README 的手動 checklist |
| appspine 框架套件 monorepo 要不要補文件 | 要，目前完全沒有任何文件 |
| workspace 根目錄要不要補 README.md | 要，目前只有給 agent 看的 CLAUDE.md/AGENTS.md，沒有給人類看的 README |
| `docs/agent-guide.md` 這個檔名/路徑要不要在 workspace、template、`appspine` 框架 monorepo 三處統一 | 要，三處都用同一個名字 |
| 要不要一份 workspace 端的「業務系統登記清單」文件 | 不要，多 repo 架構下沒有中心化清單的需求 |
| `appspine` 框架套件 monorepo 的 `docs/agent-guide.md` 內容要怎麼跟 `dev_docs/003` 分工 | 薄文件、連結為主——只放要點跟一覽表，細節決策連結指回 `_archive/dev_docs-20260803/framework/003-shared-package-reuse-plan.md`，不整段摘要複製 |

---

## 執行順序

```
006（本計劃，跟 005 平行、互不依賴）
  ├── A. workspace 端入口機制（CLAUDE.md/AGENTS.md 精簡 + docs/agent-guide.md）
  ├── E-1. workspace 根目錄補 README.md
  ├── B. template 端入口機制（新增兩份入口檔案 + docs/agent-guide.md，含 App Positioning 佔位）
  │     └── C. scaffold-init.mjs（依賴 B 已經有 App Positioning 佔位可填）
  └── E-2. appspine 框架套件 monorepo 補齊 README.md + 入口機制 + docs/agent-guide.md（獨立 task，內容量大）
```

A/E-1（workspace 端）可以先做，不依賴其他項目。B 要先於 C（scaffold 腳本要改的 App Positioning 段落，得先
存在）。E-2（框架套件 monorepo 文件）跟 A/B/C 沒有依賴關係，可以平行排，但因為內容量較大單獨排一個 task。

跟 005 的關係：兩份計劃主題不同、互不依賴，可以任意交錯排序；不用等其中一份完成才能開始另一份。

## 完成後的狀態

- `CLAUDE.md`/`AGENTS.md` 不再有逐字重複內容，只有一份 `docs/agent-guide.md` 是原始來源
- `appspine-app-template` 有了跟 workspace 一致的多入口 agent 文件機制，之後每個新 fork 出去的業務系統 repo
  一開始就帶有統一的 agent 文件，不用各自土法煉鋼
- 新業務系統 repo 的初始化（改名稱、APP_NAME、README/CLAUDE 標題）有 `scaffold-init.mjs` 可以跑，不用照著
  README 手動清單一步一步改
- workspace 根目錄跟 `appspine` 框架套件 monorepo 都有基本的 README.md，讓人類（不只是 agent）也能看懂這兩個
  目錄在幹嘛

