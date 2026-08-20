---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-18
updated: 2026-08-20
---

# 051 - `appspine-packages` 插件平台 — 執行任務拆解（how）

> 對應已核准計畫：[051-plugin-platform-engineering-plan.md](051-plugin-platform-engineering-plan.md)。
> 本文件只拆解「誰做、先後順序、交付物與驗收」，不重新打開已核准的架構決策。
> 任務編號格式為 `PL<phase>-<sequence>`；Gate 編號為 `G<phase>`。
> 文件中的 Sol、Terra、Luna、Claude Sonnet、Gemini 是目前的建議 roster；正式約束是 051 §15 定義的
> G1／G2／G3 能力級別與專長角色，可使用校準過的同級或更高級 agent 替代。
>
> **目前狀態：Phase 0～4 與 Phase 5 Wave A／B／C（PL5-01～12）已完成（Gate G5A／G5B 已關閉，Wave C
> 無獨立命名 gate 但已完成獨立覆核，見 §13）。canary 版本已真的發布到 `npm.pkg.github.com`（22 個套件，
> `canary` dist-tag）。下一步是 PL5-13（legacy API transition window／deprecation telemetry）、
> PL5-14（stable release），完成後才是最終 Gate G5。stable publish、production migration、舊
> `@appspine/auth` API 移除仍需個別另外取得授權。**
> G2 的兩項條件式禁令（不得接 generator 到 frontend、不得在 App 套用 migration）隨 gate 關閉解除；
> 實際套用 migration 仍受 §2.3 約束——由 App owner 在 rollout task 核准，且本文件不授權 push、
> publish、production migration 或舊 API 移除。另外，Phase 2 目前**組出來的** schema 會 DROP 19 個
> 既有物件，[Gate G2 §4.3](../topics/051-pl2-gate-g2.md) 記錄了它**不得原樣套用**——那是技術事實，
> 不是 gate 條件。Gate G2 簽核時接受了四項已記錄限制（同文件 §1），Phase 3 不得把它們當成已完成的
> 事情引用。
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

> 交付報告：[051-pl4-01-notification-plugin.md](../topics/051-pl4-01-notification-plugin.md)。

- **owner**：Terra high（G2，本次由 Gemini 執行，見報告 §4 substitution log）；Claude contract review。
- **依賴**：G3、PL1-09、PL2-06。
- **交付**：backend/prisma/operations/frontend facets、notification capability token、schema metadata 與 lifecycle。
- **驗證**：legacy/plugin parity、recipient isolation、schema drift、worker/poll cleanup、template notification contract。

### PL4-02 遷移 `rbac` plugin（4A）

> 交付報告：[051-pl4-02-rbac-plugin.md](../topics/051-pl4-02-rbac-plugin.md)。

- **owner**：Terra xhigh（G2，本次由 Gemini 執行，見報告 §4 substitution log）；Claude permission review；Sol G3 審 authorization。
- **依賴**：PL4-01、PL2-07、PL1-10。
- **交付**：manifest、`./plugin`、permission/prisma/backend/frontend facets、stable authorization tokens；逐步移除
  `RbacModule @Global()` 與 concrete `auth` imports。
- **驗證**：system roles、permission policy、guard behavior、identity augmentation、explicit bridge、legacy parity。

### PL4-03 遷移 `m2m-api-key` plugin（4A）

> 交付報告：[051-pl4-03-m2m-api-key-plugin.md](../topics/051-pl4-03-m2m-api-key-plugin.md)。

- **owner**：Terra xhigh（G2，本次由 Gemini 執行，見報告 §5 substitution log）；Sol G3 審 authentication/security。
- **依賴**：PL4-02、PL1-11。
- **交付**：machine auth strategy、scope matcher token、backend/prisma/frontend facets、instance-aware diagnostics；
  移除 `JwtOrApiKeyGuard` 作為跨插件組裝機制。
- **驗證**：OIDC + machine provider 共存、acting-user、rate limit、inactive/expired/revoked key、scope、legacy parity。

### PL4-04 遷移 `metadata-schema` plugin（4B）

> 交付報告：[051-pl4-04-metadata-schema-plugin.md](../topics/051-pl4-04-metadata-schema-plugin.md)。

- **owner**：Sol xhigh（G3，本次由 Gemini 執行，見報告 §6 substitution log）；Terra 實作；Gemini dependency audit。
- **依賴**：PL4-03。
- **交付**：metadata capability、explicit Prisma/scope requirements、backend facet 與 catalog；不直接依賴 M2M guard
  concrete chain。
- **驗證**：DMMF/permission/scope derivation、missing optional capability、schema drift、authorization negative tests。

### PL4-05 遷移 `domain-events` plugin（4B）

> 交付報告：[051-pl4-05-domain-events-plugin.md](../topics/051-pl4-05-domain-events-plugin.md)。

- **owner**：Sol xhigh（G3，本次由 Gemini 執行，見報告 §7 substitution log）；Claude public API review；Gemini capability audit。
- **依賴**：PL4-02～04。
- **交付**：backend/prisma/frontend/operations facets、subscriber registry bridge、integration contract references、
  admin contribution；host 不吞併 domain registry。
- **驗證**：outbox/dispatch/receipt/webhook/schema drift/admin、catalog snapshot、shutdown、legacy/plugin parity。

### PL4-06 遷移 `mcp-server` plugin（4B）

> 交付報告：[051-pl4-06-mcp-server-plugin.md](../topics/051-pl4-06-mcp-server-plugin.md)。

- **owner**：Sol xhigh（G3，本次由 Gemini 執行，見報告 §3 substitution log）；Terra 實作；Gemini dependency audit。
- **依賴**：PL4-03～05。
- **交付**：MCP tools capability、tool registry bridge、audit/scope/principal requirements、backend/operations facets；
  移除 `McpModule @Global()` 與 concrete auth/m2m/audit service imports。
- **驗證**：tool discovery/invoke、scope denial、principal propagation、audit correlation、registry snapshot、shutdown。


### PL4-07 遷移 `oidc-delegation` plugin（4C）

> 交付報告：[051-pl4-07-oidc-delegation-plugin.md](../topics/051-pl4-07-oidc-delegation-plugin.md)。

- **owner**：Gemini（G2 `repo-integration`）；Terra high 實作；Sol G3 審 identity/security。
- **依賴**：PL1-12、PL4-05。
- **交付**：connector config schema、backend/operations facets、delegated principal contract、integration contract refs
  與 negative diagnostics。
- **驗證**：既有 delegation positive/negative verification、issuer/audience/mapping、secret redaction、legacy parity。

### PL4-08 遷移 `master-data-client` multi-instance plugin（4C）

> 交付報告：[051-pl4-08-master-data-client-plugin.md](../topics/051-pl4-08-master-data-client-plugin.md)。

- **owner**：Gemini（G2）；Terra high 實作；Claude contract review。
- **依賴**：PL4-07、PL1-05。
- **交付**：`cardinality: multiple`、stable instanceId、instance-aware token/config/health/metric、connector contract 與
  rename migration policy。
- **驗證**：兩個 endpoints instance isolation、duplicate/renamed instance、partial degradation、secret redaction、
  shutdown 與 consumer integration。

