# appspine Packages & Governance — Agent Guide

`appspine-packages` is the central monorepo hosting shared core packages (`@appspine/*`), integration contracts (`specs/contracts/`), and system-wide governance specifications (`specs/`).

## Architecture & Knowledge Base

System-wide architectural standards, conventions, and decision logs:
- `specs/topics/app-framework.md` — Tech stack, topology, template mechanism, and capability list.
- `specs/topics/dev-conventions.md` — Coding conventions, Prisma standards, API design, commit rules, and CRUD module workflows.
- `specs/topics/plugin-platform.md` — Plugin platform specifications and SSoT guide.
- `specs/decisions/` — Architecture decision records (ADRs).
- `specs/log.md` — Historical specs and cleanup logs.

Validate specifications across repositories:
```bash
node scripts/lint-specs.mjs
```

## Integration Contracts Toolchain

Integration contract schemas, bindings, and generation CLI reside in this repository:

```bash
# Validate contract schemas and index freshness
node scripts/contract-cli.mjs validate
node scripts/contract-cli.mjs index --check --root-only

# Generate or sync contract runtime artifacts for consumer apps
node scripts/contract-cli.mjs sync-views --contract <contract-id>@<version> --target <app-path> --dry-run
node scripts/contract-cli.mjs generate-runtime --contract <contract-id>@<version> --target <app-path> --dry-run
```

## Local Dev Ports Assignment

Check this table before creating or initializing new app forks:

| App | DB Port | Backend Port | Frontend Port |
| --- | --- | --- | --- |
| `appspine-app-template` | 5432 | 3000 | 3001 |
| `apps/approve` | 5433 | 3002 | 3003 |
| `apps/calendar` | 5434 | 3004 | 3005 |
| `apps/chat` | 5435 | 3006 | 3007 |
| `apps/drive` | 5436 | 3008 | 3009 |
| `apps/master-data` | 5437 | 3010 | 3011 |
| `apps/mcp-gateway` | 5438 | 3012 | 3013 |
| `apps/projects` | 5439 | 3014 | 3015 |
| `apps/wiki` | 5440 | 3016 | 3017 |
