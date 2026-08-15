# @appspine/frontend-shell

## 0.15.1

### Patch Changes

- 3282f18: Security audit fixes across the shared framework packages.

  **BREAKING (`@appspine/m2m-api-key`)** — `ScopeGuard` now fails **closed** for API-key
  principals. Previously, a route with no `@Scopes()` metadata reachable on either the handler
  or the controller class returned `true`, so adding a handler to a `ScopeGuard`-protected
  controller without a `@Scopes()` decorator silently granted every API key full access to it.
  API-key callers are now rejected with 403 when no scope requirement is declared at all; JWT
  callers are unaffected (scopes have never applied to them). Every M2M-reachable route must
  now carry an explicit `@Scopes(...)` on the handler or the controller class. Note that
  `@Scopes('*')` is not an "any key" escape hatch — `matchScope` requires the key to actually
  hold the `*` wildcard scope for that to pass.

  - `@appspine/common`: `LoggingModule` now redacts `req.headers.cookie` and
    `res.headers["set-cookie"]` (consuming apps run CORS with `credentials: true`, so session
    cookies were reaching plaintext logs), plus `proxy-authorization`,
    `x-appspine-signature`, and the common token-bearing body fields.
  - `@appspine/common`: `GlobalExceptionFilter` now validates `X-Request-Id` against
    `/^[A-Za-z0-9._-]{1,64}$/` before using it as the trace id, falling back to a generated
    UUID. An embedded newline previously let a caller forge whole log lines and reflect
    arbitrary content into the JSON error body.
  - `@appspine/integration-contracts`: `resolveSafeDestination()` now expands IPv6 literals
    before classifying them. Loopback and unique-local addresses written in a non-canonical
    form (`0:0:0:0:0:0:0:1`, `fc00:0:0:0:0:0:0:1`) bypassed the string-prefix blocklist
    entirely. Also blocks NAT64 (`64:ff9b::/96`), 6to4 (`2002::/16`), Teredo, and the
    `192.88.99.0/24` 6to4 relay anycast range.
  - `@appspine/domain-events`: `postDomainEventWebhook` (v1) now applies the same
    `resolveSafeDestination()` guard `postDomainEventWebhookV2` uses and pins the connection to
    the validated address, closing an SSRF primitive against an admin-supplied destination URL.
    It takes an optional `destinationPolicy` and is marked `@deprecated` in favour of v2.
  - `@appspine/frontend-shell`: admin request helpers now `encodeURIComponent()` ids
    interpolated into fetch paths, so an id containing `../` or `?` can no longer retarget the
    request at a different API route.

## 0.15.0

### Minor Changes

- 2a9b9ab: Add a `@appspine/frontend-shell/server` entry point exporting the Next.js server-side
  scaffolding shared by every business-app fork's `frontend/src/server/`: a
  `createGetCurrentUser(apiFetch)` factory for a cached, 401-tolerant `getCurrentUser()`,
  list-URL query helpers (`buildListHref`/`buildSortHref`/`parseSortOrder`/`formatPageInfo`),
  `setLocaleAction`, and cookie helpers (`setValueToCookie`/`getPreference`). Each host app
  still supplies its own `apiFetch` implementation via dependency injection — this only
  consolidates the identical boilerplate that was previously duplicated byte-for-byte across
  9 repos (the template plus 8 business apps).

## 0.14.1

### Patch Changes

- 147d374: Harden shared package publishing and runtime dependencies: restrict package tarballs to runtime
  artifacts and maintained documentation, add health-check coverage with a typed Terminus adapter,
  upgrade bcrypt to remove the vulnerable node-pre-gyp chain, and require patched MCP Hono
  dependencies.

## 0.14.0

### Minor Changes

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

## 0.13.2

### Patch Changes

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

## 0.13.1

### Patch Changes

- 887c381: Harden notification target-path validation and schema drift checks, pause polling in initially hidden tabs, and align the notification bell with the shared shell header controls.

## 0.13.0

### Minor Changes

- 055f88c: Add the Phase 1 shared notification capability: transaction-aware first-write-wins notification
  writes, ownership-safe inbox mutations, a documented Prisma contract and schema drift checker,
  plus a callback-driven frontend notification bell with bounded polling, optimistic read actions,
  responsive states and accessibility primitives.

## 0.12.0

### Minor Changes

