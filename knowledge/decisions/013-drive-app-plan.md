---
type: decision
scope: cross-repo
status: active
source_repo: appspine/drive
source_commit: 9ca50f37d6fbd0e4b4fcd776a4f09779fef9d8d2
canonical_url: https://github.com/appspine/drive/blob/9ca50f37d6fbd0e4b4fcd776a4f09779fef9d8d2/knowledge/decisions/013-drive-app-plan.md
copy_status: fresh
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# 013 - Drive App（appspine 第三個業務系統）- 系統設計計畫

> 狀態：規劃完成，**可開工（前置依賴 021 已完成）**。
>
> **執行前置依賴（2026-07-08 已完成）**：`_archive/dev_docs-20260803/framework/020-framework-consolidation-plan.md` §6.1
> 已拍板「Users/Roles/API Keys 三個 admin 頁收斂進 `@appspine/frontend-shell`」要在
> drive/approve 開工前完成（已立 `021-admin-pages-frontend-shell-consolidation-plan.md`
> 並執行完畢）。本文件排序在 021 之後：021 已完成、
> `appspine-app-template` 已消費新版 admin 頁，現可執行第 11 節的 fork 流程。

---

## 1. 背景與定位

appspine 的第三個業務系統，從 `appspine-app-template` fork 出來，落地在 `apps/drive/`
（獨立 repo、獨立資料庫，比照 001「多 repo」決策）。

定位：團隊檔案協作（類 Google Drive）——多個獨立 Space 作為唯一的擁有權/權限邊界，每個
Space 底下是巢狀資料夾樹 + 檔案，檔案實體存在 MinIO（S3 相容物件儲存），Office 文件
（docx/xlsx/pptx）可透過 Collabora Online 在瀏覽器內直接編輯（WOPI 協定）。與
auranest-drive 定位相同，這次是把「已驗證能動的部分」重新套用 appspine 框架的身份/權限/AI
整合機制，同時跟 calendar 一樣**卸除** auranest 那套中心化 Admin Center SSO + 跨 app 稽核
聚合佇列的平台假設（理由同 012 第 2 節，appspine 依 001 決策沒有這個角色）。

跟 wiki/calendar 不同的地方：這是第一個真正需要**新增基礎設施**（MinIO、Collabora）的 app，
`docker-compose.yml` 會從只有 `db` 一個服務，變成 `db` + `minio` + `collabora` 三個服務。

---

## 2. 與 auranest-drive 的差異調整

