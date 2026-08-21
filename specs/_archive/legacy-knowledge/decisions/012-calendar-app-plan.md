---
type: decision
scope: repo-local
status: active
supersedes: null
superseded_by: null
created: 2026-07-05
updated: 2026-08-03
---

# 012 - Calendar App（appspine 第二個業務系統）- 系統設計計畫

> 狀態：已完成，app 已上線於 apps/calendar

---

## 1. 背景與定位

appspine 的第二個業務系統，從 `appspine-app-template` fork 出來，落地在 `apps/calendar/`
（獨立 repo、獨立資料庫，比照 001「多 repo」決策）。

定位：個人行事曆（類 Google Calendar 單人版）——每個使用者若干個行事曆（目前 v1 只有
`PERSONAL` 語意，見第 2 節），每個行事曆下多筆事件，支援全天事件、時區、RRULE 週期性事件與
拖曳/縮放調整。與 auranest-calendar 定位相同，這次是把「已驗證能動的部分」重新套用 appspine
框架的身份/權限/AI 整合機制，同時**卸除** auranest 那套「中心化 Admin Center SSO + 跨 app
稽核聚合佇列」的平台假設——appspine 依 001 決策採多 repo、無集中管理服務，這兩者在 appspine
下沒有對應物、也不需要，見第 2 節說明。

---

## 2. 與 auranest-calendar 的差異調整

