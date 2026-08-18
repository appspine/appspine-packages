---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 Gate G2 — 可重現的安裝與組裝（**未關閉**）

> Gate：`G2`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#gate-g2--可重現的安裝與組裝)）。
> 涵蓋：[PL2-01](051-pl2-01-plugin-cli.md)～[PL2-10](051-pl2-10-generation-gate.md)。
> 依賴：[Gate G1](051-pl1-gate-g1.md)。

---

## 1. 結論：Gate G2 **不關閉**

PL2-01～10 全部完成、full gate 全綠，但**獨立 review 沒有發生**。

拆解 §1.1 寫得很清楚：**task owner 不得擔任自己的唯一 reviewer**。G1 是由一個完全獨立、沒有先前上下文的
Claude Opus agent 完成的（見 [G1 §1](051-pl1-gate-g1.md)）；G2 的同一個安排在執行到一半時因為
**帳號月度額度上限**被中止，沒有產出任何 finding。

因此本文件記錄的是「實作與自我對抗檢查的狀態」，不是 gate 通過。拆解對 G2 的規定是
「過不了就不得把 generator 接入 frontend，也不得在 App 套用 migration」——**這兩件事現在都不得進行**，
Phase 3 也不得開始。

§4 原本列的三項未完成，**已補齊兩項半**：template dual-mode parity 與 rollback rehearsal 現在都是對真的
Postgres、真的開機做出來的（§4.1、§4.2）；schema dry-run 也做了（§4.3）；只有 permission dry-run 仍是
缺口，而它卡在 Phase 4 的東西上（§4.4）。

**但 gate 仍然不關閉**，因為擋住它的是獨立性，不是工作量。要關閉 G2 需要一次獨立 review
（不同 context，最好不同 provider）。

另外兩項在 PL2-09 已記錄、此處彙總：

- **template 的改動 staged 但未 commit**：該 repo 的 pre-commit 會跑完整 typecheck，而 Phase 2 的
  package 尚未發布、裝不起來，hook 必然失敗。**沒有繞過 hook**——那個失敗是真的。
- `verify:template-dual-mode` 與 `verify:runtime-parity` **都不在 CI**（成本考量，且後者需要 Docker
  與 dev Keycloak，見 [PL2-10 §4](051-pl2-10-generation-gate.md)）。

## 2. 代替方案：一次有紀錄的對抗性變異掃描

沒有獨立 reviewer，能做的最接近的事是**主動把程式碼改壞，看測試會不會紅**——這正是 G0 與 G1 兩次
review 產出最多價值的手法。19 個變異，每一個都拆掉一項本 Phase 明文宣稱的保證：

**第一輪：14 caught / 5 survived。** 存活的每一個都是真的缺口（其中一個是我變異寫得不對）：

| 存活的變異 | 意義 | 修法 |
|---|---|---|
| `build` 在「圖解得開但輸入仍有錯」時照樣產生 | guard 有兩半，只有前一半被測到 | 新增測試，用一個 **resolver 不會重複回報**的 diagnostic（`config-ref-not-declared`）隔離後半 |
| `build` 在 Prisma 組不起來時照樣產生 | 該 guard 從未被觸發過——測試裡的失敗案例都先被 resolver 擋掉 | 新增測試：augmentation 缺 `type`，resolver 滿意、只有 composer 會說不 |
| `doctor` 用 `!process.env[k]` 取代 `k in process.env` | 空字串的環境變數會被誤報成缺少；也讓「只看存在、不讀值」這條界線失守 | 新增測試 |
| composition 多 import 一個 disabled plugin | 原測試只斷言「某個字串不存在」 | 改成**釘住整份 import 清單** |
| `sourceDigest` 忽略 manifests | 見 §3 | 更正註解，不是改程式 |

**第二輪（只重跑存活的 5 個）：4 caught，1 存活且已知為冗餘。**