| 項目 | auranest-drive（來源） | appspine drive（本次） | 理由 |
|---|---|---|---|
| 身份驗證 | 中心化「Admin Center」簽發 RS256/JWKS token，本 app 只驗證、透過 `UserResolutionInterceptor` 把 SSO `globalUserId` 對應到本地 `User` | appspine 自己的 `@appspine/auth`，使用者本來就是本地 `User`，不需要額外的身份對應層 | 同 012 第 2 節，appspine 沒有中心 IdP |
| `InternalProvisioningModule` / `UserResolutionInterceptor` | 有 | **不搬** | 同上 |
| 跨 app 稽核聚合（`AuditEmitterService` + pg-boss，drive 會 emit `drive.trash.emptied`/`drive.file.permanently_deleted`/`drive.space.member_added`/`drive.space.role_granted` 等事件） | 有 | **不搬** | 同 012，依賴中心 Admin Center 當 consumer，appspine 架構下沒有這個角色；本地稽核用 `@appspine/audit-log` 已足夠（見第 8 節） |
| RBAC 模型 | `Role`+`PermissionPolicy`+`Permission[]`，跟 appspine 幾乎同構 | 沿用同構模型，改吃 `@appspine/rbac` | 跟 calendar 一樣，調整量最小 |
| Guard chain | `JwtAuthGuard`/`JwtOrApiKeyGuard` + `PermissionGuard`（`@RequirePermissions`）+ `AdminGuard`（平台管理路由） | `JwtOrApiKeyGuard`（`@appspine/m2m-api-key`）→ `PermissionGuard`（`@appspine/rbac`，class 層級）→ `ScopeGuard`（限 API Key） | 對應 002「API 設計規範」，同 wiki/calendar |
| DTO 驗證 | **已經是 Zod + `ZodValidationPipe`**（`folder.dto.ts`/`file.dto.ts`/`space.dto.ts`/`space-member.dto.ts`/`space-role-grant.dto.ts` 全部是 Zod，跟 appspine 慣例天生一致） | **直接沿用，幾乎不用改** | 跟 wiki/calendar 不同——drive 這批模組 auranest 原始碼本來就沒用 class-validator，是三個 app 裡調整量最小的一次 |
| 路由前綴 | 沒有 `/api` 全域前綴（`/spaces`、`/drive/folders`、`/drive/files`、`/wopi/*` 直接掛 root） | **不用調整**，直接沿用 | 同 calendar，本來就對齊 002「路徑前綴慣例」 |
| Metadata Schema API | 自建 `MetaService`，讀 Prisma DMMF | **不用自建**，`@appspine/metadata-schema` 已內建 `GET /metadata/schema` | 同 wiki/calendar |
| MCP Tools | **Layer 1 全自動**：掃 Prisma DMMF 幫每個非 `@internal` model 生 5 個 CRUD tool，**繞過 service 層直接呼叫 Prisma delegate**——跟 calendar 一樣有同樣的正確性缺口（例如 MCP `create_drive_files` 不會經過 `FilesService.upload()`，會漏掉 MinIO 寫入、`spaceId`/`folderId` 合法性檢查、`MAX_UPLOAD_BYTES` 檢查） | appspine 沒有自動產生機制，**比照 wiki/calendar 手寫 `@McpTool()`**，方法本體呼叫真正的 service 方法 | 同 calendar 第 2 節理由，appspine 手寫模式順便修正 auranest 的既有正確性問題 |
| Audit Log | 有 `AuditLogService`，但**只掛在 users/roles/api-keys**（平台管理），drive 領域完全沒呼叫（`AuditEmitterService` 的 `drive.*` 事件是給跨 app 佇列用，不是本地 `AuditLog` 表） | Space/Member/RoleGrant/Folder/File 的 create/update/delete/trash/restore 呼叫 `AuditLogService.record()`（`@appspine/audit-log`） | 對應 001「System / Audit Log」治理要求；跟 calendar 一樣是新增，不是調整既有邏輯 |
| 健康檢查 | 自建 | `@appspine/health-check` 已內建 `GET /health` | 同 wiki/calendar |
| 儲存層 | MinIO（S3 相容）+ `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` | **原封不動沿用**，`docker-compose.yml` 新增 `minio` 服務 | 已與使用者確認走「MinIO + Collabora 全套」路線，見第 9 節 |
| WOPI / Collabora 線上編輯 | `WopiModule`（獨立 `WOPI_TOKEN_SECRET` HS256 token，跟主要 JWT 分開）+ Collabora Online container | **原封不動沿用**，`docker-compose.yml` 新增 `collabora` 服務 | 同上，見第 10 節 |
| Model 命名 | `Space`/`SpaceMember`/`SpaceRoleGrant`（裸名）；`DriveFolder`/`DriveFile`（已加前綴） | 改名 `DriveSpace`/`DriveSpaceMember`/`DriveSpaceRoleGrant`；`DriveFolder`/`DriveFile` 維持原名 | 比照 wiki（`WikiSpace` 而非裸 `Space`）與 calendar（`Event`→`CalendarEvent`）的既有慣例——`Space` 是過度泛用、跨 app 極易撞名的字，其餘已加前綴的 model 不需要再調整 |
| Permission 命名 | `SPACE_MANAGE`（裸名，未加前綴）、`DRIVE_FILE_SHARE`（**已確認是死碼，無任何 guard/service 讀取它**） | `SPACE_MANAGE` 改名 `DRIVE_SPACE_MANAGE`；`DRIVE_FILE_SHARE` **不搬** | 命名比照上一列理由；`DRIVE_FILE_SHARE` 對應的分享功能本來就沒做（見第 2 節「不搬」清單），不搬一個沒有對應功能的權限旗標 |
| MIME 白名單/黑名單 | **完全沒有**——`FileInterceptor('file')` 用預設 memory storage，無 `limits`/`fileFilter`，任何檔案類型都能上傳 | **待決**，v1 先沿用 auranest 不做限制，見第 16 節 | 這點不像其他「不搬」項目那麼明確——wiki 的附件機制當初主動加了 appspine 沒有的 MIME 白名單（`image/png|jpeg|gif|webp`），drive 存放任意檔案類型是產品需求的一部分（不只圖片），是否要加黑名單（例如擋執行檔）需要使用者拍板，不是照抄或照 wiki 先例能決定的事，故列為待決事項而非直接決定 |

---

## 3. 資料模型

沿用 auranest-drive 目前的 `Space`/`SpaceMember`/`SpaceRoleGrant`/`DriveFolder`/`DriveFile`
欄位設計（扣除第 2 節列出的「不搬」欄位/enum 值），只調整 `///` 文件註解使其符合 002 慣例、
外鍵一律指向 appspine 的 `User` model、model 改名如上表。

