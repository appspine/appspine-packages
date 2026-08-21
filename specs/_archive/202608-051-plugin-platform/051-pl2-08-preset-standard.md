---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL2-08 — `@appspine/preset-standard` 與 preset 展開

> Task：`PL2-08`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL2-04](051-pl2-04-plugin-lockfile.md)～[PL2-07](051-pl2-07-permission-reconciler.md)。
> Changeset：`.changeset/051-phase2-preset-standard.md`。

---

## 1. preset 只是「一串 plugin 的簡寫」

展開之後，inventory 讀起來**與把那些 entry 逐條打出來完全一樣**；resolver、catalog、lockfile、host
沒有任何一個知道曾經有 preset 存在。

其餘所有設計都是在保護這一條。

## 2. catalog 與 lock 記的是解算出來的 plugin，不是 preset 名字

拆解的驗收寫得很直接：「preset 名稱不是唯一 catalog entry；resolved plugins/facets/versions/digests
全部可見」。

理由是 `standard@1.0.0` 這種寫法會把「這個 App 到底跑了什麼」藏在一個**意義會隨版本改變**的名字後面。
所以每一筆 entry 都完整記錄 package name／version／digest／provides／requires，preset 則以
`fromPreset` 記在**旁邊**當 provenance，另外在 `presets` 欄位記錄它貢獻了哪些 instance key。

## 3. 三條「不可以」

| 規則 | 為什麼 |
|---|---|
| preset **不能移除**任何 entry，只能貢獻 | 否則加一個 preset 就可能把 app-local plugin 吞掉 |
| App 明寫的 entry **覆蓋** preset 的，而且 CLI 會說出來（`preset-entry-overridden`） | 安靜的覆蓋，正是「App 跑的東西與它自己的檔案看起來不一樣」的成因 |
| 兩個 preset 貢獻同一個 instance → **直接拒絕**（`preset-overlap`） | 這不該由 CLI 用「誰先誰後」來決定，App 必須自己講清楚 |

preset 也**不宣告順序**。registration order 來自 resolver 的 capability graph；preset 若再暗示一套順序，
就是對同一個問題給出第二個、而且比較弱的答案。`preset.spec.ts` 直接斷言 preset 文件裡沒有 `order` 欄位。

## 4. preset 版本進 source digest

升級 preset 而 derived artefact 卻仍然「看起來是最新的」，等於它命名的那組 plugin 在底下換掉了而沒人知道。
所以 preset 的 package version 是 `sourceDigest` 的輸入之一——換版本會讓 `build --check` 直接 drift。

## 5. `add`／`remove` 編輯的是「寫下來的那份」，不是展開後的

`loadState()` 現在同時回傳 `inventory`（展開後，給下游用）與 `declared`（檔案原樣，給編輯用）。

如果 `add` 動的是展開結果，第一次 `add` 就會把 preset 的內容**凍結成一份拷貝**寫進
`appspine.plugins.json`，之後升級 preset 就什麼都不會變。這一條有專門的測試。

## 6. package 本身

`@appspine/preset-standard` 同時有 `appspine.preset.json`（CLI 不執行任何 code 就能讀）與
`src/index.ts` 裡的同名常數，由 `preset.spec.ts` 斷言兩者 deep-equal——與 plugin manifest 完全相同的
「強制重複」策略（見 [PL1 核心 §2](051-pl1-plugin-platform-core.md)）。

內容是 template 現在手工 import 的四個 Phase 1 試點：`health-check`、`audit-log`、`identity-core`、
`oidc-auth`（含 `oidc` configRef）。其餘標準 capability 在 Phase 4 遷移時加入。

## 7. 驗證

```bash
pnpm --filter @appspine/preset-standard test   # 6 tests
pnpm --filter @appspine/plugin-cli test        # 158 tests（PL2-08 新增 10）
```

涵蓋拆解點名的每一項，另加：preset 未安裝、schema 版本不支援、app-local plugin 不被吞、
preset 版本變動造成 drift、`add` 不把展開結果寫回檔案。

## 8. 已知限制

- preset 不能巢狀（preset 引用 preset）。目前沒有需求，加上去會讓 `preset-overlap` 的語意變複雜。
- preset 只列 plugin，不能帶 config 值——`configRef` 是引用，值仍在 App 的 `appspine.config.ts`。
- `preset-standard` 目前只含四個 Phase 1 試點；`rbac`／`m2m-api-key`／`notification` 等要等 Phase 4
  各自 plugin 化後才能進來。
- 沒有 `appspine.preset.json` 的 JSON Schema。plugin manifest 有，preset 目前只靠 TypeScript 型別與
  CLI 的 schemaVersion 檢查。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-08 |
| Actual agent | Claude Opus 5（拆解建議 Terra high + Claude review composition boundary；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-08-preset-standard` |
| Commit | `f0a789d` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §7；`packages/preset-standard/src/preset.spec.ts`、`packages/plugin-cli/src/preset.spec.ts` |
| 已知風險 | §8 |
| Rollback | 刪除 `packages/preset-standard`、`packages/plugin-cli/src/preset.ts`、`src/preset.spec.ts`、`.changeset/051-phase2-preset-standard.md`、本文件；還原 root `tsconfig.json` reference、`plugin-cli` 的 `inventory-file.ts`／`commands/shared.ts`／`commands/add.ts`／`commands/remove.ts`／`generate.ts`／`lockfile.ts`、`scripts/051-pl1-architecture-check.mjs` 的 `FOUNDATION_PACKAGES` |
