---
type: topic
scope: cross-repo
status: superseded
created: 2026-07-03
updated: 2026-08-03
supersedes: null
superseded_by: 034-coolify-github-deployment-plan
---

# Z03 - Coolify + GitHub 自動部署指南（appspine 業務 App 部署範本）

> **已提升為正式計畫 `_archive/dev_docs-20260803/auto-deploy/034-coolify-github-deployment-plan.md`**
> （2026-07-29，task breakdown 見 `034-task-breakdown.md`）。本文件保留作為該計畫的
> 詳細技術步驟參考（安裝指令、Coolify 後台設定路徑、環境變數名稱），繼續維護、不封存；
> 已拍板決策與待確認事項的正式追蹤以 034 為準。
>
> 狀態：**修訂版**，取代原「自建 Gitea + Coolify」方向（原始版本見 git 歷史紀錄）。
> 原始碼與部署來源統一為 GitHub（appspine 各業務 app repo 本來就 host 在
> `github.com/appspine/*`），不再另建內網 Gitea 作為第二份程式碼真相來源。
>
> **改動理由**（2026-07-24 討論定案）：
>
> 1. appspine 各 app repo 安裝私有套件（`@appspine/*`，發布在 GitHub Packages）本來就需要
>    對外連線，自建 Gitea 想達成的「內網隔離」實際上沒有真的達成。
> 2. 雙 git host（GitHub 為主、Gitea 為部署來源）會產生兩份程式碼真相來源的同步問題，
>    原文件未處理。
> 3. 若日後真正需要完全不碰公網（air-gap），需要同時規劃「原始碼鏡像」＋「私有套件鏡像
>    （例如自架 Verdaccio）」兩套單向搬運機制，且會與 `_archive/dev_docs-20260803/framework/001-app-framework-plan.md`
>    已拍板的「套件 registry 採 GitHub Packages」決策衝突，需要一併重新評估——這是遠比本文件
>    複雜的方向，不在本文件範圍內。
>
> **後續追加拍板（2026-07-24）**：
>
> 1. **資料庫**：8 個業務 app 各自維持獨立 PostgreSQL container/instance，不共用一台
>    資料庫伺服器——延續框架「各系統各自獨立、不設共用基礎設施」的一貫精神，代價是較高的
>    資源開銷，換取故障隔離（單一 app 的爛 query/migration 不會拖累其他 app）。
> 2. **備份**：先做到「排程備份 + 異地存放」（備份檔案不可跟主機放同一顆硬碟/同一台機器），
>    還原演練與多主機容錯留待規模變大後再排，不在本輪範圍。
> 3. **GitHub App 授權**：安裝時選 *Only select repositories*，逐一勾選要部署的 repo；
>    Permission 僅給 `Contents: Read-only` + `Metadata: Read-only`，不勾其餘權限。
> 4. **部署觸發／網路暴露面**：採「方案 A」——只開放 GitHub Webhook 需要的那條路徑（由
>    GitHub 簽章驗證保護），Coolify 管理後台（8000 埠）與其餘所有路徑維持內網/VPN only。
>    曾評估過「方案 B：完全零 inbound、改用主機端輪詢」，但查證後 Coolify **沒有**原生
>    輪詢功能（官方 auto-deploy 文件與程式碼層級的 DeepWiki CI/CD 頁面都只描述
>    webhook／GitHub Actions 兩種事件觸發方式），方案 B 得自己刻一支排程腳本、且會變成
>    一個沒人監控的額外元件（呼應 `Z24-blindspot-review-20260724.md` A-2 完全沒有監控
>    機制的缺口），不划算，故採方案 A。

---

## 🏗️ 部署架構規劃