## 3. 那個仍然存活的變異，是註解錯了不是程式錯了

`sourceDigest` 的 `manifests` 欄位拿掉之後，所有 digest 都不變、測試全綠。原因是
`graph.digest` 已經折入每個 instance 的 `digest`（manifest digest + package name/version）——
保證是成立的，只是**由另一條路徑提供**。

處理方式與 G1 的 S1（resolver 兩個確定性機制互為備援）一致：**保留欄位當 defence in depth，
但把宣稱它提供保證的註解改掉**。同時測試也改成釘住**性質**（manifest 變了 → artefact 全部失效）
而不是釘住其中一條實作路徑——綁在兩條冗餘路徑之一的測試，會在無害重構時變紅、在真正的回歸時保持綠。

## 4. 相對拆解驗收條件的狀態

拆解對 G2 的「必須通過」有六條。**五條達成、一條仍是缺口**：

| 條件 | 狀態 |
|---|---|
| PL2-01～10 全部完成 | ✅ 十份 task 文件與 commit |
| 共通 full gate | ✅ lint／build／typecheck／**969 tests / 22 packages**／phase0／phase1／phase2／lint-knowledge／changeset-discipline／`git diff --check` |
| tarball consumer | ✅ `verify:phase1`（PL1-14）與 `verify:template-dual-mode`（PL2-09） |
| template dual-mode **parity** | ✅ 見 §4.1。真的把 App 開起來、接真的 Postgres，兩種模式**各 68 條 route 完全相同** |
| **rollback rehearsal** | ✅ 見 §4.2。plugin mode 寫入 → 切回 legacy → 資料完好、筆數未變 |
| schema/permission **dry-run** | ⚠️ schema 做到了（§4.3），**permission 仍是缺口**（§4.4） |

補齊用的腳本是 `scripts/051-g2-runtime-parity.mjs`（`pnpm verify:runtime-parity`）。它**不重做** PL2-09
的 tarball 流程，而是 `--reuse` 那支腳本 `--keep` 下來的 App，所以這裡測的就是 PL2-09 驗過的那個 App。

資料庫用**自己起的拋棄式 Postgres**（`appspine-g2-parity-db`，port 23999，無 volume、`--rm`），不是開發機
上的 dev container。理由寫在腳本裡：dev container 的 volume 是用舊密碼初始化的，要接得上就得對別人的開發
資料庫下 `ALTER USER`——那是這支腳本不該有的副作用。順帶的好處是 parity run 永遠碰不到任何人在意的資料。

### 4.1 API parity：68 條 route，兩種模式完全相同

route 是從 **Express router 的 stack** 讀的，不是 Nest 的 metadata。metadata 是 App「宣告」了什麼，
這裡要問的是它「真的服務」什麼——兩者只有在某個東西沒註冊成功時才會不同，而那正是要找的情況。
比較用集合：多一條 route 和少一條 route 一樣算失敗。

**但 parity 涵蓋的範圍要說清楚。** plugin mode 下 host 擁有的只有
`audit-log, health-check, identity-core, oidc-auth` 四個；`rbac / m2m-api-key / metadata-schema /
mcp-server` 兩種模式都仍是手寫 import。所以這條 parity 說的是「整個服務面沒有因為切換而缺角」，
**不是**「大部分能力已經搬到 host 上」。腳本每次執行都把這兩份清單印出來，就是為了不讓它被讀成後者。

### 4.2 Rollback rehearsal：切回去不需要 migration，也不需要第二次部署

`APPSPINE_PLUGIN_MODE=1` 開機 → 寫一列 marker → `APPSPINE_PLUGIN_MODE=0` 重開 → 該列仍在、
欄位一致、`users` 筆數未變。整個過程沒有 migration、沒有 schema 變更、沒有第二次部署。

這正是 dual mode 存在的理由（051 decision 6），而在此之前它只是個**沒被測過的宣稱**。

