# @appspine/frontend-shell

Shared dashboard shell primitives for `appspine-app-template` forks.

## Design notes

- The package owns the minimal shadcn-derived primitives it needs under `src/components/ui/`.
- Apps do not need to provide matching local shadcn copies for shell internals.
- Peer dependencies stay at the library boundary (`next`, `react`, `tailwindcss`, `radix-ui`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`) so host apps keep one runtime copy.

## Integration notes

- Host apps should add `@appspine/frontend-shell` to `transpilePackages`.
- Host apps should include the package in Tailwind content scanning so shell class names are generated.
