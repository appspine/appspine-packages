# Changelog

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
