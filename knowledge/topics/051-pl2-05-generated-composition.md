---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL2-05 — generated Nest composition

> Task：`PL2-05`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL2-03](051-pl2-03-build-doctor.md)、[PL2-04](051-pl2-04-plugin-lockfile.md)。
> Changeset：`.changeset/051-phase2-generated-composition.md`。

---

## 1. 這個 generator 只為一件事存在：static import

051 計畫 §6.4 與 §9 都禁止在執行期以 package name 解析模組。理由不是風格：**dynamic import 對
bundler、對 TypeScript、對 dependency scanner 都是隱形的**——而這三個讀者正是這個檔案存在的理由。

因此 `.appspine/generated/backend/composition.ts` 裡每個 plugin 都是一行真正的 `import`：

```ts
import { auditLogPlugin as auditLogPlugin_0 } from '@appspine/audit-log/plugin';
```

依解算出的 registration order 排列、依 package 去重（multi-instance plugin 是**一個 import、多個
entry**）。測試直接斷言檔案裡沒有 `import(` 也沒有 `require(`。

## 2. 為什麼產生 TypeScript 而不是 JSON

因為 App 會**編譯**它。export 名稱寫錯會在 build 時大聲失敗，而不是等到開機。

PL1-03 早就把 `GeneratedComposition` 這個型別凍結在 `plugin-host-nest/src/config/composition.ts`，
所以 host 從 Phase 1 起就有一個能用的 consumer，這個 generator 只是補上另一端。

## 3. export 名稱是慣例，所以必須有人強制它

`health-check` → `healthCheckPlugin`。慣例的可靠度等於它的強制力，因此
`051-pl1-architecture-check.mjs` 新增一條規則：**每個有 manifest 的 package 都必須從 `./plugin`
export 這個名字**（self-test 15 個）。

沒有這條規則，這裡就只是一個猜測，而且會在幾天後某個 consumer 的 build 裡爆掉，離弄壞它的 package
很遠。加上之後，違規在**它自己的 package** 就失敗。

現有四個 plugin package 都已符合（`healthCheckPlugin`、`auditLogPlugin`、`identityCorePlugin`、
`oidcAuthPlugin`），所以這條規則是把既成事實變成契約，不是新增負擔。

## 4. 停用的 plugin：不 import，但仍在 inventory 裡

被 disable 的 plugin **不會**出現在 import 清單（否則它仍會進 bundle），但**會**留在檔案內嵌的
inventory 裡，這樣 host 的 catalog 仍能把它報成 `disabled`。兩者都有測試。

## 5. 產生器註冊表搬到 `generators.ts`

`composition.ts` 需要 `generate.ts` 的 `sourceDigest`；如果註冊表也放在 `generate.ts`，兩個模組就互相
import，形成 cycle。最初的修法是在 `generateAll` 內用 `require()` 延遲載入——但那會違反本 package
「原始碼裡不得出現 `require(`」的測試，而那條測試本身是正確的。

正解是把註冊表抽成獨立的 `generators.ts`：它 import 兩邊，兩邊都不 import 它。PL2-06／PL2-07 各加一行。

## 6. 順帶抓到的第三個 import-scan 偽陽性

PL0 的 build-graph checker 對 `@appspine/plugin-cli` 報「import 了 `@appspine/plugin-host-nest`、
`@appspine/audit-log`、`@appspine/oidc-auth`、`@appspine/health-check` 卻沒宣告」。

全部來自**字串**：composition generator 把 `import type { GeneratedComposition } from
'@appspine/plugin-host-nest';` 當文字**產生出來**，而 spec 用 `toContain("from
'@appspine/audit-log/plugin';")` 斷言產出內容。這些都不是依賴。

PL0 的 `IMPORT_PATTERN` 原本是無錨點的 `/from\s+['"]@appspine\/…/`——會匹配檔案裡任何位置的那串文字。
改成與 PL1 checker 相同的形狀：錨定在**真的以 `import`／`export` 開頭的行**，並以第一個分號為界。

這是同一類問題的第三次（Gate G1 的 identity-core 註解、PL2-02 的 `from "added"` 註解、現在的字串常數）。
共同的教訓：**原文掃描必須先排除註解與字串，或錨定到語法位置**，否則規則遲早會把描述它的文字當成違規。

## 7. 驗證

```bash
pnpm --filter @appspine/plugin-cli test   # 115 tests（PL2-05 新增 14）
node scripts/051-pl1-architecture-check.mjs --self-test   # 15 self-tests
```

涵蓋：靜態 import（含「沒有 `import(`／`require(`」的正面斷言）、resolved order、multi-instance 去重、
byte 穩定且與 inventory 順序無關、**只改 inventory 就能重建**（PL2-05 的驗收條件）、
disabled plugin 的兩面行為、composition 被 lockfile digest 且被 drift check 覆蓋。

## 8. 已知限制

- **本 task 沒有真的編譯過產生出來的檔案。** 型別正確性目前只由 `GeneratedComposition` 的凍結型別與
  architecture checker 的 export 名稱規則間接保證。真正的
  「Nest build／bootstrap 與 catalog 一致」驗證屬於 [PL2-09](../decisions/051-plugin-platform-engineering-task-breakdown.md)
  （template 雙模式）與 PL2-10（clean-fork CI gate）。這是相對拆解驗收條件的一項**未完成**，
  在那兩個 task 補齊前不應視為已證明。
- 只產生 backend composition。frontend 的產生物屬 Phase 3。
- `compositionPreflight` 目前只回報「沒有 backend facet」的 info；facet 對 `exports` 是否發布由
  architecture checker 擋。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-05 |
| Actual agent | Claude Opus 5（拆解建議 Terra xhigh + Sol review lifecycle；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Sol provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-05-generated-composition` |
| Commit | `63eb0cc` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §7；`packages/plugin-cli/src/composition.spec.ts` |
| 已知風險 | §8，尤其第一項 |
| Rollback | 刪除 `packages/plugin-cli/src/composition.ts`、`src/composition.spec.ts`、`src/generators.ts`、`.changeset/051-phase2-generated-composition.md`、本文件；還原 `src/generate.ts` 的 `GENERATORS`、`src/commands/build.ts`、`src/commands/doctor.ts`、`src/index.ts`、`scripts/051-pl1-architecture-check.mjs` 的 descriptor-export 規則、兩支 PL0 腳本的 `IMPORT_PATTERN` |
