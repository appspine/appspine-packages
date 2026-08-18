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

要關閉 G2 需要：一次獨立 review（不同 context，最好不同 provider）＋本文件 §4 列出的三項未完成補齊。

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

## 4. 相對拆解驗收條件的未完成項

拆解對 G2 的「必須通過」有六條。三條已達成、三條沒有：

| 條件 | 狀態 |
|---|---|
| PL2-01～10 全部完成 | ✅ 十份 task 文件與 commit |
| 共通 full gate | ✅ lint／build／typecheck／**969 tests / 22 packages**／phase0／phase1／phase2／lint-knowledge／changeset-discipline／`git diff --check` |
| tarball consumer | ✅ `verify:phase1`（PL1-14）與 `verify:template-dual-mode`（PL2-09） |
| template dual-mode **parity** | ⚠️ 只證明到兩種模式都**組得起來**（`compile()`，無資料庫）。真正的 API/E2E parity 需要 Postgres + Keycloak，**未做** |
| schema/permission **dry-run** | ⚠️ 產生了 plan 與 `prisma validate` 通過，但 permission 沒有 apply adapter，所以沒有真正的 dry-run 對照現況 |
| **rollback rehearsal** | ❌ 完全未做。只驗證了「切回 legacy 仍能組裝」，沒有任何實際部署或資料層面的演練 |

另外兩項在 PL2-09 已記錄、此處彙總：

- **template 的改動 staged 但未 commit**：該 repo 的 pre-commit 會跑完整 typecheck，而 Phase 2 的
  package 尚未發布、裝不起來，hook 必然失敗。**沒有繞過 hook**——那個失敗是真的。
- `verify:template-dual-mode` **不在 CI**（成本考量，見 [PL2-10 §4](051-pl2-10-generation-gate.md)）。

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
| Tools | repo read/write、pnpm、vitest、tsc、biome、node、prisma CLI、mutation sweep |
| Evidence | §2 的 19 個變異與兩輪結果；§4 的 full gate |
| 已知風險 | §4 的三項未完成；§1 的獨立性缺口 |
| Rollback | 各 task 文件的 Rollback 欄位 |
