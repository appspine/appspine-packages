---
type: decision
scope: cross-repo
status: active
source_repo: appspine/wiki
source_commit: c053b6ec7e6c5d24fa134a9360642062267a6348
canonical_url: https://github.com/appspine/wiki/blob/c053b6ec7e6c5d24fa134a9360642062267a6348/knowledge/decisions/011-wiki-app-plan.md
created: 2026-07-03
updated: 2026-08-03
supersedes: null
superseded_by: null
copy_status: fresh
---

# 011 - Wiki App（appspine 第一個業務系統）- 系統設計計畫

> 狀態：已完成，app 已上線於 apps/wiki

---

## 1. 背景與定位

appspine 的第一個業務系統，從 `appspine-app-template` fork 出來，落地在
`apps/wiki/`（獨立 repo，獨立資料庫，比照 001「多 repo」決策）。

定位：團隊知識庫（類 Notion / Confluence）——多個獨立 Space，每個 Space 一棵巢狀
Page 樹，Tiptap v3 富文字編輯器作為內容引擎。與 auranest-wiki 定位完全相同，此次是把
同一套已驗證的產品設計「重新套用 appspine 框架的身份/權限/AI 整合機制」，不是重新設計
產品。

---

## 2. 與 auranest-wiki 的差異調整

| 項目 | auranest-wiki（來源） | appspine wiki（本次） | 理由 |
|---|---|---|---|
| RBAC 模型 | 簡易 `ADMIN / USER` role | `Role` + `PermissionPolicy`(DENY_ALL/READ_ALL/ALLOW_ALL) + `Permission[]`，見 `@appspine/rbac` | 沿用 appspine 既有框架，不重造 |
| 系統層權限 | 無獨立 Permission enum | 在 app 自己的 `Permission` enum（`backend/prisma/schema/base.prisma`）新增 `WIKI_SPACE_READ/CREATE/DELETE`、`WIKI_PAGE_READ/CREATE/DELETE`、`WIKI_ATTACHMENT_UPLOAD` | 對應 002 慣例：Permission catalog 隨 app CRUD 模組成長，只存在於 app 自己的 schema |
| Guard chain | 單一 `JwtAuthGuard` | `JwtOrApiKeyGuard` → `PermissionGuard`（class 層級）→ `ScopeGuard`（限 API Key 呼叫） | 對應 002「API 設計規範」guard chain 順序 |
| Space 層權限 | `WikiSpaceMember`（OWNER/EDITOR/VIEWER） | **原封不動沿用** | Space 層 membership 本來就與系統 RBAC 分開管理，appspine RBAC 只是取代「誰能碰 wiki 功能」這一層，space 內部角色仍是資料驅動、不適合用 decorator 靜態表達，維持 service 層手動檢查 |
| 路由前綴 | `/api` 全域前綴 | 不加前綴，直接掛 root（`/spaces`、`/spaces/:id/pages`、`/attachments`、`/search`） | 對應 002「路徑前綴慣例」 |
| Metadata Schema API | 自建 `meta/` module，`GET /meta/schema` | **不用自建**，`@appspine/metadata-schema` 已在 template 內建 `GET /metadata/schema`，自動吃 Prisma DMMF | 只要 Wiki* model 都補齊 `///` doc comment 即可，框架自動涵蓋 |
| M2M API Key / MCP | 無 | 新增 `wiki-spaces:read`、`wiki-spaces:write`、`wiki-pages:read`、`wiki-pages:write` scope；透過 `@McpTool()` 註冊核心讀寫 tool（見第 6 節）。write tool 需要 `@appspine/m2m-api-key` 新增 `actingUserId` 綁定才能運作，屬框架前置變更，獨立在 `_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md` | 對應 001 AI 整合設計；本次 v1 決策：先開放核心讀寫，delete/members/attachments/versions 的 tool 留待後續 |
| Audit Log | 無 | Space/Page 的 create/update/delete（含軟刪除、還原）呼叫 `AuditLogService.record()` | 對應 001「System / Audit Log」治理要求——記錄「誰改了什麼」 |
| 健康檢查 | 自建 | `@appspine/health-check` 已內建 `GET /health`，不用另外處理 | 框架已提供 |
| Tiptap / 編輯器設計 | **原封不動沿用** | 同左 | 已驗證過的成熟設計，非本次調整重點 |
| 資料模型（Space/Page/Version/Attachment 欄位） | **原封不動沿用**（含 icon 欄位已在 auranest 移除的部分） | 同左，見第 3 節 | 已驗證過的欄位設計 |