```prisma
enum DriveSpaceRole {
  VIEWER
  EDITOR
  OWNER

  @@map("drive_space_role")
}

/// Top-level ownership/permission boundary for all folders and files.
/// There is no "personal drive" outside a Space.
model DriveSpace {
  id          String   @id @default(cuid())
  name        String
  description String?
  createdById String?  @map("created_by_id")
  createdBy   User?    @relation("DriveSpaceCreator", fields: [createdById], references: [id], onDelete: SetNull)
  members     DriveSpaceMember[]
  roleGrants  DriveSpaceRoleGrant[]
  folders     DriveFolder[]
  files       DriveFile[]
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("drive_spaces")
}

/// Explicit per-user membership in a Space, with a specific role.
model DriveSpaceMember {
  spaceId   String         @map("space_id")
  userId    String         @map("user_id")
  spaceRole DriveSpaceRole @map("space_role")
  space     DriveSpace     @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  user      User           @relation("DriveSpaceMemberships", fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime       @default(now()) @map("created_at")

  @@id([spaceId, userId])
  @@map("drive_space_members")
}

/// Bulk access grant: everyone holding a given system Role gets this SpaceRole
/// in this Space, without needing an individual DriveSpaceMember row each.
model DriveSpaceRoleGrant {
  spaceId      String         @map("space_id")
  systemRoleId String         @map("system_role_id")
  spaceRole    DriveSpaceRole @map("space_role")
  space        DriveSpace     @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  systemRole   Role           @relation(fields: [systemRoleId], references: [id], onDelete: Cascade)
  createdAt    DateTime       @default(now()) @map("created_at")

  @@id([spaceId, systemRoleId])
  @@map("drive_space_role_grants")
}

/// A folder within a Space. Folders form a tree via parentId (adjacency list,
/// no materialized path). onDelete: SetNull on parentId is deliberate — deleting
/// a parent folder does not cascade at the DB level; the service layer must
/// recursively soft-delete children itself (see §13 risk notes).
model DriveFolder {
  id          String       @id @default(cuid())
  name        String
  spaceId     String       @map("space_id")
  space       DriveSpace   @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  parentId    String?      @map("parent_id")
  parent      DriveFolder? @relation("FolderTree", fields: [parentId], references: [id], onDelete: SetNull)
  children    DriveFolder[] @relation("FolderTree")
  createdById String?      @map("created_by_id")
  createdBy   User?        @relation("DriveFolderCreator", fields: [createdById], references: [id], onDelete: SetNull)
  files       DriveFile[]
  /// Soft-delete flag; distinct from permanent delete (trash empty).
  isTrashed   Boolean      @default(false) @map("is_trashed")
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  @@index([spaceId, parentId])
  @@map("drive_folders")
}

/// A file's metadata. The actual bytes live in MinIO at `storagePath`.
model DriveFile {
  id          String       @id @default(cuid())
  /// Original filename as uploaded.
  name        String
  mimeType    String       @map("mime_type")
  /// Size in bytes.
  size        Int
  /// MinIO/S3 object key, e.g. "{spaceId}/{fileId}/{originalName}".
  storagePath String       @map("storage_path")
  spaceId     String       @map("space_id")
  space       DriveSpace   @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  folderId    String?      @map("folder_id")
  folder      DriveFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
  createdById String?      @map("created_by_id")
  createdBy   User?        @relation("DriveFileCreator", fields: [createdById], references: [id], onDelete: SetNull)
  isTrashed   Boolean      @default(false) @map("is_trashed")
  /// Incremented on each WOPI save. Only the latest version's blob is kept —
  /// there is no version history table (see plan §16, ported unchanged from auranest).
  version     Int          @default(1)
  /// WOPI collaborative-editing lock (Collabora); TTL enforced in service layer.
  lockToken   String?      @map("lock_token")
  lockedBy    String?      @map("locked_by")
  lockedAt    DateTime?    @map("locked_at")
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  @@index([spaceId, folderId])
  @@map("drive_files")
}
```

`User` model（`backend/prisma/schema/user.prisma`）需新增反向關係：`DriveSpace[]`（as
DriveSpaceCreator）、`DriveSpaceMember[]`、`DriveFolder[]`（as DriveFolderCreator）、
`DriveFile[]`（as DriveFileCreator）。

`Permission` enum（`backend/prisma/schema/base.prisma`）新增：

```prisma
enum Permission {
  // ...既有 USERS_*, API_KEYS_*, CALENDAR_*, CALENDAR_EVENT_*
  // Drive
  DRIVE_FILE_READ
  DRIVE_FILE_CREATE
  DRIVE_FILE_UPDATE
  DRIVE_FILE_DELETE
  DRIVE_FOLDER_READ
  DRIVE_FOLDER_CREATE
  DRIVE_FOLDER_UPDATE
  DRIVE_FOLDER_DELETE
  DRIVE_SPACE_MANAGE
}
```

> 沿用 wiki 教訓：這些 Permission 只控制「能不能碰 drive 功能」的系統層級粗粒度開關；
> Space 內部誰是 OWNER/EDITOR/VIEWER 是完全獨立的一層，由 `DriveSpaceMember` /
> `DriveSpaceRoleGrant` 驅動，見第 4 節。

---

## 4. 權限設計（雙層 + 批次授權，比 wiki 更進一步）

**第一層 — 系統層（appspine RBAC，Guard 靜態檢查）**

| 動作 | 需要的 Permission |
|---|---|
| 讀 Folder/File（含列表、下載、預覽） | `DRIVE_FOLDER_READ` / `DRIVE_FILE_READ` |
| 建立 Folder / 上傳 File | `DRIVE_FOLDER_CREATE` / `DRIVE_FILE_CREATE` |
| 更新（改名/搬移）Folder/File | `DRIVE_FOLDER_UPDATE` / `DRIVE_FILE_UPDATE` |
| Trash / 還原 / 永久刪除 Folder/File | `DRIVE_FOLDER_DELETE` / `DRIVE_FILE_DELETE` |
| Space CRUD、成員管理、Role Grant 管理 | `DRIVE_SPACE_MANAGE` |

`ADMIN` role（`ALLOW_ALL` policy）永遠放行，且在第二層 Space 檢查中完全略過（比照 auranest）。

