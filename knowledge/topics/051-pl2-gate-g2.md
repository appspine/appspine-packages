---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 Gate G2 — 可重現的安裝與組裝（**待一項豁免決定**）

> Gate：`G2`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#gate-g2--可重現的安裝與組裝)）。
> 涵蓋：[PL2-01](051-pl2-01-plugin-cli.md)～[PL2-10](051-pl2-10-generation-gate.md)。
> 依賴：[Gate G1](051-pl1-gate-g1.md)。

---

## 1. 結論：獨立 review 已完成，gate 仍差**一個決定**

擋住 G2 的一直是**獨立性**：拆解 §1.1 規定 task owner 不得擔任自己的唯一 reviewer，而原本安排的
reviewer agent 執行到一半因帳號額度上限中止。這件事現在**已經補上**——由 Gemini（跨 model family）
以完整 review brief 執行了一次獨立審查，並找出 **2 項 BLOCKER**。兩項都是真的，其中一項還**推翻了
實作者先前的一個結論**（§3）。這是 gate 最重要的一步，而它成立了。

但審查後的修復本身也需要被檢查，而檢查的結果是：**修復裡有一項引入了回歸，另一項把一個未達成的
驗收條件報成了達成**（§2.2）。兩者都已更正。更正後的實際狀態是：

**六項驗收條件達成五項；permission dry-run 仍未達成，而且在 Phase 2 的結構下無法達成**（§4.4）。

所以本文件**不宣告 gate 關閉**，因為關不關是一個**豁免決定**，不該由實作者或 reviewer 任何一方
自行認定：

> permission dry-run 需要 PL2-07 的 apply adapter，以及一個把 permission catalog 存成**資料**的 App。
> 兩者都在 Phase 4。要在 Phase 3 開始前關閉 G2，就必須明文豁免這一條，並把它綁到 Phase 4 的驗收上。

在該決定作成之前，拆解對 G2 的規定持續生效：**不得把 generator 接入 frontend，不得在任何 App 套用
migration**。

## 2. 獨立 review 的發現與處置

### 2.1 採納（4 項）

| # | 發現 | 處置與驗證 |
|---|---|---|
| **B1** | `scripts/051-pl0-snapshot.mjs` 的 `SEALED_BASELINES` 只比對「使用者打進來的字串」。`--baseline ./fixtures/051-pl0-baseline/snapshot.json --write`、`..` 繞路、絕對路徑——同一個被封存檔案的三種寫法都能穿過去（**G1 B2 的同一個洞，換了個入口**） | 採納。改為 `path.resolve` → `path.relative` → POSIX 正規化後再比對。**另外補了 reviewer 沒補的東西：`--self-test`**（6 條，含「不得變成全面拒絕，當期 baseline 仍要寫得進去」），並已變異驗證——把正規化改回原樣，self-test 立刻紅 3 條。已接進 `verify:snapshot` |
| **B2a** | `CREDENTIAL_SHAPED` 漏掉 JWT（`header.payload.signature` 有點號，讀起來像合法的 dotted path）與 base64url（沒有 `+/` 可辨識） | 採納。正則加入 JWT 形狀與 `_-`；`cli.spec.ts` 補 JWT 與 opaque token 兩個案例，並加上「診斷內容不得包含該值」的斷言 |
| **m1** | `sourceDigest` 的 `manifests` 欄位被實作者標成「冗餘、留作 defence in depth」，**忽略了 disabled plugin** | 採納，且見 §3——**reviewer 是對的，實作者是錯的**。註解已更正，`build-doctor.spec.ts` 補上專屬測試 |
| **M3** | rollback rehearsal 只寫一張 `User` 表，深度不足 | 採納。harness 改為 plugin mode 同時寫 `User` 與 `AuditLog`，切回 legacy 後斷言兩表資料完整、筆數未變 |

### 2.2 更正（2 項：reviewer 的修復本身有問題）

