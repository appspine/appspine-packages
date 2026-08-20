---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 Gate G1 — 最小平台核心

> Gate：`G1`（見 [051 拆解 §5](../decisions/051-plugin-platform-engineering-task-breakdown.md#gate-g1--最小平台核心)）。
> 涵蓋：[PL1-01～06／11](051-pl1-plugin-platform-core.md)、[PL1-07／14](051-pl1-architecture-and-consumer-checks.md)、
> [PL1-08／09](051-pl1-pilot-plugins.md)、[PL1-10／12／13](051-pl1-identity-auth-split.md)。
> 執行證據：[PL1 執行紀錄](051-pl1-execution-log.md)。
> 依賴：[Gate G0](051-pl0-gate-g0.md)。

---

## 1. Agent 替代與 reviewer 獨立性

拆解 §5 對 G1 的建議 owner 是 Sol max（G3）＋Claude API review＋Gemini blind-spot audit。本 session
沒有接入 Sol／Gemini provider，全部 PL1-01～14 由 **Claude Opus 5** 在同一個 working tree 依序完成。

依 Gate G0 已建立的替代方式（見 [G0 §1](051-pl0-gate-g0.md)），獨立 review 由**一個完全獨立、沒有
先前對話上下文的 Claude Opus general-purpose agent** 擔任：它只看 repo 與最終產出，看不到 primary
agent 的推理過程。這**不是**拆解 §15.3 所稱的「不同 provider／model family」——兩者同屬 Claude 家族，
這是本 gate 相對理想狀態最大的一項落差，明確記錄於此以便後續校準。

同樣要記錄的偏離：拆解 §1.1 要求「一個 task 一個 branch／worktree、一個可 review 的 commit series」，
本次 14 個 task 全部在同一個 working tree 完成，於收尾時一次 commit。Phase 2 起應恢復逐 task 分離。

## 2. 獨立 Review 結果與修正

獨立 review（Claude Opus general-purpose agent，2026-08-18）結論：「Gate G1 不可關閉」，列出 **4 項
blocking、9 項 should-fix、9 項 minor**，並附 19 項「重新推導後確認無誤」。

reviewer 的方法值得記錄，因為它是這輪最有價值的部分：**主動把程式碼改壞再看測試會不會紅**。
Phase 0 的 review 抓到兩支「不可能為它宣稱的理由失敗」的腳本，這輪用同樣手法抓到第三個（見 S1）。
全部變異都已還原，reviewer 交付前以 `git status --short` 確認工作樹無淨變更。

**全部 4 項 blocking 與 9 項 should-fix 已處理**；9 項 minor 中 4 項已修、5 項記錄為已知限制。
其中 2 項（S5、minor 的 digest／configRef）重新推導後**不成立**，以證據記錄而非照單全收。

### 2.1 Blocking（4 項，全部已修）

| # | 發現 | 修正 |
|---|---|---|
| B1 | delegated JIT 建帳號完全失去 audit record。拆分前 `provisionOidcUser()` 會寫 `CREATE`；拆分後 `identityStore.create()` 整條鏈沒有任何 audit 寫入。這是「外部 App 憑 RFC 8693 token 在本系統建立帳號」的路徑，而且新舊 spec 都沒斷言過它 | `JwtVerifierService.provision()` 注入 `AUDIT_SINK` 並寫 CREATE（best-effort，與拆分前一致；互動式路徑才是 transactional）。新增 3 個測試：audit 有寫、audit 失敗仍可登入、並行首登不失敗。實測拿掉 audit 呼叫該測試會紅 |
| B2 | `fixtures/051-pl0-baseline/snapshot.json`（PL0 凍結基線）在 Phase 1 被就地覆寫成 post-split 內容，PL1-13 的驗收失去比對基準；且覆寫後又 drift，`verify:snapshot` 是紅的 | 由 HEAD 的 git worktree 重新產生 pre-split snapshot——**101265 bytes，與 G0 紀錄完全相同**，等於原檔逐位元還原。generator 新增 `--baseline`，並**拒絕**覆寫 PL0 基線；phase 各自寫自己的（`fixtures/051-pl1-baseline/snapshot.json`），`verify:snapshot` 改為檢查後者。`facade.spec.ts` 新增兩個測試讓凍結基線重新變成 load-bearing，含一個「基線若又被 post-split 內容覆寫就紅」的 canary |
| B3 | `ApiKeyGuard` 新增非 `@Optional()` 的 `RBAC_POLICY` 注入，`m2m-api-key` 卻沒宣告 `@appspine/rbac`，且 changeset 標 `patch`。沒裝 RBAC 的 App 會在 bootstrap 直接失敗 | 改為 `@Optional()` + **fail-closed**：沒有 policy provider 時 guard 直接拒絕請求並記 error，App 照常啟動、其他驗證路徑不受影響、也不會發出權限空白的 principal。`@appspine/rbac` 補進 `peerDependencies` 並標 `peerDependenciesMeta.optional`。`auth`／`rbac`／`m2m-api-key`／`mcp-server` 四個 changeset 全改 `major`（各自新增了 required peer） |
| B4 | 「`user.prisma` byte-identical 所以沒有 App 需要 migration」是錯的：`AuthModule` 現在 compose `OidcAuthModule`，每次 OIDC 登入都讀 `oidcIdentity`，只升級 `@appspine/auth` 而沒建表的 App 第一次登入就全站中斷 | 改寫 changeset 與 [identity 拆分文件](051-pl1-identity-auth-split.md) §4；新增 `packages/oidc-auth/prisma/migrations/README.md`，含 SQL、rollout 順序（先 migration 後部署）、rollback 與 backfill 說明。拆解 §2.3 禁止的是**套用** migration，不是產生它 |

### 2.2 Should-fix（9 項，全部已處理）

| # | 發現 | 處理 |
|---|---|---|
| S1 | resolver 確定性的兩個機制**各自單獨拿掉，104 個測試全綠**——當時沒有任何測試在保護個別機制 | 新增 `orders by instance key, not by the inventory sort key`：用唯一一組兩者會給出不同答案的輸入（instanceId 排在 `default` 之前的 multi-instance），把 frontier 排序釘成權威。實測拿掉它會紅。inventory 預排序保留為 defence-in-depth，程式碼註解與文件都改成如實描述，不再宣稱「兩者都有測試」 |
| S2 | `undeclared-dependency` 把 devDependencies 當合法宣告：從 `src/index.ts` import 只在 devDependencies 的 `vitest`，checker 完全放行 | shipped source 只接受 `dependencies`／`peerDependencies`／`optionalDependencies`；devDependencies 僅在 `*.spec.ts`／`test-support.ts` 放行。錯誤訊息區分兩種情形 |
| S3 | `--self-test` 只覆蓋 7 條規則，文件卻宣稱「為每條規則」；其中 `undeclared-capability-requirement` 在現有 workspace **結構上不可能觸發** | self-test 從 7 個擴充到 **13 個**，補上 devDependency、facet export、prisma fragment 與 capability requirement，並新增 self-test 框架原本沒有的**負向案例**（`expect: null`，規則必須保持沉默）——否則「把規則收緊到什麼都會觸發」會看起來像進步 |
| S4 | `createUserSchema` 靜默移除 `password`：zod 預設 strip unknown key，既有 consumer 送密碼會被無聲丟棄 | 把欄位加回 schema 並**明確拒絕**（`z.never()` + 指向 051 決策 7 的訊息）。新增測試斷言拒絕成立、且錯誤訊息不回顯送來的值。identity-core 的 source-text ban 同步改為 per-file，允許這一處宣告、禁止其他任何檔案提及 |
| S5 | 「`RoleWithPermissions` 收窄成 `RoleGrant`，新增必填 `id`／`displayName`」 | **不成立**：`RoleGrant` 的 `id` 與 `displayName` 都是 optional。以 `tsc --strict` 實測舊形狀與新型別**雙向可賦值**，不是 breaking type change。changeset 的相關敘述已移除；四個 package 仍為 major，理由是 required peer（B3），與此無關 |
| S6 | audit 短暫失敗會讓 JIT 帳號永久誤標 `linkedFromLegacyEmail = true`——而那正是營運用來判斷「何時能關掉 email fallback」的指標 | 建帳號、mapping、audit 收進**同一個 transaction**。`IdentityStorePort.create` 新增 optional `transaction` 參數（與 `AuditSinkPort.record` 同契約），`UsersService.create` 支援外部 transaction。測試 fake 的 `$transaction` 原本用「快照整個陣列再還原」實作，在 `Promise.all` 下會把別人已 commit 的列一併抹掉——一併改成 buffer/commit 語意並模擬非 deferred 的 unique index，否則它分辨不出修正前後。實測還原成兩步驟寫法該測試會紅 |
| S7 | `OidcIdentity` 無 FK，刪除 User 後 mapping 成孤兒，同一外部身份**永久 401**，且無管理介面可修 | `resolve()` 命中 mapping 後先確認帳號存在；不存在就刪掉懸空 mapping 並回到正常 link/provision 路徑（`findById` 回 null 是明確的，資料庫故障會拋錯而非回 null）。新增回歸測試 |
| S8 | clean consumer 直接打包現有 `dist/`，沒重跑 build 就驗到舊產物——正是 PL1-14 宣稱要防止的「預建 dist 假象」 | 腳本開頭先跑 `tsc -b tsconfig.json`（增量，成本近乎零），並提供 `--no-build` 逃生口 |
| S9 | AdminGuard 有三份拷貝，`m2m-api-key` 那份直接硬寫 `'ADMIN'`，沒有任何共同來源 | 實作收斂成 `@appspine/plugin-host-nest` 的 `SystemAdminGuard`（讀 host 的中立 `roleNames`，沒有 capability 需要 import 另一個 capability）；三個 package 保留原本的名字作為 alias，consumer 的 `@UseGuards(...)` 不變。role 名稱常數移到 `@appspine/plugin-api`。修正時另外發現**第四份**拷貝：`oidc-auth/src/jwt-verifier.service.ts` 自己的 `const SYSTEM_ADMIN_ROLE = 'ADMIN'`，一併移除 |

### 2.3 Minor（4 項已修，5 項記為已知限制）

| # | 發現 | 處理 |
|---|---|---|
| M1 | `redactConfig` 只看 key 名稱，`databaseUrl`／`dsn`／`connectionString` 內嵌的密碼會原樣進 catalog | 擴充 secret-looking 樣式（connection string、各種 `*_url`／`*_uri`、`passphrase`、`salt`、`webhook`…），新增正反兩面的測試（該遮的要遮、`issuer`／`baseUrl` 這類要保持可讀）。仍如實標示為 heuristic，契約仍是 manifest 的 `environment[].secret` |
| M2 | resolution digest 不含 `configRef` | **不成立**：`config-ref-mismatch` 已把 inventory 的 `configRef` 釘死等於 manifest 的 `configSchema.configRef`，而 manifest 本身在 `instance.digest` 裡。實際加進去後所有 digest 完全不變。改為在 `resolutionDigest()` 上方註記為什麼刻意不含 |
| M3 | identity-core 的 source-text ban 只掃 4 個檔案 | 改成掃 `src` 下全部非 spec 檔（`plugin.ts` 對 `userRoles` 有明確例外，因為它是**宣告** augmentation 而非讀取）。實測在 `users.service.ts` 種回 `prisma.role.findMany()`、在 `identity-core.module.ts` 種入 `password` 都會紅 |
| M4 | pilot-plugins 文件說 `global: true` 的說明「在 manifest 裡有 inline 註解」，但 `appspine.plugin.json` 是純 JSON | 更正為 `packages/audit-log/src/plugin.ts` |
| — | `canonicalize` 用 `Object.keys().sort()`（UTF-16 序） | 保留：RFC 8785 JCS §3.2.3 指定的正是 UTF-16 code unit 序，現行實作與之相符 |
| — | `ajv` 是 `plugin-api` 的 runtime dependency | 已知限制，見 [核心 §7](051-pl1-plugin-platform-core.md)。移到 `./loader` 專屬 package 屬 Phase 2 以後的取捨 |
| — | 真實 workspace 沒有任何 machine strategy，`MachineAuthGuard` 在真 App 會 401 | 已知限制：`m2m-api-key` 的 plugin 化排在 Phase 4；PL1-11 的共存性目前由 `host.spec.ts` 的 fake 證明 |
| — | CI 的 `verify:phase1` 需要網路 | 已知限制，見 [checkers §5](051-pl1-architecture-and-consumer-checks.md) |
| — | Execution Log 缺 commit SHA | Phase 1 收尾 commit 後補；本 gate 的 commit 見 §5 |

### 2.4 修正過程中另外發現的事

review 沒指出、但修 review findings 時撞到的：

- `pnpm test` 在 `identity-core` 中止，**排在它之後的 5 個 package 從來沒被跑過**——Phase 1 原始交付只驗證了三個新 package 各自的 `pnpm --filter … test`（見 [執行紀錄 §2.1](051-pl1-execution-log.md)）。
- `051-pl1-architecture-check` 的「有 dependency 就要有 project reference」與 PL0-07 的「不得有 unused reference」**直接衝突**：一個只透過 DI token 使用的 package 兩邊都滿足不了。前者改為只要求**實際 import** 的 workspace dependency 要有 reference。
- 兩支 checker 的 `test-support.ts` 判斷式用 `/[/]…/`，在 Windows 上（`path.join` 產生反斜線）永遠不會匹配。改為 `[\\/]`。

## 3. Gate 條件逐項

拆解對 G1 的「必須通過」有四條：

| 條件 | 狀態 |
|---|---|
| PL1-01～14 全部完成 | ✅ 見 [執行紀錄 §1](051-pl1-execution-log.md) 的 task ledger |
| 共通 full gate（拆解 §2.2） | ✅ 見 [執行紀錄 §2](051-pl1-execution-log.md)：install／lint／build／typecheck／**798 tests**／phase0／phase1／snapshot／lint-knowledge／`git diff --check` 全綠 |
| clean consumer | ✅ `pnpm verify:phase1`：self-test 13/13、architecture 0 findings、clean consumer 7/7 |
| health → audit → identity/oidc 順序的行為 parity；`@appspine/auth` transition surface 完整 | ✅ `facade.spec.ts` 的 `LEGACY_VALUE_EXPORTS` 逐項斷言、PL0-02 凍結基線的 entry point 比對，加上 clean consumer 的 legacy-mode boot。獨立 reviewer 另外從 14 個 `export *` 逐檔展開重新核對過一次（確認項 #1） |
| 三種試點共享同一份 contract，無 app-specific exception | ✅ 四個 manifest 都通過同一個 `parsePluginManifest()`；manifest v1 未因任何一個試點而修改 |

**判定：Gate G1 通過**，但帶著 §1 的兩項已記錄偏離（reviewer 同屬 Claude model family；14 個 task 未分
branch）。這兩項不是被忽略，是被記錄下來作為 Phase 2 的校準輸入。

## 4. 過不了會怎樣

拆解寫明：G1 過不了就**不進 CLI／codegen**（Phase 2）；若三種試點無法共享 contract，修訂 manifest v1，
不加 app-specific exception。第一輪 review 的結論確實是「不可關閉」，因此 Phase 2 沒有在修完 4 項
blocking 之前開始。

## 5. 傳遞給 Phase 2 的事項

| 事項 | 由誰處理 |
|---|---|
| `IdentityStorePort.create` 的 optional `transaction` 參數（S6 新增）需要納入 PL2-01 CLI 對 port 契約的認知 | PL2-01 |
| plugin lockfile 要記的 digest 語意見 [核心 §4.1](051-pl1-plugin-platform-core.md)；`configRef` 刻意不在 digest 內（§2.3 M2） | PL2-04 |
| `oidc-auth` 的 additive migration 已產生未套用，PL2-06 的 Prisma composer 要能把它納入 migration plan | PL2-06 |
| `audit-log`／`auth` 的 `@Global()` 與 `AuditLogService` 具體 export 仍在過渡狀態 | Phase 4 |
| identity 刪除的 lifecycle hook（S7 的長期解法，目前是 `resolve()` 內的懸空 mapping 清理） | Phase 4 |
| `m2m-api-key` plugin 化後才會有真正的 machine strategy；`MachineAuthGuard` 目前無真實 provider | Phase 4 |
| 拆解 §1.1 的「一個 task 一個 branch」自 Phase 2 起恢復 | PL2-01 起 |

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | Gate G1 |
| Commit | `4c0ce5f`（branch `051-plugin-platform-phase0-phase1`）|
| Actual agent | Claude Opus 5（primary）＋獨立 Claude Opus general-purpose agent（blind-spot review） |
| Required class | G3（Sol max 主責、Gemini 獨立遺漏審查）——本 session 依 G0 已建立的替代方式執行，見 §1 |
| Substitution reason | 本 session 無獨立 Sol／Gemini provider |
| Independent reviewer | 獨立 Claude Opus general-purpose agent（無先前對話上下文） |
| Tools | repo read/write、pnpm、vitest、tsc、biome、node、npm、prisma generate |
| Evidence | §3；[PL1 執行紀錄 §2](051-pl1-execution-log.md) |
| 已知風險 | §1 的 reviewer 獨立性落差與 branch／worktree 偏離；各分項文件的「已知限制」 |
| Rollback | 見各分項文件的 Rollback 欄位 |