---

## 3. 資料模型

沿用 auranest-wiki 目前（Phase 1 + Phase 2 完成後）的 schema，只調整 `///` 文件註解
使其符合 002 慣例（Metadata Schema API 的資料來源）、外鍵一律指向 appspine 的 `User`
model。

```prisma
enum WikiSpaceVisibility {
  OPEN
  MEMBERS_ONLY
  PRIVATE

  @@map("wiki_space_visibility")
}

enum WikiPageVisibility {
  OPEN
  MEMBERS_ONLY
  PRIVATE

  @@map("wiki_page_visibility")
}

enum WikiMemberRole {
  OWNER
  EDITOR
  VIEWER

  @@map("wiki_member_role")
}

/// Top-level knowledge base container. Each space has its own page tree.
model WikiSpace {
  id          String              @id @default(cuid())
  /// Human-readable name, e.g. "Engineering Wiki".
  name        String
  description String?
  visibility  WikiSpaceVisibility @default(OPEN)
  createdById String              @map("created_by_id")
  createdBy   User                @relation("WikiSpaceCreator", fields: [createdById], references: [id])
  members     WikiSpaceMember[]
  pages       WikiPage[]
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")
  /// Set when the space is soft-deleted; purged after 30 days.
  deletedAt   DateTime?           @map("deleted_at")

  @@map("wiki_spaces")
}

/// Membership record linking a user to a wiki space with a specific role.
model WikiSpaceMember {
  spaceId   String         @map("space_id")
  userId    String         @map("user_id")
  role      WikiMemberRole @default(VIEWER)
  space     WikiSpace      @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  user      User           @relation("WikiSpaceMemberships", fields: [userId], references: [id])
  createdAt DateTime       @default(now()) @map("created_at")

  @@id([spaceId, userId])
  @@map("wiki_space_members")
}

/// A single page within a wiki space. Pages form a tree via parentId.
model WikiPage {
  id                  String             @id @default(cuid())
  spaceId             String             @map("space_id")
  space               WikiSpace          @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  /// Parent page id; null = root page.
  parentId            String?            @map("parent_id")
  parent              WikiPage?          @relation("PageTree", fields: [parentId], references: [id], onDelete: Restrict)
  children            WikiPage[]         @relation("PageTree")
  title               String
  /// Storage key or URL for the cover image.
  coverImage          String?            @map("cover_image")
  /// Tiptap document JSON.
  content             Json               @default("{}")
  /// Plain-text extraction of content used for full-text search.
  searchText          String             @default("") @map("search_text")
  /// Tiptap schema version at time of last save; used for migration safety.
  tiptapSchemaVersion String             @default("3") @map("tiptap_schema_version")
  visibility          WikiPageVisibility @default(OPEN)
  /// Float ordering within siblings; rebalanced on demand.
  order               Float              @default(0)
  createdById         String             @map("created_by_id")
  createdBy           User               @relation("WikiPageCreator", fields: [createdById], references: [id])
  updatedById         String             @map("updated_by_id")
  updatedBy           User               @relation("WikiPageUpdater", fields: [updatedById], references: [id])
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")
  /// Set when the page is soft-deleted.
  deletedAt           DateTime?          @map("deleted_at")

  attachments WikiAttachment[]
  versions    WikiPageVersion[]

  @@index([spaceId, parentId])
  @@map("wiki_pages")
}

/// Immutable snapshot of a wiki page saved on each update.
model WikiPageVersion {
  id                  String   @id @default(cuid())
  pageId              String   @map("page_id")
  page                WikiPage @relation(fields: [pageId], references: [id], onDelete: Cascade)
  title               String
  content             Json
  tiptapSchemaVersion String   @default("3") @map("tiptap_schema_version")
  savedById           String   @map("saved_by_id")
  savedBy             User     @relation("WikiPageVersionSaver", fields: [savedById], references: [id])
  savedAt             DateTime @default(now()) @map("saved_at")
  /// Pinned versions are excluded from the 50-version rolling trim.
  isPinned            Boolean  @default(false) @map("is_pinned")

  @@index([pageId, savedAt(sort: Desc)])
  @@map("wiki_page_versions")
}

/// File attachment (images, etc.) uploaded via the wiki editor.
model WikiAttachment {
  id           String    @id @default(cuid())
  /// WikiPage that owns this attachment; null = space-level attachment.
  pageId       String?   @map("page_id")
  page         WikiPage? @relation(fields: [pageId], references: [id], onDelete: SetNull)
  /// Original filename as uploaded.
  filename     String
  /// MIME type, e.g. "image/png".
  mime         String
  /// File size in bytes.
  size         Int
  /// Relative path on disk, e.g. "uploads/2026/06/abc123.png".
  storageKey   String    @map("storage_key")
  uploadedById String    @map("uploaded_by_id")
  uploadedBy   User      @relation("WikiAttachmentUploader", fields: [uploadedById], references: [id])
  createdAt    DateTime  @default(now()) @map("created_at")

  @@map("wiki_attachments")
}
```