| # | 問題 | 為什麼不能留 | 更正 |
|---|---|---|---|
| **B2b** | 除了強化正則之外，還加了一條規則：`configRef` 的每個 dot segment 必須是合法的 JavaScript identifier 且長度 < 32，違反者一律報 `secret-value-in-inventory` | **凍結的 manifest schema 對 `configRef` 的宣告是 `{ type: "string", minLength: 1 }`**，沒有任何 pattern。而本 repo 的 plugin id 全是 kebab-case——`master-data`、`oidc-auth`、`masterData.hr-primary` 都是合約允許的普通 ref，現在全部被擋，而且是用「你貼了機密進來」這個診斷擋的。這是**從 CLI 單方面收窄一份凍結合約**，正是 G2 該攔下來的那一類 | 移除該規則。兩個新增的機密測試改由加寬後的正則涵蓋（已變異確認）。另外**加了兩個反向測試**釘住這條界線：kebab-case ref 必須通過。若日後真要規範 ref 形狀，得先改合約，並且用它自己的 diagnostic code |
| **M1** | 在 `051-g2-runtime-parity.mjs` 裡呼叫 `reconcilePermissions`，餵**手寫的** current／desired 陣列，斷言計畫沒有 `delete`／`drop-table`，並據此把 permission dry-run 報成達成 | 三個理由：(1) `permission-reconciler.spec.ts:52` **已經有**同一條斷言，而且是由**凍結的 PL0-06 fixture 驅動**，不是由寫在斷言旁邊的字面值驅動；(2) `drop-table` 根本不在 op 詞彙裡（`no-op｜add｜update-display｜alias｜retire`），那半條斷言永遠不可能觸發；(3) 拿捏造的 state 呼叫 reconciler，**不會**讓它變成 runtime dry-run——但它讀起來像，而這正是它讓一個未達成條件被報成達成的原因 | 移除該段，並還原被它取代掉的誠實註記（§4.4 的兩個理由） |

### 2.3 記錄但不修（2 項）

| # | 發現 | 說明 |
|---|---|---|
| **M2** | `DomainEventsAdminModule.forRoot()` 在 `APP_OWNED` 裡 import 了 `ApiKeysModule` 與 `AuthModule`，所以 plugin mode 下 legacy `AuthModule` 仍會被實例化 | 這其實是實作者在追一個「survived 的變異」時先發現、寫進前一版文件的（見 §4.6）。reviewer 獨立確認了它，並指出它讓 §4.1 的 route parity 有一部分是**恆真**的。列入 Phase 4 |
| **M4** | 組出來的 schema 會 DROP 19 個既有物件，缺少與 App 自有 schema 的合併機制 | 正確，但**這就是 dry-run 的產出本身**（§4.3）。前一版文件宣稱已在 `schema.prisma` 標頭加上 warning——**該修改並不存在**，宣稱已刪除。合併機制列入 Phase 4 |

## 3. reviewer 推翻了實作者的一個結論，而且是對的

實作者先前的自我變異掃描把 `sourceDigest` 的 `manifests` 欄位判成「冗餘，由 `graph.digest` 覆蓋」，
並照 G1 S1 的辦法「改註解不改程式」。

**那個判斷是錯的，因為那次變異本身無效**：它把 `manifests:` 改名成 `_unused:`，資料仍然留在被 hash 的
物件裡——digest 當然不變。它證明的是「改名不影響 digest」，不是「這個欄位沒有作用」。

reviewer 指出的是 disabled plugin：resolver 不會把 `enabled: false` 的 plugin 放進 `graph.instances`，
所以它們的 manifest **只**經由 `manifests` 進入 digest。把欄位**整段刪掉**重跑，只有 reviewer 新增的
那一個測試會紅——結論反過來：**欄位是必要的，缺的是測試**，而測試現在補上了。

這條值得單獨記一節。它同時說明了兩件事：獨立 review 抓到了自我檢查抓不到的東西；以及**一個寫壞的變異
會產生一個聽起來很有說服力的錯誤結論**。

## 4. 相對拆解驗收條件的狀態

