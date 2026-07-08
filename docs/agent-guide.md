# appspine Framework — Agent Guide

This document is the development guide for adding or modifying shared `@appspine/*` packages inside the framework monorepo.

## Package Dependency Architecture

To avoid circular dependencies (which cause build and runtime issues), packages must adhere to the following dependency direction:

- **`common`** — The foundation package. No dependencies on other shared framework packages.
- **`auth`** — Depends on `common`.
- **`rbac`** — Depends on `auth` and `common`.
- **`m2m-api-key`** — Depends on `auth` and `common`.
- **`mcp-server`** — Depends on `auth` and `m2m-api-key` (for `ApiKeyGuard` / `ApiKeyUser`).
- **`metadata-schema`** — Depends on `common` and `m2m-api-key`.
- **`audit-log`** — Depends on `common`.
- **`health-check`** — Depends on `common`.
- **`e2e-kit`** — No workspace dependencies (Playwright-only).
- **`frontend-shell`** — No workspace dependencies (frontend peer deps only).


## Standard Flow for Adding a New Package

When creating a new shared package under `packages/`:
1. Initialize the package folder with a `package.json` that includes `"private": false`, a unique name like `@appspine/<name>`, and appropriate peer/dev dependencies.
2. Maintain a `tsconfig.json` extending the workspace root `tsconfig.base.json`.
3. Export files via `package.json` `"exports"` field properly.
4. Declare any database models as individual Prisma schema snippets under `prisma/` and expose them so they can be consumed and combined by the downstream template.
5. Register the new directory in the workspace configuration if necessary (pnpm-workspace.yaml already matches `packages/*` automatically).

## Release and Versioning Strategy

We follow a strict semver flow managed by Changesets:
1. When making code changes, run `pnpm changeset` to generate a markdown changeset log under `.changeset/`. Choose `patch` or `minor` bumps depending on the nature of API additions.
2. Bumping version: `pnpm version-packages` will parse changesets, modify package.json files, and write `CHANGELOG.md` updates.
3. Publication: Packages are compiled and published to GitHub Packages repository via `pnpm release`.

For the original discussion on AuraNest packages reuse analysis and the architectural decisions behind these shared modules, see the workspace document:
`dev_docs/003-shared-package-reuse-plan.md` in the `appspine` workspace root (the local workspace this repo lives in; not tracked inside this repo's GitHub remote).