### 4.3 Schema dry-run：計畫產出來了，而計畫本身是個必須記錄的風險

`prisma migrate diff --from-url <parity db> --to-schema-datamodel <composed schema> --script`，
產出 **30 條 statement，其中 19 條是破壞性的**：

```sql
DROP TABLE "api_keys";
DROP TABLE "domain_event_deliveries";
DROP TABLE "domain_events";
DROP TABLE "integration_event_receipts";
DROP TABLE "notifications";
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_fkey";
-- 完整計畫寫在 App 目錄下的 g2-schema-dry-run.sql
```

**這不是腳本失敗，這就是 dry-run 存在的意義。** 組出來的 schema 只涵蓋 plugin 擁有的 model；
上面那些表屬於仍然手寫的能力（rbac、m2m-api-key、metadata-schema、mcp）或 App 自己。
換句話說：**目前產生的 schema 絕對不能就這樣套用到任何 App**——這正是拆解 §2.3 禁止在 Phase 4 之前
套用任何東西的具體理由。記錄，不修。

腳本另外驗證了 dry-run**確實沒有套用**：不是比對 `users` 的筆數（那些列在這份計畫下本來就會活著，
證明不了任何事），而是直接查計畫裡第一個 `DROP TABLE` 的目標表是否還在。

### 4.4 Permission dry-run：仍然是缺口，而且卡在兩件互相獨立的事情上

1. `preset-standard` 裡沒有任何 plugin 貢獻 permission，所以 desired set 是空的（`desired: 0`）；
2. 這個 template 把 permission 存成 Prisma 的 `enum Permission`（編譯期決定），**沒有任何 catalog
   資料表**可以讓 `reconcilePermissions` 讀成 current state。

真正的 permission dry-run 需要 PL2-07 的 apply adapter，以及一個把 catalog 存成資料的 App。兩者都在
Phase 4。腳本會把這兩個理由整段印出來，**避免「plan 產生成功」被讀成「dry-run 通過」**。

### 4.5 這次補齊過程中發現的東西

| 發現 | 性質 | 處理 |
|---|---|---|
| `DomainEventsAdminModule.forRoot()` 在 `APP_OWNED` 裡 import 了 `ApiKeysModule` **和 `AuthModule`** | 真實發現：plugin mode 下 legacy `AuthModule` 仍然會被實例化，從後門進來 | 記錄；Phase 4 把 auth 真正搬上 host 時必須一併處理。也代表 §4.1 的 parity 有一部分是被這條路徑「順便」滿足的 |
| harness 在 `logger: false` 下遇到啟動錯誤 → Nest 預設 `abortOnError` 直接 `process.exit(1)`，**沒有任何輸出** | 診斷黑洞：只看得到 `exit 1`，看不到原因 | 改成 `abortOnError: false`，讓錯誤走到 marker line 上 |
| harness 用 `process.stdout.write` 後立刻 `process.exit`，pipe 是非同步的 → 輸出整行遺失 | 同上，而且會偽裝成「App 開不起來」 | 改用 `writeSync(1, ...)`；`process.exit` 留著（Prisma 連線開著，等 event loop 排空會 hang） |
| `pg_isready` 在 entrypoint 自己的 bootstrap server 還在時就回答「好了」 | flaky：下一步 `prisma migrate deploy` 撞上 `the database system is starting up` | readiness 改成真的跑一次 `select 1` |
| App 在 `AUTH_MODE=oidc` 下缺 `OIDC_*` 三個變數就拒絕啟動，而 template 的 `.env` 出貨時是 placeholder | parity run 會依賴「別人怎麼填自己的 .env」 | 三個值在腳本裡釘死（harness 不驗任何 token，只需要它們存在且指向真的地方）|
| **腳本自己在致命 FAIL 後 exit 0** | 真 bug：致命檢查用 `return` 跳出 `main()`，跳過了結尾設定 exit code 的那行 | exit code 改在 `check()` 裡設。**這是下面 §4.6 的變異掃描抓到的** |

