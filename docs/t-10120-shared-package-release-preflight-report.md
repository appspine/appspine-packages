# T-10120 - Shared Package Release Preflight Report

Status: **completed**.

This preflight completed the 024 shared package release gate. The prepared
packages were validated from local tarballs in a clean consumer project and
published to GitHub Packages.

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

## Previously Blocking Evidence

Earlier clean install of a temporary consumer project from the local tarballs failed
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

On 2026-07-15, GitHub Packages authentication was available again and direct
clean install of `@appspine/common@0.2.0` succeeded from a temporary consumer
project.

## Completion Evidence

Additional commands run on 2026-07-15:

```bash
npm whoami --registry=https://npm.pkg.github.com
npm view @appspine/common version --registry=https://npm.pkg.github.com
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
pnpm --filter @appspine/chatbot-contracts pack --pack-destination <temp>
pnpm --filter @appspine/mcp-server pack --pack-destination <temp>
pnpm --filter @appspine/audit-log pack --pack-destination <temp>
npm install <three local tarballs> <required peers>
npx prisma generate
node verify.cjs
pnpm changeset publish
npm view @appspine/chatbot-contracts version --registry=https://npm.pkg.github.com
npm view @appspine/mcp-server version --registry=https://npm.pkg.github.com
npm view @appspine/audit-log version --registry=https://npm.pkg.github.com
```

Clean consumer verification covered:

- installing all three local tarballs in a temporary project;
- installing required Nest, Express, Zod, Prisma, Reflect, and RxJS peers;
- generating a minimal Prisma client;
- loading `@appspine/chatbot-contracts` and validating a claim request;
- loading `@appspine/mcp-server` and parsing Appspine MCP metadata;
- executing an idempotent write once, replaying it without a second side
  effect, and rejecting a conflicting request hash.

Published versions verified in GitHub Packages:

- `@appspine/chatbot-contracts@0.1.1`;
- `@appspine/mcp-server@0.6.0`;
- `@appspine/audit-log@0.5.0`.

`changeset publish` created local git tags for the three published versions.