- **作業系統**：建議使用 Ubuntu 22.04 / 24.04 LTS。
- **Coolify 埠號**：`8000`（管理後台）、`80/443`（部署應用的反向代理）。
- **主機規格（樓地板建議，2026-07-24）**：跑得起來、不會被 OOM 卡死的下限，不是舒適值，
  之後應依實際用量調整：
  - **vCPU**：4 核——平時 API 流量對內部工具而言不重，但 build（`pnpm build`/`tsc`/
    `prisma generate`）是 CPU 密集，共用 4 核勉強夠，別壓到 2 核以下。
  - **記憶體**：16GB——Coolify 本身建議至少 2GB；8 個 Postgres instance 保守抓每個
    300MB（≈2.4GB）；8 個 NestJS backend 每個 250MB（≈2GB）；8 個 Next.js frontend
    （SSR 比純 API 吃記憶體）每個 350MB（≈2.8GB）；OS 與 build 過程額外開銷抓 2GB。
    加總落在 10–11GB，抓 16GB 才有基本緩衝；壓在 8GB 幾乎確定會在同時 build 兩個 app
    時吃緊。
  - **硬碟**：100GB SSD——8 份 Postgres data + Docker image/layer（Node/Next.js image
    疊起來不小）+ build cache。**不含 `apps/drive` 的檔案儲存**，那是開放式成長的量，
    需另外估算，不算進這個樓地板。
  - 這是先求撐得住的下限估算，不是精算結果；正式上線後應觀察實際資源用量再調整（見
    「待確認事項」）。
- **部署邏輯**：
  1. 開發者 push 到 GitHub（`github.com/appspine/<app-repo>`）。
  2. GitHub 透過 Coolify 的 **GitHub App** 整合自動通知 Coolify（Coolify 原生支援，
     不需手動設 Webhook URL/Secret）。
  3. Coolify 拉取程式碼，在伺服器上建置並啟動應用。
- **網路暴露面**：只有 GitHub Webhook 需要的那條路徑對外開放（由 GitHub 簽章驗證保護），
  管理後台（8000 埠）與其餘所有路徑一律限制在內網/VPN，見下方「步驟三」。
- **資料庫**：每個業務 app 各自一個獨立 PostgreSQL container/instance，不共用資料庫伺服器。
- **這是單一 app repo 的部署範本**。appspine 目前有 8 個獨立業務 app repo（見
  `docs/agent-guide.md` 的埠號表），每個 repo 要各自重複下方「步驟四」設定一組 Coolify
  service；同一台伺服器上跑多個 app 時，記得比對埠號表避免衝突。

---

## 🛠️ 步驟一：安裝 Coolify

Coolify 的安裝非常簡單，它會自動安裝 Docker 並將自己運行在 Docker 容器中。

1. **執行安裝指令**：

   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```

2. **登入 Coolify**：
   - 瀏覽器打開 `http://<伺服器_內網_IP>:8000` 註冊管理員帳號。

---

## 🛠️ 步驟二：在 Coolify 串接 GitHub

Coolify 對 GitHub 有原生的 GitHub App 整合，比自建 Gitea 的 SSH key 方式更省事，且自動
處理 Webhook：

1. 進入 Coolify 後台 → **Sources** → **Add New Source** → **GitHub App**。
2. 安裝時選擇 **Only select repositories**，逐一勾選要部署的 repo，**不要選 All
   repositories**——降低這個 App 被濫用時的影響範圍。
3. Permission 只給 **Contents: Read-only** + **Metadata: Read-only**，不要順手多勾
   Issues/PR/Actions/Packages 等用不到的權限。
4. 安裝完成後，Coolify 會自動取得對應 repo 的讀取權限，**不需要額外管理 PAT 或 SSH key**
   來讀原始碼。

---

## 🛠️ 步驟三：限制對外暴露面（只開放 Webhook 路徑）

原本設想 Coolify 主機純內網，但「push 了就自動觸發部署」這個需求，不管走 Webhook 還是
GitHub Actions 呼叫 API，本質上都需要 Coolify 這一端有某個端點可以被外部呼叫到——完全
零 inbound 只能靠 Coolify 主機自己定期輪詢 GitHub，而 Coolify **沒有**原生輪詢功能（查證
見文件開頭「後續追加拍板」第 4 點），得自己刻排程腳本，維護成本不划算。因此改採「只開放
最小必要端點」：