| 項目 | auranest-calendar（來源） | appspine calendar（本次） | 理由 |
|---|---|---|---|
| 身份驗證 | 中心化「Admin Center」簽發 RS256/JWKS token，本 app 只驗證、透過 `UserResolutionInterceptor` 把 SSO `globalUserId` 對應到本地 `User` | appspine 自己的 `@appspine/auth`（local/oidc 二選一），使用者本來就是本地 `User`，**不需要**額外的身份對應層 | appspine 沒有、也不打算做 001「多 repo、無集中管理服務」決策之外的中心 IdP；auranest 這層是它自己歷史包袱，appspine 直接跳過 |
| `InternalProvisioningModule` / `UserResolutionInterceptor` | 有（SSO 使用者 provisioning webhook） | **不搬** | 同上，appspine 沒有外部身份來源需要對應 |
| 跨 app 稽核聚合（`AuditEmitterService` + pg-boss `aggregated-audit-log` queue） | 有 | **不搬** | 依賴同一個中心 Admin Center 當 consumer，appspine 架構下沒有這個角色；本地稽核用 `@appspine/audit-log` 已足夠（見第 7 節） |
| RBAC 模型 | 已有 `Role`+`PermissionPolicy`+`Permission[]`（跟 appspine 幾乎同構，`CALENDAR_*`/`EVENT_*` 已經是獨立 Permission） | 沿用同構模型，改吃 `@appspine/rbac` | 兩邊設計本來就接近，幾乎是 1:1 對應，調整量最小的一次 |
| Guard chain | `JwtAuthGuard` + `PermissionGuard`（app 路由）；`AdminGuard` 只用在平台管理路由（users/roles/api-keys，這些由 `@appspine/*` 套件內建，不用重做） | `JwtOrApiKeyGuard`（`@appspine/m2m-api-key`）→ `PermissionGuard`（`@appspine/rbac`，class 層級）→ `ScopeGuard`（限 API Key 呼叫） | 對應 002「API 設計規範」guard chain 順序，跟 wiki 一致 |
| DTO 驗證 | **混用** class-validator（`@Body()`）+ Zod（`@Query()`，如 `listEventsQuerySchema`/`updateScopeSchema`），另有自訂 `EndAfterStartConstraint`（`endAt > startAt`） | **統一改 Zod + `ZodValidationPipe`**（`@appspine/common`），`EndAfterStartConstraint` 改寫成 Zod `.refine()` | 對應 002 慣例：DTO 一律用 Zod，不用 class-validator（同 011 task breakdown 已定案的轉換表） |
| 路由前綴 | 已經沒有 `/api` 全域前綴（`/calendars`、`/events` 直接掛 root） | **不用調整**，直接沿用 | 跟 wiki 不同——wiki 的 auranest 來源是 `/api` 前綴需要拔掉，calendar 的來源本來就沒加，剛好對齊 002「路徑前綴慣例」 |
| Metadata Schema API | 自建 `MetaService`，讀 Prisma DMMF，`GET /meta/schema`（`AdminGuard` 保護，且身兼「衍生 API Key 可用 scope 清單」用途） | **不用自建**，`@appspine/metadata-schema` 已內建 `GET /metadata/schema`，同樣吃 Prisma DMMF | 跟 wiki 一致，框架已提供 |
| MCP Tools | **Layer 1 全自動**：掃 Prisma DMMF 幫每個非 `@internal` model 生 5 個 CRUD tool（`list_calendars`/`get_calendars`/.../`list_events`/... 共 15 個），**繞過 service 層直接呼叫 Prisma delegate**——已確認的正確性缺口：MCP `create_events` 不會經過 `EventsService.create()`，會漏掉 owner 指派、RRULE 驗證、全天事件正規化 | appspine 沒有自動產生機制，**比照 wiki 手寫 `@McpTool()`**，方法本體就是呼叫真正的 `CalendarsService`/`EventsService`，天生不會有 auranest 那個「MCP 繞過 service 層」的缺口。v1 決策：只開放 list/get/create/update，delete 留待後續（同 wiki 先例） | 對應 001 AI 整合設計；appspine 的手寫模式順便修正了 auranest 的既有正確性問題，值得在 code review 時特別確認 |
| Audit Log | 有 `AuditLogService`，但**只掛在 users/roles/api-keys**（平台管理），calendars/events 完全沒呼叫 | Calendar/Event 的 create/update/delete 呼叫 `AuditLogService.record()`（`@appspine/audit-log`） | 對應 001「System / Audit Log」治理要求；這點 calendar 領域本身反而要**新增**，不是調整既有邏輯 |
| 健康檢查 | 自建（`@nestjs/terminus` + Prisma health indicator） | `@appspine/health-check` 已內建 `GET /health` | 框架已提供，同 wiki |
| 資料模型 - `CalendarType`（`PERSONAL`/`SHARED`） | 有欄位，但**完全沒有任何存取檢查邏輯讀它**——`SHARED` 形同虛設 | **不搬**，v1 只做 owner-only 語意，欄位直接省略 | 沿用「只搬已驗證」原則；未實作的欄位不該照搬，之後真的要做共用行事曆時再設計（見第 15 節） |
| 資料模型 - `EventPrivacy`（`DEFAULT`/`PUBLIC`/`PRIVATE`） | 有欄位，同樣沒有任何存取檢查邏輯讀它 | **不搬** | 同上；沒有共用行事曆的前提下，privacy 欄位沒有意義 |
| 資料模型 - `EventAttendee` / `AttendeeStatus`（邀請/RSVP） | 有 model，但**沒有任何 controller/service 建立過** | **不搬** | 同上，是「畫了但沒做完」的殘留設計，不予沿用 |
| Model 命名 | `Event`（裸名，未加前綴） | 改名 `CalendarEvent`（`Calendar` model 本身維持原名，不疊字） | 比照 wiki 先例（`WikiSpace`/`WikiPage` 而非裸的 `Space`/`Page`）——`Event` 是過度泛用、極易跨領域撞名的字，之後若有其他 app 也有「事件」概念會很尷尬；`Calendar` 本身已經是夠明確的領域詞，不需要再疊一次前綴 |
| 樂觀鎖 / 併發寫入 | 無版本欄位，last-write-wins | **沿用 last-write-wins，不新增** | 對應「只實作已拍板設計，不做預防性設計」——auranest 沒有因為 last-write-wins 出過事，個人行事曆場景多使用者同時改同一筆事件的機率也低，v1 不引入 wiki 那套 `baseUpdatedAt` 409 機制，先沿用驗證過的簡單做法（見第 10 節、第 15 節待決事項） |
| FullCalendar 版本 | `@fullcalendar/{core,react,daygrid,timegrid,interaction}` 全部鎖 `^6.1.20` | **建議一併鎖到 `^6.1.20`** | `appspine-app-template` 的 `frontend/package.json` 目前已預裝 `@fullcalendar/react@^7.0.0`，但只有這一個子套件、其餘 `core`/`daygrid`/`timegrid`/`interaction` 都還沒裝，且這個 v7 版本從未真正跑過一個行事曆功能驗證過；auranest 驗證過的組合是 v6.1.20 全家，比照 Tiptap 先例「先用已驗證版本，不隨附帶版本升級」，建議把既有的 `react` 降回 `^6.1.20` 並補齊其餘四個子套件，而不是信任未經驗證的 v7（詳見第 13 節風險） |

