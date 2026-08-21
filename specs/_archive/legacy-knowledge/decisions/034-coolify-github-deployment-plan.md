---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-29
updated: 2026-08-03
---

# 034 - Coolify + GitHub 業務 App 部署落地計畫 - 系統設計計畫

> 狀態：**已定案，可排執行**。Task breakdown 已建立於 `034-task-breakdown.md`。
>
> 承接 `_archive/dev_docs-20260803/auto-deploy/Z03-self-hosted-gitea-coolify-setup.md`（Coolify + GitHub
> 部署指南，2026-07-24 由「自建 Gitea + Coolify」改版定案）——**Z03 是本計畫的詳細技術
> 步驟參考，必須與本文件併讀**。Z03 已經把安裝指令、GitHub App 串接、防火牆設定、各
> app 部署設定值都寫清楚了，本文件不重複列出那些細節，只做正式範圍界定、已拍板決策
> 彙整、待確認事項收斂與 task breakdown，讓這件事從「探索文件」變成可追蹤、可驗收的
> 執行計畫。

---

## 1. 背景與定位

`Z24-blindspot-review-20260724.md` A-1 點出一個缺口：appspine 有 8 個獨立部署的業務
系統，但文件庫裡唯一跟「這些系統實際跑在哪」相關的文件（Z03）標題就寫著「未定案探索」——
沒有任何正式計畫回答 production 環境是誰在管、機器在哪、怎麼佈署。

本計畫的範圍：把 Z03 已經寫好、拍板的 Coolify + GitHub 部署方式，實際落地到一台真實
主機上，依序把 8 個業務 app（`apps/wiki`、`apps/calendar`、`apps/drive`、`apps/chat`、
`apps/project`、`apps/approve`、`apps/mcp-gateway`、`apps/master-data`）部署上去，並
完成備份與還原演練的第一次驗證。

**不在本範圍內**：新增或修改任何業務 app 的程式碼、新增部署以外的維運能力（監控/
告警/on-call，見 [Z24-blindspot-review-20260724.md](Z24-blindspot-review-20260724.md) A-2，另案處理）。

## 2. 已拍板決策（沿用 Z03 2026-07-24 定案，此處彙整不重複列細節，細節見 [Z03-self-hosted-gitea-coolify-setup.md](../topics/Z03-self-hosted-gitea-coolify-setup.md)）

1. **原始碼/部署來源統一 GitHub**，不自建 Gitea（Z03 文件開頭「改動理由」）。
2. **資料庫**：8 個業務 app 各自維持獨立 PostgreSQL container/instance，不共用資料庫
   伺服器。
3. **備份**：排程備份 + 異地存放；第一個 app 上線後一個月內完成一次完整還原演練。
4. **GitHub App 授權**：安裝時選 *Only select repositories*，Permission 僅
   `Contents: Read-only` + `Metadata: Read-only`。
5. **部署觸發／網路暴露面**：方案 A——只開放 GitHub Webhook 需要的路徑，Coolify 管理
   後台（8000 埠）與其餘所有路徑限內網/VPN only。
6. **Coolify 帳號**：無 admin 強制 2FA、無 per-app RBAC 範圍控制，靠政策彌補——個人
   自行開 2FA、帳號名單壓到最少人、只有真的要做部署維運的人給 Admin。

## 3. 待確認事項（延續 Z03，未拍板，不阻擋本輪 task breakdown）

- **主機規格樓地板**（4 vCPU／16GB／100GB）是憑經驗抓的下限，不是精算結果，上線後
  需觀察實際用量再校正；且未包含 `apps/drive` 的檔案儲存需求。
- **多主機容錯**：觸發條件已定（業務停機成本升高，或主機資源逼近樓地板上限時評估），
  本輪不做。
- **單機部署全部 8 個 app 是刻意的 Phase 1 選擇**：代價是這台機器掛了，8 個 app 同時
  停擺，是已知、已接受的取捨，升級到多機的觸發條件沿用上一條。
- **主機需要 inbound 可達性，不是只有 outbound**（2026-07-29 家用測試環境 dry-run
  發現，見 `034-task-breakdown.md` §3 執行結果）：GitHub App 的 webhook 是 GitHub
  主動打進來，不是主機主動連出去。原本「主機能對外連線到 GitHub」只涵蓋 outbound，
  正式執行 T-12200 前要先確認目標主機**要嘛有真實公網 IP，要嘛在 NAT 後面但有能力
  設定 port forwarding**，否則 GitHub App 來源可以連上，但 push-to-deploy 永遠不會
  被觸發。

這些項目維持開放，不影響本輪先把部署跑通。

## 4. 明確不做（本輪範圍外）

- Air-gap／完全不碰公網（Z03 文末「若日後真的需要 air-gap」——遇到再另開新文件，
  不要直接把 Gitea 步驟加回來）。
- 多主機部署、跨機容錯。
- 監控/告警/on-call/災難復原規劃（Z24 A-2，是另一個更大的缺口，不在本計畫處理）。
- Coolify 平台帳號以外的、各業務 app 自己的 API Key／使用者權限管理（沿用各 app 既有
  慣例，跟本計畫的 Coolify 平台帳號政策是兩件事）。

## 5. 驗收標準

- 8 個業務 app 皆已透過 Coolify 完成至少一次成功的 push-to-deploy（對 `main` push 小
  改動 → 自動建置 → 部署成功），且部署流程中 `prisma migrate deploy` 正確執行。
- 防火牆/reverse proxy 規則已驗證：僅 Webhook 路徑對外可達，8000 埠與其餘路徑僅限
  內網/VPN 存取。
- 每個 app 的資料庫排程備份已設定，並確認至少成功產生過一份異地存放的備份檔案。
- 第一個上線的 app，已完成一次完整還原演練並留下紀錄（演練腳本供之後其他 app 沿用）。

