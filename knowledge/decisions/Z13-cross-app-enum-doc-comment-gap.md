---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-09
updated: 2026-08-03
---

# Z13 - 跨 App Prisma Enum 缺少 `///` 文件註解（已修復，防再犯機制已實作）

> 狀態：**已全部完成**——5 個既有 app 的缺口已修復並驗證；`check:schema-docs` 防再犯機制已實作
> 並回補進 `appspine-app-template` + 5 個既有 app 的 pre-commit hook。

## 背景

在 013（drive）執行完成後，使用者檢視 `apps/drive/backend/prisma/schema/drive.prisma` 時發現
`enum DriveSpaceRole` 沒有 `///` 文件註解，而同檔案的 model 都有。追查後確認：

1. **這確實會影響 metadata，不是空談**：`@appspine/metadata-schema` 套件的
   `meta.service.ts`/`data-dictionary.js` 在 runtime 直接讀 Prisma DMMF 的
   `datamodel.enums[].documentation`（含每個 enum value 各自的 `documentation`），用來產生：
   - `GET /metadata/schema` runtime API（`MetaModule` 已掛進每個 app 的 `app.module.ts`）
   - `docs/data-dictionary.md`（`pnpm schema:docs` 產生，供 AI agent 理解 schema 用）
   缺少 `///` 註解 = 這個 enum 在上述兩個輸出裡的說明整段空白（不會報錯，純粹缺漏）。
2. **文件早就明講這是必填，只是沒人照做**：
   - `_archive/dev_docs-20260803/framework/002-app-dev-conventions.md:72`：「Prisma `///` 文件註解為必填：是 Metadata
     Schema API 與 data dictionary 的資料來源，直接影響 AI agent 可理解的 schema 品質」
   - `_archive/dev_docs-20260803/framework/002-app-dev-conventions.md:136`（新增 CRUD 模組標準流程 Step 1）：
     「新增 model / enum，補上 `///` 文件註解」——model 與 enum 並列必填。
   - `_archive/dev_docs-20260803/framework/003-shared-package-reuse-plan.md:77`：印證 `meta.service.ts` 的實作機制。

## 掃描結果：5 個 app 全部違反

逐一檢查 `wiki`/`project`/`chat`/`calendar`/`drive` 五個 app 的 domain-specific enum：

| App | Enum | 修復前狀態 |
|---|---|---|
| wiki | `WikiSpaceVisibility`、`WikiPageVisibility`、`WikiMemberRole` | 缺 |
| project | `ProjectStatus`、`ProjectMemberRole`、`ProjectBoardType`、`ProjectSprintStatus`、`ProjectIssuePriority`、`ProjectIssueStatus` | 缺 |
| chat | `ChatChannelMemberRole`、`ChatMessageType`、`ChatMentionType` | 缺 |
| calendar | `CalendarColor`（每個 value 有註解，但 enum 本身缺 top-level 摘要）、`CalendarEventStatus` | 部分缺/缺 |
| drive | `DriveSpaceRole` | 缺 |

只有框架層共用的 `Permission`/`PermissionPolicy`（`base.prisma`/`role.prisma`，來自
`@appspine/*` 套件的 fragment）本來就有文件註解——代表這是**每個 app 自己新增 domain enum 時
都沒補**的系統性落差，不是任何一次執行疏漏。

## 已完成的修復

對 5 個 app 的全部 13 個缺漏 enum（+ `CalendarColor` 補上 enum 層級摘要）逐一補上英文 `///`
文件註解（依 002 慣例：程式碼註解一律英文）。內容基於實際讀 service 層程式碼確認語意後撰寫，
沒有把握的地方（例如 `ProjectBoardType` SCRUM/KANBAN、`ChatMessageType` BOT/SYSTEM 目前並無
service 層強制邏輯）如實註明「目前未強制/未使用」，不誇大既有行為。

修復後對每個 app 執行並確認：
- `pnpm -C backend prisma:generate`：全部成功（無 Windows DLL 鎖定問題）。
- `pnpm -C backend schema:docs`：重新產生 `docs/data-dictionary.md`，抽查 `DriveSpaceRole`、
  `ChatMessageType` 的輸出確認新註解已正確出現。
