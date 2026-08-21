---
type: topic
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 Phase 5 收尾執行提示詞（PL5-13 ～ PL5-14）

> 派工用途文件，非驗收報告。實際交付報告仍應各自寫在
> `knowledge/topics/051-pl5-13-deprecation-telemetry.md`、`051-pl5-14-stable-release.md`。

```text
Task series: PL5-13 (deprecation telemetry) ~ PL5-14 (stable release)，appspine 插件平台 Phase 5 收尾
Source of truth: knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
現況: Phase 0～4 與 Phase 5 Wave A/B/C（PL5-01～12）皆已完成並經 Claude 獨立覆核通過（見拆解文件
§13）。@appspine/* canary 版本真的發布在 npm.pkg.github.com（22 個套件，dist-tag canary）。
template + 8 個 App（wiki/calendar/chat/drive/projects/approve/master-data/mcp-gateway）都已切到
Plugin Mode 為預設，legacy escape hatch（APPSPINE_PLUGIN_MODE=0）都驗證過。

Required capability: 文件建議 PL5-13 由 Claude Sonnet 定義 public deprecation、Gemini 收集 consumer
evidence；PL5-14 由 Sol max 做 release gate、Gemini coordinator、Terra 執行、Claude 做 public API
review。本環境由你（Gemini）執行兩個 task 的可執行部分，Claude 之後獨立覆核並承擔 Sol/Claude review
的角色。

這兩個 task 依序做，PL5-14 依賴 PL5-13 完成。

============================================================
PL5-13 — 啟動舊 API transition window 與 deprecation telemetry
============================================================
Repo/worktree: 主要在 D:\Source\Private\appspine\appspine-packages，建立
051-pl5-13-deprecation-telemetry；掃描動作涉及 template + 8 個 App，唯讀不改動它們的程式碼。

In scope:
- 盤點 `@appspine/auth` 目前的 root/module exports（`packages/auth/src/index.ts`、
  `auth.module.ts`），以及其他已完成遷移的 capability package 是否還留著舊的相容性 export（例如各
  Phase 4 capability 保留的 `@Global()` compatibility bridge、Phase 3 frontend-shell 的舊 import
  路徑）。
- 幫每一個仍在用的 legacy export 補上 `@deprecated` JSDoc（含建議替代方案、預計移除的 major
  version），不要動它的實際行為。
- 寫一支 usage scanner（掃 template + 8 個 App 的 source，找出誰還在 import 這些 legacy path），輸出
  一份 consumer 清單（哪個 App、哪個檔案、用到哪個 legacy export）。
- 針對 scanner 掃出的每一筆 legacy usage，決定：(a) 有明確 owner 與 migration 計畫可以之後排掉，或
  (b) 已經沒人用、可以直接列入下一輪 major removal 提案。
- 把 scanner 接進 appspine-packages 的 CI（或至少接進 `pnpm lint`／pre-commit 這類既有 gate），讓它在
  「新增」的 legacy import 出現時 fail——已存在的 legacy usage 先放行（不能因為這個 task 讓現有 CI 全部
  變紅），但新增的要擋下來。
- 產出一份「下一個 major removal 提案」文件（草案，不是核准），列出：哪些 legacy export 預計哪個版本
  移除、目前還有哪些已知 consumer、需要什麼前置條件。

Out of scope（這條很重要，不要越界）：
- **不得真的移除任何 `@appspine/auth` 或其他 legacy export**——這個 task 只做「標記＋掃描＋提案」，
  移除只能在 transition window 結束後另立一個 major release 計畫，不是這次的範圍。
- 不改動任何 App 的程式碼（scanner 是唯讀的）。
- 不做任何 publish。

Required validation:
- scanner 對 template + 8 個 App 重跑一次要 deterministic（同樣輸入同樣輸出）。
- 手動驗證幾個已知的 legacy usage 案例（例如 Phase 4 保留的 `@Global()` bridge）真的有被 scanner 抓到，
  不是漏網。
- 確認 scanner 接進 CI 後，故意在一個 scratch 檔案裡加一行新的 legacy import，跑一次確認會 fail；再刪掉
  這個測試改動。
- `@deprecated` JSDoc 加完後，appspine-packages 的 `pnpm build`／`pnpm typecheck` 仍要全綠（JSDoc 不影響
  型別，但要確認沒有手滑改到其他東西）。

============================================================
PL5-14 — Stable release 與最終驗收
============================================================
Repo/worktree: D:\Source\Private\appspine\appspine-packages，建立 051-pl5-14-stable-release；驗證會
涉及 template + 8 個 App 但主要改動在 appspine-packages。
依賴: PL5-13 完成，以及**使用者再次明確給出 stable publish 授權**（見下方硬性停點，這跟先前的 canary
publish 授權是兩件事，不能沿用）。

In scope（不需要授權就能做的部分）：
- 準備 stable package/preset 版本號（從目前的 canary 版本，如 `plugin-host-nest@2.0.0-canary` 這類，
  決定對應的 stable 版本號；如果 canary 版本本身就是乾淨的 semver 沒有 prerelease 後綴，就是同一個版本
  號改發到 `latest`/`stable` tag，不是重新編號——用 `npm view @appspine/<pkg> versions
  --registry=https://npm.pkg.github.com` 跟 `npm view @appspine/<pkg> dist-tags
  --registry=https://npm.pkg.github.com` 現查目前狀態再決定，不要假設）。
