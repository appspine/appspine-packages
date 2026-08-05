---
'@appspine/notification': patch
'@appspine/frontend-shell': minor
---

Second-round fixes from an adversarial re-review of the notification capability's first round of
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
  closed a stale-*overwrite* bug by introducing a stale-*read* one (a manual refresh right after a
  mutation could resolve with the pre-mutation count). `isLoading` is now cleared via `finally`
  instead of depending on a callback that might never fire, so it can no longer latch permanently
  true.