**第二層 — Space 層（`DriveSpaceMember` + `DriveSpaceRoleGrant`，service 層資料驅動檢查，
沿用 auranest `SpaceAccessService` 邏輯不變）**

- **有效角色解析**：同時查 `DriveSpaceMember`（個人明確成員）與 `DriveSpaceRoleGrant`（呼叫者
  持有的系統 Role 對應的批次授權），取兩者中**較高**的角色（`VIEWER(1) < EDITOR(2) < OWNER(3)`）
  ——也就是說，個人授權只能把權限往上加，不會把批次授權的權限往下壓，反之亦然。
- **Guard 實作**：比照 auranest `SpaceMemberGuard` + `@RequireSpaceRole(role, source)`，`source`
  支援 5 種來源解析 `spaceId`：`query`（列表類）、`body`（建立類）、`space-param`（`Space` 路由的
  `:id` 本身就是 spaceId）、`file-param`（查 `DriveFile.spaceId`）、`folder-param`（查
  `DriveFolder.spaceId`）。
- **實際落地的角色門檻**（沿用 auranest 不變）：
  | 動作 | 最低 Space 角色 |
  |---|---|
  | 讀取/列表/下載/預覽 Folder、File | VIEWER |
  | 建立/改名/搬移/trash/還原/永久刪除 Folder、File；上傳 File | EDITOR |
  | Space 改名/刪除、成員管理、Role Grant 管理 | OWNER |
- **最後一位 OWNER 保護**：`guardLastOwner` 防止把 Space 唯一的 OWNER 降級或移除（沿用不變）。
- **資料夾到檔案沒有獨立繼承鏈**：`DriveFolder`/`DriveFile` 都各自直接帶 `spaceId`，一個檔案的
  有效權限永遠等於「呼叫者在該檔案所屬 Space 的有效角色」，跟它放在哪個子資料夾無關（沿用
  auranest 設計，v1 不做「只分享某個子資料夾」的細粒度分享）。

---

## 5. API 設計

不加全域 `/api` 前綴（auranest-drive 本來就沒加）。Guard chain：
`@UseGuards(JwtOrApiKeyGuard, PermissionGuard, ScopeGuard)`（class 層級，`@appspine/m2m-api-key`
+ `@appspine/rbac`）+ `SpaceMemberGuard`（`@RequireSpaceRole`）疊加在需要 Space 層檢查的路由上。

### Spaces / Members / Role Grants

| Method | Path | Permission | Space 層 |
|---|---|---|---|
| GET | `/spaces` | `DRIVE_SPACE_MANAGE` 略過（依可見性列出，ADMIN 看全部，一般使用者看自己有成員資格或 Role Grant 的 Space） | — |
| POST | `/spaces` | `DRIVE_SPACE_MANAGE` | — |
| GET | `/spaces/:id` | — | VIEWER |
| PATCH | `/spaces/:id` | — | OWNER |
| DELETE | `/spaces/:id`（含清空 MinIO 物件） | — | OWNER |
| GET/POST/PATCH/DELETE | `/spaces/:id/members`、`/spaces/:id/members/:userId` | — | VIEWER（讀）/ OWNER（寫） |
| GET/POST/PATCH/DELETE | `/spaces/:id/role-grants`、`/spaces/:id/role-grants/:roleId` | — | VIEWER（讀）/ OWNER（寫） |

### Drive Folders

| Method | Path | Permission | Space 層 |
|---|---|---|---|
| POST | `/drive/folders` | `DRIVE_FOLDER_CREATE` | EDITOR |
| GET | `/drive/folders`（`spaceId` 必填；`parentId`/`trashed`/搜尋/分頁） | `DRIVE_FOLDER_READ` | VIEWER |
| GET | `/drive/folders/:id` | `DRIVE_FOLDER_READ` | VIEWER |
| PATCH | `/drive/folders/:id`（改名/搬移） | `DRIVE_FOLDER_UPDATE` | EDITOR |
| PATCH | `/drive/folders/:id/trash` | `DRIVE_FOLDER_DELETE` | EDITOR |
| PATCH | `/drive/folders/:id/restore` | `DRIVE_FOLDER_DELETE` | EDITOR |
| DELETE | `/drive/folders/:id`（永久刪除，遞迴） | `DRIVE_FOLDER_DELETE` | EDITOR |
| POST | `/drive/folders/trash/empty` | `DRIVE_FOLDER_DELETE` | EDITOR |

### Drive Files

| Method | Path | Permission | Space 層 |
|---|---|---|---|
| POST | `/drive/files/upload`（multipart，`spaceId` query 必填、`folderId` optional） | `DRIVE_FILE_CREATE` | EDITOR |
| GET | `/drive/files` | `DRIVE_FILE_READ` | VIEWER |
| GET | `/drive/files/recent`（跨所有可見 Space） | `DRIVE_FILE_READ` | 服務層依可見 spaceIds 過濾，不掛 `SpaceMemberGuard` |
| GET | `/drive/files/:id` | `DRIVE_FILE_READ` | VIEWER |
| GET | `/drive/files/:id/download`（1 小時 presigned URL） | `DRIVE_FILE_READ` | VIEWER |
| PATCH | `/drive/files/:id`（改名/搬移） | `DRIVE_FILE_UPDATE` | EDITOR |
| PATCH | `/drive/files/:id/trash` | `DRIVE_FILE_DELETE` | EDITOR |
| PATCH | `/drive/files/:id/restore` | `DRIVE_FILE_DELETE` | EDITOR |
| DELETE | `/drive/files/:id`（永久刪除，含清 MinIO 物件） | `DRIVE_FILE_DELETE` | EDITOR |
| POST | `/drive/files/trash/empty` | `DRIVE_FILE_DELETE` | EDITOR |