`User` model（`backend/prisma/schema/user.prisma`）需新增反向關係：
`WikiSpace[]`（as WikiSpaceCreator）、`WikiSpaceMember[]`、`WikiPage[]`（creator +
updater 兩個 relation）、`WikiPageVersion[]`（saver）、`WikiAttachment[]`（uploader）。

`Permission` enum（`backend/prisma/schema/base.prisma`）新增：

```prisma
enum Permission {
  // ...既有 USERS_*, API_KEYS_*
  // Wiki
  WIKI_SPACE_READ
  WIKI_SPACE_CREATE
  WIKI_SPACE_DELETE
  WIKI_PAGE_READ
  WIKI_PAGE_CREATE
  WIKI_PAGE_DELETE
  WIKI_ATTACHMENT_UPLOAD
}
```

> 沿用 auranest 教訓：這些 Permission 只控制「能不能碰 wiki 功能」的系統層級粗粒度
> 開關；space 內部誰是 OWNER/EDITOR/VIEWER 是完全獨立的一層，由 `WikiSpaceMember`
> 驅動，見第 4 節。

---

## 4. 權限設計（雙層）

沿用 auranest-wiki 的雙層模型，第一層換成 appspine RBAC：

**第一層 — 系統層（appspine RBAC，Guard 靜態檢查）**

| 動作 | 需要的 Permission |
|---|---|
| 讀 Space / Page（含樹狀、搜尋） | `WIKI_SPACE_READ` / `WIKI_PAGE_READ` |
| 建立 Space / Page | `WIKI_SPACE_CREATE` / `WIKI_PAGE_CREATE` |
| 刪除 Space / Page | `WIKI_SPACE_DELETE` / `WIKI_PAGE_DELETE` |
| 更新 Space / Page | 沿用 `WIKI_SPACE_READ`/`WIKI_PAGE_READ`（實際寫入權限由第二層 space membership 把關，系統層只需要「進得來」）|
| 上傳附件 | `WIKI_ATTACHMENT_UPLOAD` |

`ADMIN` role（`ALLOW_ALL` policy）永遠放行；一般 `USER` role 預設 `DENY_ALL`，需要
管理員手動勾選上述 Permission 才能使用 wiki 功能（比照 002 RBAC 權限模型的 OR 邏輯）。

**第二層 — Space 層（`WikiSpaceMember`，service 層資料驅動檢查，非 Guard）**

沿用 auranest-wiki 原始設計，**不改**：

| 動作 | 條件 |
|---|---|
| 讀取 Space | OPEN：任何通過第一層的用戶；MEMBERS_ONLY：Space 成員；PRIVATE：OWNER |
| 更新 / 刪除 Space | Space OWNER 或系統 ADMIN |
| 管理成員 | Space OWNER 或系統 ADMIN |
| 建立 Page | Space OWNER / EDITOR |
| 讀取 Page | 視 Space + Page visibility（繼承規則見下） |
| 更新 / 刪除 Page | Space OWNER / EDITOR（VIEWER 唯讀）|

Visibility 繼承規則（Space 優先）：

```
Space PRIVATE      → 只有 OWNER 看得到，page visibility 無效
Space MEMBERS_ONLY  → 只有 WikiSpaceMember 看得到
Space OPEN          → 通過第一層權限的用戶皆可見，進入 page 層判斷
  Page PRIVATE      → 只有 createdBy 可見
  Page MEMBERS_ONLY  → 只有 space 成員可見
  Page OPEN          → 所有能看此 space 的人都能看
```

