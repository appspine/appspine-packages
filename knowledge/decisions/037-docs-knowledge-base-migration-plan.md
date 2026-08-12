---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-03
updated: 2026-08-03
---

# 037 - appspine 文件知識庫遷移（借鑑 project-cairn + LLM Wiki）- 系統設計計畫

> 狀態：**已定案，可排執行**。task breakdown 已建立於 `_archive/dev_docs-20260803/framework/037-task-breakdown.md`
> （T-13000–13880，82 個 task），待執行。task breakdown 經 Opus 第四輪覆核（針對粒度，非
> 針對方案本身）拆細並發現 5 項需裁定的缺口，皆已裁定並反映在本文件與 task breakdown 中；
> 第四輪的合併結果再經第五輪獨立稽核重新實查、修正 churn 排除規則與多處事實數字，見第 4 節。
>
> 動機：`dev_docs` 現有 104 份文件集中在 `appspine-workspace` 這個 wrapper repo，但真正獨立
> 部署、獨立 git 生命週期的是 `appspine`（框架）、`appspine-app-template`、以及 8 個
> `apps/*` 業務 repo。每份 `NNN-plan.md` 又混了決策理由／執行過程／現況／可攜教訓四種生命
> 週期，找「目前結論」得整篇讀完，`INDEX.md` 也只能靠 regex 掃「狀態：」一行分類。本計畫要
> 建立分散式的文件知識庫（每個 repo 一份自己的 `knowledge/`，`appspine-workspace` 一份跨 repo
> 協調用的 `knowledge/`），轉寫既有 104 份文件後，把 `dev_docs/` 整個封存進 `_archive/`。
>
> 規劃過程：與使用者多輪討論收斂設計（改良既有分類 → 拆到各 repo → 引入 project-cairn 與
> LLM Wiki 機制），再經 `/grill-me` 逐題釐清定案，之後歷經**三輪獨立 Opus 覆核**（分別找出
> 動機案例不實、私有 repo 存取失效、分類/編號/排程三項缺陷），逐輪修正。完整推導過程、每輪
> 質疑的具體內容與逐項回應，見
> `_archive/future-plans-Z29-20260803/Z29-docs-knowledge-base-redesign-concept.md` (歷史封存)
> 全 16 節（Z29 已封存並移出 `dev_docs/`，比照 Z23→031、Z28→036 的既有升格先例）；本文件只
> 收斂最終定案的方案與待執行的排程，不重複推導過程。

---

## 1. 背景

appspine 的規劃文件全部放在 `dev_docs/`，按主題分資料夾（`framework/`、`app-wiki/`…），
由 `dev_docs/scripts/themes.mjs` 手動維護分類、`generate-index.mjs` 產生 `INDEX.md`。這套
機制運作至今（001-036），但兩個問題隨文件量增長而變得明顯：

1. 只 clone 單一 `apps/*` repo 的協作者或 agent，拿不到該 repo 的規劃／決策歷史——這些歷史
   全部在 `appspine-workspace` 這個獨立 repo 裡。
2. 一份 `NNN-plan.md` 同時是決策記錄、執行日誌、現況描述、也可能是未來可攜的教訓，四種生命
   週期混在一份文件裡，找「現在的結論是什麼」成本隨文件老化增加。

## 2. 最終定案的方案

### 2.1 分散式知識庫架構

每個獨立 git 生命週期的 repo（`appspine`、`appspine-app-template`、8 個 `apps/*`、以及
`appspine-workspace` 自己）各自一份 `knowledge/`：

```text
knowledge/
  index.md      內容目錄，每頁一行摘要 + metadata
  log.md         時間序，格式 `## [YYYY-MM-DD] {ingest|decision|lint} | 標題`
  decisions/     不可變決策記錄
  topics/        現況真相頁，會被覆寫
  Cited.md       輕量版：只留外部參考連結 + 一句話說明，不做 provenance 追蹤
