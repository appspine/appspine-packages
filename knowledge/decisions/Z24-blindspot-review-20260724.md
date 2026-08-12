---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-24
updated: 2026-08-03
---

# Z24 - appspine Blindspot Review（PM/架構師視角，unknown unknowns 盤點）

> 狀態：**記錄，未定案**。2026-07-24 由 agent 通讀 `docs/agent-guide.md`、`dev_docs/INDEX.md` 全部主題、
> 001/002 框架規劃、025/031（MCP Gateway）、026-028（Domain Events）、033（Master Data）、
> Z21（發布基礎設施缺口）等 30+ 份文件後產出，目的是找出「PM/架構師可能沒意識到自己不知道」
> 的缺口，供後續排入正式計畫前的參考素材，不是拍板的執行計畫。

## 分層說明

- **A 層**：整個 dev_docs 文件庫裡完全沒出現過的主題，真正的 unknown unknowns。
- **B 層**：已經零星記錄在個別 Z 文件裡，但還沒被連成一個「策略風險」來看的模式——
  已經是 known unknowns，但可能還沒被當作需要主動處理的架構風險。

---

## A 層：整個 dev_docs 裡完全沒提過的主題

1. **正式生產環境部署目標其實還沒拍板。** 唯一一份跟「這些系統實際跑在哪」相關的文件是
   [`Z03-self-hosted-gitea-coolify-setup.md`](../topics/Z03-self-hosted-gitea-coolify-setup.md)，
   標題本身就是「未定案探索」。8 個獨立部署的業務系統，目前沒有一份文件回答「production
   環境是誰在管、機器在哪、怎麼佈署」。若現在已有真的 production 環境在跑，這份落差本身
   就是風險——代表營運現實跑在文件之前，沒人回頭補。
   **2026-07-29 更新**：此缺口已排入正式計畫
   [`034-coolify-github-deployment-plan.md`](034-coolify-github-deployment-plan.md)（待執行）。

2. **完全沒有監控/告警/on-call/備份/災難復原規劃。** 全文件庫掃描「observability」
   「backup」「disaster recovery」「on-call」「Prometheus/Grafana/Sentry」等關鍵字，
   一次都沒出現在框架層決策裡。001 的框架能力清單裡有 Health Check，但那只是「服務有沒有
   活著」的端點，不等於有人在看、有人會被叫醒。8 個獨立 DB、各自部署——現在如果
   `apps/approve` 的 DB 半夜掛了，要怎麼知道？備份多久還原一次？目前沒有任何文件涉及。

3. **沒有資料治理/個資（PII）盤點與保留政策。** `apps/master-data` 未來會集中組織/人員
   主檔，`apps/chat` 有訊息內容，`apps/drive` 有檔案——但沒有任何一份文件討論「哪些欄位是
   PII、要保留多久、離職員工的資料怎麼處理、法遵稽核要拉報表時去哪裡拉」。稽核關聯 id
   header（見 001「對外介接層細節」）明講「不受信任、不集中收集」——代表目前完全沒有
   跨 app 事後追蹤一起資安事件的能力。

4. **沒有安全滲透測試/威脅建模的規劃，即便攻擊面剛擴大。** 031（跨 App Agent 存取）讓
   外部 client 用一人一 key 直接打多個 app 的 MCP server——這是刻意新增的高權限外部入口，
   但文件庫裡沒有對應的滲透測試或第三方安全稽核計畫。

5. **沒有效能/負載測試與容量規劃。** 002 的測試規範明講「不強制整體覆蓋率」「主力驗證
   手段是 E2E golden path」，完全沒提負載測試。8 個 app 若真的共用同一組實體基礎設施
   （Z03 探索文件暗示可能如此），目前沒人算過尖峰同時在線的總資源需求。

6. **人員 bus factor 沒被當成風險看待。** Z21 那些「手動繞過發布問題」的步驟（改用本機
   PAT 手動 publish、手動 `gh pr create` 再 `--admin` merge）目前是 tribal knowledge，
   散落在單篇事後記錄裡，沒有整理成「維運手冊」。若只有一人知道這套繞過流程，是單點故障。