- Second audit round fixes: `GlobalExceptionFilter` now logs every caught exception (error level with stack for 5xx, debug for 4xx) instead of silently discarding it — previously a 500 left zero server-side trace beyond the generic access-log line. `frontend-shell`'s `actions-core.ts` duplicated try/catch/fallback boilerplate across 13 functions, now collapsed into a shared `runAction()` helper. `DatePicker`'s trigger button no longer hardcodes `zh-TW` when formatting the displayed date — it now follows the app's actual resolved locale. `ThemeBootOptions`' `persistence`/`defaults` are now typed against the real preference keys instead of `Record<string, string>`. Added the package's first test suite, covering previously-untested pure utilities (`auth-error.ts`, `api-client.ts`, `date-only.ts`, `utils.ts`, `theme-utils.ts`).

## 0.11.0

### Minor Changes

- `useTranslations()` now returns a properly typed translate function instead of `(key: string) => string`. Consuming apps opt in by augmenting the new exported `FrontendShellMessages` interface via TypeScript declaration merging:

  ```ts
  import type { Messages } from "@/i18n/messages";
  declare module "@appspine/frontend-shell" {
    interface FrontendShellMessages extends Messages {}
  }
  ```

  Apps that don't augment it keep the previous untyped behavior — fully backward compatible, no existing call sites need to change.

## 0.10.0

### Minor Changes

- Replace the generic `<TKey extends string = string>` on the 6 shared admin table
  components (`RolesTable`, `UsersTable`, `ApiKeysTable`, `DomainEventsTable`,
  `DomainEventCatalogTable`, `DomainEventDetailPanel`) with each component's actual literal
  key union, and remove the internal `as TKey` assertions those keys were hidden behind. The
  0.9.0 generic design was type-safety-neutral in practice — the `= string` default let an
  unmigrated consumer keep passing `(key: string) => string` and still compile, and the
  internal assertions meant a typo'd or renamed translation key inside the component itself
  wouldn't be caught either. Consumers whose scoped translation function's key type doesn't
  structurally satisfy the new literal union will now see a real compile error instead of
  silently compiling.

  Also removes `buildAllMessages()` (dead export, zero callers anywhere in the workspace) and
  `sidebar.tsx`'s hand-rolled `document.cookie` write (now goes through this same package's
  `setClientCookie`, added in 0.9.0, instead of duplicating the max-age logic).

## 0.9.0

### Minor Changes

- Retroactive changelog entry (036 remediation, 2026-07-31) — this version was published
  (`0f588f3`) without a changeset, so this entry was missing until now. It shipped: generic
  `<TKey extends string = string>` types on the 6 shared admin table components (`RolesTable`,
  `UsersTable`, `ApiKeysTable`, `DomainEventsTable`, `DomainEventCatalogTable`,
  `DomainEventDetailPanel`), replacing their `t: (key: string) => string` prop that forced
  every consumer into an `as any`/cast workaround; and consolidation of `cookie.client.ts`,
  `theme-boot.tsx` (`ThemeBootScript`), and a new parameterized `createApiFetch` factory,
  previously duplicated verbatim across all 9 repos.

## 0.8.0

### Minor Changes

- `LoginButton`'s `label`/`pendingLabel` props are now required instead of defaulting to hardcoded English text — every consumer already passed its own translated copy, but the defaults meant a future app that forgot to would silently render English regardless of locale. A failure in `onSignIn` other than next-auth's own redirect (e.g. a network failure reaching the IdP) is now caught and surfaces an error message instead of silently resetting the button to idle with no explanation (`unstable_rethrow`'s underlying digest check is reimplemented inline rather than imported, since this package's `moduleResolution: NodeNext` can't resolve `next/navigation` against Next.js's own empty `exports` map).

## 0.7.0

### Minor Changes

- Add `LoginButton` component and `mapAuthErrorKey` helper for the OIDC redirect-style
  login flow (dev_docs/framework/035 §4.1, T-12550). Extracted from `apps/mcp-gateway`'s
  pilot next-auth integration after validating it in-browser — each app still owns its own
  next-auth config and translated copy; this only shares the loading/error presentation
  shape around `signIn()`.

## 0.6.1

### Patch Changes

- 4e3edbf: `DialogContent` had no height cap, so dialogs whose content is taller than
  the viewport (e.g. the Create API key dialog once it renders one checkbox
  per non-`@internal` metadata-schema scope, three per model) extend both
  above and below the viewport instead of scrolling internally — the footer
  buttons become unreachable. Cap it at `max-h-[85vh]` with
  `overflow-y-auto`, the standard shadcn dialog pattern for unbounded content.

## 0.6.0

### Minor Changes

- cc3b30a: Export the shared select primitive, preference layout/theme helpers, and a parameterized header breadcrumb component.

