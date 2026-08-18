---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-19
---

# 051 - `appspine-packages` 插件平台 — 執行任務拆解（how）

> 對應已核准計畫：[051-plugin-platform-engineering-plan.md](051-plugin-platform-engineering-plan.md)。
> 本文件只拆解「誰做、先後順序、交付物與驗收」，不重新打開已核准的架構決策。
> 任務編號格式為 `PL<phase>-<sequence>`；Gate 編號為 `G<phase>`。
> 文件中的 Sol、Terra、Luna、Claude Sonnet、Gemini 是目前的建議 roster；正式約束是 051 §15 定義的
> G1／G2／G3 能力級別與專長角色，可使用校準過的同級或更高級 agent 替代。
>
> **目前狀態：Phase 0 與 Phase 1 已完成並通過各自的 Gate。Phase 2 的 PL2-01～10 已完成，但
> Gate G2 尚未關閉（獨立 review 未執行）——因此不得把 generator 接入 frontend、不得在 App 套用
> migration、Phase 3 不得開始。本文件不授權 push、publish、production migration 或舊 API 移除。**
> 外部可見或難以回復的動作必須在對應 Gate 再取得授權。

---

## 1. 拆解原則

### 1.1 Task 邊界

- 一個 task 原則上由一個 primary agent 在獨立 branch／worktree 完成，形成一個可 review 的 PR 或 commit
  series；不把多個 Phase 混在同一變更。
- 每個 task 必須有具體輸入、輸出與驗證，不以「重構完成」「看起來可用」作為驗收。
- task owner 不得擔任自己的唯一 reviewer；G3 task 優先由不同 provider／model family 獨立 review。
- package-local 工作可以平行；共用 hot files 由當期 integration owner 串行整合。
- 若實作發現需變更 051 已核准決策，先停止該 task、記錄 evidence，再修訂 ADR；不得把設計偏移藏在
  implementation detail。

### 1.2 目前基線

本拆解已依 2026-08-18 working tree 做初步核對；PL0 仍須以可重現腳本產生正式 baseline：

| 項目 | 目前事實 | 對拆解的影響 |
|---|---|---|
| Workspace packages | 15 個 | README 與 CI 仍有舊的套件數敘述，PL0 先修正 |
| `@Global()` | `common` Prisma、`auth`、`audit-log`、`rbac`、`m2m-api-key`、`mcp-server` 共 6 處 | 不可一次移除；依試點與 capability 順序逐批替換 |
| Build graph | 尚無 TypeScript project references；fresh build 依賴先產生 `dist/*.d.ts` | PL0 先建立明確 graph，不先導入 Turbo／Nx |
| Capability UI | Users、Roles、API Keys、Domain Events、Notification、Login 仍集中或部分集中在 `frontend-shell` | Phase 3 依 ownership 逐批搬回各 package 的 `./frontend` |
| Identity schema | `User` 同時含 `password`，並直接反向 relation 到 RBAC／API key | identity 拆分前必須先完成 ownership 與 migration fixtures |
| Template backend | `AppModule` 仍手工 import 9 個標準 capability modules | Phase 2 以 host + preset 雙模式遷移 |
| Consumer fleet | template + 8 個 App；版本與 capability 組合不完全一致 | Phase 5 先 template／wiki canary，再分 wave rollout |

### 1.3 Package 分類

不是所有 npm package 都應變成可安裝 capability plugin。PL0 必須確認、後續依此治理：

| 類別 | Packages | 目標 |
|---|---|---|
| Platform foundation | `common`、`integration-contracts`、`e2e-kit`、`frontend-shell` | 提供基礎 contract、tooling、Shell；不偽裝成可啟停的業務 capability |
| 新平台 packages | `plugin-api`、`plugin-host-nest`、`plugin-testkit`、`plugin-cli`、`preset-standard` | manifest、host、測試、CLI、preset；本身不等同 capability plugin |
| 試點 capability | `health-check`、`audit-log`、`identity-core`、`oidc-auth` | Phase 1 驗證最小、資料型與 identity/auth 三種形狀 |
| 後續 capability／connector | `notification`、`rbac`、`m2m-api-key`、`metadata-schema`、`domain-events`、`mcp-server`、`oidc-delegation`、`master-data-client` | Phase 4 依 dependency layer 遷移 |
| Transition-only | 現有 `auth` | 保留至少一個 major transition window，re-export／bridge 新 packages；不承接新功能 |

### 1.4 Hot files 與並行限制

以下檔案或邊界容易讓不同 agent 互相覆蓋，指定當期 integration owner 串行修改：

- root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、root／package `tsconfig*.json`。
- `plugin-api` manifest／token contract、`plugin-host-nest` resolver 與 catalog types。
- `auth`／`identity-core`／`oidc-auth` public exports 與 Prisma ownership。
- `frontend-shell/package.json`、root barrel、admin types、i18n augmentation 與 compatibility re-exports。
- template 的 `AppModule`、Prisma schema、plugin inventory、generated frontend routes 與 lockfiles。

同一 Phase 中可先平行準備 package-local commits，但 hot-file integration 必須排隊；不得讓兩個 agent 同時
編輯同一 working directory，再靠人工挑選未提交檔案。

---

## 2. 共通 Definition of Done

### 2.1 每個 code task

每個 task handoff 至少包含：

- 實際 agent／model、能力級別、專長角色、推理強度、branch／worktree 與 commit SHA。
- 完成／未完成範圍、相對 051 的偏離、public API／manifest／schema／permission 變更。
- affected-package build、typecheck、unit／contract tests 與 `git diff --check` 的實際命令及結果。
- package 發布面變更需有 changeset；不得直接手改版本號。
- 新增或修改 public subpath 時，必須驗證 `exports`、types、runtime target 與 `npm pack --dry-run` 內容。
- 未解風險、rollback 與下一 task 前置條件。

### 2.2 每個 Phase gate