---

## B 層：已零星記錄、但還沒連成風險判斷的模式

7. **共用套件發布基礎設施已經用同一個根因炸過兩次，而且沒有真正修好。**
   [`Z07-common-version-cascade-gap.md`](Z07-common-version-cascade-gap.md)
   記錄過「changesets bump 版號 ≠ 真的 publish」，
   [`Z21-shared-package-release-infra-gaps.md`](../topics/Z21-shared-package-release-infra-gaps.md)
   §4/§7 明講「這是同一個根因第二次出現」，§9 又額外炸出「registry 上有已 rollback 的
   孤兒版本燒掉了版本號」這種新變形。目前狀態：release workflow 仍需人工介入建 PR
   （org 層級 GitHub Actions 權限問題還沒修）、`@appspine/e2e-kit` 的 403 根因位置不明確。
   這代表下一次任何人改共用套件、要發版，有相當機率第三次踩到類似問題——這不是單一
   bug，是這條 pipeline 本身結構性脆弱，但目前沒有文件把它提升到「框架層待辦事項」的
   層級，只停留在事後記錄。

8. **各 app 的 `@appspine/*` 套件版本已經長期漂移，沒人在追蹤現況。** Z21 §8 列出
   approve/calendar/chat/drive/project/wiki 的 backend/frontend 都還釘著過舊的套件版本
   範圍，且明講「留給維護者決定」。若哪天 `@appspine/auth` 爆出安全漏洞要全部緊急升級，
   目前答不出「8 個 app 各自跑哪個版本、要花多久才能全部追上」——因為沒有中央盤點機制。

9. **Domain Events 帶來的最終一致性風險，目前只靠「定期對帳」兜底、沒有可觀測性。**
   033 §4.3 明講 reconciliation 排程內建在套件裡，但沒有提到「複本落後多久算異常、要不要
   告警」。跨 app 的 mirror（如 `OrgUnitMirror`）理論上可能因為 webhook 漏送而悄悄跟
   source of truth 脫節，直到下次排程對帳才修正——這段時間窗口內使用者看到的資料可能是
   錯的，而且沒人會知道，因為沒有 staleness 監控指標。

10. **模板同步（template-sync）完全靠人工判斷 + 人工 replay，且沒有定期稽核機制。**
    `docs/agent-guide.md` 的「Template change propagation」流程要求人工判斷「這個 fix
    要不要傳播」、人工 replay commit、人工更新 `docs/template-sync.md`。8 個 fork，沒有
    任何腳本去定期檢查「哪些 fork 落後 upstream 多久、有沒有漏傳播的安全修補」。目前唯一
    的防線是「Rule of Thumb：修完 template 要記得想」——這是流程上的信任假設，不是機制。

11. **`apps/org` → `apps/master-data` 的資料遷移是目前唯一「已拍板但沒有回滾計畫」的
    高風險操作。** `033-master-data-app-plan.md` (歷史封存)
    §8 待決事項寫明「資料搬遷細節留到 task breakdown」，但遷移期間 `apps/approve` 的核准
    流程（消費 org 資料）要不要暫停、遷移失敗怎麼回滾，這類問題目前完全沒有答案，而
    approve 是已上線的生產系統。

---

## 建議的後續處理方向（未拍板，供討論）

- 先釐清 A-1/A-2：appspine 現在到底部署在哪、誰負責備份與事故應變——這決定了後面所有
  維運類指令有沒有意義。
- B-7/B-8 值得排一份「框架維運健檢」正式計畫，把 Z07/Z21 這兩次事故連成一份「發布基礎
  設施根治計畫」，而不是繼續累積事後記錄。
- B-9/B-10 適合各補一個輕量監控/稽核腳本：mirror staleness 告警、template-sync 落後
  天數的定期盤點。

本文件為一次性盤點記錄，若後續決定針對某一項排入正式編號計畫，執行後應在此標註對應
編號並視情況封存本文件（比照其他 future_plans 文件的慣例）。