### WOPI（Collabora）

| Method | Path | Guard |
|---|---|---|
| GET | `/wopi/editor-url/:fileId` | `JwtOrApiKeyGuard`（appspine 主要 JWT） |
| GET | `/wopi/files/:fileId`（CheckFileInfo） | `WopiTokenGuard`（獨立 WOPI token） |
| GET | `/wopi/files/:fileId/contents`（GetFile，串流） | `WopiTokenGuard` |
| POST | `/wopi/files/:fileId/contents`（PutFile，version++） | `WopiTokenGuard` |
| POST | `/wopi/files/:fileId`（Lock/Unlock/RefreshLock/GetLock，`X-WOPI-Override` header） | `WopiTokenGuard` |

---

## 6. MCP Tools（v1：核心讀寫，比照 wiki/calendar 手寫模式）

依 002「新增 CRUD 模組標準流程」第 3 步，手寫 `@McpTool()`，內部呼叫真正的 service 方法（避免
auranest 的 Layer-1 自動 CRUD 繞過 service 層問題，見第 2 節）。v1 只開放 list/get/create/update，
delete 留待後續（同 wiki/calendar 先例）。**檔案上傳不透過 MCP tool 提供**（`create_drive_file`
需要接收檔案二進位內容，MCP tool 的 Zod `inputSchema` 不適合傳大型二進位，v1 先不做，留待
未來視需求評估——不是遺漏，是刻意排除，見第 16 節）。

| Tool name | 對應 REST | requiredScopes |
|---|---|---|
| `list_drive_spaces` | `GET /spaces` | `drive-spaces:read` |
| `get_drive_space` | `GET /spaces/:id` | `drive-spaces:read` |
| `create_drive_space` | `POST /spaces` | `drive-spaces:write` |
| `update_drive_space` | `PATCH /spaces/:id` | `drive-spaces:write` |
| `list_drive_folders` | `GET /drive/folders` | `drive-folders:read` |
| `get_drive_folder` | `GET /drive/folders/:id` | `drive-folders:read` |
| `create_drive_folder` | `POST /drive/folders` | `drive-folders:write` |
| `update_drive_folder` | `PATCH /drive/folders/:id` | `drive-folders:write` |
| `list_drive_files` | `GET /drive/files` | `drive-files:read` |
| `get_drive_file` | `GET /drive/files/:id` | `drive-files:read` |
| `update_drive_file` | `PATCH /drive/files/:id` | `drive-files:write` |

M2M API Key scope 新增 `drive-spaces:read/write`、`drive-folders:read/write`、
`drive-files:read/write`（`resource:action` 格式，對應 001 M2M API Key 設計）。write tool
依賴 `resolveActingUserId()`（`@appspine/auth`，010 已完成），且 tool 內部一樣要過
`DriveSpaceMember`/`DriveSpaceRoleGrant` 的有效角色檢查（不是繞過 Space 層，只是繞過 HTTP
Guard，改成方法內手動呼叫同一個 `SpaceAccessService`）。

---

## 7. 前端架構

沿用 auranest-drive 現行（`dashboard/spaces/` 為主，`dashboard/drive/` 舊路由已改成 redirect
stub 的部分不需要照抄）的元件切分，路徑改用 appspine template 的
`frontend/src/app/(main)/dashboard/` 慣例：

```
frontend/src/
├── app/(main)/dashboard/
│   ├── spaces/
│   │   ├── page.tsx                        # Space 列表（DRIVE_SPACE_MANAGE 可建立）
│   │   ├── _components/create-space-dialog.tsx
│   │   └── [spaceId]/
│   │       ├── page.tsx                    # 檔案瀏覽器：breadcrumb + 搜尋 + 上傳 + 新增資料夾 + 表格檢視
│   │       ├── members/page.tsx            # Members / Role Grants 分頁管理 + 刪除 Space（danger zone）
│   │       └── trash/page.tsx              # 該 Space 的 Trash：還原/永久刪除/清空
│   └── recent/page.tsx                     # 跨 Space 最近檔案
├── app/(editor)/editor/files/[id]/edit/
│   └── page.tsx                            # 全螢幕 Collabora iframe（無側邊欄），fetch /wopi/editor-url/:id
└── lib/
    ├── spaces-api.ts
    ├── folders-api.ts
    ├── files-api.ts                        # 含 uploadFile()：原生 XHR + onprogress，不是 chunked 協定
    └── wopi-api.ts
```