- Release notes（彙整 Phase 0～5 的重大變更、breaking changes、遷移指南連結）。
- Compatibility report（哪些既有 App 版本相容、哪些需要先升版）。
- Fleet upgrade conclusion（總結 template + 8 個 App 目前的 Plugin Mode 狀態，比照
  051-pl5-12-fleet-matrix.md 但要反映最新狀態）。
- Incident/rollback contacts 文件。
- 另立的 legacy removal plan（承接 PL5-13 的提案，這裡只是把它正式化成一個有 owner 的後續計畫文件，
  不是這次要執行的東西）。
- 共通 full gate、registry clean consumer（用 canary tarball 或已發布版本，不要用本機 tarball 模擬）、
  template fresh fork、8 Apps CI/E2E、failure injection、rollback rehearsal、knowledge lint——這些都
  可以在拿到 stable publish 授權「之前」先做完，作為 publish 前的最後把關。

>>> 硬性停點：以下動作，沒有使用者在對話中對「這一步」明確給出的授權文字，不准執行 <<<
- 任何真的把版本從 canary tag 提升到 `latest`/`stable` dist-tag 的指令（`npm dist-tag add`、
  `npm publish --tag latest` 之類）。
- 任何 `git push`（含 tag push）。
- 任何會被外部消費者（其他還沒升級的 App、或未來的 fork）看到的正式發布動作。

如果收到這份提示詞時還沒看到這個授權文字，你只能把上面「In scope」列的東西全部準備到「一聲令下就能
發」的狀態，然後停下來回報，列出還缺什麼（例如某個 canary 版本還沒被充分驗證），不要自己判斷「反正
準備好了就發一發」。

Required validation（不需要 publish 授權就能做完）：
- pnpm install --frozen-lockfile / pnpm lint / pnpm build / pnpm typecheck / pnpm test / node
  scripts/lint-knowledge.js / git diff --check 全綠。
- template fresh fork（乾淨 clone，非本機 workspace）安裝 canary 版本、build、typecheck、test、E2E
  全綠。
- 至少一個代表性 App（建議用 wiki，Wave A 第一個驗證過的）fresh install + 真實 Docker bootstrap +
  E2E 全綠。
- Failure injection：故意讓一個 required plugin 缺配置，確認 `appspine doctor`／開機會正確 fail-fast，
  不是靜默通過。
- Rollback rehearsal：至少一個 App 從 Plugin Mode 切回 `APPSPINE_PLUGIN_MODE=0` 再切回來，資料不遺失、
  行為一致。

============================================================
Gate G5 — 計畫完成（PL5-13/14 都做完後，由 Claude 接手判斷，不是這次的範圍）
============================================================
必須通過：PL5-01～14 全部；所有 051 §13 驗收條件都有可點查 evidence；沒有把 legacy API 移除偷渡進這次
release；未完成項目已轉成有 owner 的後續計畫。

============================================================
共通流程要求（依 051 §11、§13 執行紀錄與 Gate G5A/G5B/Wave C 覆核的教訓）
============================================================
- **一定要真的 commit**，收尾前自己跑 `git log -1 --format="%H"`，把真實輸出貼進報告，不要用記憶或
  猜測的 SHA——Wave B 兩個 repo 都因為引用不存在的 commit SHA 被抓到過。
- 不要自己在 051-plugin-platform-engineering-task-breakdown.md §13 把任一 task 的 checkbox 勾成
  「已完成」；那只能等 Claude 獨立覆核後才勾。
- 若你取代了文件建議角色，在報告裡填寫 §11 substitution log 完整表格。
- 表格類的彙整資料（例如 fleet matrix、consumer 清單）一定要用真的指令重新產生／核對過，不要照樣板
  規律填——Wave C 的 fleet matrix 有 4 列的「顯式匯入模組清單」是照規律亂填的，被抓到後才更正。
- 任何驗證腳本只印成功訊息但沒有真的斷言，等於沒測。
- 驗證指令一次只跑一個，不要背景平行跑多個 install/build/test。
- 遇到型別不相容時，用明確窄化型別的 cast，不要用 `as any` 蓋過去且不揭露——mcp-gateway 已經因為這樣
  被抓到一次。
- 報告摘要用語要跟實際驗證深度一致；不確定的地方寫「未解風險」，不要自行判斷沒問題。

============================================================
授權邊界（整份提示詞最重要的一段，PL5-14 尤其要遵守）
============================================================
- 不得執行任何 git push（含 tag push）、任何形式的 stable/latest publish 指令、production migration
  指令，除非上面「硬性停點」段落描述的授權文字已經出現在對話中。
- 插件安裝／啟用不得自動套用 migration；migration 只能產生 plan／dry-run。
- 不要移除任何 legacy API——那是另一個未來的 major release 計畫，不是這次的範圍。
```
