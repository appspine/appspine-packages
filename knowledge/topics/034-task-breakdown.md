---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-29
updated: 2026-08-03
---

# 034 - Coolify + GitHub 業務 App 部署落地 Task Breakdown

> 狀態：**待執行**（0/14）。
>
> 依照 `_archive/dev_docs-20260803/auto-deploy/034-coolify-github-deployment-plan.md`（已於本文件建立時
> 定案）執行，**必須與該 plan 及 `_archive/dev_docs-20260803/auto-deploy/Z03-self-hosted-gitea-coolify-setup.md`
> 併讀**——Z03 是每一項 task 實際操作步驟（安裝指令、Coolify 後台設定路徑、環境變數
> 名稱）的權威來源，本文件不重複列出指令細節，只列「做什麼、怎麼驗證、依賴什麼」。
>
> 複雜度標記：**S** = 半天內、**M** = 1–2 天、**L** = 3 天以上（本批預期全數 S/M，無 L）。
>
> 這是真實主機上的維運操作，不是程式碼變更——沒有 `tsc --noEmit`／`biome check` 這類
> 檢查，每個 task 的「驗證」欄位就是唯一的完成判準，需要實際登入主機/Coolify 後台確認。

---

## 1. 執行原則

- **範圍**：只做 plan 034 §1 列出的 8 個業務 app 部署 + 備份 + 第一次還原演練。
  **不擴大**到 plan §4 明確排除的範圍（air-gap、多主機容錯、監控/告警/on-call、
  各業務 app 自己的 API Key／使用者權限管理）。
- **前置需求**：需要一台符合 Z03「部署架構規劃」樓地板規格（4 vCPU／16GB／100GB，
  Ubuntu 22.04/24.04 LTS）的主機，且該主機能對外連線到 GitHub／GitHub Packages
  （outbound）。**另外需要 inbound 可達性**（2026-07-29 dry-run 發現，見「3. 執行
  結果」）：主機要嘛有真實公網 IP，要嘛在 NAT 後面但能設定 port forwarding，否則
  GitHub 的 webhook 送不進來，push-to-deploy 不會自動觸發。沒有這台主機，本批 task
  無法開始——這是硬性前置依賴，不是可以繞過的估計值。
- **Secrets 處理**：GitHub PAT（`GITHUB_TOKEN`）、`DATABASE_URL`、Coolify 管理員密碼
  這類敏感值一律只存在 Coolify 環境變數/密碼管理裡，**不得**寫進任何 dev_docs 文件、
  commit、或聊天記錄——task breakdown 執行紀錄若需要佐證，只記錄「已設定」，不貼明碼。
- **每個 app 部署 task 都要重複 Z03 步驟四的完整流程**（Token 設定 → 後端 → 前端 →
  備份設定 → push-to-deploy 驗證），不是只做其中一部分；8 個 app 各自獨立驗收。
- **計畫外問題處理**：執行中若發現 Z03/034 未預期的新問題（例如某個 app 的 build
  指令跟範本不同），依既有慣例另開 `Z0x-...` 記錄文件，不要順手擴大這份 task 的範圍。

---

## 2. Task Breakdown

### A. 主機與 Coolify 平台基礎設施（plan §2 決策 1、4、5、6）

- [ ] **T-12200** 主機準備與 Coolify 安裝。複雜度：**S**
  - 確認主機規格符合 Z03「部署架構規劃」樓地板（4 vCPU／16GB／100GB，Ubuntu 22.04/24.04
    LTS），依 Z03「步驟一」執行安裝指令，完成後用瀏覽器登入 `http://<內網 IP>:8000`
    註冊管理員帳號。
  - 驗證：Coolify 後台可登入；`docker ps` 可看到 Coolify 自身容器正常運行。
  - 依賴：主機已備妥（前置需求）

- [ ] **T-12210** 串接 GitHub App Source。複雜度：**S**
  - 依 Z03「步驟二」，在 Coolify 建立 GitHub App Source，安裝範圍選 *Only select
    repositories*，逐一勾選 8 個業務 app repo，Permission 僅
    `Contents: Read-only` + `Metadata: Read-only`。
  - 驗證：Coolify 的 Sources 頁面顯示該 GitHub App 已連接，且能列出 8 個目標 repo。
  - 依賴：T-12200

