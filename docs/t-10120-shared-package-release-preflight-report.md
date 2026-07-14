# T-10120 - Shared Package Release Preflight Report

Status: **in progress; publish gate not complete**.

This preflight prepares the 024 shared packages for the T-10120 release gate,
but does not mark T-10120 complete. Clean consumer installation is currently
blocked by GitHub Packages authentication while resolving existing
`@appspine/common` dependencies.

## Prepared Packages

| Package | Prepared Version | Scope |
|---|---:|---|
| `@appspine/chatbot-contracts` | `0.1.1` | Chat/n8n JSON Schemas, generated TypeScript types, strict AJV validators, golden fixtures. |
| `@appspine/mcp-server` | `0.6.0` | Operation metadata parsing, write fail-closed behavior, idempotency primitives, Prisma idempotency adapter, Prisma fragment export. |
| `@appspine/audit-log` | `0.5.0` | Distributed trace audit fields, trace normalization, Prisma fragment update. |

## Release Prep Changes

- Added `@appspine/chatbot-contracts` to source control.
- Added a changeset for the three 024 shared packages.
- Added `@appspine/mcp-server` export for
  `./prisma/mcp-idempotency.prisma`.
- Added package `files` allowlists for `@appspine/mcp-server` and
  `@appspine/audit-log` so release tarballs only include `dist` and `prisma`.
- Added changelog entries and prepared package versions for the release gate.

## Validation Completed

Commands run:

```bash
pnpm --filter @appspine/chatbot-contracts typecheck
pnpm --filter @appspine/chatbot-contracts test
pnpm --filter @appspine/chatbot-contracts build
pnpm --filter @appspine/mcp-server typecheck
pnpm --filter @appspine/mcp-server test
pnpm --filter @appspine/mcp-server build
pnpm --filter @appspine/audit-log typecheck
pnpm --filter @appspine/audit-log test
pnpm --filter @appspine/audit-log build
pnpm lint
pnpm changeset status
pnpm --filter @appspine/chatbot-contracts pack --pack-destination <temp>
pnpm --filter @appspine/mcp-server pack --pack-destination <temp>
pnpm --filter @appspine/audit-log pack --pack-destination <temp>
```

Pack artifact checks:

- `@appspine/chatbot-contracts@0.1.1` tarball contains `dist/generated`,
  `dist/schemas`, validators, and package metadata.
- `@appspine/mcp-server@0.6.0` tarball contains `dist`, package metadata, and
  `prisma/mcp-idempotency.prisma`.
- `@appspine/audit-log@0.5.0` tarball contains `dist`, package metadata, and
  `prisma/audit-log.prisma`.
- `workspace:*` dependencies in packed manifests are rewritten to concrete
  package versions.

## Blocking Evidence

Clean install of a temporary consumer project from the local tarballs failed
while resolving existing published `@appspine/common`:

```text
pnpm install: ERR_PNPM_FETCH_403 for https://npm.pkg.github.com/@appspine%2Fcommon
npm install: E401 Unauthorized for https://npm.pkg.github.com/@appspine%2fcommon
```

The failure also reproduces without the new tarballs when installing
`@appspine/common@0.2.0` as the only dependency in a clean temporary project:

```text
pnpm install: ERR_PNPM_FETCH_403 for https://npm.pkg.github.com/@appspine%2Fcommon
npm install: E401 Unauthorized for https://npm.pkg.github.com/@appspine%2fcommon
```

`npm view` from the workspace can read:

```bash
npm view @appspine/common version --registry=https://npm.pkg.github.com
npm view @appspine/auth version --registry=https://npm.pkg.github.com
npm view @appspine/m2m-api-key version --registry=https://npm.pkg.github.com
npm view @appspine/rbac version --registry=https://npm.pkg.github.com
```

The token/configuration therefore needs a clean-consumer install fix before
T-10120 can be completed and before publishing these prepared versions.

## Not Yet Done

- No `changeset publish` or `npm publish` command was run.
- T-10120 must not be checked off until clean install succeeds and the prepared
  versions are published to GitHub Packages.
- After publish, verify `npm view` for:
  - `@appspine/chatbot-contracts@0.1.1`;
  - `@appspine/mcp-server@0.6.0`;
  - `@appspine/audit-log@0.5.0`.