`_components/`（掛在 `[spaceId]/` 底下或 `frontend/src/components/`，視共用程度）：
`upload-zone.tsx`（拖曳 + 點擊上傳，前端先擋 `MAX_UPLOAD_BYTES`）、`preview-dialog.tsx`
（僅圖片 `<img>`/PDF `<iframe>` 可預覽，其餘一律下載）、`new-doc-button.tsx`（從
`frontend/public/templates/` 的空白 docx/xlsx/pptx 建立新文件後直接開編輯器）、
`create-folder-dialog.tsx`、`rename-folder-dialog.tsx`、`rename-file-dialog.tsx`、
`drive-breadcrumb.tsx`、`drive-item-row.tsx`（依副檔名決定 icon）。

i18n：新增 `drive` namespace，enum 翻譯（`DriveSpaceRole`）依 002「Enum / i18n 慣例」放進
`enums.<EnumName>.<VALUE>`，從 `GET /metadata/schema` 讀取選項。

---

## 8. Audit Log 整合

`AuditLogService.record()` 呼叫點（`@appspine/audit-log`，`AuditAction` 為 CREATE/UPDATE/DELETE）
——這在 auranest 原始碼裡完全沒有本地稽核紀錄（`AuditEmitterService` 的事件是給跨 app 佇列，
不是本地 `AuditLog` 表），這次是新增：

- DriveSpace：create / update / delete
- DriveSpaceMember：add / update role / remove
- DriveSpaceRoleGrant：add / update / remove
- DriveFolder：create / update（改名/搬移）/ trash / restore / 永久刪除
- DriveFile：create（上傳）/ update（改名/搬移）/ trash / restore / 永久刪除

MCP 呼叫路徑帶 `isAiOperation: true` + `mcpTool: <tool name>`；`req.user.isApiKey === true`
時把 `actingApiKeyId` 一併帶入（比照 wiki/calendar）。

---

## 9. 儲存層：MinIO 整合（原封不動沿用）

- `StorageModule`/`StorageService` 包裝 `@aws-sdk/client-s3`（`forcePathStyle: true`），
  `onModuleInit` 用 `HeadBucketCommand` 確認 bucket 存在，不存在則 `CreateBucketCommand` 自動建立。
- Key 慣例：`{spaceId}/{fileId}/{originalName}`（`fileId` 為 `randomBytes(12).toString('hex')`，
  應用層產生，同時作為 Prisma record id）；WOPI 儲存另開 `{spaceId}/{fileId}/v{version}/{name}`
  且**舊版本 blob 不會清除**（沿用 auranest 已知限制，見第 13 節）。
- 上傳：`FileInterceptor('file')`（multer 預設 memory storage），`spaceId` 走 query string（因為
  Guard chain 要先跑完才輪到 multer 解析 multipart body），原始檔名 `latin1`→`utf8` 解碼修正
  非 ASCII 檔名亂碼。單一全域 `MAX_UPLOAD_BYTES`（預設 100MB）在 `FilesService.upload` 檢查，
  超過丟 `PayloadTooLargeException`。
- 下載：`getPresignedDownloadUrl(key, expiresSec=3600)`，前端直接導向該 URL，**不經過 NestJS
  伺服器代理**，沒有 HTTP Range 支援（大檔案/影片拖曳全靠 MinIO/S3 本身是否支援）。
- 刪除：`deleteObject`/`deleteObjects`（`Promise.allSettled`，失敗只記 log 不拋錯），永久刪除
  檔案、遞迴刪資料夾、清空 trash、刪除 Space 時呼叫。
- **v1 明確不做**（沿用 auranest 原本就沒有）：縮圖產生、病毒/惡意軟體掃描、依 hash 去重、
  分段/可續傳上傳協定。上傳進度只是前端用原生 `XMLHttpRequest` 的 `xhr.upload.onprogress`
  觀察單一 POST 的位元組進度，不是真正的分段協定。

`docker-compose.yml` 新增（沿用 auranest 設定）：

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-minioadmin}
    MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-minioadmin}
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 5s
    timeout: 5s
    retries: 10