除該 Phase 的專屬驗收外，integration owner 在乾淨 worktree 執行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm typecheck
pnpm test
node scripts/lint-knowledge.js
git diff --check
```

涉及 package consumption 的 Phase 必須再從實際 tarball 安裝到 isolated clean consumer；workspace symlink
成功不算相容性證據。涉及 Next.js／Prisma 的 Phase 另跑 template 的 build、schema validation 與相關 E2E。

### 2.3 發布與 migration 授權

- task 可準備 changeset、migration plan 與 release notes；push、canary／stable publish 另走 PL5 release gate。
- 插件安裝或啟用不得自動執行 production migration。實際套用 migration 由 App owner 在 rollout task
  核准；停用插件不代表刪資料。
- 本計畫與本拆解都不授權移除 `@appspine/auth` 舊 API。移除只能在 transition window 結束後另立 major
  release 計畫。

---

## 3. 依賴 DAG 與建議 workstreams

```text
Phase 0: baseline + contract freeze + build graph
   │
   └── G0
        │
        ▼
Phase 1: plugin-api/host/testkit → health → audit → identity-core/oidc-auth
   │
   └── G1
        │
        ▼
Phase 2: CLI + lockfile + codegen ─┬─ Prisma/permission composer
                                   └─ preset + template dual mode
   │
   └── G2
        │
        ▼
Phase 3: frontend facet/generator → capability UI migration → Shell cleanup
   │
   └── G3
        │
        ▼
Phase 4A: notification/RBAC/M2M ─┐
Phase 4B: metadata/events/MCP ───┼─ controlled integration → preset completion
Phase 4C: delegation/master-data ┘
   │
   └── G4
        │
        ▼
Phase 5: authorized release → template → wiki canary → App waves → deprecation evidence
   │
   └── G5