---

## 5. API 設計

不加全域 `/api` 前綴（對應 002「路徑前綴慣例」）。Guard chain：
`@UseGuards(JwtOrApiKeyGuard, PermissionGuard)`（class 層級）+
`@RequirePermissions(Permission.WIKI_SPACE_READ)` 等 method-level 裝飾器；
API Key 呼叫另加 `ScopeGuard` 限制 scope。

### Spaces

| Method | Path | 系統層 Permission | Space 層條件 |
|---|---|---|---|
| GET | `/spaces` | `WIKI_SPACE_READ` | 依 visibility 過濾 |
| POST | `/spaces` | `WIKI_SPACE_CREATE` | 建立者自動成為 OWNER |
| GET | `/spaces/:id` | `WIKI_SPACE_READ` | 依 visibility |
| PATCH | `/spaces/:id` | `WIKI_SPACE_READ` | OWNER 或 ADMIN |
| DELETE | `/spaces/:id` | `WIKI_SPACE_DELETE` | OWNER 或 ADMIN，軟刪除 |

### Space Members

| Method | Path | 系統層 Permission | Space 層條件 |
|---|---|---|---|
| GET | `/spaces/:id/members` | `WIKI_SPACE_READ` | space member |
| POST | `/spaces/:id/members` | `WIKI_SPACE_READ` | OWNER |
| PATCH | `/spaces/:id/members/:userId` | `WIKI_SPACE_READ` | OWNER，不可改唯一 OWNER |
| DELETE | `/spaces/:id/members/:userId` | `WIKI_SPACE_READ` | OWNER，不可移除唯一 OWNER |

### Pages

| Method | Path | 系統層 Permission | Space 層條件 |
|---|---|---|---|
| GET | `/spaces/:spaceId/pages/tree` | `WIKI_PAGE_READ` | metadata-only，依 visibility 過濾 |
| POST | `/spaces/:spaceId/pages` | `WIKI_PAGE_CREATE` | OWNER/EDITOR |
| GET | `/spaces/:spaceId/pages/:id` | `WIKI_PAGE_READ` | 含 content + 祖先鏈 |
| PATCH | `/spaces/:spaceId/pages/:id` | `WIKI_PAGE_READ` | OWNER/EDITOR，帶 `baseUpdatedAt` 樂觀鎖 |
| DELETE | `/spaces/:spaceId/pages/:id` | `WIKI_PAGE_DELETE` | OWNER/EDITOR，遞迴軟刪子孫 |
| PATCH | `/spaces/:spaceId/pages/:id/move` | `WIKI_PAGE_READ` | OWNER/EDITOR，新 parentId + position |

### Page Versions

| Method | Path | 系統層 Permission | Space 層條件 |
|---|---|---|---|
| GET | `/spaces/:spaceId/pages/:id/versions` | `WIKI_PAGE_READ` | OWNER/EDITOR/VIEWER |
| GET | `/spaces/:spaceId/pages/:id/versions/:vId` | `WIKI_PAGE_READ` | 同上 |
| POST | `/spaces/:spaceId/pages/:id/versions/:vId/restore` | `WIKI_PAGE_READ` | OWNER/EDITOR |

### Trash

| Method | Path | 系統層 Permission | Space 層條件 |
|---|---|---|---|
| GET | `/trash` | `WIKI_PAGE_READ` | 依 space membership 過濾 |
| POST | `/pages/:id/restore-trash` | `WIKI_PAGE_READ` | OWNER/EDITOR |
| DELETE | `/pages/:id/purge` | `WIKI_PAGE_DELETE` | OWNER 或 ADMIN |

### Attachments

| Method | Path | 系統層 Permission |
|---|---|---|
| POST | `/attachments` | `WIKI_ATTACHMENT_UPLOAD` |
| GET | `/attachments/:id` | `WIKI_PAGE_READ`（serve file，驗證所屬 page 可見） |

### Search

| Method | Path | 系統層 Permission |
|---|---|---|
| GET | `/search?q=keyword` | `WIKI_PAGE_READ` |

---

## 6. MCP Tools（v1：核心讀寫）

依 002「新增 CRUD 模組標準流程」第 3 步，由 app 自行用 `@McpTool()` 註冊，非框架
自動產生。v1 決策：只開放 list/get/create/update，delete、members、attachments、
versions 的 tool 留待後續視需求再補。

