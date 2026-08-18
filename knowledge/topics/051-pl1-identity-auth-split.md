---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL1-10／PL1-12／PL1-13 — identity／OIDC 拆分與 `@appspine/auth` facade

> Tasks：`PL1-10`（`@appspine/identity-core`）、`PL1-12`（`@appspine/oidc-auth`）、`PL1-13`
> （`@appspine/auth` 轉為相容 facade）。
> 見 [051 拆解 §5](../decisions/051-plugin-platform-engineering-task-breakdown.md#5-phase-1--最小平台核心與三種試點)。
> 依賴：[PL0-04](051-pl0-identity-responsibility-matrix.md)、[PL0-06](051-pl0-prisma-permission-fixtures.md)、
> [PL1-09](051-pl1-pilot-plugins.md)、[PL1-11](051-pl1-plugin-platform-core.md)。
> Changeset：`.changeset/051-phase1-identity-split.md`。

這是 Phase 1 三種試點形狀的第三種，也是最大的一種：不只是把既有 module 包成 plugin，而是把一個
package 拆成兩個 owner，中間只留 capability token。

---

## 1. 拆完之後誰擁有什麼

| Package | 擁有 | provides | requires |
|---|---|---|---|
| `@appspine/identity-core` | `User` model、Users CRUD、`AdminGuard`、system role 常數 | `appspine.identity-store` | `appspine.prisma`、`appspine.principal-context`（optional：`appspine.audit-sink`、`appspine.rbac-policy`） |
| `@appspine/oidc-auth` | JWKS／RS256 驗證、`azp` 檢查、RFC 8693 delegated 入站、`OidcIdentity` model | `appspine.interactive-auth-provider`、`appspine.delegated-identity-verifier` | `appspine.identity-store`、`appspine.authentication-strategy-registry`、`appspine.principal-context`、`appspine.prisma`、`appspine.audit-sink` |
| `@appspine/auth` | 什麼都不擁有 | — | — |

`oidc-auth` 宣告 `conflicts: ["local-auth"]`，是 PL1-11 registry「最多一個 interactive provider」在
manifest 層的對應：兩個互動式登入方式必須在解算階段就撞在一起，而不是等到執行期。

## 2. `identity-core`（PL1-10）——把 RBAC 讀取換成 capability

拆分前 `resolveDefaultRoleId()` 直接跑 `prisma.role.findUnique(...)`：identity 在查 RBAC 自己的表。
預設角色是 RBAC 的政策決定，所以現在走新的 `appspine.rbac-policy` capability，角色讀寫也一併走同一個
capability——`UserRole` 與它的 relation 形狀屬於 RBAC。對已安裝 RBAC 的 App 行為不變：建立使用者時不給
`roleIds` 仍然落在同一個預設角色。

Prisma fragment 也跟著改：`User` 不再宣告 `userRoles` 與 `actingApiKeys` relation，而是在 manifest 用
`augmentedBy` 記錄「這兩個欄位由 rbac／m2m-api-key 貢獻」。這讓 `identity-core` 能在**完全沒有 RBAC
augmentation** 的 schema 上運作。

`password` 欄位**保留但從不讀取**（PL0-04 §2：Phase 1 不得刪它）。`plugin.spec.ts` 兩面都測：fragment
必須還有 `password String?`；`src` 下**每一個**非 spec 檔都不得出現 `bcrypt`／`compare(`／`hash(`，
不得出現 `prisma.role`／`prisma.userRole`，也不得提及 `password`——只有 `user.dto.ts` 例外，且只能作為
一個被拒絕的欄位宣告出現一次（見下）。`userRoles` 的例外只有 `plugin.ts`，因為它是**宣告**哪個 plugin
會貢獻該欄位，與讀取正好相反。

送出 `password` 會被**明確拒絕**而不是靜默丟棄：zod 預設 strip unknown key，把欄位直接刪掉會讓 caller
以為帳號建好了而且帶著密碼。051 決策 7 把憑證完全交給 authentication plugin，這個決定必須在邊界上看得見
（Gate G1 review S4）。

> 這條 source-text ban 抓到過兩件事，都值得記：
> 1. 一個**自己造成的偽陽性**——`users.service.ts` 的註解寫了「以前會跑 `prisma.role.findUnique(...)`」，
>    原文掃描把這句解釋讀成違規。修法是比對前先 `stripComments()`，而不是刪掉解釋邊界的文件，否則規則
>    會反向獎勵「不要寫註解」。
> 2. 它原本只掃 4 個檔案（Gate G1 review M3），`identity-core.module.ts`／`index.ts`／`constants.ts`
>    在管轄範圍外。現在掃全部。

## 3. `oidc-auth`（PL1-12）——身份鍵從 email 換成 `(issuer, subject)`

新的 `OidcIdentity` model 以 `@@unique([issuer, subject])` 為外部身份鍵。理由是兩個具體故障：IdP 端改
email 會生出第二個帳號；兩個 realm 剛好發出同一個 `sub` 會併成同一個人。
`fixtures/051-identity-boundary/cases.json` 把這三種情境凍結，`oidc-identity.spec.ts` 直接跑它。

`userId` 是 snapshot reference，**刻意沒有 Prisma relation**：宣告 relation 會逼 `identity-core` 的 `User`
為一個 *optional* plugin 帶一個 back-relation 欄位，那正是這次拆分要移除的反向依賴。

沒有 mapping 的登入有三種結果，區分很重要：

| 情況 | 結果 |
|---|---|
| 恰好一個 **active** 舊帳號的已驗證 email 相符 | 在同一個 transaction 內連結，並寫 audit（`linkedFromLegacyEmail = true`） |
| 完全沒有帳號 | JIT 建立，與拆分前的 `JwtVerifierService` 一致 |
| 相符但帳號 **inactive** | 拒絕。停用的帳號不該因為登入而復活 |

全部經 `appspine.identity-store`，沒有一條路直接查 `User`。

## 4. `@appspine/auth`（PL1-13）——只剩 facade

`packages/auth/src/index.ts` 現在沒有任何實作，只有 re-export 與一張 old→new 對照表（檔頭 JSDoc）。
`AuthModule` 組合兩個新 module 並維持 `@Global()`，`./prisma/user.prisma` **保持 byte-identical**。

> **但這不代表沒有 App 需要 migration。** Gate G1 獨立 review（B4）指出這句原本的結論是錯的：
> `AuthModule` 現在 compose `OidcAuthModule`，每一次 OIDC 登入都會讀 `OidcIdentity`。只升級
> `@appspine/auth`、沒有先建 `oidc_identities` 表的 App，第一次登入就是全站登入中斷。
> `user.prisma` 沒變說的是「`users` 表沒變」，不是「什麼都不用做」。SQL、rollout 順序（先 migration
> 後部署）與 rollback 見 `packages/oidc-auth/prisma/migrations/README.md`。clean consumer 的
> legacy-mode boot 測試**證明不到**這件事——它的 fixture schema 已經手工含了 `OidcIdentity`。

`facade.spec.ts` 是 PL1-13 的驗收條件本身：把拆分前 14 個 `export *` 的 runtime 面攤成一張
`LEGACY_VALUE_EXPORTS` 清單逐一斷言仍然存在。type-only export 無法在執行期斷言，由編譯器擔保——
該檔案自己的 import 少了任何一個都會 typecheck 失敗。

計畫與拆解都**不授權移除**這個 surface（拆解 §2.3）；移除只能在 transition window 結束後另立 major
release 計畫。

## 5. 連帶調整

| Package | 改動 |
|---|---|
| `@appspine/rbac` | 新增 `RbacPolicyService`（`appspine.rbac-policy` token）、接手 `buildUserContext`、不再 import auth |
| `@appspine/m2m-api-key` | acting user 改經 `appspine.identity-store` 驗證，不再直接讀 `User` 表（PL0-04 §1 的 B1 發現） |
| `@appspine/mcp-server` | request identity 型別改由 host 提供 |
| 全部 | 新增 `./package.json` export |

## 6. 驗證

```bash
pnpm --filter @appspine/identity-core test   #  29 tests
pnpm --filter @appspine/oidc-auth test       # 149 tests
pnpm --filter @appspine/auth test            #  34 tests
pnpm --filter @appspine/rbac test            #  26 tests
pnpm --filter @appspine/m2m-api-key test     #  16 tests
```

`051-pl1-clean-consumer.mjs` 另外從 tarball 證明 legacy `AuthModule` wiring 仍然 boot 得起來
（見 [PL1-07／14](051-pl1-architecture-and-consumer-checks.md)）。完整 gate 見
[PL1 執行紀錄](051-pl1-execution-log.md)。

## 7. 已知限制

- `OidcIdentity.userId` 沒有 FK。Gate G1 review（S7）指出這讓刪除 User 後留下的孤兒 mapping 會把同一個
  外部身份**永久鎖在 401**，因此 `resolve()` 現在會偵測懸空 mapping、刪掉它並回到正常
  link/provision 路徑。真正的長期解法是 identity 刪除的 lifecycle hook，屬 Phase 4。
- email fallback 連結路徑仍然開著；`linkedFromLegacyEmail` 是給營運觀察「何時可以關掉」的指標，
  真正的 cutover 不在 Phase 1。該指標的可信度靠「建帳號 + mapping + audit 同一個 transaction」
  維持（Gate G1 review S6）——分成兩步時，一次 audit 失敗就會讓重試的新帳號被永久標成 legacy link。
- `identity-core` 的 `frontend.ts` 只是預留邊界，Users UI 的實際搬遷是 PL3-04。
- `AuthModule` 仍為 `@Global()`，與 `audit-log` 同屬過渡狀態。
- Prisma migration 已產生（`packages/oidc-auth/prisma/migrations/README.md`）但**未套用**；拆解 §2.3
  規定實際套用由 App owner 在 rollout task 核准。
- `identity-core` 的 `createUserSchema` 現在**明確拒絕** `password`（Gate G1 review S4），這是相對
  拆分前「接受並雜湊」的行為變更，屬 051 決策 7 的既定方向，已記在 changeset。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL1-10、PL1-12、PL1-13 |
| Actual agent | Claude Opus 5（單一 session 依序執行；拆解建議的 Sol xhigh 主責＋Terra 切檔＋Claude review 未分派，屬 §11 替代） |
| Required class | G3 |
| Substitution reason | 本 session 無獨立 Sol／Terra provider；使用者要求直接執行 Phase 1 |
| Independent reviewer | 見 [Gate G1](051-pl1-gate-g1.md) |
| Tools | repo read/write、pnpm、vitest、tsc、biome、`051-pl1-architecture-check.mjs`、`051-pl1-clean-consumer.mjs` |
| Evidence | §6；`packages/identity-core/src/plugin.spec.ts`、`packages/oidc-auth/src/**/*.spec.ts`、`packages/auth/src/facade.spec.ts`、`fixtures/051-identity-boundary/cases.json` |
| 已知風險 | §7 |
| Rollback | 刪除 `packages/identity-core`、`packages/oidc-auth`；`git checkout -- packages/auth packages/rbac packages/m2m-api-key packages/mcp-server`；刪除 `.changeset/051-phase1-identity-split.md` 與 `fixtures/051-identity-boundary/` |