---

## 3. 資料模型

沿用 auranest-calendar 目前的 `Calendar`/`Event` 欄位設計（扣除第 2 節列出的「不搬」欄位/model），
只調整 `///` 文件註解使其符合 002 慣例（Metadata Schema API 的資料來源）、外鍵一律指向
appspine 的 `User` model、`Event` 改名 `CalendarEvent`。

```prisma
enum CalendarColor {
  BLUE   // #4285F4
  GREEN  // #0F9D58
  RED    // #DB4437
  YELLOW // #F4B400
  PURPLE // #7C4DFF
  PINK   // #E91E63
  TEAL   // #009688
  GRAY   // #616161

  @@map("calendar_color")
}

enum CalendarEventStatus {
  CONFIRMED
  TENTATIVE
  CANCELLED

  @@map("calendar_event_status")
}

/// A user's calendar. Each user gets a primary calendar auto-created on first access.
model Calendar {
  id          String   @id @default(cuid())
  name        String
  description String?
  color       CalendarColor @default(BLUE)
  /// Soft show/hide in the UI; does not affect event data.
  isVisible   Boolean  @default(true) @map("is_visible")
  /// The auto-created home calendar; cannot be deleted.
  isPrimary   Boolean  @default(false) @map("is_primary")
  ownerId     String   @map("owner_id")
  owner       User     @relation("CalendarOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  events      CalendarEvent[]
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("calendars")
}

/// A single calendar event, optionally recurring via an RRULE string.
model CalendarEvent {
  id               String              @id @default(cuid())
  calendarId       String              @map("calendar_id")
  calendar         Calendar            @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  title            String
  description      String?
  location         String?
  /// IANA timezone, e.g. "Asia/Taipei". Governs how the RRULE is expanded.
  timezone         String              @default("Asia/Taipei")
  /// True UTC instant. For all-day events, normalized to UTC midnight.
  startAt          DateTime            @map("start_at")
  /// True UTC instant, exclusive (midnight of the day after the last day for all-day events).
  endAt            DateTime            @map("end_at")
  isAllDay         Boolean             @default(false) @map("is_all_day")
  status           CalendarEventStatus @default(CONFIRMED)
  /// iCalendar RRULE string; null = non-recurring event.
  recurrenceRule   String?             @map("recurrence_rule")
  /// Points at the master event's id by convention, NOT a DB-level FK — see risk notes (§13).
  recurringEventId String?             @map("recurring_event_id")
  /// The occurrence's original start time before this override row existed.
  originalStartAt  DateTime?           @map("original_start_at")
  /// True = this occurrence is a tombstone (cancelled single occurrence of a recurring series).
  isCancelled      Boolean             @default(false) @map("is_cancelled")
  /// Per-event color override; falls back to the owning calendar's color when null.
  color            CalendarColor?
  ownerId          String              @map("owner_id")
  owner            User                @relation("CalendarEventOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt        DateTime            @default(now()) @map("created_at")
  updatedAt        DateTime            @updatedAt @map("updated_at")

  @@index([calendarId, startAt])
  @@index([recurringEventId])
  @@map("calendar_events")
}
```

`User` model（`backend/prisma/schema/user.prisma`）需新增反向關係：`Calendar[]`（as
CalendarOwner）、`CalendarEvent[]`（as CalendarEventOwner）。

`Permission` enum（`backend/prisma/schema/base.prisma`）新增：

```prisma
enum Permission {
  // ...既有 USERS_*, API_KEYS_*
  // Calendar
  CALENDAR_READ
  CALENDAR_CREATE
  CALENDAR_UPDATE
  CALENDAR_DELETE
  CALENDAR_EVENT_READ
  CALENDAR_EVENT_CREATE
  CALENDAR_EVENT_UPDATE
  CALENDAR_EVENT_DELETE
}
```

---

## 4. 權限設計（單層——比 wiki 簡單）