- [ ] **T-12220** 對外暴露面基礎防護：預設全擋 + 8000 埠限內網。複雜度：**M**
  - **注意順序**：Z03「步驟三」第 1 點要看的是「該 app service 的 Webhook 端點路徑」，
    這個路徑要等該 app 在 Coolify 建立 service 之後才存在——本 task **不可能**在任何
    app 部署前就把「僅放行 webhook 路徑」的規則一次做完，只能先做通用基礎防護：預設
    擋掉 8000 埠與其餘所有路徑（Z03「步驟三」第 2 點的「擋掉」規則），僅開放
    80/443 的連線能力（規則本身，不含任何 allow-list 路徑）。
  - **逐 app 補齊 allow-list** 的動作移到 T-12240–T-12310 各自的部署 task 內（見下方
    B 節新增子步驟：部署完成後把該 app 的 Webhook 端點路徑加進防火牆/reverse proxy
    的 allow-list）。
  - 驗證：從公網（或模擬公網的環境）嘗試連線 8000 埠應被拒絕；此時尚無任何 app
    service，暫不驗證 webhook 簽章保護（留到 T-12320 對全部 8 個 app 一併驗證）。
  - 依賴：T-12210

- [ ] **T-12230** Coolify 帳號政策：個人 2FA + 帳號最小化 + RBAC 指派。複雜度：**S**
  - 依 Z03「步驟三」4–5 點：每個 Coolify 帳號自行開啟 2FA；盤點帳號名單，只有真的
    要做部署維運的人給 Admin，其餘查看需求的人給 Read-only；記錄成一份簡短 runbook
    （帳號名單 + 角色 + 2FA 狀態）。
  - 驗證：Coolify 團隊成員清單裡每個帳號都已標註角色與 2FA 狀態；Admin 角色人數
    為當下真正負責部署維運的最小集合。
  - 依賴：T-12200

### B. 8 個業務 app 逐一部署（plan §1 範圍、Z03 步驟四）

以下 8 個 task 各自獨立執行 Z03「步驟四」完整流程（GitHub Token 設定 → 部署 NestJS
後端 → 部署 Next.js 前端 → 備份設定 → push-to-deploy 驗證），每個 app 用各自獨立的
`DATABASE_URL`（獨立 PostgreSQL instance）與獨立 GitHub PAT。埠號依
`docs/agent-guide.md`「Local Dev Ports」表（此處為 production 埠號規劃，需另行確認
與內網其餘服務無衝突，不必沿用開發埠號）。

**每個 task 額外多一步**（承接 T-12220 移過來的部分）：該 app 的 Coolify service 建好、
Webhook 端點路徑可見後，立刻把這條路徑加進 T-12220 設定的防火牆/reverse proxy
allow-list，再進行 push-to-deploy 驗證——不要等全部 8 個 app 都部署完才一次補。

- [ ] **T-12240** 部署 `apps/wiki`。複雜度：**M**
  - 依賴：T-12220、T-12230
- [ ] **T-12250** 部署 `apps/calendar`。複雜度：**M**
  - 依賴：T-12220、T-12230
- [ ] **T-12260** 部署 `apps/drive`。複雜度：**M**
  - 額外注意：Z03 未涵蓋 `apps/drive` 的檔案儲存（MinIO/Collabora）容量規劃，部署
    時需另外確認這兩個固定埠號（9000/9001、9980）服務的資源與儲存空間，不算進
    Z03 的主機樓地板估算內。
  - 依賴：T-12220、T-12230
- [ ] **T-12270** 部署 `apps/chat`。複雜度：**M**
  - 依賴：T-12220、T-12230
- [ ] **T-12280** 部署 `apps/project`。複雜度：**M**
  - 依賴：T-12220、T-12230
- [ ] **T-12290** 部署 `apps/approve`。複雜度：**M**
  - 依賴：T-12220、T-12230
- [ ] **T-12300** 部署 `apps/mcp-gateway`。複雜度：**M**
  - 依賴：T-12220、T-12230
- [ ] **T-12310** 部署 `apps/master-data`。複雜度：**M**
  - 依賴：T-12220、T-12230

每個 task 的驗證標準一致：對該 app 的 `main` push 一個小改動，確認 Coolify 自動觸發
建置並成功部署（Z03「步驟四之 5」）；後端 `/health` 回 200；前端可正常開啟並打得到
後端 API；該 app 的資料庫排程備份已設定並確認能成功產生備份檔案（異地存放，Z03
「步驟四之 4」）。