## 0.5.3

### Patch Changes

- edc32a1: Fix domain event admin review findings: restrict retry/ignore mutations to dead-letter deliveries, add an optional admin audit hook, split unresolved delivery keys from data-driven catalog entries, make date upper bounds inclusive by day, strengthen schema/subscriber drift checks, and surface unresolved catalog rows in the shared frontend table.

## 0.5.2

### Patch Changes

- Fix `DomainEventDeliveriesPanel`: it's a Client Component, but was taking `t`/`renderEnumLabel`
  (plain functions) as props from Server Component callers — React Server Components reject
  passing plain functions (as opposed to `"use server"` Server Actions) across that boundary,
  which crashed the page at runtime ("Functions cannot be passed directly to Client
  Components..."). It now calls `useTranslations('domainEvents')`/`useTranslations('enums')`
  itself, matching `RoleRowActions`/`ApiKeyRowActions`'s existing pattern in this same
  directory. `DomainEventsTable`'s own `t`/`renderEnumLabel` props are unaffected — it's a
  Server Component and no longer forwards them into the nested `DomainEventDeliveriesPanel`.

  Found via real browser testing while wiring this into apps/approve (dev_docs 028 T-11230) —
  not caught by T-11220's typecheck/build-only verification, since this is a runtime RSC
  serialization error, not a type error.

## 0.5.1

### Patch Changes

- Add `retryDomainEventDeliveryRequest`/`ignoreDomainEventDeliveryRequest` to
  `actions-core.ts`, matching the existing roles/users/api-keys action-wrapper convention,
  for apps wiring up `DomainEventDeliveriesPanel`'s retry/ignore action props.

## 0.5.0

### Minor Changes

- Add declarative domain-event subscriptions (`@DomainEventSubscriber` decorator,
  `registerDomainEventSubscribers()`, `DomainEventRegistry.describe()`), a shared
  `@appspine/domain-events/admin` NestJS module (catalog + list/detail + retry/ignore
  endpoints, shipped as a second package entry point so lightweight consumers never pull
  in the auth guard chain), and matching `@appspine/frontend-shell` admin components
  (`DomainEventsTable`, `DomainEventDetailPanel`, `DomainEventDeliveriesPanel`,
  `DomainEventCatalogTable`).

## 0.4.3

### Patch Changes

- 33aa41f: Reduce domain-event dispatcher database work with bulk stale-lock reclamation and skip empty or duplicate delivery fan-out writes. Improve shared admin-table rendering by indexing service accounts once, tighten sortable-link component types, and align the pagination helper type with its existing default behavior.

## 0.4.2

### Patch Changes

- Expose app-specific API key scopes in the shared admin dialog by accepting scope
  options from `/metadata/schema`, while keeping the existing fallback list for
  apps that have not wired metadata-backed scopes yet.

## 0.4.1

### Patch Changes

- Fix `RolesPage` crashing with "Functions cannot be passed directly to Client Components" (React Server Components error). `CreateRoleDialog` and `RoleRowActions` previously accepted a `renderEnumLabel` callback prop, which is a plain function and cannot cross the Server-to-Client Component boundary — this made the Roles admin page 500 on every render in every consuming app.

  `CreateRoleDialog` and `RoleRowActions` now accept `policyOptions`/`permissionOptions` as pre-resolved `{ value, label }[]` data (a new `EnumOption` type) instead of raw enum values plus a label-rendering function. `RolesTable` (which has no `'use client'` directive and therefore still safely receives `renderEnumLabel` from its Server Component parent) resolves the labels itself before handing the enriched data down to `RoleRowActions`.

  **Consumers must update their `roles/page.tsx`**: build `{ value, label }[]` arrays for `policyOptions`/`permissionOptions` before passing them to `<CreateRoleDialog>` (e.g. `permissionPolicyOptions.map((value) => ({ value, label: enumLabel(tEnum, "PermissionPolicy", value) }))`), and drop the `renderEnumLabel` prop from `<CreateRoleDialog>` — `<RolesTable>`'s own props are unchanged.

## 0.4.0

### Minor Changes

- Add `admin/*` exports (including `UsersTable`, `RolesTable`, `ApiKeysTable`, their dialogs and row-actions, 12 `*Request` pure action functions, and consolidated types) and seven new shadcn primitive exports (`dialog`, `alert-dialog`, `checkbox`, `label`, `field`, `table`, `badge`).

## 0.3.1

### Patch Changes

- a03373a: Fix `<DateRangePicker>`'s trigger button label using a locale-formatted `d MMM yyyy` (e.g. "9 6 月 2026"), which reads awkwardly in `zh-TW` (day-month-year order borrowed from the English pattern with the month name swapped for Chinese). Use a plain `yyyy/M/d` numeric format instead (e.g. "2026/6/9"), which is unambiguous in both locales.

## 0.3.0

### Minor Changes

- Add `<DateTimePicker>`, `<DateRangePicker>`, `<DatePicker>` components (and the underlying `<Calendar>`/`<Popover>` primitives) to `@appspine/frontend-shell`, consolidating five copy-pasted forks (`appspine-app-template`, `apps/wiki`, `apps/calendar`, `apps/chat`, `apps/project`) into one shared implementation. `<DateTimePicker>` uses the version with the nested-`<button>` hydration fix; `<DateRangePicker>`/`<DatePicker>` use `apps/project`'s i18n-aware versions (`useDateFnsLocale()`), which are now wired into all three components' popover `<Calendar>`.

  **New peerDependencies**: `date-fns@^4.4.0` and `react-day-picker@^10.0.1` (already in use by all five consuming apps at this version, so no consumer needs to bump anything to stay compatible — but any new app forking from `appspine-app-template` with a different version should check compatibility).

## 0.2.2

### Patch Changes

- Thread `accountLabel`/`signOutLabel` through `DashboardShell` → `AppSidebar` to `UserNav`, which already accepted them but had no way to receive anything but its hardcoded English defaults ("Account"/"Log out") from a consuming app.

## 0.2.1

### Patch Changes

- Fix SidebarPagePortal losing its target when the sidebar switches between desktop and mobile (Sheet) presentations, which re-mounts the slot as a new DOM node.

## 0.2.0

### Minor Changes

- Add SidebarPageSlot/SidebarPagePortal so page-level content (e.g. a chat app's channel list) can render into the persistent app sidebar instead of the content area.

## 0.1.2

### Patch Changes

- Publish to the registry instead of being consumed only via a local `file:` link. Business-system repos forked from `appspine-app-template` don't have this monorepo checked out as a sibling directory, so the `file:../../appspine-packages/packages/frontend-shell` dependency in `frontend/package.json` couldn't resolve outside the original dev workspace (broke both CI and any real fork).

## 0.1.1

### Patch Changes

- `<SortableColumnHeader>` is now generic over its `field`/`buildSortHref` field type (`SortableColumnHeader<TField extends string>`), so a page can supply its own literal union of sortable field names and catch a typo'd/renamed field at compile time instead of it silently falling through to the backend's default sort. Defaults to `string`, so existing untyped usages keep compiling unchanged.

## 0.1.0

### Minor Changes

- ab5e450: Add `@appspine/frontend-shell`, extracted from `appspine-app-template/frontend`'s dashboard shell
  (`dev_docs/004-task-breakdown.md` T-201~T-205):

  - `DashboardShell`: composes `AppSidebar` + main content, accepting `navItems`/`header` props.
  - `UserNav`: controlled `{ user, onSignOut }` interface, decoupled from any app-specific data source.
  - `ThemeSwitcher` / `SidebarResizer`: moved as-is from the template's sidebar components.
  - Bundles a trimmed-down copy of the shadcn primitives the shell components depend on
    (`src/components/ui/`) instead of requiring apps to provide their own — peer dependencies are
    limited to the underlying libraries (`radix-ui`, `lucide-react`, `class-variance-authority`,
    `clsx`, `tailwind-merge`). This mirrors `auranest`'s `@auranest/ui` approach: apps re-running the
    shadcn CLI or restyling their own components can't silently break the package at compile time.

- bed4373: Add core i18n infrastructure, supporting locale types, a type-safe messages helper `buildAllMessages`, the context-providing `I18nProvider`, and client hooks `useLocale`/`useTranslations` for shared translation retrieval.
- 3911f83: Add the `<ListPagination>` component to `@appspine/frontend-shell` to encapsulate table listing pagination, handle custom Link injection, and correctly manage disabled state.
- 8db6971: Add the `<ListSearchForm>` component to `@appspine/frontend-shell` for unified query-input form layout across dashboard listing pages.
- ab42589: Add `<LocaleSwitcher>` component to `@appspine/frontend-shell` for toggling application locales.
- Add the `<SortableColumnHeader>` component to `@appspine/frontend-shell` — a link-based, server-rendered table header that toggles `sortField`/`sortOrder` via URL navigation (same `LinkComponent`/`buildHref` pattern as `<ListPagination>`), so list pages can wire up server-side sorting without a client component.
