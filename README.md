# appspine — Shared Framework Monorepo

This repository is a monorepo containing shared business-app framework packages (`@appspine/*`) managed via `pnpm` workspaces. These packages provide common services, guards, and utilities consumed by business systems built using `appspine-app-template`.

## Package Catalog

The monorepo contains the following packages located under `packages/`:

- **`common` (`@appspine/common`)** — Core shared utilities. Includes the global exception filter (producing unified JSON error structures), Zod validation pipes, pagination helpers (`paginate`), generalized `PrismaModule` / `PrismaService` wrappers, and logging modules.
- **`rbac` (`@appspine/rbac`)** — Role-Based Access Control management. Contains Role/Permission CRUD controllers and database structures, as well as `PermissionGuard` and `@RequirePermissions` decorator for endpoint authorization.
- **`m2m-api-key` (`@appspine/m2m-api-key`)** — Machine-to-machine API key authorization. Provides client key management, scope restrictions, rate-limiting, and machine-specific guards such as `ApiKeyGuard`; mixed authentication uses `AppspineAuthGuard` from `@appspine/plugin-host-nest`.
- **`audit-log` (`@appspine/audit-log`)** — Security and operation auditing. Writes audit entries locally to the system's `audit_logs` table for independent system auditing without centralized queues.
- **`health-check` (`@appspine/health-check`)** — Exposes basic system health checks at `GET /health` (Terminus + Prisma ping indicator).
- **`metadata-schema` (`@appspine/metadata-schema`)** — Exposes Prisma schema metadata dynamically generated from DMMF at `GET /metadata/schema` (excluding `@internal` fields). Also provides functions to render markdown data dictionaries.
- **`mcp-server` (`@appspine/mcp-server`)** — Exposes Model Context Protocol (MCP) streamable HTTP server transport at `POST /mcp` to register custom AI tools (does not auto-generate CRUD tools).
- **`e2e-kit` (`@appspine/e2e-kit`)** — Shared E2E testing helpers and test runner wrappers.
- **`frontend-shell` (`@appspine/frontend-shell`)** — Shared frontend layout primitives, navigation shells, and common React/Next.js components.
- **`integration-contracts` (`@appspine/integration-contracts`)** — Deterministic runtime primitives for app-to-app integration contracts; no NestJS, Prisma, or application dependency.
- **`domain-events` (`@appspine/domain-events`)** — Transaction-aware domain event dispatch, subscriber registry, and outbox/receipt tracking for cross-module and cross-app event delivery.
- **`notification` (`@appspine/notification`)** — Shared in-app notification primitives, including a transaction-aware `NotificationService` with first-write-wins delivery semantics.
- **`oidc-delegation` (`@appspine/oidc-delegation`)** — Backend-only, provider-neutral OAuth 2.0 Token Exchange (RFC 8693) client for delegating a signed-in user's identity from one appspine app to another.
- **`master-data-client` (`@appspine/master-data-client`)** — Reusable master-data Sync/Cache helpers for appspine consuming apps.
- **`plugin-api` (`@appspine/plugin-api`)** — Runtime-light manifest, lifecycle, capability-token, loader, and resolver contracts shared by plugins and hosts.
- **`plugin-testkit` (`@appspine/plugin-testkit`)** — In-memory plugin fixtures, lifecycle harnesses, and catalog assertions.
- **`plugin-host-nest` (`@appspine/plugin-host-nest`)** — NestJS plugin composition, lifecycle, catalog, diagnostics, and request-principal infrastructure.
- **`plugin-cli` (`@appspine/plugin-cli`)** — Build-time plugin composition, diagnostics, lockfile, Prisma, permission, and frontend generation commands.
- **`preset-standard` (`@appspine/preset-standard`)** — Standard plugin inventory and dependency graph for the official capabilities.
- **`identity-core` (`@appspine/identity-core`)** — Provider-neutral User ownership, CRUD, and the stable identity-store capability.
- **`oidc-auth` (`@appspine/oidc-auth`)** — OIDC/JWKS authentication, issuer-subject mapping, and delegated identity verification.

The monorepo currently contains 21 packages under `packages/`. The transition-only
`@appspine/auth` facade was removed in the v3 legacy-removal release.

## Development Scripts

Run these scripts from the repository root:

- `pnpm build` — Build all workspace packages in the correct order of dependency.
- `pnpm typecheck` — Perform TypeScript compilation checks (`tsc --noEmit`) recursively.
- `pnpm test` — Run unit and integration tests across all packages.
- `pnpm lint` — Check formatting and linting violations using Biome (`biome check .`).
- `pnpm lint:fix` — Automatically fix linting and formatting issues.
- `pnpm build:graph` — Build all packages through the TypeScript project-reference graph.
- `pnpm verify:build-graph` — Check project references against declared dependencies and source imports.
- `pnpm verify:snapshot` — Re-scan the sibling template + 8 Apps and byte-check the current v3 consumer snapshot.
- `pnpm verify:phase0` — Run the frozen identity, manifest, Prisma, permission, and build-graph contract checks.
- `pnpm verify:phase1` — Run the plugin architecture checks and isolated tarball consumer through typecheck, build, test, and bootstrap.

## Publishing & Versioning

We use Changesets to manage package versioning and publication to GitHub Packages:
1. `pnpm changeset` — Create a changeset file detailing changes and the version bump type.
2. `pnpm version-packages` — Bump package versions and update changelogs.
3. `pnpm release` — Build all packages and publish them (translates to `changeset publish`).

For further information on package development guidelines and dependency directions, see the [Agent Guide](docs/agent-guide.md).