> `create_*`/`update_*` 這幾個 write tool 依賴 `_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md`
> 完成並發版後才能實作與驗證；`list_*`/`get_*` 純讀 tool 不受影響，可以更早開始。

| Tool name | 對應 REST | requiredScopes |
|---|---|---|
| `list_wiki_spaces` | `GET /spaces` | `wiki-spaces:read` |
| `get_wiki_space` | `GET /spaces/:id` | `wiki-spaces:read` |
| `create_wiki_space` | `POST /spaces` | `wiki-spaces:write` |
| `update_wiki_space` | `PATCH /spaces/:id` | `wiki-spaces:write` |
| `list_wiki_pages` | `GET /spaces/:spaceId/pages/tree` | `wiki-pages:read` |
| `get_wiki_page` | `GET /spaces/:spaceId/pages/:id` | `wiki-pages:read` |
| `create_wiki_page` | `POST /spaces/:spaceId/pages` | `wiki-pages:write` |
| `update_wiki_page` | `PATCH /spaces/:spaceId/pages/:id` | `wiki-pages:write` |

M2M API Key scope 新增 `wiki-spaces:read`、`wiki-spaces:write`、`wiki-pages:read`、
`wiki-pages:write`（`resource:action` 格式，對應 001 M2M API Key 設計），建立 key 時
可手動勾選。

---

## 7. Audit Log 整合

`AuditLogService.record()` 呼叫點（`entityType` / `action` 依 `@appspine/common` 的
`AuditAction` enum）：

- Space：create / update / delete（軟刪除）
- Page：create / update / delete（軟刪除）/ restore（trash 還原）/ move（reparent）

MCP 呼叫路徑記得帶 `isAiOperation: true` + `mcpTool: <tool name>`，符合
`RecordAuditLogDto` 介面，讓稽核紀錄能區分「人類操作」與「AI agent 操作」。

> **稽核可追溯性**：身份解析後，`createdById`/`updatedById`/space membership
> 全部收纜成 `actingUserId`，資料上會跟這個 acting user 真的登入操作長得一模
> 一樣，`isAiOperation`/`mcpTool` 只能說「這是 AI 做的」，說不出「是哪一把
> API Key 做的」。`AuditLog` 需要新增 `actingApiKeyId` 快照欄位才能補上這個
> 缺口——這是框架層變更，設計與理由見
> `_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md` 第 3 節「`@appspine/audit-log`」，
> wiki 端只需在呼叫 `AuditLogService.record()` 時，`req.user.isApiKey === true`
> 就把 `req.user.sub`（即 `apiKey.id`）帶進 `actingApiKeyId`。

---

## 8. 前端架構

沿用 auranest-wiki 既有的目錄配置與元件切分，路徑改用 appspine template 的
`frontend/src/app/(main)/dashboard/` 慣例（沿用 `blank_shadcn_app` 結構）：

```
frontend/src/
├── app/(main)/dashboard/
│   ├── page.tsx                          # Spaces 列表首頁
│   ├── spaces/
│   │   ├── new/page.tsx                  # 建立 space
│   │   └── [spaceId]/
│   │       ├── page.tsx                  # Space 首頁（根頁面列表）
│   │       ├── settings/page.tsx         # Space 設定 + 成員管理
│   │       ├── trash/page.tsx            # Trash（Phase 2 一起做）
│   │       └── pages/[pageId]/page.tsx   # 頁面瀏覽 / 編輯
│   └── _components/sidebar/
│       ├── space-switcher.tsx
│       └── page-tree.tsx                 # dnd-kit 拖曳排序（Phase 2 一起做）
├── components/
│   ├── editor/
│   │   ├── wiki-editor.tsx               # Tiptap v3，"use client" + next/dynamic ssr:false
│   │   ├── editor-toolbar.tsx
│   │   ├── slash-command-menu.tsx
│   │   └── extensions/
│   └── wiki/
│       ├── page-header.tsx
│       ├── page-cover.tsx
│       ├── page-actions.tsx
│       └── version-history-drawer.tsx    # Phase 2 一起做
└── lib/
    ├── wiki-api.ts
    └── tiptap-utils.ts                   # extractSearchText()
```