1. 確認 Coolify 該 app service 的 Webhook 端點路徑（Coolify 後台該服務的 **Webhooks**
   分頁可查看，格式通常帶一段 token）。
2. 在主機前面架 reverse proxy 或防火牆規則：
   - **放行**：僅 Webhook 端點的路徑，走 80/443。
   - **擋掉**：8000 埠（管理後台）與其餘所有 API 路徑，只能從內網/VPN 存取。
3. 這條 Webhook 路徑本身有 GitHub 簽章驗證保護（Coolify 會核對 payload 簽章），沒有對應
   secret 的請求會被拒絕，不是「誰都能打」的開放端點。
4. **Coolify 每個帳號自己去設定裡開 2FA**——查證過官方沒有「admin 強制全 team 開 2FA」
   的功能（只是一個尚未實作的功能請求），只能靠人為紀律維持，不能靠設定一次鎖死。帳密
   外洩的代價是拿到全部 app 的部署設定與 `GITHUB_TOKEN`/`DATABASE_URL`，這是單一入口、
   影響面最大的資產。
5. **Coolify 的權限模型是 team 層級的粗粒度 RBAC（Admin／Read-only，部分版本另有
   Developer），沒有 per-app 的範圍控制**——只要某人在這個 team 裡有非唯讀權限，實際上
   碰得到全部 8 個 app 的部署設定，跟「各自獨立 PAT／DB」想做到的爆炸半徑隔離對不上。
   因應方式不是重新設計，是用政策彌補：**Coolify 帳號名單壓到最少人**，只有真的要做
   部署維運的人給 Admin，其餘需要查看狀態的人給 Read-only，不要每個 app 負責人都開一個
   帳號。

---

## 🛠️ 步驟四：部署 appspine 業務 app（NestJS + Next.js）

各業務 app repo 是 pnpm-based（`backend/`、`frontend/` 雙目錄，見
`_archive/dev_docs-20260803/framework/002-app-dev-conventions.md`「目錄結構慣例」），且依賴 GitHub Packages
的私有套件：

### 1. 設定下載私有套件所需的 Token

- `pnpm install` 時需要連上公網的 GitHub Packages 下載 `@appspine/*`。
- 在 Coolify 的應用環境變數中加入：

  ```env
  GITHUB_TOKEN=<具有 read:packages 權限的 GitHub PAT>
  ```

- **建議每個 app service 用獨立的 PAT**（而非全部 app 共用同一把），單一 PAT 外洩時影響
  範圍才不會波及全部業務系統。

### 2. 部署 NestJS 後端

- 在 Coolify 中新增服務，選擇步驟二設定好的 GitHub App Source 與對應 repo。
- **Base Directory**：`backend`
- **Build Command**：`npx prisma migrate deploy --schema prisma/schema && pnpm build`
- **Start Command**：`pnpm start`
- 設定環境變數 `DATABASE_URL` 連接該 app **專屬**的 PostgreSQL container/instance（每個
  業務系統各自獨立一份，不共用資料庫伺服器，見文件開頭「後續追加拍板」第 1 點）；用
  Coolify 一鍵啟動 PostgreSQL 即可，8 個 app 各自按一次，不要手動管理 8 份設定檔。

### 3. 部署 Next.js 前端

- 新增另一個服務，指向同一個 repo。
- **Base Directory**：`frontend`
- 環境變數設定 `NEXT_PUBLIC_API_URL` 為後端的存取網址。
- 啟動並綁定對應網域（依 app 各自的網域/子網域規劃）。

### 4. 備份設定

- 用 Coolify 內建的資料庫排程備份功能，推到 S3 相容的物件儲存——**備份存放位置必須跟主機
  實體分開**，不能存在同一顆硬碟或同一台機器上，否則主機硬碟壞掉時資料庫跟備份一起消失。
