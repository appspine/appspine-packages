---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL2-04 — `appspine.plugin-lock.json`

> Task：`PL2-04`（見 [051 拆解 §6](../decisions/051-plugin-platform-engineering-task-breakdown.md#6-phase-2--clilockfileprismapermission-與-preset)）。
> 依賴：[PL2-02](051-pl2-02-cli-commands.md)、[PL2-03](051-pl2-03-build-doctor.md)、PL1-05（resolver）。
> Changeset：`.changeset/051-phase2-plugin-lockfile.md`。

---

## 1. 「derived 且 committed」決定了其餘一切

lockfile 同時具備兩個性質，而這兩個性質決定了它的所有設計：

- **derived**——由 `appspine build` 重新產生，不是手改的，因此 `build --check` 可以斷言它是最新的。
- **committed**——人會把它當 diff 讀。所以它排序、canonical 格式化，而且**能少寫就少寫**。

因此它記錄的是解算的**結果**：registration order、capability graph、每個 instance 的依賴，
以及每個 package 的 version、manifest digest、Prisma fragment digest。

## 2. 它刻意不記什麼

| 不記 | 為什麼 |
|---|---|
| tarball resolution 與 integrity | `pnpm-lock.yaml` 擁有這些。複製一份就是第二個會安靜過期的真相來源，兩者最終會對「到底裝了哪些 bytes」給出不同答案，而且沒有任何東西能說哪一邊對 |
| 任何 secret 或環境變數的值 | env key 只記**名字**與 required／secret 旗標。這個檔案會被 commit、會被貼進 ticket |
| resolver 自己能重推的東西 | 記結果，讓 CI 能用「重新解算一次」去比對「被 review 過的那份」 |

「不記 integrity」這條由**結構**測試守住而不是文字搜尋：斷言每個 package entry 的 key 集合恰好是六個。
一開始寫成 `expect(raw).not.toContain('integrity')` 時測試紅了——因為檔案裡的 `note` 正好在說明
「resolution 與 integrity 在 pnpm-lock.yaml，不在這裡」。**一個會因為自己的說明而失敗的測試，沒人會信任它。**

## 3. 兩份 lockfile 必須一起讀

計畫 §7：「CI 必須同時比對兩個 lockfiles，避免 package 升級後 plugin resolution 沒有重建。」

這是本 task 最重要的一條。透過 pnpm 升級 `@appspine/audit-log` 但沒有重跑 `appspine build`，
留下的 plugin lock 描述的是**上一版**的 capability graph——App 會在一個沒人 review 過的圖上開機。

drift 分開命名，因為修法不同：

| code | 意義 | 修法 |
|---|---|---|
| `plugin-lock-missing` | 沒有 lock | 跑 build 並 commit |
| `plugin-lock-version-drift` | 裝的版本 ≠ lock 記的版本 | package manager 跑過但沒 rebuild |
| `plugin-lock-manifest-tampered` | **同一版本**但 manifest digest 不同 | 安裝好的 package 被就地修改過 |
| `plugin-lock-schema-drift` | package 的 Prisma fragment 變了 | 同上 |
| `plugin-lock-resolution-drift` | 解算出的圖不同 | inventory 變了 |
| `plugin-lock-package-added`／`-removed` | package 進出 inventory | 跑 build |
| `plugin-lock-artifact-drift` | 現在會產生的 artefact digest ≠ lock 記的 | 跑 build |

### 3.1 tamper 不是「跑一下 build 就好」

`doctor` 把上表除了 `plugin-lock-manifest-tampered` 以外的全部視為 **rebuildable**，回
`DRIFT_DETECTED`；tampered 走 `RESOLUTION_FAILED`。理由：同版本卻換了 manifest 的 package 不是
過期，是被動過手腳，叫操作者去 rebuild 等於直接把它蓋掉。這條有測試。

### 3.2 「檔案被手改」與「lock 過期」是兩件事

手改 `.appspine/generated/catalog.json` 由 artefact 比對抓到（`artifact-stale`），此時 **lock 仍然
內部一致**，所以 lock 那邊保持沉默。反過來，改了 inventory 之後 lock 記的 artefact digest 就不再等於
現在會產生的，`plugin-lock-artifact-drift` 才會響。兩者有各自的擁有者，混在一起會讓每次 artefact
編輯都看起來像 lockfile 問題。這一組對照有專門的測試。

## 4. `build` 一次帶起兩種 derived state

`.appspine/generated/*` 是沒人讀的可重生輸出；`appspine.plugin-lock.json` 是 committed 且被當 diff 讀的。
兩者由**同一組輸入**推導，所以由同一個指令維護——只更新其中一個的 repo，是一個「lock 描述的圖 ≠ App
實際跑的圖」的 repo。

lock 記錄的 artefact digest 直接取自**當次產生的 artefact 物件**，不是第二次產生的結果；否則兩次產生
之間的任何不確定性都會變成假 drift。

## 5. 驗證

```bash
pnpm --filter @appspine/plugin-cli test   # 101 tests（PL2-04 新增 16）
```

涵蓋拆解點名的每一項：亂序輸入 deterministic（兩種 inventory 順序產生 byte 相同的 lock）、
tamper detection（同版本改 manifest／改 Prisma fragment）、multi-instance isolation
（`appspine.master-data-client#hr` 與裸名各自正確、一個 package 只出現一次）、
pnpm lock 與 plugin lock 的責任分工。preset 展開待 PL2-08。

## 6. 已知限制

- `permissionDigest` 一律是 `null`，permission facet 由 PL2-07 擁有。**記成 null 而不是省略欄位**，
  這樣之後補上時是每份 lock 都看得到的變更，而不是一個沒人注意到的新 key。
- preset 展開後的 lock 表示法待 PL2-08。
- lock 不含 generated composition 的內容（PL2-05），只含它的 digest。
- 沒有 `--frozen-lockfile` 等價選項；CI 用 `appspine build --check`。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL2-04 |
| Actual agent | Claude Opus 5（拆解建議 Terra xhigh 實作 + Sol max 審 canonicalization／security；本 session 無該 provider，屬 §11 替代） |
| Required class | G2（canonicalization／security 部分為 G3） |
| Substitution reason | 本 session 無獨立 Terra／Sol provider |
| Independent reviewer | **尚未執行**——Gate G2 才驗收 |
| Branch | `051-pl2-04-plugin-lockfile` |
| Commit | `6339d8a` |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node |
| Evidence | §5；`packages/plugin-cli/src/lockfile.spec.ts` |
| 已知風險 | §6 |
| Rollback | 刪除 `packages/plugin-cli/src/lockfile.ts`、`src/lockfile.spec.ts`、`.changeset/051-phase2-plugin-lockfile.md`、本文件；還原 `src/commands/build.ts`、`src/commands/doctor.ts`、`src/manifest-source.ts` 的 `packageDirs`、`src/index.ts` |