跟 wiki 不同，這次**沒有第二層「資料驅動的協作角色」**——因為 v1 決定不搬 `CalendarType.SHARED`
與 `EventAttendee`（第 2 節），砍掉了唯一需要第二層的理由。整個權限模型只有系統層一層：

**系統層（appspine RBAC，Guard 靜態檢查）**

| 動作 | 需要的 Permission |
|---|---|
| 讀 Calendar 列表/單筆 | `CALENDAR_READ` |
| 建立 Calendar | `CALENDAR_CREATE` |
| 更新/刪除 Calendar | `CALENDAR_UPDATE` / `CALENDAR_DELETE` |
| 讀 Event（含依日期範圍查詢） | `CALENDAR_EVENT_READ` |
| 建立 Event | `CALENDAR_EVENT_CREATE` |
| 更新/刪除 Event（含 recurrence scope） | `CALENDAR_EVENT_UPDATE` / `CALENDAR_EVENT_DELETE` |

`ADMIN` role（`ALLOW_ALL` policy）永遠放行；一般 `USER` role 預設 `DENY_ALL`。

**Owner-only 檢查（service 層，非 Guard，沿用 auranest 原始邏輯不變）**

- 讀/寫/刪任何 `Calendar`：`calendar.ownerId !== resolveActingUserId(user) → ForbiddenException`（`ADMIN` role 略過此檢查）
- 讀/寫/刪任何 `CalendarEvent`：`event.ownerId !== resolveActingUserId(user) → ForbiddenException`
- 刪除 `isPrimary` calendar：一律拒絕（不分 ADMIN，沿用 auranest「主行事曆不可刪除」規則）
- 建立 Calendar/Event：建立者自動成為 owner（`ownerId = resolveActingUserId(user)`）

> 這一層本質上就是「你的行事曆只有你看得到」，沒有 wiki `WikiSpaceMember` 那種
> OWNER/EDITOR/VIEWER 協作角色，因為 auranest 原始設計裡這塊（`SHARED`/attendees）
> 從未真正實作過，v1 決定不生出一個 appspine 自己發明、auranest 沒驗證過的協作模型。

---

## 5. API 設計

不加全域 `/api` 前綴（auranest-calendar 本來就沒加，這次不用調整）。Guard chain：
`@UseGuards(JwtOrApiKeyGuard, PermissionGuard, ScopeGuard)`（class 層級）+
`@RequirePermissions(Permission.CALENDAR_READ)` 等 method-level 裝飾器 + API Key 呼叫另加
`@Scopes(...)`。

### Calendars

| Method | Path | Permission | Owner 檢查 |
|---|---|---|---|
| GET | `/calendars` | `CALENDAR_READ` | 只回傳 `ownerId = actingUserId` 的資料 |
| GET | `/calendars/:id` | `CALENDAR_READ` | owner |
| POST | `/calendars` | `CALENDAR_CREATE` | 建立者自動為 owner |
| PATCH | `/calendars/:id` | `CALENDAR_UPDATE` | owner |
| DELETE | `/calendars/:id`（204） | `CALENDAR_DELETE` | owner，`isPrimary` 一律拒絕 |

### Events

| Method | Path | Permission | Owner 檢查 |
|---|---|---|---|
| GET | `/events?start&end&calendarIds` | `CALENDAR_EVENT_READ` | 只回傳 owner 自己的事件，範圍內含 RRULE 展開後的虛擬 occurrence |
| GET | `/events/:id` | `CALENDAR_EVENT_READ` | owner |
| POST | `/events` | `CALENDAR_EVENT_CREATE` | 建立者自動為 owner |
| PATCH | `/events/:id?scope=THIS_ONLY\|THIS_AND_FOLLOWING\|ALL` | `CALENDAR_EVENT_UPDATE` | owner |
| DELETE | `/events/:id?scope=...`（204） | `CALENDAR_EVENT_DELETE` | owner |

`scope` query 用 Zod schema 驗證（`updateScopeSchema`，沿用 auranest 三選一列舉）。

---

## 6. MCP Tools（v1：核心讀寫，比照 wiki 手寫模式）