- 各 app 各自設定一次排程（沿用「Coolify 範本各自按一次」的模式，不是手動腳本）。
- **第一次還原演練，不跟規模掛勾，上線後就要排**：第一個 app 上線後一個月內，找非上班
  時間做一次完整還原演練（備份還原到乾淨環境、確認資料完整）。理由是「備份機制設定完」
  不等於「備份真的能用」——常見的坑是權限設錯、排程沒真的觸發、S3 憑證過期、備份出來是
  空檔案，這些問題不會因為規模小就不發生，反而規模小時出錯代價最低、最適合練手。之後
  每個新 app 上線可沿用同一套演練腳本，不用重新設計流程。
- **跨主機容錯**才是適合用觸發條件延後的，本輪不做，但訂出明確的觸發標準（不是模糊的
  「規模變大」）：任一 app 的停機成本高到會實際影響業務（例如 `apps/approve` 核准流程
  卡住、未來 `apps/master-data` 是其他 app 的依賴來源），或主機資源用量逼近「樓地板規格」
  上限時，就該排入評估。

### 5. Push-to-deploy 驗證

- 完成設定後，Coolify 應已透過 GitHub App 自動訂閱該 repo 的 push 事件；確認步驟三設定的
  防火牆/reverse proxy 規則只放行 Webhook 路徑，不需要像原 Gitea 方案那樣手動貼整組
  Webhook URL/Secret。
- 對 `main` push 一個小改動，確認 Coolify 自動觸發建置並成功部署。

---

## 待確認事項（未拍板）

- **主機整體資源規劃**：樓地板估算已定案（見「部署架構規劃」：4 vCPU／16GB／100GB），
  但這是憑經驗抓的下限，不是根據實際使用者規模精算的結果——實際部署後仍需觀察用量再校正，
  且未包含 `apps/drive` 的檔案儲存需求。
- **多主機容錯**：觸發條件已定案（見「步驟四之 4. 備份設定」：業務停機成本升高或主機資源
  逼近樓地板上限時評估），本輪不做。第一次還原演練已改為「上線後一個月內就要排」，不再是
  無限期延後（見同節）。
- ~~**Coolify 帳號本身的 2FA/RBAC 支援程度**~~ **已查證（見「步驟三」第 4/5 點）**：2FA
  只能個人自行開啟、無法 admin 強制；RBAC 是 team 層級粗粒度（Admin／Read-only），沒有
  per-app 範圍控制。因應方式是把帳號名單壓到最少人，不是等 Coolify 補上這個功能。
- ~~**單機部署全部 8 個 app 是否為刻意的階段性選擇**~~ **已回答（2026-07-24）**：是刻意的
  Phase 1 選擇，不是被忽略的疏漏——資源樓地板與多主機容錯觸發條件都是照這個前提定的。
  代價講清楚：程式碼／DB／發版各自獨立沒錯，但實體上擠在同一台機器，這台機器掛了是全部
  8 個 app 同時停擺，不是單一 app 出事，跟框架其他地方強調的「各系統獨立部署、不互相
  拖累」有落差，是已知、已接受的取捨。升級到多機的觸發條件沿用「多主機容錯」那條——不
  用另外定義「規模變大」是什麼意思。

---

## 若日後真的需要 air-gap（完全不碰公網）

本文件（Coolify + GitHub）假設部署伺服器可以對外連線到 GitHub / GitHub Packages。若之後
真的出現「完全不能碰公網」的硬性需求，不要直接把 Gitea 步驟加回本文件——那只解決了原始碼
這一半，私有套件安裝仍會破功。屆時需要另開一份新文件，同時規劃「原始碼單向鏡像」＋
「私有套件單向鏡像（例如自架 Verdaccio，並回頭挑戰 001 已拍板的 GitHub Packages 決策）」
兩套機制，屬於不同量級的方案。