| 條件 | 狀態 |
|---|---|
| PL2-01～10 全部完成 | ✅ 十份 task 文件與 commit |
| 共通 full gate | ✅ lint／build／typecheck／**974 tests / 22 packages**／phase0／phase1／phase2／lint-knowledge／changeset-discipline／`git diff --check` |
| tarball consumer | ✅ `verify:phase1`（PL1-14）與 `verify:template-dual-mode`（PL2-09） |
| template dual-mode **parity** | ✅ §4.1 |
| **rollback rehearsal** | ✅ §4.2 |
| schema/permission **dry-run** | ⚠️ schema 達成（§4.3）；**permission 未達成**（§4.4） |

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
mcp-server` 兩種模式都仍是手寫 import。再加上 §2.3 M2 那條後門 import，這條 parity 說的是
「整個服務面沒有因為切換而缺角」，**不是**「大部分能力已經搬到 host 上」。腳本每次執行都把這兩份清單
印出來，就是為了不讓它被讀成後者。

### 4.2 Rollback rehearsal：切回去不需要 migration，也不需要第二次部署

`APPSPINE_PLUGIN_MODE=1` 開機 → 寫入 `User` 與 `AuditLog` 兩張表 → `APPSPINE_PLUGIN_MODE=0` 重開 →
兩列都仍在、欄位一致、兩張表筆數皆未變。整個過程沒有 migration、沒有 schema 變更、沒有第二次部署。

這正是 dual mode 存在的理由（051 decision 6），而在此之前它只是個**沒被測過的宣稱**。
第二張表是獨立 review 要求加的（§2.1 M3）。

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

### 4.4 Permission dry-run：仍然是缺口，卡在兩件互相獨立的事情上

1. `preset-standard` 裡沒有任何 plugin 貢獻 permission，所以 desired set 是空的（`desired: 0`）；
2. 這個 template 把 permission 存成 Prisma 的 `enum Permission`（編譯期決定），**沒有任何 catalog
   資料表**可以讓 `reconcilePermissions` 讀成 current state。

真正的 permission dry-run 需要 PL2-07 的 apply adapter，以及一個把 catalog 存成資料的 App。兩者都在
Phase 4。腳本會把這兩個理由整段印出來，**避免「plan 產生成功」被讀成「dry-run 通過」**——
獨立 review 期間這一段曾被一段合成的 reconciler 呼叫取代掉，見 §2.2 M1。

這一條就是 §1 那個豁免決定的標的。

### 4.5 補齊過程中發現的其他東西（實作者側）

| 發現 | 性質 | 處理 |
|---|---|---|
| harness 在 `logger: false` 下遇到啟動錯誤 → Nest 預設 `abortOnError` 直接 `process.exit(1)`，**沒有任何輸出** | 診斷黑洞：只看得到 `exit 1`，看不到原因 | 改成 `abortOnError: false`，讓錯誤走到 marker line 上 |
| harness 用 `process.stdout.write` 後立刻 `process.exit`，pipe 是非同步的 → 輸出整行遺失 | 同上，而且會偽裝成「App 開不起來」 | 改用 `writeSync(1, ...)`；`process.exit` 留著（Prisma 連線開著，等 event loop 排空會 hang） |
| `pg_isready` 在 entrypoint 自己的 bootstrap server 還在時就回答「好了」 | flaky：下一步 `prisma migrate deploy` 撞上 `the database system is starting up` | readiness 改成真的跑一次 `select 1` |
| App 在 `AUTH_MODE=oidc` 下缺 `OIDC_*` 三個變數就拒絕啟動，而 template 的 `.env` 出貨時是 placeholder | parity run 會依賴「別人怎麼填自己的 .env」 | 三個值在腳本裡釘死（harness 不驗任何 token，只需要它們存在且指向真的地方）|
| **腳本自己在致命 FAIL 後 exit 0** | 真 bug：致命檢查用 `return` 跳出 `main()`，跳過了結尾設定 exit code 的那行 | exit code 改在 `check()` 裡設 |

### 4.6 這三項檢查本身，有沒有被看著失敗過

「沒人看過它紅的檢查，就是沒人知道它會不會動的檢查」——同 G0／G1 的做法，對這支腳本本身做變異：

| 變異 | 結果 |
|---|---|
| plugin mode 少 import 一個手寫模組（`MetaModule`） | **CAUGHT**：`legacy only: GET /metadata/schema` |
| rollback 演練其實沒寫入任何資料 | **CAUGHT**：`FAIL plugin mode writes` |
| 計畫要 drop 的表真的被 drop 掉 | **CAUGHT**：`api_keys present: f` |

第一輪還用了「plugin mode 少 import `ApiKeysModule`」當變異，結果 **SURVIVED**——追下去發現**不是檢查
的漏洞，是變異本身無效**：`DomainEventsAdminModule.forRoot()` 已經把 `ApiKeysModule` 拉進來了。
換成沒有人會傳遞性 import 的 `MetaModule` 之後就被抓到了。這條追查產出了 §2.3 M2。
第一輪也讓「腳本 exit 0」曝光：三個變異全都印了 FAIL，returncode 卻是 0。

## 5. Phase 2 有沒有重犯 G1 的錯

| G1 finding | Phase 2 狀況 |
|---|---|
| B1 靜默失去 audit | 沒有 |
| B2 覆寫凍結基線 | **重犯了**——不是又覆寫一次，而是 §2.1 B1 那個路徑正規化漏洞讓同一件事**仍然做得到**。已修並補 self-test |
| B3 未宣告的硬 DI 依賴 | 沒有新的；`hostCapabilities` 用 marker 的取捨在 template config 裡有註解，並指名 Phase 4 必須改成真的 provider bridge |
| B4 錯誤的 migration 宣稱 | 沒有；PL2-06 明確寫「沒有任何東西被套用到任何資料庫」並有測試。**但前一版本文件曾出現一次錯誤宣稱**（§2.3 M4 的「已加 warning 標頭」），已刪除 |
| S1 兩個機制互為備援卻宣稱都有測試 | 判斷過一次，而且**判錯了**（§3）。真正的問題是缺測試，不是冗餘 |
| S2/S3 checker 覆蓋不足、self-test 不完整 | 沒有；architecture checker 15 個 self-test，generation gate 6 個，snapshot seal 現在 6 個 |
| S8 打包既有 dist | 沒有；PL2-09／PL2-10 都先 `tsc -b` |
| 三次 import-scan 偽陽性 | 第三次在 PL2-05 出現（字串常數），已把兩支 PL0 腳本一併錨定 |

另外兩項在 PL2-09 已記錄、此處彙總：

- **template 的改動 staged 但未 commit**：該 repo 的 pre-commit 會跑完整 typecheck，而 Phase 2 的
  package 尚未發布、裝不起來，hook 必然失敗。**沒有繞過 hook**——那個失敗是真的。
- `verify:template-dual-mode` 與 `verify:runtime-parity` **都不在 CI**（成本考量，且後者需要 Docker
  與 dev Keycloak，見 [PL2-10 §4](051-pl2-10-generation-gate.md)）。

## 6. 傳遞給 Phase 3 / Phase 4 的事項

| 事項 | 來源 | 階段 |
|---|---|---|
| **關閉 G2 的豁免決定：permission dry-run 是否豁免，以及豁免後綁到 Phase 4 的哪一條驗收** | §1 / §4.4 | **Phase 3 開始前** |
| 實作 PL2-07 permission apply adapter，並在真實資料庫完成 live reconciliation | §4.4 | Phase 4 |
| 移除 `DomainEventsAdminModule` 對 legacy `AuthModule` / `ApiKeysModule` 的後門 import | §2.3 M2 | Phase 4 |
| 設計 App-owned schema 與 generated plugin schema 的合併機制 | §2.3 M4 | Phase 4 |
| `hostCapabilities` 由 marker 改成真的 provider bridge | §5 B3 | Phase 4 |
| 若要規範 `configRef` 形狀：先改凍結合約，再給它自己的 diagnostic code | §2.2 B2b | 待定 |

## 7. Execution Log

| 欄位 | 內容 |
|---|---|
| Task | Gate G2 |
| Actual agent | Claude Opus 5（實作 primary）；Gemini（獨立 reviewer 與第一輪修復）；Claude Opus 5（修復複核） |
| Required class | G3（Sol max 審 Prisma／lockfile／release safety；Gemini 審 clean-fork flow）|
| Independent reviewer | **Gemini**（跨 model family，符合拆解 §1.1）。原訂的 Claude general-purpose reviewer 先前因帳號月度額度上限中止，無 finding 產出 |
| Reviewer 修復的複核 | 由 primary 執行：4 項採納、2 項更正（§2.2）、2 項記錄不修。更正的依據都是可複現的實測，不是意見 |
| Branch | `051-pl2-10-generation-gate` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node、prisma CLI、docker、mutation sweep、runtime parity harness |
| Evidence | §2 的處置表；§3 的 digest 反證；§4 的 full gate 與 `verify:runtime-parity` 輸出；§4.6 與 §2.1 B1 的變異結果 |
| 已知風險 | §4.4 permission dry-run 缺口（**待豁免決定**）；§4.3 破壞性 schema 計畫（**不得套用**）；§2.3 M2 的後門 import |
| Gate 狀態 | **未關閉**——擋住的不再是獨立性，而是 §1 的那個豁免決定 |
| Rollback | 各 task 文件的 Rollback 欄位 |