```

環境變數：`MINIO_ENDPOINT`、`MINIO_REGION`（預設 `us-east-1`）、`MINIO_ACCESS_KEY`/
`MINIO_SECRET_KEY`（預設 `minioadmin`/`minioadmin`，僅限本機開發）、`MINIO_BUCKET`（例如
`appspine-drive`）、`MAX_UPLOAD_BYTES`（預設 `104857600`）。

---

## 10. WOPI / Collabora Online 整合（原封不動沿用）

- `WopiModule`：`WopiTokenService` 簽發**獨立於主要 appspine JWT 的 HS256 token**（獨立密鑰
  `WOPI_TOKEN_SECRET`），刻意讓 Collabora server 永遠拿不到使用者的真實 session token。
- `GET /wopi/editor-url/:fileId`（appspine 主要 Guard 保護）算出 `canWrite`（`effectiveRole in
  {OWNER, EDITOR}` 或 ADMIN），連同 `lang`（前端從 locale cookie 帶入）一起烤進短效 WOPI token，
  回傳 Collabora iframe 用的 editor URL。
- `WopiTokenGuard` 保護 `/wopi/files/:fileId*` 系列端點，`PutFile` 儲存前**伺服器端再次確認**
  `wopi.canWrite`，並執行檔案鎖（`lockToken`/`lockedBy`/`lockedAt`，TTL 3600 秒）避免併發編輯
  衝突——這層鎖跟第 4 節的 Space 角色檢查是疊加關係，兩者獨立運作。
- `docker-compose.yml` 新增（沿用 auranest 設定，**注意 `aliasgroup1`/`WOPI_PUBLIC_URL` 在本機
  Windows 開發環境需要 `host.docker.internal`**，見第 13 節風險）：

```yaml
collabora:
  image: collabora/code:latest
  environment:
    - aliasgroup1=${WOPI_PUBLIC_URL:-http://host.docker.internal:3030}
    - DONT_GEN_SSL_CERT=1
    - extra_params=--o:ssl.enable=false --o:ssl.termination=false
    - username=${COLLABORA_ADMIN_USER:-admin}
    - password=${COLLABORA_ADMIN_PASSWORD:-admin}
  extra_hosts:
    - "host.docker.internal:host-gateway"
  ports:
    - "9980:9980"
  cap_add:
    - MKNOD
    - SYS_ADMIN
  security_opt:
    - seccomp=unconfined
```

環境變數：`WOPI_TOKEN_SECRET`、`WOPI_TOKEN_TTL_SEC`（預設 3600）、`COLLABORA_URL`（預設
`http://localhost:9980`）、`WOPI_PUBLIC_URL`（Collabora 回呼 backend 用的位址，本機開發是
`http://host.docker.internal:<backend-port>`，全端 docker 部署是 `http://backend:3000`）。

---

## 11. Repo 建立流程

> **開工前置確認**：執行本節之前，先確認 `021-admin-pages-frontend-shell-consolidation-plan.md`
> 已完成且 `appspine-app-template` 已消費新版 `@appspine/frontend-shell` admin 頁（見文首
> 「執行前置依賴」）。另外，fork 出來後除了 scaffold-init，還要依
> `docs/agent-guide.md`「Template change propagation」一節，在 `apps/drive/docs/` 建立
> `template-sync.md`（020 新增的機制，記錄本 repo 目前對齊到 template 的哪個 commit SHA），
> 供之後追蹤 template 修正是否已回放到 drive。

比照 `_archive/dev_docs-20260803/app-template/Z02-app-template-fork-validation.md` 已驗證過的流程，port 依
`docs/agent-guide.md`「Local Dev Ports」表選下一個未用區塊（wiki 用 23010/3010/3011，calendar
用 23020/3020/3021）：DB `23030`、Backend `3030`、Frontend `3031`；另外 MinIO 固定用
`9000`/`9001`、Collabora 固定用 `9980`——**這兩個沒有走 app 專屬 port 配置慣例，因為它們是
單機開發環境下假設全域只會跑一份的輔助服務**，若未來要多個 app 同時本地並存且都要 MinIO/
Collabora，需要另外設計 port 分配（列入第 16 節待決事項）。

```bash
gh repo create appspine/drive --template appspine/appspine-app-template --private
# clone 到 apps/drive/
node scripts/scaffold-init.mjs --name drive --display-name "Drive" \
  --db-port 23030 --backend-port 3030 --frontend-port 3031
pnpm install
docker compose up -d db minio collabora
pnpm -C backend prisma:migrate -- --name init
pnpm -C backend prisma:seed
pnpm dev
GET http://localhost:3030/health   # 確認開機成功
```

之後才開始加 Drive 專屬 schema/module（依 002「新增 CRUD 模組標準流程」逐步進行，
DriveSpace → DriveFolder → DriveFile（含 MinIO）→ WOPI 依序建立，對齊第 12 節任務依賴）。

---

## 12. 建議執行順序（供後續 task-breakdown 依賴）

```
Schema（DriveSpace/Member/RoleGrant/DriveFolder/DriveFile + Permission 擴充）
  ├── Spaces module ────────→ Space 設定、成員管理、Role Grant 管理
  ├── Storage module ───────→ MinIO client wrapper（Folder/File module 依賴此）
  ├── Folders module ───────→ 資料夾樹、trash/restore
  ├── Files module ─────────→ 上傳/下載/預覽、trash/restore（依賴 Storage module）
  └── Wopi module ──────────→ 線上編輯（依賴 Files module 的 version/lock 欄位）

MCP tools 註冊 + Audit Log 掛點 → 待各 module CRUD 完成後個別補上
```

---

## 13. 風險與注意事項（沿用 auranest 經驗 + appspine 新增部分）

1. **Windows 下 `prisma:migrate` 前必須先停掉 dev server**（DLL 鎖定問題，沿用 wiki/calendar
   已知問題）。
2. **`DriveFolder.parentId` 是 `onDelete: SetNull`，不是 Cascade**：刪除父資料夾的 service 層
   必須自己遞迴處理子孫（trash 或永久刪除），否則子資料夾會變成 `parentId = null` 的孤兒，
   不是預期行為（沿用 auranest 既有邏輯，照抄遞迴處理，不要漏掉）。
3. **舊版本 MinIO blob 永遠不會清除**：WOPI 每次儲存都開新 key（`v{n}`），沒有清理機制，長期
   會累積孤兒物件——這是沿用 auranest 的已知技術債，v1 照抄不修，列入第 16 節待決事項。
4. **Collabora 的 `aliasgroup1`/`WOPI_PUBLIC_URL` 本機開發設定**：Collabora container 需要能
   回呼到 backend，本機 Windows Docker Desktop 環境要用 `host.docker.internal`（配合
   `extra_hosts: host-gateway`），全端 docker 部署則用服務名稱 `http://backend:3000`——這組設定
   容易搞錯導致 WOPI 編輯器打不開，開工前建議先手動驗證一次 Collabora 能成功呼叫回 backend
   的 `/wopi/files/:fileId`（CheckFileInfo）。
5. **`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` 預設值 `minioadmin`/`minioadmin` 僅限本機開發**，
   `.env.example` 要註明清楚，正式環境部署必須換掉（呼應 002「不可寫死 secret」原則）。
6. **`User` model 反向關係新增後**：需停 dev server + 重跑 `prisma generate`。
7. **MCP tool 的 Space 存取檢查**：write tool（`create_drive_space` 等）透過 API Key 呼叫時，
   要在方法內手動呼叫 `SpaceAccessService` 做跟 HTTP 路由一樣的角色檢查，不能因為繞過了
   `SpaceMemberGuard` 就漏掉這層（同 wiki/calendar 先例，先建立 `isServiceAccount = true` 專用
   User + 手動加入 Space 成員資格，才能讓 AI agent 有東西可以寫入）。
8. **無 MIME 限制**：`FileInterceptor` 沒有設 `fileFilter`，任何檔案類型都能上傳並存進 MinIO
   ——v1 先沿用 auranest 不加限制，但這是待使用者確認的風險項，見第 16 節。

---

## 14. M2M API Key 身份綁定（框架已就緒，同 wiki/calendar）

drive 的 MCP write tool 需要 API Key 綁定真實 `User` 身份，才能滿足 `createdById` FK 與
`DriveSpaceMember`/`DriveSpaceRoleGrant` 資料驅動授權查詢。這個能力已經在 010 完成並發版，
`appspine-app-template` 早已升級消費，drive fork 出來的當下就已經帶有 `resolveActingUserId()`
（`@appspine/auth`）與 `AuditLogService.record()` 的 `actingApiKeyId` 快照能力。

開放 AI agent 寫入 drive 的操作步驟（同 010 第 4 節政策）：建立一個
`isServiceAccount = true` 的專用 User（例如 `drive-agent@internal`），把它加成目標 Space 的
`DriveSpaceMember`（EDITOR 或 OWNER），再建立 API Key 並綁定 `actingUserId` 指到這個 service
account。

---

## 15. Repo 建立流程以外的框架前置條件確認

同 calendar（012 §0）：drive 需要的框架能力（`@appspine/auth` 含 `resolveActingUserId()`、
`@appspine/rbac`、`@appspine/m2m-api-key` 含 `actingUserId`、`@appspine/audit-log` 含
`actingApiKeyId`、`@appspine/metadata-schema`、`@appspine/mcp-server`、`@appspine/health-check`）
全部已在 010/011 完成並讓 `appspine-app-template` 消費，**不需要**任何框架層變更，也沒有
像 011 wiki 當初的「框架前置修正」task 群組。

---

## 16. 待決事項（尚未拍板，執行前需確認）

- **MIME 白名單/黑名單**（第 2 節、第 13 節風險 8）：auranest 完全沒做，appspine 是否要加
  （至少擋執行檔類副檔名）需要使用者拍板，不是照抄 auranest 或比照 wiki 先例能決定的事。
- **`DRIVE_FILE_SHARE` / 公開分享連結**：v1 不做（auranest 本來就沒實作，見第 2 節），未來
  若要做「分享單一檔案/子資料夾給非 Space 成員」，需要重新設計（不是照抄 auranest 的殘留
  Permission enum 值）。
- **版本歷史**：auranest 只有「目前版本號 + 覆蓋舊 blob」，沒有版本清單、沒有還原到舊版本的
  功能（不像 wiki 的 `WikiPageVersion` 有完整版本表）。若未來需要類似 wiki 的版本歷史體驗，
  需要另外設計版本表，不是現有 `version: Int` 欄位能直接支援的。
- **舊版本 MinIO blob 清理**（第 13 節風險 3）：目前沒有排程或機制清除，累積多了要不要做定期
  清理 job，留待未來評估。
- **縮圖產生、病毒掃描、依 hash 去重、分段/可續傳上傳**：auranest 都沒做，v1 沿用不做，未來
  視需求評估是否要補。
- **星號收藏（starred/favorites）、拖曳排序**：auranest 完全沒有對應的 model/欄位/UI（拖曳排序
  在 auranest 的 `CLAUDE.md` 裡甚至列為未完成 TODO），v1 不做。
- **MinIO/Collabora 的 port 是否要納入 app 專屬配置慣例**（第 11 節）：目前假設本機開發環境
  同時間只會跑一份 drive，若未來需要多個依賴 MinIO/Collabora 的 app 在同一台機器並存，需要
  重新設計 port 分配方式。

