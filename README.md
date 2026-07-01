# appspine — Shared Framework Monorepo

This repository is a monorepo containing shared business-app framework packages (`@appspine/*`) managed via `pnpm` workspaces. These packages provide common services, guards, and utilities consumed by business systems built using `appspine-app-template`.

## Package Catalog

The monorepo contains the following packages located under `packages/`:

- **`common` (`@appspine/common`)** — Core shared utilities. Includes the global exception filter (producing unified JSON error structures), Zod validation pipes, pagination helpers (`paginate`), generalized `PrismaModule` / `PrismaService` wrappers, and logging modules.
- **`auth` (`@appspine/auth`)** — Session authentication and user management. Supports local credential authentication (bcrypt + HS256 JWT) or OIDC SSO (via Keycloak) depending on `AUTH_MODE` env var. Houses `AdminGuard` and user profile endpoints.
- **`rbac` (`@appspine/rbac`)** — Role-Based Access Control management. Contains Role/Permission CRUD controllers and database structures, as well as `PermissionGuard` and `@RequirePermissions` decorator for endpoint authorization.
- **`m2m-api-key` (`@appspine/m2m-api-key`)** — Machine-to-machine API key authorization. Provides client key management, scope restrictions, rate-limiting, and guards like `ApiKeyGuard` or `JwtOrApiKeyGuard`.
- **`audit-log` (`@appspine/audit-log`)** — Security and operation auditing. Writes audit entries locally to the system's `audit_logs` table for independent system auditing without centralized queues.
- **`health-check` (`@appspine/health-check`)** — Exposes basic system health checks at `GET /health` (Terminus + Prisma ping indicator).
- **`metadata-schema` (`@appspine/metadata-schema`)** — Exposes Prisma schema metadata dynamically generated from DMMF at `GET /metadata/schema` (excluding `@internal` fields). Also provides functions to render markdown data dictionaries.
- **`mcp-server` (`@appspine/mcp-server`)** — Exposes Model Context Protocol (MCP) streamable HTTP server transport at `POST /mcp` to register custom AI tools (does not auto-generate CRUD tools).
- **`e2e-kit` (`@appspine/e2e-kit`)** — Shared E2E testing helpers and test runner wrappers.
- **`frontend-shell` (`@appspine/frontend-shell`)** — Shared frontend layout primitives, navigation shells, and common React/Next.js components.

## Development Scripts

Run these scripts from the repository root:

- `pnpm build` — Build all workspace packages in the correct order of dependency.
- `pnpm typecheck` — Perform TypeScript compilation checks (`tsc --noEmit`) recursively.
- `pnpm test` — Run unit and integration tests across all packages.
- `pnpm lint` — Check formatting and linting violations using Biome (`biome check .`).
- `pnpm lint:fix` — Automatically fix linting and formatting issues.

## Publishing & Versioning

We use Changesets to manage package versioning and publication to GitHub Packages:
1. `pnpm changeset` — Create a changeset file detailing changes and the version bump type.
2. `pnpm version-packages` — Bump package versions and update changelogs.
3. `pnpm release` — Build all packages and publish them (translates to `changeset publish`).

For further information on package development guidelines and dependency directions, see the [Agent Guide](docs/agent-guide.md).