依 002「新增 CRUD 模組標準流程」第 3 步，由 app 自行用 `@McpTool()` 註冊。跟 auranest 的
「Layer 1 自動生成、繞過 service 層」模式不同，appspine 手寫 tool 內部直接呼叫
`CalendarsService`/`EventsService` 的既有方法，天生不會漏掉 owner 指派、RRULE 驗證、全天
事件正規化（見第 2 節列出的 auranest 正確性缺口）。v1 只開放 list/get/create/update，delete
留待後續（同 wiki 先例）。

| Tool name | 對應 REST | requiredScopes |
|---|---|---|
| `list_calendars` | `GET /calendars` | `calendar-calendars:read` |
| `get_calendar` | `GET /calendars/:id` | `calendar-calendars:read` |
| `create_calendar` | `POST /calendars` | `calendar-calendars:write` |
| `update_calendar` | `PATCH /calendars/:id` | `calendar-calendars:write` |
| `list_calendar_events` | `GET /events` | `calendar-events:read` |
| `get_calendar_event` | `GET /events/:id` | `calendar-events:read` |
| `create_calendar_event` | `POST /events` | `calendar-events:write` |
| `update_calendar_event` | `PATCH /events/:id` | `calendar-events:write` |

M2M API Key scope 新增 `calendar-calendars:read`、`calendar-calendars:write`、
`calendar-events:read`、`calendar-events:write`（`resource:action` 格式，對應 001 M2M API
Key 設計）。write tool 依賴 `resolveActingUserId()`（`@appspine/auth`，010 已完成），可直接使用，
不像 wiki 當初需要等框架前置變更。

---

## 7. Audit Log 整合

`AuditLogService.record()` 呼叫點（`entityType`/`action` 依 `@appspine/common` 的
`AuditAction` enum）——這點在 auranest 原始碼裡 calendars/events **完全沒有**（auranest 只在
users/roles/api-keys 平台管理路由掛了稽核），這次是新增，不是調整既有邏輯：

- Calendar：create / update / delete
- CalendarEvent：create / update / delete（含 recurrence scope 編輯——`THIS_AND_FOLLOWING`
  等實際上可能觸發多筆 DB 寫入，但對每次 HTTP 呼叫只記一筆邏輯層級的 `UPDATE`/`DELETE`
  稽核紀錄，不逐筆記錄內部拆分細節）

MCP 呼叫路徑帶 `isAiOperation: true` + `mcpTool: <tool name>`；`req.user.isApiKey === true`
時把 `actingApiKeyId` 一併帶入（比照 wiki 第 7 節、010 已定案的欄位）。

---

## 8. 前端架構

沿用 auranest-calendar 既有的元件切分，路徑改用 appspine template 的
`frontend/src/app/(main)/dashboard/` 慣例：

```
frontend/src/
├── app/(main)/dashboard/
│   └── calendar/
│       ├── page.tsx                       # FullCalendar 月/週/日檢視主頁
│       └── _components/
│           ├── calendar-sidebar.tsx        # mini date-picker + 我的行事曆清單（顯示/隱藏切換）
│           ├── event-form-modal.tsx        # 建立/編輯事件（React Hook Form + Zod）
│           ├── rrule-builder.tsx           # RRULE 週期規則 UI + 未來 5 次預覽
│           ├── event-detail-dialog.tsx     # 唯讀彈窗 + 編輯/刪除
│           └── recurrence-scope-dialog.tsx # THIS_ONLY / THIS_AND_FOLLOWING / ALL 選擇
└── lib/
    ├── calendars-api.ts
    └── events-api.ts                       # CreateEventInput/UpdateEventInput/RecurrenceScope/isRecurringEvent()
```

i18n：新增 `calendar` namespace（calendars/events/color/status 等 key），enum 翻譯
（`CalendarColor`/`CalendarEventStatus`）依 002「Enum / i18n 慣例」放進
`enums.<EnumName>.<VALUE>`，從 `GET /metadata/schema` 讀取選項，不寫死前端常數。

> 沒有 users/roles/api-keys 管理頁要另外做——這些頁面已經是 `appspine-app-template` 內建的
> 平台功能，不是 auranest calendar app 自己的程式碼，calendar 這邊不需要重做。

---

## 9. FullCalendar / RRULE 設計（原封不動沿用邏輯，僅調整版本與 DTO 驗證方式）