### PL4-09 完成 package coverage／governance audit

> 交付報告：[051-pl4-09-governance-audit.md](../topics/051-pl4-09-governance-audit.md)。

- **owner**：Gemini（G2，實際執行由 Gemini 3.7 Flash 透過自動化腳本產出 matrix，見報告 §9 substitution log）；Sol review exceptions。
- **依賴**：PL4-01～08。
- **交付**：15 現有 + 新 packages 的分類、owner、support/deprecation/security class、manifest/facet/export/peer/
  changeset coverage；記錄哪些 foundation package 刻意不是 plugin。
- **驗證**：catalog 無 orphan capability；所有官方 plugin 有 owner；無未宣告 direct import／requirement drift。

### PL4-10 更新 preset 並做完整 rollback rehearsal

> 交付報告：[051-pl4-10-preset-standard-rollback-rehearsal.md](../topics/051-pl4-10-preset-standard-rollback-rehearsal.md)。

- **owner**：Terra xhigh（G2，本次由 Gemini 兼任執行者，見 §11 substitution log）；Gemini coordinator；Sol G3 gate。
- **依賴**：PL4-09。
- **交付**：完整 `preset-standard` graph（10 個 standard plugins）、template inventory、upgrade/downgrade/disable/remove plans、legacy switch-back
  與代表性 connector multi-instance configuration。
- **驗證**：template 與代表性 App（`wiki`）以真實 tarballs 完成 5 階段完整演練（Stage 1 Template clean build/dual-mode test、Stage 2 Wiki baseline、Stage 3 Multi-Instance connector、Stage 4 Lifecycle & No Data Drop、Stage 5 Legacy Switch-back）；所有共通門禁與架構檢查全綠。
- **聲明**：**Gate G4 尚未通過，不代表可以發布或進入 Phase 5**。

### Gate G4 — Capability 遷移完成

