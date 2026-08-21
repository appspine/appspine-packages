---
type: topic
scope: appspine-packages
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-18
---

# 051 PL1-08／PL1-09 — 兩個試點 capability plugin

> Tasks：`PL1-08`（`health-check` 試點）、`PL1-09`（`audit-log` 試點並反轉 audit token）。
> 見 [051 拆解 §5](../decisions/051-plugin-platform-engineering-task-breakdown.md#5-phase-1--最小平台核心與三種試點)。
> 依賴：[PL1-01～06／11](051-pl1-plugin-platform-core.md)、[PL1-07](051-pl1-architecture-and-consumer-checks.md)。
> Changeset：`.changeset/051-phase1-pilot-plugins.md`。

---

## 1. 為什麼是這兩個

拆解把「三種形狀」列為 Phase 1 的驗收條件，這兩個是前兩種：

| 試點 | 形狀 | 要證明的事 |
|---|---|---|
| `health-check` | 最小 | host 能不能組裝一個 plugin：一個 controller、一個 health contribution、零 Prisma model、零 config |
| `audit-log` | 資料型 | 擁有 Prisma model，而且**別人透過 token 依賴它**，不是 import 它的具體 class |

第三種（identity／auth）在 [PL1-10／12／13](051-pl1-identity-auth-split.md)。

## 2. 共同做法：plugin mode 回傳的就是 legacy module

兩個 package 的 `./plugin` 都只是把 root export 的同一個 Nest module 包成 descriptor：

```ts
export const healthCheckPlugin = definePlugin({
  manifest: healthCheckManifest,
  backend: () => HealthModule,
});
```

這是刻意的。若 plugin mode 另外組一份 module，「legacy 與 plugin 行為 parity」就只能靠測試去追；
回傳同一個 class，parity 變成結構上不可能不成立，測試只需要證明兩條 wiring 都到得了同一個 module。
拆解 PL1-08 的驗收寫的是「controller／response parity」，這個做法把它從行為斷言降級成組裝斷言。

manifest 一樣採用 [PL1 核心 §2](051-pl1-plugin-platform-core.md) 的「JSON 與 TS 常數雙份、由 spec 強制
deep-equal」策略：`appspine.plugin.json` 是 CLI／loader **不執行 package code** 就能讀到的那份，
`src/plugin.ts` 的常數是 `definePlugin()` 型別檢查的那份。

## 3. `health-check`（PL1-08）

- `provides: ["appspine.health-indicator"]`、`requires: ["appspine.prisma"]`。
- `facets.backend.controllerRoutes: ["health"]` 讓 resolver 在 Nest 看到之前就能擋掉 route 相撞；
  `facets.operations.healthIndicatorId: "health-check"` 對齊 PL0-03 §4 的命名空間規則。
- root 仍 export `HealthModule`／`HealthController`，既有 App 不必改任何一行。

## 4. `audit-log`（PL1-09）與 token 反轉

- `provides: ["appspine.audit-sink"]`；service 綁到 `@appspine/plugin-api` 的 `AUDIT_SINK`。
  反轉的對象是舊的 `@appspine/auth` → `AuditLogService` 具體 class import——那正是 051 §6.1 要移除的
  耦合。拆分後 `oidc-auth` 只 require `appspine.audit-sink`，不知道誰實作。
- `facets.prisma`：`owns: ["AuditLog"]`、`ownsEnums: ["AuditAction"]`、`schemaFragment` 加上
  `schemaDigest`（sha256，LF 正規化後計算）。digest 常數 export 成 `AUDIT_LOG_SCHEMA_DIGEST`，
  `plugin.spec.ts` 重算檔案內容比對，fragment 改了但忘了更新 manifest 會直接測試失敗。
- `facets.backend.global: true` 是**過渡狀態**，不是最終樣貌：051 決策 3 要移除 `@Global()`，但不能和
  「引入 token」同一次改動一起做，否則今天依賴 global 的 consumer 會在還沒有機會遷移前就壞掉。
  理由寫在 `packages/audit-log/src/plugin.ts` 的 inline 註解裡（`appspine.plugin.json` 是純 JSON，
  放不了註解），Phase 4 移除時會一起清掉。
- `AuditLogService` 具體 export 保留，理由同上。

## 5. 驗證

```bash
pnpm --filter @appspine/health-check test   # 2 spec 檔
pnpm --filter @appspine/audit-log test      # 4 spec 檔
node scripts/051-pl1-architecture-check.mjs # manifest／peer／import graph
```

`plugin.spec.ts` 兩邊都涵蓋：manifest JSON 與 TS 常數 deep-equal、manifest 通過真正的
`parsePluginManifest()`（不是自製檢查）、`package.json` 的 `files`／`exports` 真的包含
`appspine.plugin.json` 與 `./plugin`、resolver 在缺少 `appspine.prisma` 時失敗、以及 catalog 狀態。
`audit-log` 另外重算 schema digest。

完整 workspace gate 見 [PL1 執行紀錄](051-pl1-execution-log.md)。

## 6. 已知限制

- 兩個 plugin 都還沒有 `permissions` facet（PL2-07 才擁有）與 `frontend` facet（PL3-02）。
- `audit-log` 的 `@Global()` 與具體 `AuditLogService` export 都還在，見 §4。
- 尚未有 App 實際切換到 plugin mode；template 遷移是 Phase 2（PL2-08）的工作。

## Execution Log

| 欄位 | 內容 |
|---|---|
| Task | PL1-08、PL1-09 |
| Commit | `4c0ce5f`（branch `051-plugin-platform-phase0-phase1`）——Phase 0 與 Phase 1 合併為單一 commit，偏離見 [Gate G1 §1](051-pl1-gate-g1.md) |
| Actual agent | Claude Opus 5（單一 session 依序執行；拆解建議的 Terra high／xhigh + Sol review 未接入，屬 §11 替代） |
| Required class | G2 |
| Substitution reason | 本 session 無獨立 Terra／Sol provider；使用者要求直接執行 Phase 1 |
| Independent reviewer | 見 [Gate G1](051-pl1-gate-g1.md) |
| Tools | repo read/write、pnpm、vitest、tsc、biome、`051-pl1-architecture-check.mjs` |
| Evidence | §5；`packages/health-check/src/plugin.spec.ts`、`packages/audit-log/src/plugin.spec.ts` |
| 已知風險 | §6 |
| Rollback | 刪除兩個 package 的 `appspine.plugin.json`、`plugin.js`／`plugin.d.ts`、`src/plugin.ts`、`src/plugin.spec.ts`，還原兩者的 `package.json` 與 `.changeset/051-phase1-pilot-plugins.md` |
