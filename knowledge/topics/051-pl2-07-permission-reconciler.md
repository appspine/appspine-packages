---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL2-07 — permission reconciler

> Task：`PL2-07`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL0-06](051-pl0-prisma-permission-fixtures.md)、[PL2-04](051-pl2-04-plugin-lockfile.md)。
> Changeset：`.changeset/051-phase2-permission-reconciler.md`。

---

## 1. 兩個性質決定其餘一切

**permission ID 不可變。** role、audit 紀錄、客戶自己寫的 policy 全都引用它。所以「改名」不是編輯，
是「新 ID + 從舊 ID 來的 alias」。

**永遠不刪。** 離開 desired state 的 permission 是 **retire**，不是 delete——這樣每一筆歷史授權與 audit
列都還能被解讀。這與 051 決策 13 對 Prisma 資料的立場一致：移除 plugin 不移除它記錄過的東西。

## 2. 規則來自 PL0-06

`permission-reconciler.spec.ts` 直接把凍結 fixture 餵進實作：

- `scenarios/add-rename-retire.json`：五種 op code（`no-op`／`update-display`／`add`／`alias`／`retire`）
  一次到齊，並斷言 **`delete` 與 `drop-table` 永遠不出現**。
- 三個 negative：alias 指向不存在的目標、對更新的狀態套用更舊的 plan（downgrade）、重複 ID。

`alias-target-not-found` 特別值得說：一個「看起來合理但指向不存在目標」的 alias 是最糟的結果——它會乾淨地
套用成功，然後舊 ID 上的每一筆既有授權**安靜地不再解析**。

## 3. 出錯就完全不給 plan

任何 error 都會讓 reconciler 回傳 **`plan: null`**，而不是它已經算出來的那部分 op。

半成品 plan 比沒有 plan 更糟：操作者看到一份**看起來完整**的變更清單，然後把它套用下去。

## 4. manifest 的 `permissions` facet 被收緊

PL0-05 指名 PL2-07 為擁有者。一筆 entry 可以是：

- **裸 ID 字串**——凍結 fixture `rbac-full-facets` 用的形狀，displayName 預設等於 ID（不由 plugin 自行
  發明一個名字，這樣差異在 review plan 時仍然看得見）；或
- **物件**——帶 `displayName`／`status`／`aliasOf`／`frontendOnly`。

`frontendOnly` 是 **UI 的可見性提示，不是授權判斷**。它仍然是一筆真正的 permission、仍然在 plan 裡；
這個欄位只說它顯示在哪裡。

ID 由 schema pattern 強制 `<plugin>:<resource>:<action>`，而 reconciler 另外檢查
**declaring plugin 不得在別人的命名空間宣告 permission**（`permission-outside-namespace`）——
schema 擋不到那個，因為它不知道是誰在宣告。

## 5. 產生物只含「全新安裝」的 plan

`.appspine/generated/permissions.json` 記錄 desired state 與**對空的 current state** 算出來的 plan。

空的是刻意的：真正的 current state 在 App 的資料庫裡，去讀它會讓一個 build-time generator 依賴一個
正在跑的部署。發布出去的是「plugin 宣告了什麼」加上「全新安裝需要哪些 op」；apply adapter 在真的能看到
現況的時候才做真正的 reconcile。**這個工具從不讀寫 App 資料庫**，檔案裡就這麼寫著，並有測試斷言那句話在。

## 6. 驗證

```bash
pnpm --filter @appspine/plugin-cli test   # 148 tests（PL2-07 新增 15）
pnpm --filter @appspine/plugin-api test   # 107 tests
```

涵蓋拆解點名的每一項：rename without alias（改 displayName 走 `update-display`、ID 不動）、
remove in-use（→ retire，永不 delete）、downgrade newer state、重複 ID、frontend-only visibility。
另加：非 namespaced ID、self-alias、已 retired 的不再動、順序無關（正反順序同一個 digest）。

## 7. 已知限制

- **apply adapter 尚未存在。** 本 task 只交付 plan 與邊界；真正把 plan 套到資料庫的實作屬 Phase 4／PL5，
  拆解對 PL2-07 的驗收提到「apply adapter boundary 與 audit result」——邊界有了（產生物明說自己不碰資料庫），
  **audit result 還沒有**，因為還沒有 apply。這是相對驗收條件的一項未完成。
- `schemaGeneration` 目前由呼叫者傳入；產生物固定用 1（全新安裝）。真正的 generation 由 apply adapter 管理。
- 沒有 `retire` 之後的清理策略（orphan policy）。拆解提到 orphan plan，目前只有 retire。
- 尚無任何真實 package 宣告 `permissions` facet；`rbac` 的 plugin 化在 Phase 4。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-07 |
| Actual agent | Claude Opus 5（拆解建議 Terra xhigh + Claude 審 permission semantics + Sol 審 destructive path；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Sol provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-07-permission-reconciler` |
| Commit | `8e67a05` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §6；`packages/plugin-cli/src/permission-reconciler.spec.ts` |
| 已知風險 | §7，尤其第一項 |
| Rollback | 刪除 `packages/plugin-cli/src/permission-reconciler.ts`、`src/permission-reconciler.spec.ts`、`.changeset/051-phase2-permission-reconciler.md`、本文件；還原 `packages/plugin-api` 的 permissions facet 與 `schema.spec.ts`、`plugin-cli` 的 `generators.ts`／`index.ts` |