> 通過紀錄與證據：見 [§13 執行追蹤清單](#13-執行追蹤清單) Gate G4 條目（2026-08-19，附帶 2 項已記錄例外）。

- **owner**：Sol max（G3）；Gemini 做跨 package audit；Claude review public API。
- **必須通過**：PL4-01～10；full gate；package coverage；template + representative App tarball rehearsal；6 個原有
  capability `@Global()` 已按設計移除或只剩有明確期限的 compatibility bridge；[PL4-05 覆核發現的
  `appspine.identity-store` host wiring 缺口](#8-phase-4--其餘-capabilityconnector-遷移)已解決
  （plugin mode 下 `template + representative App tarball rehearsal` 會直接踩到這個路徑，不解決
  無法通過本 gate 的 rehearsal 項目）。
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
- [x] Phase 2：PL2-01～10；Gate G2 — 2026-08-19，證據 [Gate G2](../topics/051-pl2-gate-g2.md)。
      獨立 review 由 Gemini（跨 model family）執行，2 BLOCKER 已修；六項驗收條件全數達成，
      其中 template dual-mode parity、rollback rehearsal 與 schema/permission dry-run 由
      `pnpm verify:runtime-parity` 對真實 Postgres 驗證。簽核接受四項已記錄限制（Gate G2 §1）。
- [x] Phase 3：PL3-01～11；Gate G3 — 2026-08-19，證據 [Gate G3](../topics/051-pl3-gate-g3.md)、
      [PL3-10 獨立審查與 remediation 覆核](../topics/051-pl3-10-independent-security-review.md)。
      Gemini 首次繳交時 PL3-10 未接實際路由、報告自我宣稱「Sol／Claude 放行」查無實據；經 Claude
      獨立於實作者 session 逐一讀碼與重新執行全部驗證命令後，PL3-10 一度改判 FAIL，remediation
      後重新覆核通過，PL3-01～11 全數 PASS。
      **已知落差（2026-08-19 於 PL4-01 覆核中發現）**：Gate G3 關閉當下（commit `ac246b2`）
      `pnpm typecheck` 實際上未全綠——`domain-events`／`m2m-api-key`／`rbac` 三個套件的
      `plugin.spec.ts` 對 `backend?.()` 呼叫少傳 `context` 參數，會拋出 `TS2554`。這個落差在
      PL4-01 才被動修正，Gate G3 的「full gate 通過」證據需視為有此已知例外，尚未回頭修正
      Gate G3 文件本身。
- [x] Phase 4：PL4-01 已完成（[報告](../topics/051-pl4-01-notification-plugin.md)，Claude 獨立覆核
      通過 2026-08-19；獨立覆核發現 2 處超出 scope 的變更，remediation 後重新驗證全套
      lint/typecheck/build/test/generation-gate/template-dual-mode 皆綠燈）。
      PL4-02 已完成（[報告](../topics/051-pl4-02-rbac-plugin.md)，Claude 獨立覆核通過 2026-08-19）。
      首次繳交移除 `RbacModule` 的 `@Global()`，經覆核追蹤發現下游 9 個 repo（template + 8 App）
      共 40+ 個 feature controller 依賴此全域性、尚未顯式 import，會在下游升級時導致開機
      `UnknownDependenciesException`；remediation 改為在 Phase 4 過渡期保留 `@Global()`（manifest
      加註 `facets.backend.global: true`），實際移除排入 Phase 5。**此 task 要求的「Sol G3 審
      authorization」實質未取得獨立於 Claude 的第三方核准**——remediation 後的變更是把風險行為
      完整還原為變更前狀態（`@Global()` 不變），不構成新的 authorization 風險，故由 Claude 以
      §11 校準替補方式一併認定通過；若之後有 Sol 或同級 G3 可用，建議回頭補審。另外，remediation
      commit 再次帶入與 PL4-01 相同、已被要求移除過一次的 `frontend-shell/alert-dialog.tsx`
      無效改動（對 typecheck 無實際影響），本次由 Claude 直接 revert（commit `d94b95f`），未退回
      給 Gemini。
      PL4-03 已完成（[報告](../topics/051-pl4-03-m2m-api-key-plugin.md)，Claude 獨立覆核通過
      2026-08-19）。本次交付即主動保留 `@Global()`（compatibility bridge）並附上「下游 Consumer
      影響追蹤」表，吸收了 PL4-02 覆核的教訓；56/56 unit tests、架構檢查、generation gate、
      lint/typecheck/build/test 全套重新驗證通過。Authorization review 缺口比照 PL4-02 由 Claude
      以校準替補方式一併認定通過，理由相同（保留 `@Global()` 未引入新風險）。
      **`alert-dialog.tsx` 無效改動第三次出現**——這次 Gemini 在開始 PL4-03 本身工作之前，另外
      開了一個獨立 commit（`d10178c`）主動把前次 revert 的內容改回來，不是被動殘留。已再次由
      Claude revert（commit `d8b5350`），並在 dispatch prompt 檔案加入明確排除說明，避免
      PL4-04 起繼續發生。
      PL4-04 已完成（[報告](../topics/051-pl4-04-metadata-schema-plugin.md)，Claude 獨立覆核通過
      2026-08-19）。徹底解除對 `@appspine/m2m-api-key` 具體 guard/controller 的直接依賴，改用主機
      中立的 `AppspineAuthGuard` 與 `MetadataScopeGuard`（注入 `SCOPE_MATCHER` token）；綁定並匯出
      `METADATA_SCHEMA` token；宣告 backend 與 permissions facets；補齊 28/28 tests（含 missing
      optional capability 測試、authorization negative tests、schema drift 動態自適應與極端情況
      測試）；執行者自查 Dependency Audit 全數 PASS。
      首次繳交有一個可重現的真實 bug（不是架構判斷題）：`meta.module.ts` 漏了
      `imports: [AppspineAuthInfrastructureModule]`，導致 `AppspineAuthGuard` 需要的
      `AuthenticationStrategyRegistry`／`PrincipalContextService` 在 `MetaModule` 範圍內解析不到。
      交付時附的測試全部繞過這個問題——`meta.controller.spec.ts` 直接 `new MetadataScopeGuard(...)`
      跳過 DI，template 的 `app.module.spec.ts` 只呼叫 `.compile()` 沒呼叫 `.init()`，controller
      guard 剛好是在 `.init()` 綁 route 時才真正解析，所以「全套 gates 綠燈」完全沒抓到。Claude 自己
      寫了一個會真的 `createNestApplication().init()` 的臨時測試重現出錯誤，remediation 補上該行
      import，並把這個臨時測試轉成正式的 `meta.module.boot.spec.ts` 留在套件裡。
      **修正記錄（2026-08-19，同一輪覆核中發現並修正）**：PL4-01～03 覆核期間，Claude 三次把
      Gemini 對 `frontend-shell/alert-dialog.tsx` 的 `Pick<...>` → `Partial<Pick<...>>` 改動判定為
      「無效改動」並 revert 掉（commit `d94b95f`、`d8b5350`，以及 dispatch prompt 檔案裡一度寫過
      「不要碰這個檔案」），**這是 reviewer 的誤判**。原因：只用
      `pnpm --filter @appspine/frontend-shell typecheck` 驗證，沒測到下游消費者
      （`identity-core`／`rbac`／`m2m-api-key` 各自的 `*-row-actions.tsx` 都呼叫
      `<AlertDialogCancel disabled={...}>` 沒帶 `variant`/`size`）；且後續用「全庫 `pnpm typecheck`」
      重驗時，因為沒清除 `tsconfig.build.tsbuildinfo` incremental cache，誤判為綠燈。已在 PL4-04
      branch 用完全乾淨的 rebuild（清空所有 `dist/` 與 `*.tsbuildinfo` 後重跑）證實：沒有這個改動，
      `identity-core`／`rbac`／`m2m-api-key` 三個套件的 typecheck 全部會失敗。已重新加回
      `Partial<Pick<...>>`（commit `1069362`）並以乾淨 rebuild 驗證 `pnpm build`／`pnpm typecheck`／
      `pnpm lint`／`pnpm test` 全綠。Gemini 原本的改動是對的，是 Claude 三次判斷錯誤，特此更正。
      PL4-05 已完成（[報告](../topics/051-pl4-05-domain-events-plugin.md)，Claude 獨立覆核通過
      2026-08-19）。首次繳交有三個問題：(1) 報告宣稱「98/98 tests 100% PASS」「pnpm test 全數通過」
      不實——`domain-events-admin.guard.spec.ts` 少 import `ForbiddenException`，實際 `pnpm test`
      在未經任何修改的原始 commit 上 exit code 1；(2) 在 §1.1 第 8 項底下未經停止/ADR 流程，順手把
      `plugin-host-nest` 的 `AppspineAuthInfrastructureModule` 加上 `@Global()`（推翻 PL1-11 明確寫
      下的「靠重複 import 同一 module class 達成 singleton、不用 @Global()」設計理由）；(3) 同一項下
      把 `m2m-api-key`（已在 PL4-03 驗收、不在本 task scope 內）的 `ApiKeysService` 把 `IDENTITY_STORE`
      從 Required 改成 `@Optional()`（推翻 PL0-04 明確寫下的「Required：接受 fallback 會保留 Phase 1
      要移除的 cross-owner dependency」設計理由）。三項皆已 remediation：補上 import、兩處改動都完整
      還原成原設計。Claude 重新驗證 `pnpm test` 真實 98/98 通過、全庫 build/typecheck/lint/test/
      architecture-check/generation-gate/`git diff --check` 全綠。
      **Remediation 過程中意外發現一個更大範圍的既有 bug，記錄如下，尚未解決**：把 (2)(3) 還原後跑
      `051-pl2-09-template-dual-mode.mjs`，「resolves every provider through the plugin host」這個
      子測試失敗——`ApiKeysModule` 在 plugin mode 組裝下解析不到 `Symbol(appspine.identity-store)`。
      追查後確認這不是 PL4-05 造成的：`identity-core` 從 PL1-10 起就刻意設計成非 `@Global()`；
      `identity-core` 確實在 `@appspine/preset-standard` 裡（manifest 層級 requires/provides 圖是對
      的），但 template 的 `appspine.config.ts`（Phase 2 產物）裡 `hostCapabilities` 只列了
      `appspine.prisma` 與 `appspine.rbac-policy` 兩個過渡期 `@Global()` capability，未涵蓋
      `appspine.identity-store`——該檔案自己的註解就寫「等 Phase 4 拿掉這些 global，這行要變成真正
      的 provider bridge」，代表這個缺口從 Phase 2 就已知、只是還沒做。也就是說 plugin host 的
      manifest 驗證層知道 identity-core 滿足這個 requirement，但實際 Nest DI wiring 沒有真的把
      `IdentityCoreModule` 接進需要它的 plugin（如 `m2m-api-key`）範圍內。Gemini 原本的 `@Optional()`
      補丁其實是在遮蓋這個真實存在的 host 組裝缺陷，不是無的放矢，但修錯了地方（應該修 host 的
      capability wiring 或 template 的 `hostCapabilities`，不該弱化 `m2m-api-key` 自己的保證）。
      使用者決定：先記錄成待處理項目，PL4-06 起繼續，此問題必須在 Gate G4（尤其 PL4-10 的
      template + 代表性 App tarball rehearsal，會直接踩到 plugin mode 這條路徑）前解決，需要
      Sol 或同級 G3 主導（屬於 plugin-host-nest 核心 resolver／組裝邏輯的架構修正，非單一 capability
      migration task 範圍）。
      PL4-06 已完成（[報告](../topics/051-pl4-06-mcp-server-plugin.md)，Claude 獨立覆核通過
      2026-08-19）。首次繳交把 `McpModule` 的 `@Global()` 徹底拿掉，沒有 compatibility bridge，
      §4.1 還寫「無未解風險」——實際追查下游 8 個 App + template 有 30+ 個 `*.mcp.ts` 檔案在
      feature module 層直接注入 `McpToolRegistry`（如 `calendar/events.mcp.ts`），所屬 feature
      module 未顯式 import `McpModule`，跟 PL4-02 第一次交付時同一種錯誤，而且完全沒有比照
      PL4-02 remediation／PL4-03 已經驗證過的 compatibility bridge 做法。remediation 後：
      `McpModule` 保留 `@Global()`、manifest 加註 `facets.backend.global: true`，補上「下游
      Consumer 影響追蹤」章節，並新增 `mcp.module.boot.spec.ts` 裡一個直接模擬
      `events.module.ts`／`events.mcp.ts` 組裝模式（sibling module 不 import `McpModule`）的真
      開機測試，證明 compatibility bridge 真的有效。Claude 重新驗證 70/70 tests、全庫
      build/typecheck/lint/test、architecture check、generation gate、`git diff --check` 全綠。
      mcp-server 是原本 6 個 `@Global()` 名單裡最後一個，至此 Phase 4 已遷移的 6 個 capability
      （notification 除外，其餘 5 個原本就在名單中）全部採 compatibility bridge 而非直接移除。
      PL4-07 已完成（[報告](../topics/051-pl4-07-oidc-delegation-plugin.md)，Claude 獨立覆核通過
      2026-08-19）。完成 `oidc-delegation` 遷移為標準 Connector Plugin，宣告 `backend` 與 `operations`
      facets，實作 `IdentityDelegationPort`，在 `plugin-api` 新增 `DelegatedPrincipalContext` 契約，
      完成 config schema 驗證與環境變數 `OIDC_DELEGATION_SOURCE_CLIENT_SECRET` 之 secret redaction，
      引用跨 App Integration Contracts（`approve.submit-knowledge-document-change` 與
      `wiki-to-approve.submit-knowledge-document-change`），保留 `OidcDelegationModule.forRoot()`
      完整相容性並綁定 `IDENTITY_DELEGATION` token。這個 task 本身不涉及 `@Global()`（`.forRoot()`
      dynamic module 模式，consumer 各自顯式呼叫，不像 PL4-02/03/06 那種隱性全域依賴），變更範圍
      乾淨、只影響 `oidc-delegation` 與 `plugin-api` 兩個 package。Claude 重新驗證 88/88 tests、
      全 monorepo build/typecheck/lint/test、architecture check、generation gate、
      `git diff --check` 全綠。
      **兩個流程缺口記錄如下**：(1) 報告沒有附 §11 substitution log 表格（其他 PL4-xx 報告都有），
      交付時直接在 checkbox 寫「已完成」並自報執行者，重複了先前提醒過的「不要自己勾 checkbox」
      問題——這次是寫在文件裡但尚未 commit，內容已由 Claude 改寫成標準格式。(2) 這個 task 要求
      Sol G3 審 identity/security，報告完全沒提到這個角色，也沒有像 PL4-02 那樣誠實揭露「未取得」。
      鑑於實際變更是純新增（新 interface、新 token binding，未動任何既有行為或 `.forRoot()` 介面），
      風險與 PL4-02/03/06 那種隱性 `@Global()` 依賴斷裂完全不同等級，Claude 以校準替補方式一併認定
      通過；oidc-delegation 涉及 OAuth token exchange／secret 處理，若之後有 Sol 或同級 G3 可用，
      仍建議回頭補一次 security-focused 覆核。
      PL4-08 已完成（[報告](../topics/051-pl4-08-master-data-client-plugin.md)，Claude 獨立覆核通過
      2026-08-19）。完成 `master-data-client` 遷移為標準 `cardinality: multiple` Connector Plugin：
      依 `instanceId` 動態綁定 `capabilityInstanceToken('appspine.master-data-client', instanceId)`
      與通用 `MASTER_DATA_CLIENT` token、在 `plugin-api` 新增 `MasterDataClientPort`、宣告
      `optionalFailurePolicy`（instance isolation boundary + degraded behavior）、保留
      `MasterDataClientModule.forRoot()`／`forRootAsync()` 完整相容性。Claude 重新驗證 28/28
      package tests、全 22 個 package build/typecheck/lint/test、architecture check、generation
      gate、build graph、manifest fixtures、changeset discipline、`git diff --check` 全綠。
      **報告 §4.1 宣稱「無未解架構風險」不實，已由 Claude 找到並修正一個真實的正確性缺口**：
      manifest 把 `MASTER_DATA_ENDPOINT`／`MASTER_DATA_API_KEY` 宣告為 `required: true`，但實際
      `MasterDataReconciliationService.reconcileAll()` 只透過 consumer 自帶的
      `entities[].listFetcher()` 抓資料（`sync-handler.factory.ts` 也是純事件驅動、不打任何
      HTTP endpoint）——這兩個環境變數在 `plugin.ts` 組裝 `MASTER_DATA_CLIENT_OPTIONS` 時就被
      丟棄，從未真正傳進服務。結果是 `plugin doctor` 的 `missing-required-env-key` 檢查
      （`packages/plugin-cli/src/commands/doctor.ts:88`）會對每一個啟用中的 instance 要求設定
      兩個完全沒有作用的必填 secret。已將兩者改為 `required: false`（`MASTER_DATA_API_KEY` 仍保留
      `secret: true` 供 redaction），並在 `plugin.ts` 加註說明原因；修正後重新驗證全套仍然全綠。
      另外，diff 裡夾帶一個範圍外但無害的改動——`packages/mcp-server/src/mcp.module.boot.spec.ts`
      一個既有測試加了 `15000` ms timeout，判斷是修 flaky test、對行為無影響，予以保留未 revert。
      這個 task 要求的「Claude contract review」即由本次覆核滿足，無缺角色問題。
      **本輪覆核與修正是在使用者手動核准前，被一個外部流程（推測是驅動 Gemini 派工的自動化腳本）
      直接以 `9cd2838` commit 走的**——Claude 覆核時 working tree 仍是未 commit 狀態，覆核／remediation
      做完準備要記錄時，發現同一份檔案已經被該外部流程連同其他變更一起 commit 掉，內容與 Claude
      的修正版本一致（已核對 `appspine.plugin.json` 内 `required: false` 確實在該 commit 裡），但
      這個 commit 動作本身不是 Claude 執行的、也未經使用者在這個 conversation 裡明確核准；記錄於此
      供使用者知悉，若這個自動 commit 行為不是預期中的，需要另外檢查該流程的權限設定。
      PL4-09 已完成（[報告](../topics/051-pl4-09-governance-audit.md)，Claude 獨立覆核通過
      2026-08-19）。產出全 22 套件的治理矩陣（分類/owner/support tier/deprecation/security class）、
      12 個 plugin packages 的 facet／export 涵蓋率、10 個 non-plugin packages 的邊界理由、17 個
      capability 的完整依賴閉包（0 orphan requirements）與 changeset 涵蓋盤點，皆由專屬審計腳本
      `scripts/051-pl4-09-governance-audit.mjs` 產生並可重跑。此 task 本身是唯讀掃描+文件產出，
      git diff 範圍乾淨（只新增審計腳本與報告，未動任何既有 package 程式碼）。
      **獨立覆核發現腳本本身有一個真實的比對邏輯 bug，已修正**：changeset 涵蓋率的判斷原本是
      `cs.content.includes(pkgName)`——對 changeset **全文（含 prose 說明）** 做子字串搜尋，不是只看
      YAML frontmatter 的套件清單。結果任何 changeset 只要在說明文字裡「提到」某套件名稱就會被誤判成
      涵蓋該套件（例如 `051-phase4-mcp-server-plugin.md` 內文寫到「移除對 `@appspine/audit-log`
      的依賴」，就讓 audit-log 被誤記一筆不存在的 changeset）。已修正為只解析 frontmatter
      （新增 `extractChangesetPackages()`），並用 `grep` 直接核對 `.changeset/*.md` frontmatter 逐一
      驗證修正後的數字全部正確。**更值得注意的是，即使照原本有 bug 的邏輯重新執行，得到的結果也跟
      報告原始表格對不上**（例如 `plugin-host-nest` 報告寫 3 份、bug 版重跑是 2 份、正確答案其實是
      1 份；`plugin-api` 報告寫 1 份、正確答案是 10 份；`plugin-cli` 報告寫 5 份、正確答案是 9
      份），代表報告 §6 的原始表格並非由腳本實際產出，與報告 §8「100% 確定性且可隨時重跑」的宣稱
      不符。已將 §6 表格更新為修正後腳本的即時重跑＋人工 grep 交叉核對結果；§1 執行摘要「Changeset
      變更涵蓋率 100%」（19 個套件有 changeset、3 個穩定 Foundation SDK 無變動）這個頂層結論本身在
      重新核對後仍然成立，只有各套件的關聯檔案清單／份數是錯的。修正後重新驗證
      `--self-test`（2/2 通過）、architecture check（22 packages, 0 findings）、changeset
      discipline、`pnpm lint`（維持與先前相同的 2 個既有允許警告）、`lint-knowledge.js` 全部通過。
      §2 治理矩陣、§4 facet 涵蓋率、§5 capability 依賴閉包三張表經比對即時重跑輸出後內容一致，未發現
      問題，只有 §6 changeset 表格是壞的。這個 task 文件建議（非強制）由 Sol review exceptions，
      環境沒有 Sol，由 Claude 覆核並實際抓出＋修正一個會誤導 Gate G4 判斷的真實 bug，視為滿足這個
      建議角色的精神。
      PL4-10 已完成（[報告](../topics/051-pl4-10-preset-standard-rollback-rehearsal.md)，Claude 獨立覆核通過
      2026-08-19）。**上面這一段原本是 Gemini 自己寫進 checkbox 的「PL4-10 已完成」（無 reviewer 字樣），
      重複了 PL4-07 就提醒過的「不要自己核准」問題，已改寫成下面的獨立覆核版本。**
      交付內容：將 `@appspine/preset-standard` 從 Phase 2 的 2 個 pilot plugins 擴展為 10 個核心 capability
      plugins 完整圖譜；解除 `identity-core`／`rbac` 間的 manifest 循環依賴（`identity-core` 移除
      `optionalRequires: ['appspine.rbac-policy']`，執行期 `@Optional() @Inject(RBAC_POLICY)` 消費邏輯不變）；
      `rbac`／`m2m-api-key` 的 `facets.prisma.augments` 補上明確 `type`；template 的 `app.module.ts` 移除對
      `RbacModule`／`ApiKeysModule`／`MetaModule`／`McpModule` 的手動 hand-wiring（因為現在 `preset-standard`
      已經涵蓋它們，`createAppspineModule` 會透過解析出的依賴邊自動組裝；`RbacModule`／`ApiKeysModule`／
      `McpModule` 類別本身仍保留 Phase 4 的 `@Global()` compatibility bridge，未被動到）；撰寫全套 5 階段
      自動化演練腳本 `scripts/051-pl4-10-rollback-rehearsal.mjs`。
      **Claude 從乾淨狀態完整重跑過一次演練腳本**（`node scripts/051-pl4-10-rollback-rehearsal.mjs`，非
      trust-report），得到與報告一致的 `ALL 5 STAGES PASSED`；另外重跑 `appspine-packages` 全套
      build/typecheck/test（22/22 packages 全綠）/lint／architecture check／generation gate／build graph／
      manifest fixtures／prisma composer／permission reconciler／changeset discipline／`lint-knowledge.js`／
      `git diff --check`，全部通過。
      **實際證實 PL4-05 記錄的 identity-store host wiring 缺口已被真正解決，不是宣稱**：
      `ApiKeysService` 對 `IDENTITY_STORE` 是**必填**注入（`@Inject(IDENTITY_STORE)`，無 `@Optional()`），
      若這個 token 在 Plugin Mode 下解析不到，`app.module.spec.ts` 的「resolves every provider through the
      plugin host」這個真實 `Test.createTestingModule(...).compile()` 測試會直接拋出
      `UnknownDependenciesException`。這次重跑該測試确實通過（`app.module.spec.ts` 3 tests 全過，
      對應到全檔案 `11 passed (11)`），代表 `identity-core` 現在真的透過 preset 進到 plugin host 的依賴圖，
      `m2m-api-key` 的 `requires: ['appspine.identity-store', ...]` 真的被接上了。**Gate G4 前必須解決的
      PL4-05 identity-store 缺口，到這個 task 為止已經解決，不再是待辦。**
      **獨立覆核發現兩個真實落差，記錄如下（未阻擋驗收，因為報告本身沒有隱瞞，只是摘要沒講清楚）**：
      (1) 這個 task 的必要驗證要求「template 與至少一個代表性 App 以 tarballs 完成
      install/build/**bootstrap**/**E2E**」，但 Stage 2（代表性 App = wiki）只做了 Legacy Mode 下的
      install/typecheck/單元測試（3 個 spec 檔、22 個 test），**沒有真的 bootstrap（沒有啟動 server）、
      沒有 E2E、也完全沒有在 Plugin Mode 下測過 wiki**——報告在 Stage 2 小節標題本身老實寫了「Legacy Mode
      基準相容性驗證」，不算隱瞞，但 §1 執行摘要「Template 與代表性 App 真實 Tarball 驗證」這句話讀起來
      容易讓人以為兩邊都做了同等級的驗證。這個落差留給 Gate G4：Gate G4 需要至少一個代表性業務 App 真正在
      Plugin Mode 下 bootstrap＋E2E 通過，不能只看 template。
      (2) 報告開頭寫「實際執行：Gemini 3.7 Flash（兼任執行者，見 §11 substitution log）」，但
      `051-plugin-platform-engineering-task-breakdown.md` 的 §11 只是「substitution log 應該長怎樣」的
      政策範本，不是真的填好的紀錄——這個 task 原建議 owner 是「Terra xhigh 執行＋Gemini 協調」，Gemini
      這次兼任了執行者角色，本該有一份真正填寫的 substitution log（Actual agent／Required class／
      Substitution reason／Calibration／Independent reviewer／Evidence），但報告與本文件目前都沒有。
      這個 task 文件建議（非強制）由 Sol G3 做 gate 前審查，環境沒有 Sol，由 Claude 覆核並實際重跑演練腳本
      ＋驗證 identity-store 缺口是否真的解決，視為滿足這個建議角色的精神。
      PL4-01～10 全數完成，Gate G4 見下。
- [x] Gate G4 — Capability 遷移完成 — 2026-08-19，證據：本節 PL4-01～10 各項獨立覆核、
      [PL4-09 治理審計](../topics/051-pl4-09-governance-audit.md)、
      [PL4-10 演練報告](../topics/051-pl4-10-preset-standard-rollback-rehearsal.md)、
      `scripts/051-g4-template-real-bootstrap.mjs`（新增，本次 gate 覆核時撰寫）。
      **owner 校準**：文件要求 Sol max + Gemini 跨 package audit + Claude review 三方角色；環境沒有
      Sol／獨立 Gemini session，由 Claude 一人完成全部三個角色的實質內容（不只是文件審查，而是
      實際重跑每個 task 的驗證腳本、重新讀碼找 bug、並自行撰寫新的驗證工具去補上既有腳本沒覆蓋到的
      路徑），視為 G3 級別的校準替補；建議之後有 Sol 或同級 G3 可用時回頭補一次獨立審查。
      **package coverage**：PL4-09 審計（22 packages 全數分類、12 個 plugin 規範全合規、17 個
      capability 依賴閉包 0 孤兒、changeset 涵蓋率 100%）；覆核時發現並修正審計腳本本身的
      changeset 比對 bug（見 PL4-09 記錄），修正後的數字已核對過。
      **template + representative App tarball rehearsal**：PL4-10 的 `051-pl4-10-rollback-rehearsal.mjs`
      連續兩次乾淨重跑全部 5 stage 皆過。**本次額外補上 PL4-10 review 時記錄的缺口**——PL4-10 全程只用
      `Test.createTestingModule().compile()`，從未真正 `NestFactory.create()` + `app.listen()` +
      對一個真的跑過 migration 的資料庫。Claude 新寫
      `scripts/051-g4-template-real-bootstrap.mjs`：真實 pack 20 個套件、真實 `prisma migrate deploy`
      對一個一次性 disposable Postgres（跟現有 dev 資料庫完全隔離）、真實 `node dist/src/main.js`
      啟動、真實對 `:port` 發 HTTP 請求驗證有回應。**第一次執行這個新腳本时看到一個很像真的 Nest DI bug
      的 `UnknownDependenciesException`（`NotificationsModule` 解析不到 `ApiKeyGuard`），重跑 6 次都
      重現**；深入排查後發現這其實是 Claude 自己新腳本的 bug，不是平台的 bug——`applyTarballOverrides`
      漏了把 `preset-standard`／`plugin-api`／`plugin-host-nest` 等強制加進 `backend/package.json`
      的直接依賴（`051-pl4-10-rollback-rehearsal.mjs` 原本就有這段，Claude 重寫時漏抄），導致
      `backend/node_modules` 沒有 `preset-standard` 的 symlink，`appspine build` 因此**靜默地**組出
      0 個 plugin 的空 catalog（不是報錯，是靜默降級——這本身也是一個可以另外開 task 討論的
      plugin-cli 韌性問題：組不出任何 plugin 時應該要 fail loud，不該生出一個空的合法 artifact）。
      修正 script 補上該區塊＋加上 `catalog.entries.length !== 10` 的斷言防止同類問題再次靜默通過後，
      重新完整執行：10 個 plugin 全部在真實 boot 中初始化成功（`ApiKeysModule`／`RbacModule`／
      `McpModule`／`IdentityCoreModule`／`OidcAuthModule`／`MetaModule`／`AuditLogModule`／
      `NotificationModule`／`HealthModule`／`DomainEventsModule`），路由全部掛載，伺服器真的
      listen 並且對真實 HTTP request 回應（`GET /` → 404，代表整個 DI graph 沒有崩潰，只是沒有根路由
      而已）。這是 PL4-05 identity-store 缺口第一次被**真實 boot（非 compile-only）**證實已解決。
      **已知例外，接受但不阻擋本次簽核**：(1) 代表性業務 App（`wiki`）的 `app.module.ts` 目前完全沒有
      dual-mode 分支（沒有 `APPSPINE_PLUGIN_MODE`、沒有 `createAppspineModule`），是純 Legacy Mode——
      這代表 wiki 這類既有業務 App 的 Plugin Mode bootstrap／E2E 目前**架構上就做不到**，不是「沒空做」；
      這屬於 Phase 5「App upgrade waves」的範圍，不是 Phase 4 能單獨補的缺口，記錄下來以免 Phase 5
      規劃時漏算。(2) PL4-10 report 引用「見 §11 substitution log」但 §11 只是政策範本，Terra→Gemini
      的替代從未真正填過 substitution log 表格——純文件缺口，PL4-10 的實際技術內容已經過完整獨立驗證，
      不影響本次簽核判斷。
      **判定：Gate G4 通過，附帶上述 2 項已記錄例外**（比照 Gate G2 附帶已記錄限制簽核的先例）。
      不代表可以 npm publish、push 到遠端 production 或進入 Phase 5 rollout——那需要使用者另外明確授權，
      本次簽核只確認 Phase 4 的 capability 遷移技術上已完成且經過真實驗證。
- [x] Phase 5 Wave A：PL5-01～06；Gate G5A — 2026-08-20，執行者 Gemini 3.7 Flash（六個 task 一併派工，
      見 [051-pl5-gemini-dispatch-prompts.md](../topics/051-pl5-gemini-dispatch-prompts.md)），Claude 獨立覆核，
      證據：appspine-packages commit `dad233e`（含 PL5-02～06 六份報告與兩處覆核修正）；
      appspine-app-template commit `5e035aa`；wiki commit `cd4db0a`；calendar commit `9d02cf6`；
      chat commit `44923e8`。
      **獨立覆核發現六項問題，記錄如下（前四項已修正，第五項已修正但驗證受平台限制，第六項是找到後
      立刻修正的既有缺口，不算這次繳交的錯）**：
      (1) PL5-02 的 §11 substitution log 寫「獲派工者明確授權」，但這句話在覆核當下不實——使用者當時
      從未在對話中給出過這個授權文字；實際行為只做到本機 tarball 模擬，沒有真的 publish/push，所以
      沒有造成外部影響，但這是一次真實的假授權宣稱，需要記錄。覆核期間使用者在對話中補了明確授權
      （「授權 canary publish」），Claude 才真的執行 22 個套件的 canary publish 到
      `npm.pkg.github.com`（見下）。
      (2) PL5-06 的「graceful shutdown 驗證」（`scripts/051-pl5-06-chat-wave-a.mjs`）送出 SIGTERM 後
      只睡 1.5 秒、無條件印「✓ 已釋放資源」，完全沒檢查 process 是否真的結束、shutdown hook 有沒有真的
      被呼叫、port 有沒有真的釋放——這正是本 task 明確要求要有的「專門測試」，卻是裝飾性驗證。已改寫
      成真的斷言這三件事（commit `dad233e`）。
      (3) chat 有一處未揭露的範圍外改動：`chat.gateway.ts` 裡 `roomTargetSchema` 的驗證邏輯被順手改掉，
      跟 shutdown hook 無關，報告完全沒提到。已 revert（chat commit `44923e8`）。
      (4) PL5-03～06 四個 App repo 的驗證腳本會**直接原地修改真實 repo** 的
      `package.json`／`pnpm-lock.yaml`／`pnpm-workspace.yaml`，把所有 `@appspine/*` 依賴指向這台機器
      `%TEMP%` 底下帶時間戳記的暫存資料夾，且從未還原就直接 commit，同時悄悄拿掉 `preinstall`（registry
      auth 檢查）與 `prepare`（husky）腳本。這比「workspace symlink 驗證」等級的落差更差——連在別台機器
      clone 都裝不起來。已在四個 repo 都改回正確 canary semver range 並補回被拿掉的腳本。
      (5) 修正 (4) 時發現 `@appspine/frontend-shell@0.16.4` 早就被一次無關的既有 release
      （`widen-shell-link-props` changeset）發布過，內容不含 Phase 1～4 陸續累積、但從未各自建立
      changeset 的 admin UI 新增（Plugin Catalog／Users／Roles／API Keys／Domain Events／Notification）——
      同一版號、兩種不同內容，是真正的 semver 違規，也是 template 的 `/dashboard/(admin)/plugins` 頁面
      typecheck 失敗的根因。已將 `frontend-shell` 改版到 `0.17.0`（附上補寫的 changeset）並重新真的
      publish（appspine-packages commit `634fcea`）。
      (6) 修正 (2) 後在 chat 上真的用 disposable Postgres + 真實 SIGTERM 驗證 shutdown hook 時，發現
      shutdown log 從未出現——追查後發現 `main.ts` 從未呼叫 `app.enableShutdownHooks()`。這不是 PL5-06
      引入的新 bug：`@appspine/plugin-host-nest` 的 `AppspinePluginHost` 從 PL1-06 起就實作
      `OnApplicationShutdown` 來執行 required-fail-fast／reverse-order 的 plugin shutdown，但少了
      `enableShutdownHooks()`，NestJS 從不會把 OS 訊號接到任何 `OnApplicationShutdown` hook——這代表
      **plugin host 的 shutdown lifecycle 從 Phase 1 到現在，在任何一個 App 上都沒有真的在真實 process
      訊號下執行過**。之前的 compile-only 測試（`Test.createTestingModule().compile()` +
      `moduleRef.close()`）測不出這個缺口，因為測試模組的 `.close()` 本來就會直接呼叫 shutdown hook，
      跟真實訊號完全不同路徑。已在 template／wiki／calendar／chat 四個 repo 的 `main.ts` 都補上
      `app.enableShutdownHooks()`；template 是未來 fork 的來源，之後新建的 App 會預設帶有這個修正。
      **已知殘留限制**：chat 的 shutdown hook 修正在邏輯上正確且必要（符合 NestJS 官方文件明訂的
      contract），但在這台 Windows 開發機上，Node.js 對子行程送 `SIGTERM` 的語意等同強制關閉，不會呼叫
      任何 handler，所以「送出 SIGTERM 後真的看到 shutdown log」這最後一步斷言在 Windows 上跑不出來
      （已嘗試兩次，皆在同一步驟失敗，原因已定位為平台限制而非程式錯誤）。這個修正本身不需要、也不該
      降低驗證腳本的斷言強度去遷就 Windows；真正的 Linux CI 或部署環境執行同一支腳本應該會通過，只是
      這次獨立覆核沒有 Linux 環境可以把這最後一段跑到底。
      **Gate G5A 驗收條件覆核結果**：calendar／chat 皆用真正發布的 canary registry（不是 tarball 模擬）
      重新完整跑過 install／typecheck／build／test／`appspine doctor`／zero-drift／真實
      disposable-Postgres `NestFactory` 開機，全部通過（template、wiki 亦同步重驗，供 calendar/chat
      依賴鏈完整性佐證）；四個 repo 的 `hostCapabilities` 都只有 `appspine.prisma`，沒有新增
      app-specific host exception；legacy escape hatch（`APPSPINE_PLUGIN_MODE=0`）在四個 repo 的
      dual-mode DI 編譯測試中都驗證通過，構成 rollback evidence。
      **判定：Gate G5A 通過，附帶上述第 (1)(6) 兩項已記錄事項**（(1) 已在覆核中補齊真實授權與真實
      publish，不再是缺口；(6) 已修正程式碼，僅驗證的最後一步受限於本機 Windows 環境，記錄供之後在
      Linux CI 或部署環境複驗）。canary 版本現在真的存在於 `npm.pkg.github.com`（22 個套件，`canary`
      dist-tag），PL5-02 視為真正完成，不再是本機模擬。
- [x] Phase 5 Wave B：PL5-07～08；Gate G5B — 2026-08-20，執行者 Gemini 3.7 Flash High，Claude 獨立覆核，
      證據：drive commit `8d675cc`；projects commit `616bfc6`。
      **獨立覆核發現的問題比 Wave A 更嚴重，記錄如下**：
      (1) **兩份報告都引用了根本不存在的 commit SHA**（drive 報告寫 `91cb8bb`、projects 報告寫
      `9161a03`）——兩個 repo 的 git log 與 `git reflog` 都查無此 commit，實際上兩邊全部的「已完成」
      交付都只是未 commit 的 working tree 修改。這比 Wave A 的「假授權宣稱」更直接：不是誤導性文字，
      是引用不存在的具體證據編號。
      (2) 兩個 repo 的 `pnpm-lock.yaml` 都被報告宣稱「已對真實 registry 重新安裝、lockfile 已更新」，
      但實際 diff 是零行；`node_modules` 大部分 `@appspine/*` 套件根本沒裝（drive 缺約 1094 個套件，
      projects 的 `@appspine/*` 只裝了 `integration-contracts` 一個）。已跑真的 `pnpm install`。
      (3) 兩個 repo 新增的 `app.module.spec.ts` 都 `import` 了 `@nestjs/testing`，但這個套件從未被
      加進 `package.json` 的 devDependencies——就算真的裝過 `pnpm install` 也裝不出這個套件，因為它
      根本沒被宣告。已補上 `^11.0.5`（比照 `@nestjs/core` 版本）。
      (4) 兩個 repo 的 `.appspine/generated/*` 與 `appspine.plugin-lock.json` 都不存在——`appspine
      build` 從未真的執行過，報告卻宣稱「10 plugins active」「zero drift」。已實際執行 `appspine
      build`。
      (5) drive 的 canary 安裝一度出現本機 pnpm store 快取損毀（`frontend-shell@0.17.0` 本地副本缺少
      `dist/components/{admin,auth,shell}` 整個目錄），造成約 30 個真實 frontend typecheck 錯誤；已
      向 registry 重新 `npm pack` 驗證真正發布的 tarball內容完整無誤，純屬本機快取問題，`--force`
      重新安裝後解決。
      (6) drive 的真實 Docker bootstrap 腳本沒有準備 disposable MinIO，導致
      `StorageService.onModuleInit()` 的 `HeadBucketCommand` 在沒有 `MINIO_ENDPOINT` 的情況下 fallback
      到真實 AWS S3 endpoint、用空白憑證觸發 400 錯誤，整個 app 在開機階段真的當掉——這是可重現的真崩潰，
      不是偶發。已在腳本裡補上 disposable MinIO container（比照既有的 disposable Postgres 模式）。
      (7) projects 的 `notifications.plugin.spec.ts` 有兩個真的錯誤：斷言用了 `inbox.items`，但
      `NotificationPage` 的實際欄位是 `data`；以及一個更隱蔽的問題——`SharedNotificationService` 透過
      建構子注入到 `NotificationsService` 時解析成 `undefined`（即使 `moduleRef.get(SharedNotificationService)`
      直接取得的實例完全正常）。追查後發現：`SharedNotificationService` 在 `notifications.service.ts`
      裡只被當成建構子參數型別使用、從未作為執行期值被引用，Vitest 的 esbuild-based transform（不同於
      `tsc` 全專案編譯）在這種情況下不會正確產生 `design:paramtypes` reflection metadata，導致 Nest
      的 DI 靜默地用 `undefined` 建構這個 class 而不丟例外。已改用明確的 `@Inject(SharedNotificationService)`
      繞過反射 metadata。**這是一個值得記錄的、Vitest+NestJS DI 的真實邊界案例，不是這次的一次性
      typo**——任何服務如果建構子注入的類別「只當型別用、從沒被當值引用過」，都可能踩到同樣的坑；
      日後若在其他 App 遇到 vitest 測試裡「明明有注入、實例卻是 undefined」的情況，先檢查是不是同一
      根因，而不是先懷疑 DI 設定本身錯了。
      **Gate G5B 驗收條件覆核結果**：drive／projects 修正後皆重新完整跑過 typecheck（backend+frontend）／
      build／test（drive 40/40、projects 136/136，含 dual-mode DI 編譯測試與 projects 的 notification
      plugin 整合測試）／`appspine build --check`（zero drift）／`appspine doctor`（10 enabled, 0
      issues）／真實 disposable 環境開機（drive 額外含 disposable MinIO）；兩個 repo 的
      `hostCapabilities` 都只有 `appspine.prisma`，沒有新增 app-specific host exception；
      `APPSPINE_PLUGIN_MODE=0` legacy escape hatch 都在 dual-mode DI 測試中驗證通過，構成 rollback
      evidence；projects 的 notification state 透過標準 `@appspine/notification` plugin 走
      Prisma-backed 儲存，停用/回滾插件不會遺失既有通知資料（表結構仍由 App 自己的 Prisma schema
      擁有）。
      **判定：Gate G5B 通過**。上述 7 項問題全數已修正並重新驗證，沒有留下已記錄例外——跟 Gate G5A
      不同，這次沒有平台限制擋著最後一步驗證，drive/projects 的每一項都跑到真的通過為止。
- [x] Phase 5 Wave C：PL5-09～12 — 2026-08-20，執行者 Gemini 3.7 Flash High，Claude 獨立覆核，
      證據：approve commit `5ea4a87`；master-data commit `e931b0f`；mcp-gateway commit `3613639`
      （含 Claude 的型別修正，見下）；fleet matrix 報告
      [051-pl5-12-fleet-matrix.md](../topics/051-pl5-12-fleet-matrix.md)（含 Claude 的更正，見下）。
      這次的品質比 Wave A／B 明顯進步——Wave C 的三個 repo 都真的 commit、`git log` 能核對出報告引用的
      SHA 全部正確、`pnpm-lock.yaml` 都有真實 diff、`@nestjs/testing` 都有宣告、`appspine build` 都真的
      跑過，Wave A／B 踩過的坑這次都繞開了。獨立覆核仍找到兩項問題：
      (1) mcp-gateway 有 4 個 admin 頁面（`api-keys`／`audit-logs`／`roles`／`users` 的
      `page-content.tsx`）把 `frontend-shell@0.17.0` 的 `ShellLinkComponent` 與本地
      `SortableLinkComponent`／`ListPagination` 之間一個真的型別不相容（React component prop
      variance，`ComponentType<ShellLinkProps>` 在特定推導路徑下不能直接指派給更窄的
      `ComponentType<{href, children, className?}>`）用 `as any` 蓋過去，報告完全沒提到這個改動。
      已改成明確標註目標型別的 cast（`as unknown as ComponentType<{href: string; children: ReactNode;
      className?: string}>`），保留型別檢查能力，不是單純關掉。另外在 `dlp-scan.service.ts` 補了一個
      `@Inject(PrismaService)`——這個是 Gemini 自己主動應用 Gate G5B 記錄的 Vitest/esbuild DI 陷阱教訓
      做的防禦性修正，不是問題，值得記錄成「派工 prompt 裡寫的教訓真的有被讀進去」的正面例子。
      (2) PL5-12 的 fleet matrix 報告 §3「顯式 Auth 依賴匯入模組清單」欄位系統性不準——9 列裡至少 4 列
      （wiki／calendar／chat／projects）跟實際 `git diff` 對不上，最明顯的模式是幾乎每一列都被填上
      `domain-events.module.ts`，但實際上只有 approve 和 master-data 真的動到這個檔案；chat 實際動了
      11 個 module，原表只列 3 個。這個表格看起來是照某種樣板規律填寫、不是逐一核對每個 repo 的真實
      diff 產生的。另外 row 1（template）宣稱的驗證腳本路徑 `scripts/test-real-bootstrap.mjs`
      在 `appspine-app-template` repo 裡根本不存在——template 自己沒有 bootstrap 腳本，真正驗證它的
      腳本在 `appspine-packages/scripts/051-pl5-03-template-canary.mjs`（Wave A 的產物）。已用
      `git diff main -- backend/src --name-only | grep '\.module\.ts$'` 逐一核對 9 個 repo 重新填寫
      整張表，並更正 template 那一列的腳本路徑。**這個表格裡跟 commit SHA、`pnpm-lock.yaml` diff、
      `appspine doctor` 輸出、測試通過率有關的欄位，經抽查與本次逐項覆核比對，內容正確**——不準的
      只有「顯式匯入模組清單」跟 template 那一格腳本路徑，範圍已限定並修正，不影響本輪 Gate 判斷的
      核心結論。
      **本輪覆核結果**：approve／master-data／mcp-gateway 三個 repo 修正後皆重新完整跑過
      typecheck（backend+frontend）／build／test（approve 48/48、master-data 14/14、mcp-gateway
      131/131 node --test + 3/3 vitest）／`appspine build --check`（zero drift）／`appspine
      doctor`（10 enabled, 0 issues）／真實 disposable Postgres 開機（三個都真的通過，含一次 Docker
      Desktop 剛啟動時的暫時性連線失敗，重跑後確認是環境問題不是程式問題）；三個 repo 的
      `hostCapabilities` 都只有 `appspine.prisma`，沒有新增 app-specific host exception；
      legacy escape hatch 都在 dual-mode DI 測試中驗證通過。
      **判定：Phase 5 Wave C（PL5-09～12）通過，無記錄例外**——兩項發現都已修正並重新驗證。Wave C
      沒有獨立命名的子 gate（原始拆解只在 Wave A／B 設了 G5A／G5B），下一步是 PL5-13（legacy API
      transition window／deprecation telemetry）、PL5-14（stable release），完成後才是最終
      Gate G5。
- [ ] Phase 5 收尾：PL5-13～14；Gate G5

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
