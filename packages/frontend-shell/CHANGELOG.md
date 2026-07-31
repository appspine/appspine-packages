# @appspine/frontend-shell

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

- Publish to the registry instead of being consumed only via a local `file:` link. Business-system repos forked from `appspine-app-template` don't have this monorepo checked out as a sibling directory, so the `file:../../appspine/packages/frontend-shell` dependency in `frontend/package.json` couldn't resolve outside the original dev workspace (broke both CI and any real fork).

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
