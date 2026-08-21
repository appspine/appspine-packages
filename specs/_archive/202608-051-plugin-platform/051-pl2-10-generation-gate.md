---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-19
updated: 2026-08-19
---

# 051 PL2-10 — deterministic generation 與 CI gate

> Task：`PL2-10`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL2-09](051-pl2-09-template-dual-mode.md)。
> Changeset：無發布面（repo 內部工具與 CI）。

---

## 1. Phase 2 宣稱的東西，這裡負責讓它可以被否證

Phase 2 每一個產生器都宣稱「確定性」與「可偵測 drift」。
`scripts/051-pl2-10-generation-gate.mjs` 是把那些宣稱變成可否證命題的東西：

1. 對一個 committed 的 fixture App 產生全部 artefact，與 **committed golden 逐位元比對**；
2. 在**另一個目錄**再產生一次並互相比對——確定性必須是「同樣輸入、同樣 bytes」，
   而不是「同一台機器、同一次執行」；
3. 把組出來的 schema 交給 **`prisma validate`**——這正是 [PL2-06](051-pl2-06-prisma-composer.md)
   記為未完成的那一項；
4. `--self-test`：**逐一把每個 artefact 弄壞，證明 gate 會抓到**。

第 4 點是重點。Gate G0 與 Gate G1 各自教過兩次同一件事：**沒人看過它失敗的檢查，就是沒人知道它會不會動
的檢查**。所以這支腳本自己帶 6 個變異案例：

| 變異 | 抓到 |
|---|---|
| 手改產生的 catalog | ✅ |
| 手改產生的 composition | ✅ |
| 改動已安裝 package 的 manifest | ✅ |
| 改動 plugin lockfile | ✅ |
| 改動已安裝 package 的 Prisma fragment | ✅ |
| 改動 inventory | ✅ |

## 2. fixture App 為什麼放在本 repo

`fixtures/051-pl2-generation/app/` 是一個完整的 App：backend facet 含 route 與 provider token、
兩個 Prisma owner 加一個跨 package 的 augmentation、permission 用了 schema 允許的三種形狀之一以上。

它**不在 template 裡**，因為 template 在 Phase 2 發布之前根本裝不起來（見
[PL2-09 §4](051-pl2-09-template-dual-mode.md)）。**一個要等它所守護的東西上線之後才能跑的 CI gate，
守護不了任何東西。**

`node_modules/@appspine/*` 是手寫的、不是裝出來的。每一個都附一個載入即 `throw` 的 `dist/plugin.js`，
所以 gate 的每一次執行都順帶重新證明一次：產生流程從不執行 plugin code。

## 3. golden 裡刻意被正規化掉的東西

CLI 會把自己的版本寫進每個 artefact。把那個釘進 golden，會讓 CLI 的每次發版都變成一次**沒有訊號的**
golden 更新。所以比對前正規化掉它——`build --check` 仍然覆蓋它，因為那邊比的是同一組輸入的同一次產生。

## 4. CI

```yaml
- name: Verify Phase 2 deterministic generation
  run: pnpm run verify:phase2       # = verify:generation && verify:snapshot
```

失敗時上傳 golden 目錄當 artifact：產生物的差異在 log 裡讀不了，在檔案裡一看就懂。

`pnpm verify:template-dual-mode`（PL2-09）**沒有**進 CI：它需要打包全部 20 個 package 並完整安裝一次
template，在 CI 上是分鐘級的成本，而且它驗的是跨 repo 整合，適合 PL5 rollout 前手動跑。這是一個
**刻意的覆蓋範圍缺口**，寫在這裡而不是讓它看起來像沒有缺口。

## 5. goldens 必須被排除在 formatter 之外

第一次跑完之後 gate 立刻紅了：`biome check --write` 把 fixture 的 manifest **重新排版**，
manifest bytes 變了 → digest 變了 → golden 過期。重新產生 golden 之後 lint 又紅了：
biome 這次要排版 **golden 本身**——而 golden 的定義就是「與產生器輸出逐位元相同」，被排版過就不再是了。

修法是在 `biome.json` 為 `fixtures/051-pl2-generation/**` 關掉 formatter／linter／assist。
產生物與它的期望值都不是原始碼，不該被排版工具碰。

## 6. Windows 的一個現實

`prisma validate` 之後立刻 `rmSync` 暫存目錄會 EPERM——Windows 會多握著檔案 handle 一下子。
清理不是這個 gate 要測的東西，所以改成重試後安靜放棄，而不是讓一次本來全綠的執行變紅。

## 7. 驗證

```bash
pnpm verify:phase2
node scripts/051-pl2-10-generation-gate.mjs --self-test   # 6 self-tests
```

拆解點名的每一項：生成後重跑零 diff（第二個獨立目錄）、故意改 generated file／manifest／lock／schema
時失敗（6 個 self-test）、Prisma validation、失敗診斷 artifact。

## 8. 已知限制

- **fresh checkout 沒有從 git clone 開始跑過。** fixture App 每次都是全新複製，所以不依賴任何開發機
  快取；但「從 clone 開始」這一步只有 CI 會真的做到。
- **`verify:template-dual-mode` 不在 CI**，理由見 §4。
- goldens 由 `--update` 產生。README 明寫「commit 之前先讀 diff——那個 diff 是產生物唯一會得到的
  review」，但沒有任何機制強制它。
- `prisma validate` 需要在腳本裡臨時補上 datasource／generator 區塊（產生的 schema 刻意不含它們，
  見 [PL2-06 §7](051-pl2-06-prisma-composer.md)）。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-10 |
| Actual agent | Claude Opus 5（拆解建議 Terra high + Luna 建 matrix + Gemini review；本 session 無該 provider，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Luna／Gemini provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-10-generation-gate` |
| Commit | `cab0d37` |
| Tools | repo read/write、pnpm、node、prisma CLI、biome |
| Evidence | §7；`fixtures/051-pl2-generation/golden/` |
| 已知風險 | §8 |
| Rollback | 刪除 `scripts/051-pl2-10-generation-gate.mjs`、`fixtures/051-pl2-generation/`、本文件；還原 root `package.json` 的 `verify:generation`／`verify:phase2`、`.github/workflows/ci.yml`、`biome.json` 的 override、`pnpm-workspace.yaml` 的 prisma allowBuilds 與 root devDependency |