```

`appspine-workspace` 的 `knowledge/` 額外扮演跨 repo 協調角色（task-ID 全域註冊表、port
對照表、真正跨 repo 的行動如本計畫自己）。

**`appspine`／`appspine-app-template` 的 `knowledge/` 起始為空骨架**：`_archive/dev_docs-20260803/framework/`
（39 份）與 `_archive/dev_docs-20260803/app-template/`（9 份）現有文件的 `scope` frontmatter 一律標
`cross-repo`，物理位置留在 `appspine-workspace` 的 `knowledge/`——這些文件本來就是被全部
業務 app repo 引用消費的內容（例：`010` 被 wiki 引用 27 次、calendar 9 次、drive 8 次），不是
`appspine`／`appspine-app-template` 自己內部的事。兩個 repo 各自的 `knowledge/` 之後只累積
真正「只有自己在乎」的內部決策，不繼承任何舊文件。

### 2.2 `decisions/` vs `topics/` 分類規則

轉檔當下判斷該文件的「實質編輯次數」：**一次 commit 只有在它對這份文件的 diff 帶來了語意內容
變更，才算一次實質編輯**。以下三類一律不計入：

1. **純狀態列回填**——diff 只動到狀態 blockquote（`> 狀態：`那幾行）。
2. **純搬移／改資料夾**——`git mv` 型，只有 rename 沒有內容變更。判定時**必須開 rename 偵測**
   （`git log --follow -M`）：否則搬移會被 git 呈現成「新增整份檔案」，反而灌成一次最大幅度的
   實質編輯。
3. **純連結／路徑改寫**——一行在把 markdown 連結目標、相對路徑前綴（`../` → `../../`）與
   `dev_docs/<folder>/` 段落正規化之後前後相同。

第 3 條不可省略：`dev_docs` 歷史上兩個橫跨大量文件的批次整理 commit——`cc707f9`
（`docs(dev_docs): reorganize into theme-based folders`，88 檔）與 `c6212aa`
（`docs: reorganize dev_docs Z0x files into appendixes/ and future_plans/`）——**其內容變更
全部落在狀態 blockquote 之外**（實查 `cc707f9` 對 `002` 的 diff，每一段都只是 `../` → `../../`
或資料夾名替換，零語意變更），只靠第 1 條完全排不掉。

**≥ 3 次實質編輯 → 整份進 `topics/`**（不拆分，歸類為會被覆寫、之後直接在原地更新）；
**否則進 `decisions/`**（整份凍結，不拆分）。這是可自動查核的事實（比對 diff 範圍），不是
主觀判斷。

**取樣窗為空的邊界案例**：churn 計數的取樣窗是「轉檔當下該文件已存在的 git 歷史」。本計畫自己的
兩份 `037-*` 文件是隨本次遷移新建、尚未進 git，取樣窗是**空的**（不是「低」），規則沒有可計數的
輸入。此時改看「該文件是否負有已載明的持續更新義務」：`037-task-breakdown.md` 依其自身檔頭規定，
每完成一個 task 就要回填 checkbox 與「執行結果」段落，82 個 task 必然產生遠超過 3 次實質編輯，
判準本身已被滿足、只是無從事後計數 → `topics/`；本文件（`037-...-plan.md`）已定案、沒有載明的
持續更新義務，且其狀態列變更依第 1 條不計入 → `decisions/`。這是對取樣窗的補救，不是對規則的
豁免——沒有載明更新義務的 0-commit 文件仍歸 `decisions/`。

依此規則實查全庫（102 份已進 git 的文件——含 4 份 `repealed/`、不含 2 份尚未進 git 的 `037-*`；
`git log --follow -M` + 上述三項排除）得到 **28 份 `topics/`、74 份 `decisions/`**；若漏掉第 3 條
排除會變成 56／46，可見排除條款不是修辭。這組數字是 T-13000 的校準基準值。實質
編輯次數最高的幾份：`app-approve/016-task-breakdown.md`（41 次，全庫最高）、
`domain-events/026-task-breakdown.md`（27）、`framework/002-app-dev-conventions.md`（17）、
`framework/029-task-breakdown.md`（13）、`app-mcp-gateway/025-task-breakdown.md`／
`domain-events/028-task-breakdown.md`／`framework/036-task-breakdown.md`（各 12）、
`app-drive/013-task-breakdown.md`（8）、`app-wiki/011-task-breakdown.md`（7）、
`framework/001-app-framework-plan.md`（5）。完整分類表由 task-breakdown 的 T-13000 產出並凍結，
後續任務一律查表、不重算。

**跨 repo 引用的裸編號引用（如「見 Z08」不帶檔名）**：轉檔時一併改寫成帶完整檔名或連結的
引用，消除歧義。實查目前並存的編號碰撞為 `Z01`（app-drive／app-template）、`Z03`（app-calendar／
auto-deploy）、`Z04`／`Z05`／`Z06`（app-calendar／app-template）、`Z07`／`Z08`（app-calendar／
framework）、`Z22`（app-approve／framework），另有「已封存版與現存版同號」的 `Z18`／`Z20`／`Z23`。
`app-wiki/011-task-breakdown.md` 甚至出現裸**區間**引用「`Z04`～`Z09`」，橫跨 app-template
（Z04–Z06）與 framework（Z07–Z09）兩個來源。這屬於引用精確度的客觀修正，不算違反 §3「不回填
改寫舊文件內容」的原則。

**引用指向已封存／已搬移路徑**：轉檔時一併修正為現在的實際 `_archive/` 路徑，同樣屬於客觀的
位置更新，不算改寫內容。已實查確認的失效引用（`app-master-data` 全部三處都寫成 `dev_docs/…`
的字面路徑，該路徑已不存在）：

| 文內寫的路徑 | 現在的實際路徑 |
| --- | --- |
| `_archive/dev_docs-20260803/app-org/032-org-app-plan.md` | `_archive/app-org-20260722/032-org-app-plan.md` |
| `_archive/dev_docs-20260803/future_plans/Z18-enterprise-master-data-center.md` | `_archive/future-plans-Z18-20260722/Z18-enterprise-master-data-center.md` |
| `_archive/dev_docs-20260803/future_plans/Z20-master-data-client-package-plan.md` | `_archive/future-plans-Z20-20260722/Z20-master-data-client-package-plan.md` |

注意 `app-master-data` 的裸「`Z20`」指的是**已封存的** `Z20-master-data-client-package-plan.md`，
不是現存的 `domain-events/Z20-domain-events-outbox.md`——這正是上一段裸編號改寫必須同時做的原因。

工作包 E 的 T-13860 會把整個 `dev_docs/` 搬進 `_archive/`，因此**轉檔時寫進 `knowledge/` 的
`dev_docs/…` 字面路徑也會在同一次遷移中失效**。歸宿路徑（`_archive/dev_docs-<YYYYMMDD>/`）由
T-13000 一次定死，轉檔時直接寫最終路徑，不留待 T-13870 事後補救。

### 2.3 跨 repo 引用：型態導向的複製／指標規則

- 跨 repo 指向 `decisions/`（不可變）的引用 → **物理複製**到引用方 repo 的 `knowledge/
  decisions/`，保留來源編號，frontmatter 額外帶：

  ```yaml
  source_repo: appspine/appspine-workspace
  source_commit: <sha>
  canonical_url: https://github.com/.../blob/<sha>/path.md   # commit-pin，非 branch-pin
  copy_status: fresh | stale   # 只有 lint 會改
  ```

- 跨 repo 指向 `topics/`（可變）的引用 → 維持**指標**（穩定 GitHub URL，commit-pin）。
- 跨 repo 手動 lint（見 §2.5）逐一比對每份複本的 `source_commit` 與正本現況，正本已被取代時
  把複本的 `copy_status` 標成 `stale`，讓過期狀態對讀者可見，不是靜默失效。

### 2.4 Frontmatter 與檔名

```yaml
type: decision | topic | log | cited-pointer
scope: repo-local | cross-repo
status: active | superseded | archived
supersedes: <doc-id or null>
superseded_by: <doc-id or null>
created: 2026-08-03
updated: YYYY-MM-DD
```

不含 `owner`／`contributors`（單一作者，純儀式）。**從舊文件轉檔的 `decisions/`／`topics/`
保留原編號 + slug 檔名**（例：`029-appspine-wide-cleanup.md`），既有「見 029」「002」等數字
捷徑引用因此保持有效；只有全新產生、原本沒有編號的內容才用純 slug。

**`supersedes`／`superseded_by` 的值域限制**：只接受**知識庫內實際存在的 doc-id 或 `null`**，
不得填入散文說明或指向知識庫外的路徑——這兩個欄位是 §2.5 lint 要機器解析的關聯欄位，一旦允許
自由文字就同時失去型別與可查核性。被取代／取代方**刻意不納入知識庫**時（唯一案例：§3 列為非目標、
不轉檔的 `app-approve/repealed/` 4 份廢止文件），一律填 `null`，沿革改寫在正文散文裡，並附封存
後的實際 `_archive/` 路徑。`016-approve-app-plan.md` 與 `016-task-breakdown.md` 檔頭本來就已經
有「沿革」blockquote 交代兩次廢止改版，轉檔時只需依 §2.2 末段把其中的 `_archive/dev_docs-20260803/app-approve/
repealed/…` 字面路徑改寫成封存後路徑，不需要新增欄位。

### 2.5 操作觸發

- **`ingest`**：每次決策真正定案／完成時即時觸發（新決策寫進 `decisions/`，同時回頭更新受
  影響的 `topics/*`）。
- **`lint`**：手動 slash command 觸發，不做排程（appspine 無背景排程基礎設施）。跨 repo 模式
  由有全部 repo 存取權的人手動執行，比對 §2.3 的複本是否過期。

### 2.6 CLAUDE.md 規則調整

`knowledge/` 目錄比照現行 `dev_docs/` 列為中文例外（Absolute Rule 目前規定 `dev_docs/`
之外必須英文）。透過既有的 template 變更傳播流程（`list-template-changes.mjs`、手動 replay、
回填各 repo 的 `template-sync.md`）落地到 `appspine-app-template` 與 8 個既有 app repo。

## 3. 範圍與非目標

**範圍**：`dev_docs/` 現有 104 份文件的轉檔與分散式重新安置；建立 `knowledge/` 機制本身
（骨架、frontmatter、lint）；`dev_docs/` 最終整包封存進 `_archive/`。

**非目標**：不回填改寫舊文件的內容本身（只加 frontmatter，不逐句修訂）；不建立背景排程
基礎設施（lint 維持手動觸發）；不解決「私有 repo 對窄權限協作者不可見」以外的存取控制需求
（那是組織權限決策，不是文件機制能解的問題）；`app-approve/repealed/` 的 4 份廢止文件不轉檔，
隨 `dev_docs/` 一併封存。

## 4. 審查記錄

規劃過程經三輪獨立 Opus 覆核，每輪找出的問題與本文件方案採納的修正對應如下（完整內容見
Z29 對應章節）：

- **第一輪**（Z29 §9）：動機案例（「只 clone 單一 repo 拿不到文件」）部分不實——每個 `apps/*`
  repo 已有 `docs/agent-guide.md` 等現況文件，真正缺的是規劃歷史。已在 §1 動機重新界定為
  「規劃／決策歷史」而非全部知識。
- **第二輪**（Z29 §11）：已驗證 appspine 全部 11 個 repo 皆為 private，純指標機制對無
  workspace 權限者一律 404；分類規則（會不會被覆寫）本身不降低判斷成本；slug 化會丟失既有
  數字捷徑引用；CLAUDE.md 規則會外溢到 9 個英文 repo。已在 §2.3（型態導向複製/指標）、§2.2
  （churn-based 分類，不逐句拆分）、§2.4（保留原編號）、§2.6（定調為既有 template 傳播機制
  執行的有界工作）逐項回應。
- **第三輪**（Z29 §15）：已用 `git log` 驗證 `002`／`001` 是全庫異動最頻繁、被引用最多的
  文件，依 churn 規則本屬 `topics/`，型態導向複製規則救不到它們（原設計曾誤判為多數複製即可
  解決存取問題）；已驗證多個資料夾各自有重複的 `Z04`/`Z05`/`Z06`/`Z07` 編號；原排程有序列
  bug（pilot 引用到尚未轉檔的來源 repo）。已在 §2.2（churn 規則本身已涵蓋 001/002 正確路由至
  `topics/`）、§2.3（複本帶 `source_repo`/`source_commit`/`canonical_url` + lint 可偵測
  staleness）、以及 `037-task-breakdown.md` 的工作包排序（workspace `knowledge/` 建置提前到
  pilot 之後、其餘 app repo 展開之前）回應。
- **第四輪**（task-breakdown 拆解覆核，非方案本身）：Opus 把 25 個粗粒度 task 拆成 82 個可
  獨立驗收的 task 時，實際查了每個 repo 的檔案／行數／commit 數，額外發現 5 項需要裁定的缺口，
  已逐項裁定：(1) churn 判斷需排除批次搬移/回填 commit，已反映在 §2.2；(2) `appspine`／
  `appspine-app-template` 與工作包 B 的歸屬矛盾，已反映在 §2.1（scope: cross-repo + 空骨架
  方案）；(3) 跨資料夾 Z 編號碰撞在裸引用場景下的處理，已反映在 §2.2 尾段；(4) 引用指向已
  封存路徑的處理，已反映在 §2.2 尾段；(5) 工作包 C 排序改依已驗證的 app 間引用拓樸
  （`calendar → project → drive → chat → approve → master-data → mcp-gateway`）排列，取代
  原本「依文件數由小到大」的排序依據，已反映在 `037-task-breakdown.md`。
- **第五輪**（獨立 Opus 對第四輪合併結果的稽核，重新實查而非複核宣稱）：已重新驗證檔案數
  （104 份／扣掉 4 份 `repealed/` 為 100 份，82 個 task 對 100 份文件為完全覆蓋、無重複無遺漏）、
  各 app 行數、app 間引用拓樸（確認工作包 C 的順序是該有向圖的合法拓樸排序）。找到並修正 4 類
  問題：(1) **churn 排除規則排不掉它自己點名的 commit**——`cc707f9` 的內容變更全部在狀態
  blockquote 之外（純相對路徑改寫），第四輪的兩條排除條款失效，全庫分類會從 28／74 失真成
  56／46；已在 §2.2 補上第 3 條（純連結／路徑改寫）與 rename 偵測要求，並點名兩個批次 commit
  的 SHA。(2) §2.2／task-breakdown 的引用與 churn 數字多處是裸 commit 數或抄錯來源
  （`016-task-breakdown.md` 的「41 次」實際來自 `repealed-016-task-breakdown-dynamic-template.md`
  的 41 個 raw commit，本尊實質編輯數也是 41 純屬巧合；`010` 被 wiki 引用 19 次實為 27 次），
  已全部改為實查值並統一計數方法。(3) 編號碰撞只登記了 `Z08`，實查另有 `Z01`／`Z03`／`Z22`
  與已封存同號的 `Z18`／`Z20`／`Z23`，已補全於 §2.2 並在 task-breakdown 逐一標註。
  (4) T-13860 會讓轉檔時寫進 `knowledge/` 的 `dev_docs/…` 字面路徑一起失效，原本無人負責，
  已在 §2.2 末段與 T-13000／T-13860／T-13870 補上歸宿路徑前置定義。另裁定兩項第四輪未經使用者
  確認的判斷：`037` 自己的 routing 改以「取樣窗為空 + 是否負有載明的更新義務」的規則處理
  （plan → `decisions/`、task-breakdown → `topics/`，見 §2.2），取代原本「進行中所以強制
  `topics/`」的個案豁免；`supersedes`／`superseded_by` 不得填散文，改為固定 `null` + 正文沿革
  （見 §2.4），取代原本「指向 `repealed/` 歷史記錄說明」的寫法。

## 5. 待確認事項

（第四輪覆核後，原第 1 項「7 個 app repo 之間要一次做完還是分批」已随任務拆細與排序定案
自然消解——工作包 C 現在是 31 個獨立 task，可依實際空檔任意暫停/接續，不需要另外裁定「一次
做完 vs 分批」，排序本身已固定。目前無待確認事項。）