i18n：appspine template 走既有 `messages/zh-TW.json` + `en.json` 慣例（沿用 002 前端
元件規範），新增 `wiki` namespace（spaces/pages/visibility/memberRole 等 key），
enum 翻譯（`WikiSpaceVisibility`/`WikiPageVisibility`/`WikiMemberRole`）依 002
「Enum / i18n 慣例」放進 `enums.<EnumName>.<VALUE>`，且從 `GET /metadata/schema`
讀取選項，不寫死前端常數。

---

## 9. Tiptap v3 編輯器（原封不動沿用）

| 擴充 | 套件 | 功能 |
|---|---|---|
| `StarterKit` | `@tiptap/starter-kit` | Heading(1-3)、Paragraph、Bold、Italic、Code、List、Blockquote、HorizontalRule |
| `Link` | `@tiptap/extension-link` | 超連結（autolink） |
| `Image` | `@tiptap/extension-image` | 圖片嵌入 |
| `Table` 全家（row/cell/header） | `@tiptap/extension-table*` | 表格 |
| `TaskList` + `TaskItem` | `@tiptap/extension-task-list` + `-task-item` | Checkbox TODO |
| `CodeBlockLowlight` | `@tiptap/extension-code-block-lowlight` + `lowlight` | 語法高亮 |
| `Placeholder` | `@tiptap/extension-placeholder` | 空白提示文字 |
| Slash Commands | `@tiptap/suggestion`（自訂） | `/` 觸發 block選單 |

`package.json` 固定確切版本（不用 `^`）。自動儲存：debounce 2 秒 → PATCH 帶
`baseUpdatedAt`，409 衝突 → toast + reload（見第 10 節）。圖片上傳走 attachment
endpoint，不存 base64 進 JSONB。

---

## 10. 樂觀鎖 / 全文搜尋 / 圖片上傳

三者均**原封不動沿用** auranest-wiki 設計：

- **樂觀鎖**：PATCH page 帶 `baseUpdatedAt`；`current.updatedAt !== baseUpdatedAt` →
  409；前端 toast 提示「有人改過此頁」+ reload。
- **全文搜尋**：寫入時同步維護 `searchText`（Tiptap JSON walk 抽取純文字）；
  PostgreSQL `to_tsvector('english', search_text)` + GIN index；
  `plainto_tsquery` 查詢；回傳含 visibility 過濾。
- **圖片上傳**：P1 本地 `./uploads/{yyyy}/{mm}/{cuid}.{ext}`；multer diskStorage；
  MIME 白名單 `image/png|jpeg|gif|webp`；10MB 上限；`GET /attachments/:id` serve
  file（驗證所屬 page 可見性，比 auranest 原版多一層 ACL）。

---

## 11. Repo 建立流程

比照 `_archive/dev_docs-20260803/app-template/Z02-app-template-fork-validation.md` 已驗證過的流程：

```bash
gh repo create appspine/wiki --template appspine/appspine-app-template --private
# clone 到 apps/wiki/
node scripts/scaffold-init.mjs --name wiki --display-name "Wiki"
pnpm install
docker compose up -d db
pnpm -C backend prisma:migrate -- --name init
pnpm -C backend prisma:seed
pnpm dev
GET http://localhost:3900/health   # 確認開機成功
```

之後才開始加 Wiki 專屬 schema/module（依 002「新增 CRUD 模組標準流程」逐步進行，
Space → Page → Version → Attachment → Search 依序建立，對齊第 12 節任務依賴）。

---

## 12. 建議執行順序（供後續 task-breakdown 依賴）

> **前置條件**：以下順序全部排在 `_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md`
> 完成、發版、且 `appspine-app-template` 已升級消費之後才開始（見文件頂部狀態
> 註記）。wiki fork 出來的當下，`@appspine/auth`/`@appspine/m2m-api-key`/
> `@appspine/audit-log` 就已經是含 `actingUserId`/`actingApiKeyId` 的版本，不需要
> 在 wiki repo 內再處理一次框架層變更。

```
Schema（WikiSpace/Member/Page/Version/Attachment + Permission 擴充）
  ├── Spaces module ──────→ Space 設定/成員頁
  ├── Pages module ───────→ Page tree、Page detail、Tiptap editor
  │     ├── Page Versions
  │     ├── Page Move（拖曳排序）
  │     └── Trash
  ├── Attachments module ─→ 圖片上傳（editor 依賴）
  └── Search module ──────→ 搜尋 command palette

MCP tools 註冊 + Audit Log 掛點 → 待各 module CRUD 完成後個別補上
```