- `pnpm -C backend typecheck`：5 個 app 皆無錯誤。

未執行：`prisma migrate`（`///` 文件註解不產生 SQL，不影響 DB schema，不需要 migration）、
瀏覽器 E2E（純 metadata/文件性質變更，typecheck + data dictionary 內容比對已足夠驗證）。

## 防止未來新 app 重蹈覆轍的機制（已實作）

目前 `dev_docs/002` 的「Prisma `///` 必填」原本只是文字要求，没有任何自動化檢查——這正是為什麼
5 個 app 會一致犯同樣的疏漏。專案裡已有現成的同類先例可以直接套用：
`appspine-app-template/backend/scripts/check-enum-i18n.ts` 用 `MetaService().buildMeta()`
讀 DMMF、跟 `en.json`/`zh-TW.json` 的 `enums` key 比對，缺漏就 `exit(1)`；`.husky/pre-commit`
裡有 `pnpm -C backend run check:enum-i18n` 擋 commit。已比照同一套模式實作：

1. **新增 `backend/scripts/check-schema-docs.ts`**（`appspine-app-template` + 5 個既有 app 皆已
   新增，內容逐字相同）：用已匯出的 `MetaService().buildMeta()`，走一次 `meta.enums`，任何一個
   `documentation` 是空的/純空白就印出 `[schema-docs] enum X is missing a /// doc comment` 並
   `exit(1)`。**範圍只涵蓋 enum**，不含 model/field——理由見下方「順便發現的額外缺口」。沒有改
   `@appspine/metadata-schema` 套件本身（`buildMeta()` 已回傳含 `documentation` 的完整 DMMF，
   套件原始碼也不在本機 workspace 可編輯範圍內，不需要也不能改）。
2. **`backend/package.json`** 加 `"check:schema-docs"` script（緊接在 `check:enum-i18n` 後）。
3. **`.husky/pre-commit`** 緊接在 `check:enum-i18n` 後面加一行 `pnpm -C backend run
   check:schema-docs`——`appspine-app-template` + 5 個既有 app 皆已加上。
4. **`_archive/dev_docs-20260803/framework/002-app-dev-conventions.md:72`** 補一句「已由 `check:schema-docs` 強制檢查」，
   把「寫了但沒人執行」的落差補起來。
5. 因為所有新 app 都從 `appspine-app-template` fork，之後每個新 app 生下來就自動內建這道檢查。

**驗證**：實作後直接拿 `check:schema-docs` 掃過 template + 5 個 app，第一次執行**真的抓到一個
先前沒發現的既有缺口**——`enum AuditAction`（`audit-log.prisma`，@appspine/audit-log 套件
fragment，複製進每個 app 各自獨立可編輯的副本）在 template 與全部 5 個 app 都沒有 `///` 註解。
已一併補上（`/// The kind of data-modification action recorded against an AuditLog entity.`），
重跑 `prisma:generate`/`schema:docs`/`check:schema-docs`/`typecheck`，template + 5 個 app
（含新增的 `check:schema-docs` 本身）全數通過、無錯誤。這次意外命中，也證明了這道檢查不是
空跑一次就綠燈的假檢查——它是真的會抓到東西的。

## 順便發現、本次刻意不處理的額外缺口

用同樣方式順手抽查了 5 個 app 的 **model** 層級 `///` 註解完整度（002:136 明講 model/enum 並列
必填），發現以下 7 個 model 也缺文件註解：`ChatDmParticipant`、`ChatMention`（chat）、
`ProjectMember`、`ProjectBoard`、`ProjectSprint`、`ProjectComment`、`ProjectWorklog`
（project）。**本次刻意不修、`check:schema-docs` 也刻意只檢查 enum、不檢查 model**——原因是
使用者這次的請求範圍明確是「enum 缺註解」，把 model 一起修/一起納入強制檢查是範圍外的擴張決定，
若現在把 model 檢查打開，pre-commit 會立刻因為這 7 個既有 model 而 fail，需要使用者另外決定是否
要一併修。記錄於此，供未來評估是否要比照本文件的模式再開一輪修復。

