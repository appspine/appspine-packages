---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-24
updated: 2026-08-03
---

# Z22 - Release pipeline：卡住的核准關卡、CI 建置順序 bug，與新增的健康檢查機制
> 註：本檔編號與 app-approve 的 Z22 衝突，屬 framework 之獨立記錄。

> 狀態：**已修復，且已補上防再犯機制**（2026-07-24）。起因於驗證 Z21 記錄的 org 層級發布
> 基礎設施修復是否真的生效——過程中發現一個真實卡住 4 天的「Version Packages」PR（#5），
> 修復途中又額外抓到並修好兩個先前沒被記錄過的問題。跟 Z07/Z21 不同的地方：這次除了修
> bug，另外建立了一個持續運作的機制（`release-health-check.yml`），不是只留一份事後記錄。

## 1. 起因

Z21 記錄的四個發布基礎設施問題，§8/§9 顯示 2026-07-17 的一次煙霧測試（run 29550939955）
已經全綠，但文件自己承認「本次沒有 pending changeset，未實際驗證到（org 層級）建 PR 那
一步」——也就是說，自動化路徑「看起來修好了」，但從沒被一次真正需要建 PR 的 release 完整
驗證過。

與其另外造一個假的驗證用 changeset，查了 `appspine/appspine` repo 現況後發現已經有一個
真實案例可以直接拿來驗證：[PR #5「Version Packages」](https://github.com/appspine/appspine-packages/pull/5)，
2026-07-22 由 changesets bot 自動開出，內容是 `@appspine/auth@3.1.0`（新增
`employeeNumber` 欄位，033 rollout 的一部分）連動 bump 六個套件，開了兩天還沒合併。

## 2. 發現的問題（依發現順序）

### 2.1 Workflow run 卡在 `action_required`，4 天沒人發現

查這條 `changeset-release/main` branch 上的 workflow run 歷史，2026-07-20 到 07-23 的
5 次觸發全部是 `action_required`、0 個 job、0 秒完成——workflow 排進去了，但卡在「需要
人工在 GitHub UI 核准才能執行」這一關，從沒真的跑起來過。GitHub 不會主動通知這種狀態，
只有點進 Actions tab 才看得到，所以沒人發現。

用 `gh api -X POST .../actions/runs/<id>/approve` 核准後，workflow 立刻開始執行，證實
根因就是這道核准關卡，不是更深層的基礎設施問題。

### 2.2 `packages/e2e-kit` 一處 Biome 格式漂移

核准後 CI 第一步 `pnpm lint` 就失敗——`packages/e2e-kit/src/specs/m2m-api-key.spec.ts`
一行三元/nullish-coalescing 運算式超出 Biome 的行寬限制。查證這個問題**在 `main` 上從
2026-07-23（commit `f30846d`）就已經存在**，`main` 的 CI 那次 push 本身也是失敗的——同樣
沒人發現，因為這個 workflow run 沒有被任何核准關卡卡住，是自由跑的，紅了一整天照樣沒人看。

這證明問題的本質不是 2.1 那道核准關卡，而是**完全沒有「壞了會被看見」的機制**——即使核准
關卡不存在，main 的 CI 照樣可以紅一整天沒人知道。

修法：`pnpm biome check --write` 自動修正，commit `17b27ff`。

### 2.3 CI 的 `--filter "...[origin/main]"` 沒把 devDependencies 依賴算進建置範圍

修完 2.2 後，PR #5 的 CI 又在 `build` 步驟失敗：

```
Scope: 7 of 13 workspace projects
. build$ pnpm -r run build
packages/auth build$ tsc -p tsconfig.build.json
. build: Scope: 12 of 13 workspace projects
. build: packages/common build$ tsc -p tsconfig.build.json
##[error]packages/auth build: Cannot find module '@appspine/common'
```

本機重現：`pnpm --filter "...[origin/main]" list` 在這條 PR branch 上選出的範圍是 7 個
套件（root `appspine` + 6 個真的改版的套件），**`@appspine/common`／`@appspine/audit-log`
沒被選進去**——即使 `packages/auth` 透過 `devDependencies`（`workspace:*`）依賴它們。
`pnpm --filter "...[ref]"` 的「順帶抓依賴套件」機制沒有把只宣告在 `devDependencies`（而非
`dependencies`）的工作區依賴算進去；`auth` 對 `common`／`audit-log` 採
peerDependencies + devDependencies 的宣告方式是刻意設計（見
`Z05-template-common-singleton-override.md`，避免 consuming app 跟這個套件各自打包一份
class），不建議為了配合 filter 改動這個宣告方式。

額外疊加的問題：這次篩選範圍剛好也選中了 root 套件 `.` 本身，而 root 的 `build` script
定義就是 `pnpm -r run build`——外層被篩選過的流程執行到 root 的 script 時，等於在裡面
又觸發一個完全獨立、未過濾、沒跟外層協調的第二個 `pnpm -r run build`，兩邊各自並行建置，
才會撞出 `auth` 先跑贏 `common` 的 race。

驗證：改用完整、不加 filter 的 `pnpm -r run build`（`push` 情境本來就是這樣寫），本機
13 個套件、84 秒內正確依序建置完成，`common` 確實在 `auth` 之前完成。

修法：`.github/workflows/ci.yml` 的 `pull_request` 情境改成跟 `push` 情境一樣，一律跑
完整、不加 filter 的 `pnpm -r run build/typecheck/test`，commit `7e58f22`。理由：整個
workspace 只有 13 個套件，「省下來的 CI 時間」遠不值得換來這種依賴關係辨識不到的隱性風險。

## 3. 最終驗證：PR #5 完整走完自動化流程

修完 2.2、2.3 後重新核准 PR #5 的 CI，全綠、`mergeStateStatus: CLEAN`。合併後
`Release` workflow 自動觸發 `changeset publish`，**六個套件一次全部發布成功**（沒有
Z07/Z21 那種「只發改動的那個、漏發連動套件」的問題，因為這次是全自動跑完全程，不是人工
繞過）：

| 套件 | 版本 |
|---|---|
| `@appspine/auth` | 3.1.0 |
| `@appspine/domain-events` | 2.0.0 |
| `@appspine/m2m-api-key` | 3.0.1 |
| `@appspine/mcp-server` | 0.5.5 |
| `@appspine/metadata-schema` | 0.2.10 |
| `@appspine/rbac` | 3.0.1 |

這證實 Z21 §8 記錄的「org 層級允許 GitHub Actions 建 PR」修復確實有效——自動建 PR、
自動 `changeset publish` 兩段都在無人工介入的情況下跑完。

## 4. 新增機制：`release-health-check.yml`

跟 Z07/Z21 不同，這次不是只留一份事後記錄。§2.1／§2.2 的共通根因是「完全沒有『壞了會被
看見』的機制」——就算修好 2.1 的核准關卡，2.2 證明 main 的 CI 照樣可以紅一整天沒人發現，
需要的是通用的監控層，不是針對某一個關卡的局部修法。

新增 `.github/workflows/release-health-check.yml`，每天 01:00 UTC（台北 09:00）跑一次，
加 `workflow_dispatch` 可手動觸發，檢查三件事：

1. 過去 7 天內有沒有 workflow run 卡在 `action_required`。
2. `main` 最新一次 CI 是不是失敗的。
3. 有沒有「Version Packages」PR 開超過 3 天還沒合併。

任一項中，開一張 GitHub Issue（標題固定，重複觸發時用 comment 更新同一張，不會洗版）；
全部正常時，若先前開過的 issue 還在 open，自動關閉並留言。選用 GitHub Issue 而非讓
workflow 自己顯示紅色，是因為 Actions tab 正是這次沒人看的地方，issue 會進 repo 通知，
比較有機會被看到。

**已手動觸發驗證過整條鏈路**：第一次觸發因為漏加 `pull-requests: read` 權限（`pulls.list`
回 403 `Resource not accessible by integration`）失敗，補上權限（commit `9bf175c`）後
再次觸發，正確抓到當天真實發生過的 `action_required` 事件並開出
[Issue #6](https://github.com/appspine/appspine-packages/issues/6)，確認整條鏈路（排程觸發 →
檢查 → 開 issue）是通的；該 issue 內容是測試期間的歷史紀錄（PR #5 已合併完成），已手動
關閉並註明原因。

## 5. 後續提醒

- 若之後有人想重新加 `--filter` 之類的 CI 範圍優化，**先重新驗證 devDependencies 依賴
  有沒有被正確包含進去**，不要假設這個 gap 已經被永久解決——workspace 目前只有 13 個
  套件，完整建置的時間成本很低，多數情況下不值得為了省這點時間重新冒這個風險。
- `release-health-check.yml` 目前只開 GitHub Issue，沒有接 Slack/email 之類即時通知。
  如果之後有更即時的通知管道，可以直接在同一個腳本裡換掉/加碼 issue-open 那一步，不用
  重新設計檢查邏輯。

