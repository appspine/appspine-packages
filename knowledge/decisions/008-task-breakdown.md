---
type: decision
scope: cross-repo
status: completed
supersedes: null
superseded_by: null
created: 2026-07-02
updated: 2026-08-05
---

# 008 - App Template Fork 驗證 Task Breakdown

> 依照 `008-app-template-fork-validation-plan.md` 執行一次完整的 app-template fork 驗證。
> 測試 repo 為 `appspine/smoke-test-app`，本機 clone 固定放在 `D:\Source\Private\appspine\apps\smoke-test-app\`。
> 每完成一個 task，要把 checkbox 從 `[ ]` 改成 `[x]`，並補上實際執行結果。

---

## 1. 執行原則

- `PACKAGES_READ_TOKEN` 必須由使用者提供真實 token。
- `smoke-test-app` 是一次性測試 repo；相關 scaffold / CRUD commit 都進這個 repo。
- 如果發現的是 `appspine-app-template` 或 `appspine` 上游 bug，修復 commit 必須進上游 repo，不可混進 `smoke-test-app`。
- 若某步驟因本機環境限制無法執行，必須明確記錄為「未執行 / 需使用者本機補做」。
- T-808 刪除 GitHub repo 與本機 clone 前，要再次取得使用者確認。

---

## 2. Task Breakdown

### A. 建立測試 repo

- [x] **T-800** 用 `gh repo create` 從 template 建立 `appspine/smoke-test-app`（private）
  - 依賴：無

### B. Scaffold 驗證

- [x] **T-801** clone 到 `D:\Source\Private\appspine\apps\smoke-test-app\`，執行 `scaffold-init.mjs`，並驗證 token replacement
  - 依賴：T-800

### C. 本機啟動與 Secret

- [x] **T-802** 本機啟動驗證：`pnpm install`、DB、migrate、seed、`pnpm dev`、health check
  - 依賴：T-801

- [x] **T-803** 設定 `PACKAGES_READ_TOKEN` repo secret
  - 依賴：T-800

### D. Scaffold CI 驗證

- [x] **T-804** commit + push scaffold 變更，並用 `gh run watch` 確認 CI 綠燈
  - 依賴：T-801、T-803

### E. CRUD 驗證

- [x] **T-805** 依 `002-app-dev-conventions.md` 新增 `Announcement` CRUD 模組
  - 依賴：T-802

- [x] **T-806** commit + push CRUD 變更，並確認 CI 綠燈
  - 依賴：T-805

### F. 記錄與清理

- [x] **T-807** 將新發現整理到 `Z02-app-template-fork-validation.md`
  - 依賴：T-804、T-806

- [x] **T-808** 刪除 `smoke-test-app`（GitHub repo + 本機 clone）
  - 依賴：T-807
  - 注意：執行前需再次取得使用者明確確認

---

## 3. 執行結果

- **T-800**
  - 2026-07-02 成功執行：
    `gh repo create appspine/smoke-test-app --template appspine/appspine-app-template --private`
  - Repo URL：`https://github.com/appspine/smoke-test-app`

- **T-801**
  - 成功 clone 到：`D:\Source\Private\appspine\apps\smoke-test-app\`
  - 成功執行：
    `node scripts/scaffold-init.mjs --name smoke-test-app --display-name "Smoke Test App"`
  - 已驗證替換成功：
    - `frontend/package.json`
    - `backend/package.json`
    - `.env.example`
    - `README.md`
    - `CLAUDE.md`
    - `AGENTS.md`
    - `docs/agent-guide.md`
  - 額外發現：
    - 驗證文件原本寫的是 `frontend/src/app/app-config.ts`
    - 實際 repo 路徑是 `frontend/src/config/app-config.ts`

- **T-802**
  - 成功執行：
    - `pnpm install`
    - `docker compose up -d db`
    - `pnpm -C backend prisma:migrate`
    - `pnpm -C backend prisma:seed`
    - `pnpm dev`
    - `GET http://localhost:3900/health`
  - 途中問題與解法：
    - 一開始 Docker daemon 未啟動，導致本步驟無法完成；待使用者啟動 Docker 後重跑成功。
    - 早期一次 `prisma:migrate` 曾出現 transient schema / DB lock 類問題，後來在清理 stale Prisma / node process 後重跑成功。

- **T-803**
  - 使用使用者提供的 token 設定 repo secret：
    `gh secret set PACKAGES_READ_TOKEN --repo appspine/smoke-test-app`
  - 已用 `gh api repos/appspine/smoke-test-app/actions/secrets` 確認 secret 存在

- **T-804**
  - Scaffold commit：
    `0e27f43 chore: scaffold-init smoke-test-app`
  - 已 push 到 `main`
  - Workflow run：
    `28577258442`
  - 結果：成功
  - 備註：
    - GitHub Actions 有 Node 20 deprecation warning，但不影響本次驗證結果

- **T-805**
  - 已完成 `Announcement` CRUD 實作，包含：
    - Prisma model + migration
    - `Permission` enum 新增 `ANNOUNCEMENTS_READ` / `ANNOUNCEMENTS_WRITE`
    - Nest module / controller / service / MCP tool
    - frontend API
    - admin page / dialog / row actions
    - sidebar / breadcrumb / locale
    - schema docs 更新
    - RBAC coverage
    - announcement Playwright spec
  - 本機驗證成功：
    - `pnpm -C backend typecheck`
    - `pnpm -C frontend typecheck`
    - `pnpm -C backend schema:docs`
    - `pnpm -C backend check:enum-i18n`
    - `pnpm -C e2e typecheck`
    - targeted `pnpm -C e2e test -- announcements.spec.ts`
  - 途中問題與解法：
    - Prisma migration 一度卡在等待輸入 migration 名稱。
      - 解法：改用非互動式命令
        `pnpm -C backend prisma:migrate -- --name add-announcements`
    - Announcement E2E 一度因 `Search` selector 不夠精準失敗。
      - 解法：改成 exact match，避免撞到 command search trigger。
    - 全量本機 `pnpm -C e2e test` 曾出現一次 `.auth/admin.json` 的 flaky race：
      `Unexpected end of JSON input`
      - targeted spec 與 GitHub Actions CI 皆通過
      - 已記錄到 Z02，判定為 `@appspine/e2e-kit` 上游 follow-up

- **T-806**
  - CRUD commit：
    `d3b26ba feat: add announcements module`
  - 已 push 到 `main`
  - Workflow run：
    `28580255904`
  - 結果：成功（CI 綠燈）

- **T-807**
  - 已新增：
    `_archive/dev_docs-20260803/app-template/Z02-app-template-fork-validation.md`
  - 記錄內容包含：
    - `@appspine/e2e-kit` 本機平行 auth storage-state race
    - `frontend/src/app/app-config.ts` 文件路徑過期
    - Prisma migration 名稱應改用非互動式命令明確指定

- **T-808**
  - 已取得使用者確認並完成清理
  - 本機 clone 已成功刪除：`D:\Source\Private\appspine\apps\smoke-test-app\`
  - GitHub repo 已成功刪除：`appspine/smoke-test-app`
  - 過程中曾先失敗一次，原因是 `gh` token 缺少 `delete_repo` scope；使用者補跑
    `gh auth refresh -h github.com -s delete_repo` 後重試成功

---

## 4. 結論摘要

- Fork flow：已成功驗證
- Scaffold：已成功驗證
- 本機啟動：已成功驗證
- CI：兩次皆綠燈
- 002 CRUD 流程：主流程可行，但需補上 Prisma migration 非互動式命名規範
- 是否需要 Z02：需要，且已建立