### C. 收尾驗證（plan §5 驗收標準）

- [ ] **T-12320** 8 個 app 部署狀態彙整與端到端確認。複雜度：**S**
  - 逐一核對 T-12240–T-12310 的驗證結果，確認 8 個 app 都已成功完成至少一次
    push-to-deploy，且每個 app 的 Webhook 端點都已加進 T-12220 的 allow-list。
  - 補完 T-12220 當時延後的簽章驗證：對每個 app 的 Webhook 端點送一個沒有正確簽章的
    請求，確認皆被 Coolify 拒絕；並確認 8000 埠與非 Webhook 路徑對全部 8 個 app 仍
    維持限內網/VPN（沒有因為新增 allow-list 而意外放寬）。
  - 產出一份簡短彙整記錄（哪些 app 已上線、對應網域、備份排程狀態），供之後排入
    `docs/agent-guide.md` 或另立維運文件參考。
  - 依賴：T-12240、T-12250、T-12260、T-12270、T-12280、T-12290、T-12300、T-12310

- [ ] **T-12330** 第一次完整還原演練。複雜度：**M**
  - **不要依賴 T-12320**：plan §2 決策 3 拍板的是「第一個 app 上線後一個月內」執行，
    T-12240–T-12310（8 個 app 部署）彼此沒有互相依賴，實際完成順序不一定照編號，
    也不保證 8 個都做完會落在一個月內。一旦 T-12240–T-12310 中**任何一個**先完成，
    就以那個 app 為對象，在其上線後一個月內排這次演練，不需要等其餘 app 部署完成。
  - 依 Z03「步驟四之 4」：於非上班時間，把該 app 的備份還原到乾淨環境，確認資料完整。
  - 把演練步驟寫成 runbook（供之後其他 app 沿用同一套流程，不用重新設計）。
  - 驗證：還原後的環境資料與還原前一致；runbook 已產出並可重複執行。
  - 依賴：T-12240–T-12310 中最早完成的一個（不預設是哪一個）

---

## 3. 執行結果

### 2026-07-29：VirtualBox 家用測試環境 dry-run（非正式執行，未勾選任何 checkbox）

在一台 VirtualBox 裡的全新 Ubuntu 24.04.4 LTS VM 上跑了一次流程驗證，**不是**正式的
T-12200 執行——這台 VM（8 vCPU／7.7GB RAM／40GB disk，橋接網路取得 LAN IP
`192.168.10.93`）明顯低於 Z03 樓地板（16GB／100GB），且是家用路由器 NAT 後面的
環境，只拿來確認流程能不能跑通，不是最終目標主機。

**驗證通過的部分**：

- Coolify 官方安裝腳本（`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`）
  在 Ubuntu 24.04 上跑起來沒有問題，會自動偵測並安裝 Docker（29.6.2），四個容器
  （`coolify`／`coolify-db`／`coolify-redis`／`coolify-realtime`）全部 healthy。
- Coolify 後台可正常登入、註冊管理員帳號。

**發現的新落差（Z03/034 都沒寫到）**：GitHub App Source 串接時，Coolify 只給
「用安裝時偵測到的公網 IP」或「用 localhost」兩個選項當作 manifest 的
callback/webhook 網址。Z03「前置需求」原本只寫「主機能對外連線到 GitHub」（outbound），
但 GitHub App 的 webhook 是 **GitHub 主動打進來**（inbound）——如果目標主機是像這次
測試一樣、在家用 NAT 後面沒有真正的公網 IP，就必須額外設定路由器的 port forwarding
才能讓 webhook 送得到，push-to-deploy 才會動。**這個 inbound 可達性需求，正式落地時
（真的主機）也要先確認**：主機本身要嘛有真實公網 IP，要嘛在 NAT 後面但有能力設定
port forwarding，否則 GitHub App 來源可以連上、但自動 push-to-deploy 永遠不會觸發。
已回頭補進 034 plan §3「待確認事項」，正式執行前要先確認。

**中止原因**：使用者評估「先在家用測試環境驗證」的複雜度（NAT hairpin、路由器
port forwarding 這些跟真實環境無關的雜訊）大於效益，決定暫停，等實體主機到位後
直接在目標環境上正式執行 T-12200 起的完整流程，不再繼續這個 dry-run。這台測試 VM
的 Coolify 安裝維持現狀，之後不需要沿用；正式執行時是全新環境重來一次。

