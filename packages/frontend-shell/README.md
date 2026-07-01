# @appspine/frontend-shell

Shared dashboard shell primitives for `appspine-app-template` forks.

## Design notes

- The package owns the minimal shadcn-derived primitives it needs under `src/components/ui/`.
- Apps do not need to provide matching local shadcn copies for shell internals.
- Peer dependencies stay at the library boundary (`next`, `react`, `tailwindcss`, `radix-ui`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`) so host apps keep one runtime copy.

## Integration notes

- Host apps should add `@appspine/frontend-shell` to `transpilePackages`.
- Host apps should include the package in Tailwind content scanning so shell class names are generated.
- `ThemeSwitcher` and `DashboardShell` read their visual state from attributes on the host app's
  `<html>` element rather than from props, so they stay in sync with an app-level theme/preferences
  boot script instead of flashing on hydration. The host app is responsible for setting these before
  first paint (e.g. in a root layout or a blocking inline script):
  - `data-theme-mode="light" | "dark" | "system"` and a `dark` class on `<html>` when dark mode is
    active — drives `ThemeSwitcher`'s icon.
  - `data-content-layout="centered" | "full-width"` — drives `DashboardShell`'s centered content width.
  - `data-navbar-style="sticky" | "static"` — drives `DashboardShell`'s sticky header behavior.
  Without these attributes, the components render but their state-dependent styling silently no-ops
  (e.g. the theme icon never changes, the layout options never apply).