---

## 13. 風險與注意事項（沿用 auranest 經驗）

1. **Windows 下 `prisma:migrate` 前必須先停掉 dev server**（DLL 鎖定問題）。
2. **Tiptap v3 slash command**：`@tiptap/suggestion` v3 的 `SuggestionOptions` 介面
   與 v2 有差異，建議先做 PoC 再進入正式實作。
3. **圖片外存**：Tiptap content JSONB 絕不可存 base64，一律走 attachment endpoint；
   body size limit 需同步調整（`main.ts` bodyParser 10mb）。
4. **`parent onDelete: Restrict`**：刪除頁面的 service 層必須先遞迴軟刪子孫，否則
   DB 拋出 FK 錯誤。
5. **tsvector GIN index**：Prisma 不原生支援，需獨立 migration 手寫 SQL
   （`CREATE INDEX ... USING GIN (to_tsvector(...))`）。
6. **`User` model 反向關係新增後**：需停 dev server + 重跑 `prisma generate`。
7. **`order Float` 精度**：拖曳排序長期使用可能耗盡精度，需要 rebalance-on-demand
   邏輯（auranest Phase 2 已驗證過的做法，直接沿用）。
8. **appspine 新增部分無既有先例，需邊做邊驗證**：雙層權限模型（系統 RBAC +
   space membership）疊加後的 Guard/Service 邊界、MCP tool 對 space-scoped 資源的
   scope 設計（tool 呼叫時如何確認呼叫者對特定 space 有權限，而不只是系統層
   `wiki-*:read/write`）——這塊 auranest 沒有 MCP，是本次 appspine 特有風險，建議
   在 Pages module 完成後、MCP tool 註冊前，先手動驗證清楚。

---

## 14. M2M API Key 身份綁定（框架前置變更 — 已抽成獨立計畫）

wiki 的 MCP write tool 需要 API Key 能綁定一個真實 `User` 身份，才能滿足
`createdById` FK 與 `WikiSpaceMember` 資料驅動授權查詢。這個缺口不是 wiki
專屬問題（任何 app 的 M2M write 場景都會遇到），且修法需要動
`@appspine/auth`/`@appspine/m2m-api-key`/`@appspine/audit-log` 三個共用套件、
以及 `appspine-app-template` 本身（backend schema + 既有的 API Key 管理
frontend 頁面），已經超出「wiki app 計畫」的範圍，因此整份設計、決策、政策、
執行順序都獨立成 `_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md`。

**wiki app 這邊需要知道的**：010 完成並發版、`appspine-app-template` 升級消費
之後，wiki fork 出來時就已經帶有 `actingUserId`（API Key）/`actingApiKeyId`
（AuditLog）能力，wiki 端只需要：

1. `import { resolveActingUserId } from '@appspine/auth'`（010 已定案 export
   自 `@appspine/auth`，wiki 端不用自己實作，見 010 第 3、5 節）解析出寫入用
   的 userId。
2. 把它餵給 `createdById`/`updatedById` 與 `WikiSpaceMember` 查詢（第 3、4 節
   既有設計不用改）。
3. 呼叫 `AuditLogService.record()` 時帶上 `actingApiKeyId`（第 7 節已描述）。

實際要開放 AI agent 寫入某個 wiki space 時的操作步驟（010 第 4 節政策）：先建一個
`isServiceAccount = true` 的專用 User（例如 `wiki-agent@internal`），把它加成
該 space 的 `WikiSpaceMember` EDITOR/OWNER，再建立 API Key 並綁定
`actingUserId` 指到這個 service account——三步驟缺一不可，綁到非 service
account 的 User 會被 010 第 3 節的檢查擋掉。

MCP write tool（`create_wiki_space`/`update_wiki_space`/`create_wiki_page`/
`update_wiki_page`）的實作與驗證，需排在 010 完成之後；純讀 tool
（`list_*`/`get_*`）不受影響，可以更早驗證（但依文件頂部狀態註記，wiki 整體
仍等 010 完成才 fork + 開工）。

### 待決事項（尚未拍板，執行前需確認）

- 版本歷史保留策略（50 版 rolling trim + pinned 排除）先沿用 auranest 數字，
  之後視實際使用量調整。