| 項目 | 說明 |
|---|---|
| 檢視 | `dayGridMonth`/`timeGridWeek`/`timeGridDay`，拖曳搬移（`eventDrop`）、縮放（`eventResize`），失敗時 optimistic revert |
| 點擊建立 | `dateClick` 開啟 `event-form-modal` |
| RRULE 展開 | 沿用 `ExpansionService` 設計：`rrule` 套件 + `date-fns-tz` 做 floating↔UTC 轉換，occurrence 用合成 id（`${masterId}__${isoOriginalStartAt}`），**不落地資料庫**，每次 `GET /events` 即時展開 |
| 單一次例外 | 插入一筆 `isCancelled: true` 的 tombstone row（`recurringEventId` 指回 master），不是改寫 RRULE 本身 |
| 編輯範圍 | `THIS_AND_FOLLOWING` 截斷舊 master 的 RRULE（算出 `UNTIL`），若原規則是 COUNT-based 則另開一個新 forward-series master 並重算剩餘 COUNT（`adjustRuleCountForSplit`，沿用 auranest 邏輯） |
| 全天事件正規化 | UTC 午夜為界，`endAt` exclusive（結束日隔天的午夜），沿用 `normalizeAllDayBounds` helper |
| RRULE 驗證 | 原本是獨立 helper function（`validateRrule()`），appspine 改成 Zod `.refine()` 掛在 `createEventSchema`/`updateEventSchema` 上呼叫同一個驗證邏輯，DTO 驗證方式統一（第 2 節） |

`package.json` 固定確切版本（不用 `^`，同 wiki 對 Tiptap 的做法）：
`@fullcalendar/{core,react,daygrid,timegrid,interaction}` 全部鎖 `6.1.20`，`rrule` 鎖
`2.8.1`，`date-fns-tz` 鎖 `3.2.0`（前後端皆需要：後端展開用、前端 RRULE builder 預覽用）。

---

## 10. 時區 / 全天事件 / 併發寫入

- **時區**：`CalendarEvent.timezone`（IANA 字串，預設 `Asia/Taipei`）；`startAt`/`endAt` 一律存
  真實 UTC instant，展開時用 `date-fns-tz` 的 `toFloating`/`fromFloating` 轉換（沿用 auranest
  設計不變）。
- **全天事件**：正規化為 UTC 午夜邊界，`endAt` exclusive。
- **併發寫入**：**沿用 auranest 的 last-write-wins，v1 不引入樂觀鎖**（不像 wiki 的
  `baseUpdatedAt` 409 機制）。理由：auranest 這樣做沒出過事，個人行事曆多人同時編輯同一筆
  事件的機率遠低於 wiki 多人協作編輯同一頁面；若之後要做 `SHARED` 共用行事曆（見第 15 節），
  屆時再一併評估是否需要樂觀鎖。

---

## 11. Repo 建立流程

比照 `_archive/dev_docs-20260803/app-template/Z02-app-template-fork-validation.md` 已驗證過的流程，port 依
`docs/agent-guide.md`「Local Dev Ports」表選下一個未用區塊：DB `23020`、Backend `3020`、
Frontend `3021`（fork 當下記得在同一個 commit 更新該表格）。

```bash
gh repo create appspine/calendar --template appspine/appspine-app-template --private
# clone 到 apps/calendar/
node scripts/scaffold-init.mjs --name calendar --display-name "Calendar" \
  --db-port 23020 --backend-port 3020 --frontend-port 3021
pnpm install
docker compose up -d db
pnpm -C backend prisma:migrate -- --name init
pnpm -C backend prisma:seed
pnpm dev
GET http://localhost:3020/health   # 確認開機成功
```

之後才開始加 Calendar 專屬 schema/module（依 002「新增 CRUD 模組標準流程」逐步進行，
Calendar → CalendarEvent（含 RRULE 展開）依序建立，對齊第 12 節任務依賴）。

---

## 12. 建議執行順序（供後續 task-breakdown 依賴）

