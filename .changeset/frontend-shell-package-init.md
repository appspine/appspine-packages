---
"@appspine/frontend-shell": minor
---

Add `@appspine/frontend-shell`, extracted from `appspine-app-template/frontend`'s dashboard shell
(`dev_docs/004-task-breakdown.md` T-201~T-205):

- `DashboardShell`: composes `AppSidebar` + main content, accepting `navItems`/`header` props.
- `UserNav`: controlled `{ user, onSignOut }` interface, decoupled from any app-specific data source.
- `ThemeSwitcher` / `SidebarResizer`: moved as-is from the template's sidebar components.
- Bundles a trimmed-down copy of the shadcn primitives the shell components depend on
  (`src/components/ui/`) instead of requiring apps to provide their own — peer dependencies are
  limited to the underlying libraries (`radix-ui`, `lucide-react`, `class-variance-authority`,
  `clsx`, `tailwind-merge`). This mirrors `auranest`'s `@auranest/ui` approach: apps re-running the
  shadcn CLI or restyling their own components can't silently break the package at compile time.
