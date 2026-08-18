---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL2-06 — Prisma owns/augments composer

> Task：`PL2-06`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL0-06](051-pl0-prisma-permission-fixtures.md)、[PL2-04](051-pl2-04-plugin-lockfile.md)。
> Changeset：`.changeset/051-phase2-prisma-composer.md`。

---

## 1. 它解決的是 Prisma 沒有語法可表達的問題

一個 model 只有**一個**擁有 package，但一段 relation 需要**兩邊都有欄位**——所以 `rbac` 需要
`userRoles UserRole[]` 出現在 `identity-core` 的 `User` 裡面。

只有兩條路：identity-core 為一個它不該依賴的 optional plugin 宣告欄位，或是有人在組裝時把那個欄位寫進去。
這個 composer 就是後者。

## 2. 規則來自 PL0-06，不是這裡新發明的

`fixtures/051-prisma-permission/prisma/` 與 `scripts/051-pl0-prisma-composer-check.mjs` 在任何 composer
存在之前就凍結了規則。`prisma-composer.spec.ts` **直接把那些 fixture 餵進真的實作**，而不是在測試裡重述
它們的期望——重述會讓兩邊各自漂移。

沿用的凍結項目：

- `owner-collision`：兩個 plugin 都宣稱擁有同一個 model → 失敗，**永遠不自己挑一個**。
- `missing-augmentation-target`：augment 一個沒人擁有的 model → 立刻失敗，不靜默丟棄。
  丟棄的結果是缺一個 relation 欄位，Prisma 會在很後面回報一個看起來不相干的錯。
- canonical 排序 tuple 是 `(targetModel, field, plugin, type)`。把前兩者串成一個 key 會讓
  `A`/`bc` 與 `Ab`/`c` 都變成 `Abc`——那正是凍結的 `ambiguous-augmentation-sort-key` fixture 存在的理由。

## 3. manifest 的 `prisma` facet 被收緊

PL0-05 把 `prisma` 留成 `{"type":"object"}` 並指名 PL2-06 為擁有者——與 `backend`／`operations` 交給
PL1-06 是同一種交接。本 task 完成這次交接。

augment 的形狀是 `{targetModel, field, owner}` **加上 optional 的 `type`**。之所以 optional，是因為
PL0-05 凍結的 `rbac-full-facets` fixture 就是前三個欄位、沒有 `type`；收緊後的 schema 必須讓那個 fixture
繼續有效。但 composer 沒有 `type` 就寫不出欄位，所以它**以 `augmentation-without-type` 明確報出來**，
而不是讓 schema 去拒絕一個凍結 fixture。這個取捨在 `schema.spec.ts` 裡有註解說明。

## 4. composer 自己新增的三條規則

| code | 情況 | severity |
|---|---|---|
| `augmentation-owner-mismatch` | augment 宣告的 `owner` 與實際擁有者不同 | error |
| `enum-owner-collision` | 兩個 plugin 都擁有同一個 enum | error |
| `undeclared-augmentation` | 擁有者的 `augmentedBy` 沒列出這個 augmenter | **warning** |

最後一條刻意是 warning：擁有者的 `augmentedBy` 是文件，值得在進 schema 前被看見，但不值得擋下來。

## 5. 欄位怎麼寫進別人的 model

`injectAugmentations()` 是**逐行**的：找到 `model X {`、找到對應的 `}`，插入點取「閉括號之前最後一行
非空白、非 `@@` 開頭的行」——這樣欄位會落在其他欄位之間，而不是掉在 `@@map` 後面。

刻意不引入完整的 Prisma parser：為了「找到 `model X {` 與它的閉括號」而多一個大型依賴不划算。這個取捨的
代價（不支援註解內的假 model 宣告之類的邊界）記在已知限制。

## 6. `build` 先組再寫

`build` 會先跑 `compose()`，組不起來就**在寫任何檔案之前**回 `RESOLUTION_FAILED`。輸出一份缺 relation
欄位的 schema，失敗會發生在很後面的 Prisma 內部，看起來與造成它的 plugin 無關。

實測時發現：兩個 plugin 都擁有 `User` 這種情況，**resolver 比 composer 更早擋下來**
（PL1-05 的 `duplicate-prisma-model`）。兩層都對，測試斷言的是「什麼都沒被寫出來」而不是「哪一層先說不」。

## 7. 產生的 schema 不含 datasource／generator

那是**部署設定**，不是 plugin 貢獻，留在 App 自己的 schema 裡。產生的檔案含 `DO NOT EDIT` 標頭、
`sourceDigest`、`schemaDigest`，以及一句明白話：**這裡沒有任何東西被套用到任何資料庫**
（拆解 §2.3：安裝或啟用 plugin 不得碰資料庫）。

`build` 另外回報 `migrationPlan`——models／enums／augmentations／digest——那是 migration planner 需要的
輸入，但本 task **不產生也不執行 migration**。

## 8. 驗證

```bash
pnpm --filter @appspine/plugin-cli test   # 133 tests（PL2-06 新增 18）
pnpm --filter @appspine/plugin-api test   # 106 tests（schema 收緊）
```

涵蓋拆解點名的每一項：identity/RBAC/API-key fixture、duplicate table、missing target、
randomized order（正反順序診斷相同）、byte 穩定且與 inventory 順序無關、不自動套用 migration。

## 9. 已知限制

- **沒有跑過 `prisma validate` 或 `prisma format`。** 拆解的驗收有列這一項，本 task 沒做到：那需要在
  測試裡起 Prisma CLI。真正的驗證會在 PL2-09 的 template 遷移發生，
  那裡本來就有 Prisma。在那之前，schema 的語法正確性只由 fragment 本身與插入點邏輯間接保證。
- `injectAugmentations` 是逐行掃描，不是 Prisma parser。註解裡出現 `model X {` 之類的情況會誤判。
- upgrade／downgrade／remove 的 migration 情境（拆解驗收的一項）目前只以 `migrationPlan` 的輸入形式
  存在，沒有實際的 plan 產生器——那是 PL5 rollout 的範圍。
- `ownsEnums` 只做擁有權衝突檢查，enum 本身仍由 fragment 文字帶進來。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-06 |
| Actual agent | Claude Opus 5（拆解建議 Terra xhigh 實作 + Sol max 審 schema／migration；本 session 無該 provider，屬 §11 替代） |
| Required class | G2（schema／migration 部分為 G3） |
| Substitution reason | 本 session 無獨立 Terra／Sol provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-06-prisma-composer` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §8；`packages/plugin-cli/src/prisma-composer.spec.ts`、`packages/plugin-api/src/schema.spec.ts` |
| 已知風險 | §9，尤其第一項 |
| Rollback | 刪除 `packages/plugin-cli/src/prisma-composer.ts`、`src/prisma-composer.spec.ts`、`.changeset/051-phase2-prisma-composer.md`、本文件；還原 `packages/plugin-api/src/schema/appspine.plugin.v1.json` 的 prisma facet 與 `schema.spec.ts`、`plugin-cli` 的 `generators.ts`／`commands/build.ts`／`index.ts` |
