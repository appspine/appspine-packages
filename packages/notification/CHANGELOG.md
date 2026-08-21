# Changelog

## 2.0.0

### Patch Changes

- 057c121: Accept the v3 frontend-shell major while retaining compatibility with the final v2 transition
  release. This lets the canary fleet consume the new shell without peer-dependency conflicts.
- Updated dependencies [057c121]
  - @appspine/frontend-shell@1.0.0

## 1.0.2-canary.0

### Patch Changes

- Accept the v3 frontend-shell major while retaining compatibility with the final v2 transition
  release. This lets the canary fleet consume the new shell without peer-dependency conflicts.

## 1.0.0

### Minor Changes

- 96f92e8: Migrate notification capability package to full plugin model (051 PL4-01).

  - `@appspine/notification`: declare backend, prisma, operations, frontend, and permissions facets in `appspine.plugin.json` and `./plugin`; export `NotificationModule` binding `NotificationService` to `NOTIFICATION_INBOX`; ship `prisma/notification.prisma` with schema digest and User model augmentation; implement full 4-stage lifecycle (`validate` -> `register` -> `ready` -> `shutdown`) and resource cleanup registry.
  - `@appspine/plugin-api`: define `NotificationInboxPort` and related types in `ports.ts`.
  - `@appspine/identity-core`: declare `notification` plugin as authorized augmenter of `User.notifications` relation in `augmentedBy`.

### Patch Changes

- Updated dependencies [4c0ce5f]
- Updated dependencies [8e67a05]
- Updated dependencies [b75516d]
- Updated dependencies [b92c1c3]
- Updated dependencies [0eaf69d]
- Updated dependencies [9cd2838]
- Updated dependencies [a41aab9]
- Updated dependencies [aeb861d]
- Updated dependencies [96f92e8]
- Updated dependencies [fdff215]
- Updated dependencies [6a0e839]
  - @appspine/plugin-api@1.1.0
  - @appspine/plugin-host-nest@2.0.0
  - @appspine/frontend-shell@0.16.4

## 0.2.2

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.
- Updated dependencies [147d374]
  - @appspine/common@0.3.3

## 0.2.1

### Patch Changes

- 10a1871: Second-round fixes from an adversarial re-review of the notification capability's first round of
  fixes — several of those fixes turned out to be incomplete or to have introduced their own
  regressions; this closes them:

  - `@appspine/notification`: `parseNotificationSchemaMetadata` now strips `//`/`///` schema comments
    and SQL `--`/block comments before matching, so a commented-out `@@index`, `@updatedAt` field, or
    `CREATE INDEX` can no longer be counted as present. Migration indexes are now computed by
    replaying `CREATE INDEX`/`DROP INDEX` statements in order and keeping only what's still live at
    the end, so a later migration that drops a required index is correctly reported as drift instead
    of being masked by an earlier `CREATE INDEX` still present in the concatenated migration text.
    The migration-index regex now handles schema-qualified table references (`"public"."table"`) and
    strips trailing sort modifiers (`DESC`, `NULLS LAST`) instead of leaving them stuck to the parsed
    column name. `indexes`/`updatedAtFields`/`migrationIndexes` are now `undefined` (not `[]`) when
    the relevant text couldn't be parsed at all, so `checkNotificationSchemaDrift` correctly reports
    "could not be verified" instead of misreporting drift that may not exist. `markRead`, `archive`,
    `markAllRead`, `getInbox`, and `getUnreadCount` now also enforce the same recipient/notification
    id length bound `notify`/`notifyMany` already did.
  - `@appspine/frontend-shell`: the notification bell's deferred navigation (added last round to stop
    a click's page unload from aborting an in-flight `markRead`) now races that request against a
    1.5s timeout, so a hung or slow request can no longer turn a notification into a permanently
    unclickable dead link — navigation proceeds either way, and the real outcome still reconciles
    local state in the background if it arrives late. The click handler now reads modifier keys from
    the pointerdown that started the gesture rather than from the click event itself, since Radix's
    menu items re-dispatch clicks synthetically with `button: 0` and no modifiers regardless of what
    was actually held — Cmd/Ctrl-click was previously swallowed into the same-tab deferred-navigation
    path instead of opening a new tab. Middle-click (which never fires a `click` event at all, only
    `auxclick`) is now handled explicitly. `useNotificationPolling`'s `refresh()` now calls a new
    `forceRefresh()` on the polling controller that always issues a fresh request instead of
    piggybacking on whatever background poll happens to already be in flight — the previous fix
    closed a stale-_overwrite_ bug by introducing a stale-_read_ one (a manual refresh right after a
    mutation could resolve with the pre-mutation count). `isLoading` is now cleared via `finally`
    instead of depending on a callback that might never fire, so it can no longer latch permanently
    true.

## 0.2.0

### Minor Changes

- 7c9e928: Fix real gaps found in a post-release review of the Phase 1 shared notification capability:

  - `@appspine/notification`: `markRead`/`archive`/`markAllRead`/`getInbox`/`getUnreadCount` now
    accept and honor a caller-provided `{ tx }`, matching `notify`/`notifyMany` — previously they
    always used the injected `PrismaService`, silently escaping the caller's transaction boundary.
    Invalid input (blank ids, out-of-range pagination) now raises `BadRequestException` (400) instead
    of an unhandled `Error`/`ZodError` (500). `notifyMany` now rejects batches over 1000 inputs instead
    of risking a raw Postgres bound-parameter error. `parseNotificationSchemaMetadata` gains an
    optional third `notificationTableName` argument and now scopes its `@@index`/`@updatedAt` parsing
    to the `Notification` model block instead of the whole schema file, so an unrelated model can no
    longer make the drift check pass when `Notification` itself has drifted;
    `checkNotificationSchemaDrift` also now checks the DMMF's `isUpdatedAt` flag directly and reports
    index verification as explicitly unavailable (rather than silently skipping it) when no schema
    metadata is supplied.
  - `@appspine/frontend-shell`: the notification bell no longer lets a plain click's full-page
    navigation abort the in-flight mark-read request (navigation is deferred until the request
    settles; modifier/middle clicks are unaffected). Polling failures now surface a retryable inline
    error instead of silently leaving "mark all read" permanently disabled with no unread items
    visibly wrong. `useNotificationPolling`'s manual `refresh()` now shares the underlying poller's
    in-flight/sequence guards instead of being a second, unguarded request path that could overwrite a
    newer count with a stale one.
  - `@appspine/common`: `DmmfField` gains an optional `isUpdatedAt` flag, matching the real Prisma DMMF
    field shape, so consumers can check `@updatedAt` status without a metadata side-channel.

### Patch Changes

- Updated dependencies [7c9e928]
  - @appspine/common@0.3.2

## 0.1.1

### Patch Changes

- 887c381: Harden notification target-path validation and schema drift checks, pause polling in initially hidden tabs, and align the notification bell with the shared shell header controls.

## 0.1.0

### Minor Changes

- 055f88c: Add the Phase 1 shared notification capability: transaction-aware first-write-wins notification
  writes, ownership-safe inbox mutations, a documented Prisma contract and schema drift checker,
  plus a callback-driven frontend notification bell with bounded polling, optimistic read actions,
  responsive states and accessibility primitives.

All notable changes to `@appspine/notification` are documented here.

## 0.0.0

- Added the Phase 1 transaction-aware notification service, Prisma contract,
  validation helpers, and testing utilities.