```
Schema（Calendar/CalendarEvent + Permission 擴充）
  ├── Calendars module ──────→ Calendar 建立/設定、primary 自動建立
  └── CalendarEvents module ─→ Event CRUD
        ├── ExpansionService（RRULE 展開、floating/UTC 轉換）
        ├── Recurrence 編輯範圍（THIS_ONLY / THIS_AND_FOLLOWING / ALL）
        └── 全天事件正規化

前端：FullCalendar 檢視 → event-form-modal → rrule-builder → recurrence-scope-dialog

MCP tools 註冊 + Audit Log 掛點 → 待各 module CRUD 完成後個別補上
```

---

## 13. 風險與注意事項

1. **FullCalendar v6 → v7 版本落差**：`appspine-app-template` 目前預裝
   `@fullcalendar/react@^7.0.0`，但只有這一個子套件，其餘四個都還沒裝，且 v7 從未實際跑過一個
   行事曆功能驗證。auranest 驗證過的是 v6.1.20 全家。建議先做 PoC 確認要「降回 v6.1.20 沿用
   auranest 驗證過的組合」還是「升到 v7 並重新驗證月/週/日檢視、拖曳、縮放行為」，不要假設
   v7 API 相容，比照 wiki 對 Tiptap v2→v3 的處理方式。
2. **`recurringEventId` 無 DB 級 FK**：只是一般字串欄位，由應用層 code 維護指向關係，service
   層必須自己保證一致性（沿用 auranest 既有簡化設計，不新增 DB 約束）。
3. **RRULE COUNT-based 規則的 split 邏輯**（`adjustRuleCountForSplit`）：`THIS_AND_FOLLOWING`
   编輯範圍如果原規則是 COUNT-based，需要正確重算剩餘次數，這段邏輯非顯而易見，建議照抄
   auranest 實作並補單元測試（對應 002「測試規範」——複雜商業邏輯需要額外單元測試）。
4. **Windows 下 `prisma:migrate` 前必須先停掉 dev server**（DLL 鎖定問題，沿用 wiki 已知問題）。
5. **`User` model 反向關係新增後**：需停 dev server + 重跑 `prisma generate`。
6. **MCP tool 的 owner 綁定**：write tool（`create_calendar_event` 等）透過 API Key 呼叫時，
   `resolveActingUserId()` 解析出的 acting user 必須實際擁有目標 Calendar，否則落到一般
   owner-only 403，跟 wiki 一樣需要先建立 `isServiceAccount = true` 的專用 User 並手動建立
   一顆屬於它的 Calendar，才能讓 AI agent 有東西可以寫入（見第 14 節）。

---

## 14. M2M API Key 身份綁定（框架已就緒，同 wiki）

calendar 的 MCP write tool 需要 API Key 綁定真實 `User` 身份，才能滿足 `ownerId` FK。這個能力
已經在 010（`_archive/dev_docs-20260803/framework/010-m2m-api-key-acting-user-plan.md`）完成並發版，`appspine-app-template`
早已升級消費，calendar fork 出來的當下就已經帶有：

1. `resolveActingUserId()`（`@appspine/auth`）——解析寫入用的 userId。
2. `AuditLogService.record()` 帶 `actingApiKeyId`（`req.user.isApiKey === true` 時把
   `req.user.sub` 帶進去）。

開放 AI agent 寫入行事曆的操作步驟（同 010 第 4 節政策）：建立一個
`isServiceAccount = true` 的專用 User（例如 `calendar-agent@internal`），手動幫它建立（或指定）
一顆屬於它的 Calendar，再建立 API Key 並綁定 `actingUserId` 指到這個 service account。

---

## 15. 待決事項（尚未拍板，執行前需確認）

- **`CalendarType.SHARED` / `EventAttendee`（共用行事曆、邀請/RSVP）**：v1 決定不搬，因為
  auranest 原始碼裡這兩者從未真正實作（無 controller/service，無存取控制）。若未來業務需求
  真的要做「多人共用同一個行事曆」，需要重新設計（不是照抄 auranest 的殘留 schema）——屆時
  也要一併重新評估第 10 節「是否需要樂觀鎖」的判斷，因為多人協作寫入同一筆事件的機率會顯著
  提高。
- **`EventPrivacy`**：同上，等共用行事曆設計拍板後一併考慮是否需要。
- FullCalendar 版本（v6 沿用 vs v7 升級，見第 13 節風險 1）需要在開工前先做 PoC 決定。