```

建議 workstreams：

| Workstream | Task 範圍 | 預設 primary | 必要 gate |
|---|---|---|---|
| Contract／architecture | PL0-03～06、PL1-01、PL1-04～06、identity split | Claude Sonnet／Sol | Sol 或同級 G3 |
| Build／host／tooling | PL0-07、PL1 host、Phase 2 | Terra | 高風險 schema／lockfile 交 G3 |
| Frontend ownership | Phase 3 | Claude Sonnet + Terra；Luna 做機械遷移 | 不同 agent 做 API、Next build review |
| Capability migration | Phase 4A～4C | Terra／Sol／Gemini 依 051 §15.2 | 每一 subgroup 有獨立 contract review |
| Fleet rollout | Phase 5 | Gemini coordinator；Terra 執行；Luna 維護 matrix | Sol 或同級 G3 做 release gate |

---

## 4. Phase 0 — Baseline、規格凍結與 build graph

### PL0-01 建立 execution baseline 與修正文件漂移

- **repo**：`appspine-packages`
- **owner**：Gemini（G2 `repo-integration`）；Luna 可執行機械盤點。
- **依賴**：無。
- **交付**：記錄 branch／HEAD／dirty state、15 package 名單與版本、root scripts、CI gate、6 個 `@Global()`；
  修正 README catalog 與 CI 套件數註解，但不改 runtime。
- **驗證**：baseline 可由命令重跑；文件數字與 `packages/*/package.json`、source grep 一致。

### PL0-02 產生 public API、dependency、consumer 與 direct-import snapshot

- **repo**：`appspine-packages`，唯讀掃描 template + 8 Apps。
- **owner**：Gemini（G2）；Luna 產生清單。
- **依賴**：PL0-01。
- **交付**：deterministic script 與 versioned snapshot，至少包含 package exports、local dependencies、peer
  ranges、cross-package source imports、Prisma fragments、frontend ownership、consumer version／module matrix。
- **驗證**：同一 HEAD 重跑無 diff；能指出目前 `auth → audit/common`、`rbac → auth/audit/common`、
  `m2m → auth/common/audit`、`mcp → auth/m2m/audit` 等 concrete chain。

### PL0-03 固定 package／plugin／facet 分類與 naming registry

- **repo**：`appspine-packages` knowledge + contract fixtures。
- **owner**：Claude Sonnet（G2 `architecture-contract`）。
- **依賴**：PL0-02。
- **交付**：15 個現有 package 與 7 個預計新增 package 的分類表；stable capability names、plugin IDs、facet
  IDs、route/token/worker/permission namespace 規則與 reserved names。
- **驗證**：foundation package 不會被誤判為可啟停 capability；同一 logical plugin 拆多 artifact 時 catalog
  仍能展開 package/version/digest。

### PL0-04 完成 identity／auth responsibility 與 migration matrix

- **repo**：`appspine-packages`；唯讀核對 template + 8 Apps 的 usage。
- **owner**：Claude Sonnet（G2）；Sol（G3）審 identity/security/schema。
- **依賴**：PL0-02、PL0-03。
- **交付**：逐一指定 User schema、CRUD、AdminGuard、CurrentUser、OIDC JIT、delegated inbound auth、acting-user、
  service-account、`password`、RBAC／API-key relations 的目標 owner；列出 old → new export mapping、資料
  migration、downgrade 與 rollback。
- **驗證**：`identity-core` 無 OIDC/password/RBAC/API-key concrete dependency；Phase 1 不 drop `password`；
  `oidc-auth` 與未來 `local-auth` 的互斥及 issuer+subject identity 有測試案例。

### PL0-05 凍結 manifest／inventory／config／lifecycle acceptance fixtures

- **repo**：`appspine-packages` fixtures + knowledge。
- **owner**：Claude Sonnet（G2）；Sol（G3）做 contract gate；Gemini 做 blind-spot audit。
- **依賴**：PL0-03、PL0-04。
- **交付**：`appspine.plugin/v1` 正反例 fixtures，涵蓋 facets、engine ranges、provides/requires、optional、
  conflicts、replaces、singleton/multiple、required/optional failure、configRef、secret redaction 與 lifecycle。
- **驗證**：每個已核准決策至少有一個 positive 或 negative fixture；fixture 不執行插件 runtime code 即可解析。

### PL0-06 凍結 Prisma owns/augments 與 permission lifecycle fixtures

- **repo**：`appspine-packages` fixtures。
- **owner**：Terra xhigh（G2 `implementation`）；Sol（G3）審 migration/determinism。
- **依賴**：PL0-04、PL0-05。
- **交付**：identity/RBAC/API-key 組裝、owner collision、missing augmentation target、deterministic ordering、
  permission add/rename/alias/retire、upgrade/downgrade/remove plan fixtures。
- **驗證**：同順序與亂序輸入產生相同 digest；remove 不產生 drop table／delete permission data 的自動操作。

### PL0-07 導入 TypeScript project references 並修正 build graph

- **repo**：`appspine-packages`
- **owner**：Terra xhigh（G2）。
- **依賴**：PL0-02。
- **交付**：root build config、package references、fresh-checkout build path 與 CI 更新；先保留現有 package
  scripts／Changesets，不導入 Turbo／Nx。
- **驗證**：乾淨 worktree、無既存 `dist` 時仍能依 graph build；`pnpm build/typecheck/test` 全綠；snapshot
  能驗證 TypeScript references、`package.json` dependency 與實際 imports 一致。

### Gate G0 — 規格與基線凍結

- **owner**：Sol xhigh（G3）；Gemini 做獨立遺漏審查。
- **必須通過**：PL0-01～07；full workspace gate；manifest/state fixtures review；identity matrix 無 unresolved
  owner；consumer runtime 行為未改變。
- **過不了就**：停在 Phase 0 修規格或 graph，不建立 plugin runtime packages。

---

## 5. Phase 1 — 最小平台核心與三種試點

### PL1-01 建立 `@appspine/plugin-api`

- **owner**：Sol xhigh（G3）；Claude 審 public naming。
- **依賴**：G0。
- **交付**：dependency-light package、manifest v1 types／JSON Schema、stable tokens、`definePlugin()`、facet／
  lifecycle／diagnostic contracts、`./schema` 或等價公開入口。
- **驗證**：PL0 fixtures 全通過；package 不依賴 Nest／Prisma／Next／React concrete runtime；types 與 JSON
  Schema 有一致性測試；tarball consumer 可載入 schema 與 types。

### PL1-02 建立 `@appspine/plugin-testkit`

- **owner**：Terra high（G2）。
- **依賴**：PL1-01。
- **交付**：manifest builder、host harness、fake capability、lifecycle recorder、diagnostic／catalog assertions、
  singleton/multi-instance helpers。
- **驗證**：testkit 自身測試不依賴 workspace 私有 path；能從 tarball consumer 使用。

### PL1-03 建立 `@appspine/plugin-host-nest` 骨架

- **owner**：Terra high（G2）；Sol review。
- **依賴**：PL1-01、PL1-02。
- **交付**：host config types、registry boundary、generated composition input、Nest bridge 與同步／非同步
  factory contract；尚不載入任意遠端 package。
- **驗證**：Node 22 + CommonJS consumer compile；host 不反向依賴 capability package。

### PL1-04 實作 manifest loader、canonicalization 與 engine validation

- **owner**：Sol xhigh（G3）。
- **依賴**：PL1-01、PL0-05。
- **交付**：只讀 JSON 的 loader、schema validation、package version 合併、canonical digest、API／Node／framework
  range validation 與 redacted errors。
- **驗證**：unknown field policy、tampered digest、invalid range、missing facet、secret leakage negative tests 全通過；
  validation 不 import plugin runtime entry。

### PL1-05 實作 dependency resolver 與 deterministic graph

- **owner**：Sol xhigh（G3）；Gemini adversarial review。
- **依賴**：PL1-04。
- **交付**：provides/requires/optional、conflicts、replaces、cardinality、duplicate contribution、cycle detection、
  deterministic topological sort 與展開後 resolution graph。
- **驗證**：PL0 graph fixtures、亂序/property tests、精確 error path、multi-instance namespace 與 override negative
  tests；同輸入集合必須有同 digest／order。

### PL1-06 實作 Nest host lifecycle、catalog 與 diagnostics

- **owner**：Sol xhigh（G3）主導；Terra 實作 bounded batches。
- **依賴**：PL1-03、PL1-05。
- **交付**：`validate → register → ready → shutdown`、required/optional failure policy、reverse-order shutdown、
  timeout、catalog、health aggregation、redacted config diagnostics。
- **驗證**：required fail-fast、optional degraded、shutdown resource cleanup、duplicate route/token/worker fail、
  lifecycle ordering integration tests；沒有 hot unload API。

### PL1-07 建立 package／manifest／import／peer graph validator

- **owner**：Terra high（G2）；Gemini review。
- **依賴**：PL0-02、PL1-01、PL1-04。
- **交付**：architecture checker，核對 source import、`package.json`、manifest requirement、TS reference、facet
  exports、framework peers 與 forbidden internal path。
- **驗證**：故意製造 missing dependency、undeclared requirement、peer mismatch、foundation reverse dependency、
  `dist/*`／`src/*` import 時 checker 明確失敗。

### PL1-08 遷移 `health-check` 試點

- **owner**：Terra high（G2）；Sol review。
- **依賴**：PL1-06、PL1-07。
- **交付**：`appspine.plugin.json`、`./plugin` subpath、backend/operations facets、health contribution；保留既有
  `HealthModule` root export。
- **驗證**：legacy module 與 plugin mode controller／response parity；inventory enable/disable、required failure、
  catalog／health 顯示與 clean consumer tests。

### PL1-09 遷移 `audit-log` 試點並反轉 audit token

- **owner**：Terra xhigh（G2）；Sol review。
- **依賴**：PL1-08、PL0-06。
- **交付**：manifest、`./plugin`、Prisma facet metadata、`AUDIT_SINK` contract／bridge；先保留 legacy module 與
  schema export。
- **驗證**：有／無 audit consumer、database capability missing、schema digest、legacy/plugin behavior parity、
  audit failure semantics 與 secret redaction tests。

### PL1-10 建立 `@appspine/identity-core`

- **owner**：Sol xhigh（G3）；Claude 做 responsibility/API review；Terra 執行切檔。
- **依賴**：PL0-04、PL0-06、PL1-09。
- **交付**：provider-neutral User／service-account ownership、Users CRUD、principal DTO/context、identity store
  token、Prisma owns/augments metadata、Users frontend facet 的預留 public boundary。
- **驗證**：package graph 無 OIDC/JWKS/password verification/RBAC/API-key concrete dependency；既有 User
  behavior fixtures 通過；schema 組裝不靠反向 package import。

### PL1-11 建立 authentication strategy registry／principal bridge

- **owner**：Sol xhigh（G3）。
- **依賴**：PL1-06、PL1-10。
- **交付**：host-owned strategy registry、interactive/machine provider 分類、principal context bridge、duplicate
  interactive provider failure 與 request resolution contract。
- **驗證**：OIDC 與 machine provider 可共存；兩個 interactive provider fail fast；business plugin 只需中立
  principal/token，不依賴 guard implementation。

### PL1-12 建立 `@appspine/oidc-auth`

- **owner**：Sol xhigh（G3）；Terra 執行 migration；Claude review。
- **依賴**：PL1-09、PL1-10、PL1-11。
- **交付**：OIDC/JWT/JWKS、issuer+subject mapping、JIT adapter、interactive strategy、config schema、audit
  requirement、`OidcAuthModule`／`oidcAuthPlugin()` 與 `./frontend` 預留入口。
- **驗證**：現有 OIDC/security negative tests、issuer/audience/azp/JWKS failure、JIT、inactive user、audit、
  strategy registration 與 clean consumer tests；不得混入 local credential。

### PL1-13 將 `@appspine/auth` 轉為相容 facade

- **owner**：Sol xhigh（G3）；Claude 審 deprecation surface。
- **依賴**：PL1-10、PL1-12。
- **交付**：舊 root exports、Prisma path、module/API bridge、deprecation docs、old→new mapping 與 changesets；
  新功能只進 `identity-core`／`oidc-auth`。
- **驗證**：PL0 public API snapshot 中每個 export 都有保留或明確 migration conclusion；template 舊 wiring
  編譯／測試不變；不 drop `password` 或舊 schema path。

### PL1-14 建立 Phase 1 tarball clean consumer

- **owner**：Terra high（G2）；Luna 可建立 fixtures；Gemini 驗證遺漏。
- **依賴**：PL1-07～13。
- **交付**：從 `npm pack` tarballs 安裝 plugin-api／host／三個試點的 isolated Nest consumer，測 legacy 與
  plugin mode；涵蓋 CJS、types、manifest package files 與啟動診斷。
- **驗證**：無 workspace symlink、無預建本庫 `dist` 假象；install、typecheck、build、test、bootstrap 全綠。

### Gate G1 — 最小平台核心

- **owner**：Sol max（G3）；Claude API review；Gemini blind-spot audit。
- **必須通過**：PL1-01～14、共通 full gate、clean consumer；health → audit → identity/oidc 順序的行為
  parity；`@appspine/auth` transition surface 完整。
- **過不了就**：不進 CLI／codegen；若三種試點無法共享 contract，修訂 manifest v1，不加 app-specific
  exception。

---

## 6. Phase 2 — CLI、lockfile、Prisma、permission 與 Preset

### PL2-01 建立 `@appspine/plugin-cli` 與設定 schema

- **owner**：Terra xhigh（G2）；Sol review config/security boundary。
- **依賴**：G1。
- **交付**：CLI package、`appspine.plugins.json` schema、`appspine.config.ts` typed API、configRef／secret boundary、
  stable exit codes 與 machine-readable diagnostics。
- **驗證**：CLI 只修改 declarative inventory；secret 不進 inventory／lock；不執行未驗證 plugin runtime。

### PL2-02 實作 `add/remove/list/validate`

- **owner**：Terra high（G2）。
- **依賴**：PL2-01、PL1-04、PL1-05。
- **交付**：package/inventory update plan、manifest preflight、conflict/dependency validation、typed config TODO、
  dry-run 與 human-readable diff。
- **驗證**：idempotency、invalid package、duplicate instance、remove-required-dependency、config preservation、
  no arbitrary TypeScript rewrite negative tests。

### PL2-03 實作 `build/doctor` 與 catalog diagnostics

- **owner**：Terra high（G2）；Gemini review operator usability。
- **依賴**：PL2-02、PL1-06、PL1-07。
- **交付**：generated artifact build、enabled/disabled/failed status、API/peer mismatch、missing env key 名稱、
  route/schema/token conflict、digest/drift 與 preset expansion diagnostics。
- **驗證**：secret value 永不輸出；required/optional/degraded 狀態可由 JSON 與文字輸出一致表示。

### PL2-04 實作 `appspine.plugin-lock.json`

- **owner**：Terra xhigh（G2）；Sol max（G3）審 canonicalization/security。
- **依賴**：PL2-02、PL1-05。
- **交付**：resolved logical plugin、facet package/version、instance、capability graph、manifest/schema/permission/
  generated digest；不重複 pnpm resolution/integrity，不含 secret。
- **驗證**：亂序輸入 deterministic、tamper detection、preset 展開、multi-instance isolation、pnpm lock 與 plugin
  lock responsibility tests。

### PL2-05 產生 static Nest composition module

- **owner**：Terra xhigh（G2）；Sol review lifecycle。
- **依賴**：PL2-03、PL2-04。
- **交付**：`.appspine/generated/backend/*` 靜態 imports、generated Appspine module、source digest header 與
  drift check；production 不以任意 package name dynamic import。
- **驗證**：相同 inventory byte-stable；新增／停用試點只改 inventory/config 後重建；Nest build/bootstrap 與
  catalog 一致。

### PL2-06 實作 Prisma owns/augments composer

- **owner**：Terra xhigh（G2）實作；Sol max（G3）審 schema/migration。
- **依賴**：PL0-06、PL2-04。
- **交付**：contribution descriptor、owned model／enum、augmentation target、collision detection、deterministic
  `.appspine/generated/schema.prisma`、schema digest 與 migration-plan input。
- **驗證**：identity/RBAC/API-key fixtures、duplicate table/index/relation、missing target、upgrade/downgrade/remove、
  randomized order、Prisma validate/format；不自動套用 migration。

### PL2-07 實作 permission reconciler

- **owner**：Terra xhigh（G2）；Claude 審 permission semantics；Sol 審 destructive path。
- **依賴**：PL0-06、PL2-04。
- **交付**：immutable namespaced IDs、add/update-display/alias/retire/orphan plan、digest、dry-run、apply adapter
  boundary 與 audit result。
- **驗證**：rename without alias、remove in-use、downgrade newer state、重复 ID、frontend-only visibility negative
  tests；bootstrap 不做未核准大量刪改。

### PL2-08 建立 `@appspine/preset-standard`

- **owner**：Terra high（G2）；Claude review composition boundary。
- **依賴**：PL2-04～07。
- **交付**：template 現有標準 capabilities 的 versioned preset、完整 graph expansion、override boundary、preset
  catalog 與 lock representation。
- **驗證**：preset 名稱不是唯一 catalog entry；resolved plugins/facets/versions/digests 全部可見；app-local
  modules／plugins 不被吞併。

### PL2-09 將 `appspine-app-template` backend 改為雙模式 host + preset

- **repo**：`appspine-app-template`，package tarballs 來自 `appspine-packages`。
- **owner**：Terra xhigh（G2）；Gemini 做 integration review。
- **依賴**：PL2-05～08。
- **交付**：inventory、typed config、generated backend/schema、plugin lock、host + preset `AppModule`；legacy wiring
  仍可切回，business modules 保持 app-owned。
- **驗證**：plugin mode 與 legacy mode API/E2E parity；fresh fork 可重建 schema/catalog/build；rollback 只需切回
 已驗證 config/tag，不刪資料。

### PL2-10 建立 deterministic generation 與 clean-fork CI gate

- **owner**：Terra high（G2）；Luna 建 matrix；Gemini review。
- **依賴**：PL2-09。
- **交付**：CLI fixtures、goldens、generated drift checks、Prisma validation、template clean fork／tarball install
  workflow 與失敗診斷 artifacts。
- **驗證**：生成後重跑零 diff；故意改 generated file／manifest／lock／schema 時 CI 失敗；fresh checkout 不依賴
  developer machine cache。

### Gate G2 — 可重現的安裝與組裝

- **owner**：Sol max（G3）審 Prisma／lockfile／release safety；Gemini 審 clean-fork flow。
- **必須通過**：PL2-01～10、full gate、tarball consumer、template dual-mode parity、schema/permission dry-run 與
  rollback rehearsal。
- **過不了就**：不得把 generator 接入 frontend，也不得在 App 套用 migration。

---

## 7. Phase 3 — Frontend facets、slots 與 capability UI ownership

### PL3-01 固定 frontend facet 與 package export contract

- **owner**：Claude Sonnet（G2）；Sol 在 module-format/peer 衝突時 gate。
- **依賴**：G2。
- **交付**：navigation/admin/dashboard/i18n contribution types、server/client entry boundary、React/Next optional peer
  policy、same-package ESM frontend facet 與 exception criteria。
- **驗證**：純 backend consumer 不載入 React/Next；啟用 frontend facet 時 validator 強制 peers；client entry
  無 server-only import。

### PL3-02 實作 Next.js build-time generator

- **owner**：Terra xhigh（G2）；Claude review slot semantics。
- **依賴**：PL3-01、PL2-03～05。
- **交付**：`.appspine/generated/frontend/*` 靜態 imports、navigation、admin route adapter、i18n registry、slot
  ordering 與 digest/drift check。
- **驗證**：before/after cycle、priority tie、duplicate route/i18n namespace、permission visibility、server/client
  negative tests；不使用 runtime Module Federation。

### PL3-03 遷移 Users Admin 到 `identity-core/frontend`

- **owner**：Terra high（G2）；Claude API/UX review；Luna 可做 import inventory/codemod。
- **依賴**：PL3-02、PL1-10。
- **交付**：Users components/types/API adapter/frontend manifest contribution；`frontend-shell` 暫時 compatibility
  re-export；template generated route 使用新 subpath。
- **驗證**：Users list/create/update/activate/roles behavior parity、Next build、tarball consumer、old/new import compile。

### PL3-04 遷移 OIDC Login 到 `oidc-auth/frontend`

- **owner**：Terra high（G2）；Claude auth UX review；Sol security review。
- **依賴**：PL3-02、PL1-12、PL3-03 的 migration pattern。
- **交付**：LoginButton/error mapping/provider-specific UI 與 i18n contribution；Shell 只保留通用 auth layout primitive。
- **驗證**：登入、callback/error mapping、disabled/missing provider、server/client boundary 與 legacy re-export parity。

### PL3-05 遷移 Roles Admin 到 `rbac/frontend`

- **owner**：Terra high（G2）；Claude permission contract review；Luna codemod。
- **依賴**：PL3-03、PL3-01。
- **交付**：Roles UI/types/actions adapter/i18n/navigation contribution 與 compatibility exports。
- **驗證**：role CRUD、system role protection、permission policy display、RBAC guard、old/new import、template build。

### PL3-06 遷移 API Keys Admin 到 `m2m-api-key/frontend`

- **owner**：Terra high（G2）；Claude UX/API review；Sol 審 key reveal/security。
- **依賴**：PL3-05。
- **交付**：API key list/create/revoke、one-time secret reveal、role/service-account choices、frontend contribution 與
  compatibility exports。
- **驗證**：raw key 不持久化／不進 logs、acting-user constraints、scope UI、old/new import 與 template E2E。

### PL3-07 遷移 Domain Events Admin 到 `domain-events/frontend`

- **owner**：Terra high（G2）；Claude public type review；Luna codemod。
- **依賴**：PL3-06。
- **交付**：catalog、delivery/detail UI、domain event frontend types/API adapter、i18n/navigation contribution；消除
  `frontend-shell` 內手工 mirror types。
- **驗證**：catalog/delivery filters/detail behavior、large sequence serialization、old/new imports、Next build。

### PL3-08 遷移 Notification Bell／Inbox 到 `notification/frontend`

- **owner**：Terra high（G2）；Claude UX review；Luna codemod。
- **依賴**：PL3-07。
- **交付**：Notification UI、types、polling、i18n、slot contribution 與 API adapter boundary；Shell 保留 slot renderer。
- **驗證**：unread/list/mark-read/archive、targetless link、poll cleanup、client bundle、old/new imports 與 template E2E。

### PL3-09 收斂 `frontend-shell` 與執行 migration codemod

- **owner**：Claude Sonnet（G2）決定 public boundary；Terra／Luna 執行。
- **依賴**：PL3-03～08。
- **交付**：Shell 只保留 layout、slot/i18n infrastructure、通用 hooks/primitives；architecture lint 禁止 Shell
  反向依賴 capability；舊 exports 有 deprecation、changeset、codemod 與 transition window。
- **驗證**：source graph 零 capability reverse import；capability-specific components/types 清單歸零；舊 consumer
  仍編譯，新 consumer 只走 feature subpath。

### PL3-10 建立 plugin catalog／health 管理面

- **owner**：Claude Sonnet（G2）設計；Terra 實作；Sol 審 diagnostics/authorization。
- **依賴**：PL3-02、PL1-06、PL3-09。
- **交付**：受 RBAC 保護的 catalog/health admin contribution，顯示 plugin/instance/version/status/degraded/
  provides/requires/facets/digest 與 redacted diagnostics。
- **驗證**：非 admin 不可讀；secret 不顯示；required failure/degraded/multi-instance/override 皆可辨識。

### PL3-11 Template frontend integration 與 E2E

- **repo**：`appspine-app-template`。
- **owner**：Terra xhigh（G2）；Claude review；Luna 維護 route/import matrix。
- **依賴**：PL3-02～10。
- **交付**：generated navigation/routes/i18n、capability subpath imports、compatibility mode、plugin catalog page 與
  frontend drift gate；一般業務 pages 不搬入 plugins。
- **驗證**：Next build、typecheck、admin route direct-load/reload/navigation、非 admin、login、notification、nested
  dialog、catalog redaction E2E；generated files 重跑零 diff。

### Gate G3 — Frontend ownership 完成

- **owner**：Claude Sonnet primary；Sol 或同級 G3 審 module/security；不同 agent 做 Next build review。
- **必須通過**：PL3-01～11；`frontend-shell` 零 capability reverse dependency；所有 6 組 UI 由 owner package
  `./frontend` 發布；template tarball build/E2E；legacy exports 仍在 transition window。
- **過不了就**：停用該 frontend facet 或回復 compatibility export；不得複製 component 回 Shell 掩蓋問題。

---

## 8. Phase 4 — 其餘 capability／connector 遷移

### PL4-01 遷移 `notification` plugin（4A）

- **owner**：Terra high（G2）；Claude contract review。
- **依賴**：G3、PL1-09、PL2-06。
- **交付**：backend/prisma/operations/frontend facets、notification capability token、schema metadata 與 lifecycle。
- **驗證**：legacy/plugin parity、recipient isolation、schema drift、worker/poll cleanup、template notification contract。

### PL4-02 遷移 `rbac` plugin（4A）

- **owner**：Terra xhigh（G2）；Claude permission review；Sol G3 審 authorization。
- **依賴**：PL4-01、PL2-07、PL1-10。
- **交付**：manifest、`./plugin`、permission/prisma/backend/frontend facets、stable authorization tokens；逐步移除
  `RbacModule @Global()` 與 concrete `auth` imports。
- **驗證**：system roles、permission policy、guard behavior、identity augmentation、explicit bridge、legacy parity。

### PL4-03 遷移 `m2m-api-key` plugin（4A）

- **owner**：Terra xhigh（G2）；Sol G3 審 authentication/security。
- **依賴**：PL4-02、PL1-11。
- **交付**：machine auth strategy、scope matcher token、backend/prisma/frontend facets、instance-aware diagnostics；
  移除 `JwtOrApiKeyGuard` 作為跨插件組裝機制。
- **驗證**：OIDC + machine provider 共存、acting-user、rate limit、inactive/expired/revoked key、scope、legacy parity。

### PL4-04 遷移 `metadata-schema` plugin（4B）

- **owner**：Sol xhigh（G3）；Terra 實作；Gemini dependency audit。
- **依賴**：PL4-03。
- **交付**：metadata capability、explicit Prisma/scope requirements、backend facet 與 catalog；不直接依賴 M2M guard
  concrete chain。
- **驗證**：DMMF/permission/scope derivation、missing optional capability、schema drift、authorization negative tests。

### PL4-05 遷移 `domain-events` plugin（4B）

- **owner**：Sol xhigh（G3）；Claude public API review；Gemini capability audit。
- **依賴**：PL4-02～04。
- **交付**：backend/prisma/frontend/operations facets、subscriber registry bridge、integration contract references、
  admin contribution；host 不吞併 domain registry。
- **驗證**：outbox/dispatch/receipt/webhook/schema drift/admin、catalog snapshot、shutdown、legacy/plugin parity。

### PL4-06 遷移 `mcp-server` plugin（4B）

- **owner**：Sol xhigh（G3）；Terra 實作；Gemini dependency audit。
- **依賴**：PL4-03～05。
- **交付**：MCP tools capability、tool registry bridge、audit/scope/principal requirements、backend/operations facets；
  移除 `McpModule @Global()` 與 concrete auth/m2m/audit service imports。
- **驗證**：tool discovery/invoke、scope denial、principal propagation、audit correlation、registry snapshot、shutdown。

### PL4-07 遷移 `oidc-delegation` plugin（4C）

- **owner**：Gemini（G2 `repo-integration`）；Terra high 實作；Sol G3 審 identity/security。
- **依賴**：PL1-12、PL4-05。
- **交付**：connector config schema、backend/operations facets、delegated principal contract、integration contract refs
  與 negative diagnostics。
- **驗證**：既有 delegation positive/negative verification、issuer/audience/mapping、secret redaction、legacy parity。

### PL4-08 遷移 `master-data-client` multi-instance plugin（4C）

- **owner**：Gemini（G2）；Terra high 實作；Claude contract review。
- **依賴**：PL4-07、PL1-05。
- **交付**：`cardinality: multiple`、stable instanceId、instance-aware token/config/health/metric、connector contract 與
  rename migration policy。
- **驗證**：兩個 endpoints instance isolation、duplicate/renamed instance、partial degradation、secret redaction、
  shutdown 與 consumer integration。

### PL4-09 完成 package coverage／governance audit

- **owner**：Gemini（G2）；Luna 產生 matrix；Sol review exceptions。
- **依賴**：PL4-01～08。
- **交付**：15 現有 + 新 packages 的分類、owner、support/deprecation/security class、manifest/facet/export/peer/
  changeset coverage；記錄哪些 foundation package 刻意不是 plugin。
- **驗證**：catalog 無 orphan capability；所有官方 plugin 有 owner；無未宣告 direct import／requirement drift。

### PL4-10 更新 preset 並做完整 rollback rehearsal

- **owner**：Terra xhigh（G2）；Gemini coordinator；Sol G3 gate。
- **依賴**：PL4-09。
- **交付**：完整 `preset-standard` graph、template inventory、upgrade/downgrade/disable/remove plans、legacy switch-back
  與代表性 connector multi-instance configuration。
- **驗證**：template 與至少一個代表性 App 以 tarballs 完成 install/build/bootstrap/E2E；停用／回滾不 drop data；
  required/degraded catalog 正確。

### Gate G4 — Capability 遷移完成

- **owner**：Sol max（G3）；Gemini 做跨 package audit；Claude review public API。
- **必須通過**：PL4-01～10；full gate；package coverage；template + representative App tarball rehearsal；6 個原有
  capability `@Global()` 已按設計移除或只剩有明確期限的 compatibility bridge。
- **過不了就**：不發布 stable plugin platform；未完成 capability 留在 legacy mode 並在 catalog 明示。

---

## 9. Phase 5 — Release、全 App rollout 與 transition window

### PL5-01 產生 release manifest 與取得外部操作授權

- **owner**：Gemini coordinator；Sol G3 release gate；Luna 維護 version matrix。
- **依賴**：G4。
- **交付**：packages/versions/changesets、canary tag、publish order、peer ranges、template/App upgrade waves、rollback
  tag、migration plans、CI/registry health checklist。
- **驗證**：所有 package 先以 tarball 通過；release workflow 與權限已核對；使用者明確授權 push/publish 前
  停止，不把本文件核准當發布授權。

### PL5-02 發布 canary 並驗證 registry consumer

- **owner**：Terra high 執行；Gemini 監看；Sol G3 核准。
- **依賴**：PL5-01 的明確授權。
- **交付**：canary packages/preset、release notes、registry install evidence 與 rollback/fix-forward 決策。
- **驗證**：從 registry 而非 workspace 安裝；package integrity、exports、types、manifest、CJS/ESM、peer ranges、
  template clean build 全綠。

### PL5-03 將 `appspine-app-template` 切到 canary plugin mode

- **owner**：Terra xhigh（G2）；Gemini integration review。
- **依賴**：PL5-02。
- **交付**：registry versions、preset/inventory/config、generated backend/frontend/schema/lock、migration plan、E2E、
  fork docs 與 legacy rollback tag。
- **驗證**：fresh fork install/build/test/E2E/doctor/drift；plugin mode 為預設，legacy escape hatch 在 transition
  window 仍可用。

### PL5-04 `wiki` canary rollout

- **owner**：Terra high（G2）；Gemini coordinator；Sol review migration/security exceptions。
- **依賴**：PL5-03。
- **交付**：wiki inventory/preset、generated artifacts、schema/permission plan、frontend imports、E2E、rollback record。
- **驗證**：完整 build/test/E2E、OIDC/RBAC/M2M/MCP/domain-events、direct route、doctor/catalog；成功後才打開
  其餘 App waves。

### PL5-05 `calendar` rollout（Wave A）

- **owner**：Terra high（G2）；可同級替代。
- **依賴**：PL5-04。
- **交付／驗證**：依 PL5-04 模板完成 inventory、generated artifacts、migration/permission dry-run、E2E、rollback；
  保留 calendar business modules 與 pages 為 app-owned。

### PL5-06 `chat` rollout（Wave A）

- **owner**：Terra high（G2）；可與 PL5-05 使用不同 worktree 平行。
- **依賴**：PL5-04。
- **交付／驗證**：依 PL5-04 模板；特別驗證 realtime/background resources 有 lifecycle shutdown，不被 host
  誤判為可 hot unload。

### Gate G5A — Wave A

- **owner**：Gemini；Sol 只審重大例外。
- **必須通過**：calendar/chat 兩個 App 全綠、無新增 app-specific host exception、rollback evidence 完整。

### PL5-07 `drive` rollout（Wave B）

- **owner**：Terra high（G2）；Luna 維護版本差異。
- **依賴**：G5A。
- **交付／驗證**：先處理相對較舊的 `common/domain-events/health/m2m/mcp/metadata/rbac` baseline，再依 canary
  流程遷移；drive business storage/whiteboard pages 不插件化。

### PL5-08 `projects` rollout（Wave B）

- **owner**：Terra high（G2）；Claude review notification/frontend integration。
- **依賴**：G5A。
- **交付／驗證**：標準 plugin migration + notification facet／schema；專案業務 permission 仍由 App contribution
  提供；完整 E2E 與 rollback。

### Gate G5B — Wave B

- **owner**：Gemini；Sol 審版本或 schema 例外。
- **必須通過**：drive/projects 全綠；版本升級與 plugin migration 的問題可分辨；notification state 可回滾。

### PL5-09 `approve` rollout（Wave C）

- **owner**：Terra xhigh（G2）；Gemini integration review；Sol G3 審 cross-app/security。
- **依賴**：G5B。
- **交付／驗證**：標準 plugins + notification + master-data-client + integration contracts；驗證跨 App workflow、
  delegated/machine identity、domain events 與 rollback。

### PL5-10 `master-data` rollout（Wave C）

- **owner**：Terra xhigh（G2）；Gemini coordinator；Sol G3 審 identity/delegation。
- **依賴**：G5B。
- **交付／驗證**：標準 plugins、delegations、org-specific admin pages、identity mapping、integration contracts；
  一般 org business pages 保持 App-owned；完整 negative tests／rollback。

### PL5-11 `mcp-gateway` rollout（Wave C）

- **owner**：Terra xhigh（G2）；Gemini audit；Sol G3 審 MCP/auth/security。
- **依賴**：G5B。
- **交付／驗證**：標準 plugins + gateway-specific admin pages、MCP tool registry、vault/DLP/audit integrations；
  capability UI 由 package 提供，gateway-specific pages 仍屬 App；modal/direct route、scope、redaction、E2E、rollback。

### PL5-12 完成 fleet matrix、觀測性與 rollback evidence

- **owner**：Gemini coordinator；Luna 維護機械矩陣；Sol review exceptions。
- **依賴**：PL5-09～11。
- **交付**：template + 8 Apps 的 preset/version/instance/migration/permission/generated digest/CI/catalog/rollback
  matrix；列出所有 app-local plugins 與核准例外。
- **驗證**：沒有 unknown version、missing owner、unrehearsed rollback 或未解 required plugin；catalog/health 能在
  fleet 中辨識 degraded 狀態。

### PL5-13 啟動舊 API transition window 與 deprecation telemetry

- **owner**：Claude Sonnet（G2）定義 public deprecation；Gemini 收 consumer evidence。
- **依賴**：PL5-12。
- **交付**：`@appspine/auth` 與其他 legacy root/module/frontend exports 的 deprecation docs、codemod、usage
  scanner、期限與 owner；建立下一個 major removal proposal，但不執行移除。
- **驗證**：8 Apps + template 無未記錄 legacy usage；保留項目都有 consumer/期限/rollback；scanner 可在 CI
  防止新增 legacy import。

### PL5-14 Stable release 與最終驗收

- **owner**：Sol max（G3）release gate；Gemini coordinator；Terra 執行；Claude public API review。
- **依賴**：PL5-12、PL5-13、再次取得 stable publish 授權。
- **交付**：stable package/preset versions、release notes、compatibility report、fleet upgrade conclusion、incident/
  rollback contacts 與另立的 legacy removal plan。
- **驗證**：共通 full gate、registry clean consumer、template fresh fork、8 Apps CI/E2E、failure injection、rollback
  rehearsal、knowledge lint 全綠；發布後版本不可覆寫，只能 fix-forward。

### Gate G5 — 計畫完成

- **owner**：Sol 或經校準的同級 G3；不同 provider 做獨立 final review。
- **必須通過**：PL5-01～14；所有 051 §13 驗收條件都有可點查 evidence；沒有把 legacy API 移除偷渡進本
  release；未完成項目已轉成有 owner 的後續計畫。

---

## 10. 可並行與不可並行清單

### 10.1 可安全平行

- PL0-02 consumer scan 與 PL0-07 build graph 的調查可平行，但 PL0-07 最終 references 需吃 PL0-02 結果。
- PL1-02 testkit 與 PL1-03 host skeleton 可在 PL1-01 contract 穩定後平行。
- PL2-05 backend codegen、PL2-06 Prisma composer、PL2-07 permission reconciler 可在各自 contract 固定後以不同
  worktree 平行，最後由 PL2-09 integration。
- Phase 4A／4B／4C 可先做 package-local 準備；跨組依賴與 shared tokens 必須依任務 dependency 合併。
- Phase 5 同一 wave 的 App 可由不同 agent／worktree 平行；下一 wave 必須等 gate。

### 10.2 絕對不可平行

- manifest v1／stable token 未經 G0/G1 凍結前，不得讓多個 capability 自行發明不同 contract。
- `health-check → audit-log → identity-core/oidc-auth` 試點順序不可顛倒。
- PL3-03～08 的 package-local move 可以先準備，但 `frontend-shell` root exports/types/package metadata 的整合必須
  串行；避免不同 agent 同時改同一 barrel／lockfile。
- identity schema ownership、Prisma composer 與 production migration 不可由不同 agent 在無共同 fixture 的
  情況下各自前進。
- 未通過 tarball／template gate不得 publish；未取得授權不得 push/publish；未通過 wiki canary 不得展開 App
  waves。

---

## 11. Agent 替代與校準操作

每次把 task 派給與建議 roster 不同的 agent，先在 execution log 記錄：

| 欄位 | 必填內容 |
|---|---|
| Task | 例如 `PL2-06` |
| Actual agent | provider、model/version、推理強度 |
| Required class | G1／G2／G3 + specialty |
| Substitution reason | availability、cost、context、tool support 等 |
| Calibration | 同 Phase bounded task／fixture 與結果 |
| Tools | repo read/write、terminal、test、browser（若需要） |
| Independent reviewer | 不同 agent/model family |
| Evidence | commit、commands、test reports、known risks |

替代規則沿用 051 §15.3：同級或更高級才可直接替代；lower-tier 只能承接切小且可機械驗證的部分，最後由
原要求級別整合。連續兩次無法通過 bounded calibration／驗收，就更換 agent 或升級級別，不降低 gate。

---

## 12. 派工 prompt 最小模板

實際交給 agent 時，至少提供以下內容，避免它把相鄰 Phase 一起改掉：

```text
Task: PLx-yy <title>
Source of truth: knowledge/decisions/051-plugin-platform-engineering-plan.md
Execution contract: knowledge/decisions/051-plugin-platform-engineering-task-breakdown.md
Repo/worktree: <absolute path + branch>
Required capability: <G-level + specialty>
In scope: <task deliverables>
Out of scope: <next tasks, publish, production migration, API removal>
Dependencies/evidence: <accepted task IDs + commits>
Hot files owner: <agent/integration owner>
Required validation: <commands + fixtures + consumer tests>
Handoff: diff summary, commands/results, changeset, risks, rollback, next prerequisites
```

若 task 需要更改已核准 contract，agent 的輸出應是「evidence + 建議 ADR amendment」，不是直接改 contract 後
繼續擴散。

---

## 13. 執行追蹤清單

checkbox 只有在 task handoff 被 reviewer 接受後才勾選：

- [x] Phase 0：PL0-01～07；Gate G0 — 2026-08-18，證據 [Gate G0](../topics/051-pl0-gate-g0.md)
- [x] Phase 1：PL1-01～14；Gate G1 — 2026-08-18，證據 [Gate G1](../topics/051-pl1-gate-g1.md)、
      [PL1 執行紀錄](../topics/051-pl1-execution-log.md)
- [ ] Phase 2：PL2-01～10 已完成（見 [Gate G2](../topics/051-pl2-gate-g2.md)）；**Gate G2 未關閉**——
      獨立 review 未執行，且 template E2E parity 與 rollback rehearsal 未做。Phase 3 不得開始。
- [ ] Phase 3：PL3-01～11；Gate G3
- [ ] Phase 4：PL4-01～10；Gate G4
- [ ] Phase 5：PL5-01～14；G5A、G5B、Gate G5

每次更新 checkbox 時，同步更新本文件 `updated`、實際 agent mapping、accepted commit/evidence 與任何已核准
偏離；不得只勾選而沒有可重現驗證。

---

## 14. 本文件驗證

建立或更新本拆解後執行：

```bash
node scripts/lint-knowledge.js --write-indexes
node scripts/lint-knowledge.js
git diff --check
```

這些命令只驗證文件與索引一致性；不代表任何 `PL*` code task 已完成。