### 4.6 這三項檢查本身，有沒有被看著失敗過

「沒人看過它紅的檢查，就是沒人知道它會不會動的檢查」——同 G0／G1／§2 的做法，對這支腳本本身做變異：

| 變異 | 結果 |
|---|---|
| plugin mode 少 import 一個手寫模組（`MetaModule`） | **CAUGHT**：`legacy only: GET /metadata/schema` |
| rollback 演練其實沒寫入任何資料 | **CAUGHT**：`FAIL plugin mode writes` |
| 計畫要 drop 的表真的被 drop 掉 | **CAUGHT**：`api_keys present: f` |

第一輪還用了「plugin mode 少 import `ApiKeysModule`」當變異，結果 **SURVIVED**——追下去發現**不是檢查
的漏洞，是變異本身無效**：`DomainEventsAdminModule.forRoot()` 已經把 `ApiKeysModule` 拉進來了（§4.5
第一列）。換成沒有人會傳遞性 import 的 `MetaModule` 之後就被抓到了。這條追查本身產出了 §4.5 的第一個發現。

第一輪也讓「腳本 exit 0」曝光：三個變異全都印了 FAIL，returncode 卻是 0。

## 5. Phase 2 有沒有重犯 G1 的錯

G1 的 findings 逐條對照，這是自我檢查最該做的事：

| G1 finding | Phase 2 有沒有重犯 |
|---|---|
| B1 靜默失去 audit | 沒有；但 PL2-07 的 apply adapter 還不存在，audit result 因此也還不存在（已記錄） |
| B2 覆寫凍結基線 | 沒有；`SEALED_BASELINES` 現在同時保護 PL0 與 PL1，PL2 寫自己的 |
| B3 未宣告的硬 DI 依賴 | 沒有新的；`hostCapabilities` 用 marker 的取捨在 template config 裡有註解，並指名 Phase 4 必須改成真的 provider bridge |
| B4 錯誤的 migration 宣稱 | 沒有；PL2-06 明確寫「沒有任何東西被套用到任何資料庫」並有測試 |
| S1 兩個機制互為備援卻宣稱都有測試 | **重犯了一次**——`sourceDigest` 的 manifests 欄位（§3）。用同樣的方式處理了 |
| S2/S3 checker 覆蓋不足、self-test 不完整 | 沒有；PL2-10 的 gate 自帶 6 個 self-test，architecture checker 增至 15 個 |
| S8 打包既有 dist | 沒有；PL2-09／PL2-10 都先 `tsc -b` |
| 三次 import-scan 偽陽性 | **第三次在 PL2-05 出現**（字串常數），已把兩支 PL0 腳本一併錨定 |

## 6. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | Gate G2 |
| Actual agent | Claude Opus 5（primary）。獨立 reviewer **未完成**：Claude Opus general-purpose agent 於執行中因帳號月度額度上限中止，無 finding 產出 |
| Required class | G3（Sol max 審 Prisma／lockfile／release safety；Gemini 審 clean-fork flow）|
| Substitution reason | 本 session 無獨立 Sol／Gemini provider；且替代方案本身被額度中斷 |
| Independent reviewer | **無**。§2 的變異掃描由 primary 自己執行，**不構成獨立 review** |
| Branch | `051-pl2-10-generation-gate` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node、prisma CLI、docker、mutation sweep |
| Evidence | §2 的 19 個變異與兩輪結果；§4 的 full gate；§4.1～4.3 的 runtime parity 執行輸出（`pnpm verify:runtime-parity`）；§4.6 的 3 個變異 |
| 已知風險 | §4.3 的破壞性 schema 計畫（**不得套用**）；§4.4 的 permission dry-run 缺口；§4.5 第一列的 `AuthModule` 後門 import；§1 的獨立性缺口 |
| Rollback | 各 task 文件的 Rollback 欄位 |
