# @appspine/frontend-shell

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
