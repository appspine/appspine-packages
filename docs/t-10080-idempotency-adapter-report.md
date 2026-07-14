# T-10080 - MCP Write Idempotency and Transaction Adapter Report

Status: **completed**.

This checkpoint adds a storage-agnostic idempotency adapter to
`@appspine/mcp-server`. It does not introduce a Prisma schema yet; T-10100 owns
the shared `McpIdempotencyRecord` Prisma fragment and concrete database store.

## Implemented

Added `packages/mcp-server/src/idempotency.ts` with:

- canonical SHA-256 request hashing through `createMcpRequestHash()`;
- required operation-id fail-closed behavior for write tools;
- `McpTransactionRunner<Tx>` for app-provided transaction boundaries;
- `McpIdempotencyStore<Tx>` for app or later framework-provided storage;
- `executeIdempotentWrite()` orchestration for:
  - first-writer processing record creation;
  - same-operation result replay;
  - same-operation/different-request conflict rejection;
  - in-progress duplicate rejection while the lease is active;
  - stale processing lease takeover;
  - success result retention;
  - failure recording and stored-failure replay.

`packages/mcp-server/src/index.ts` exports the new adapter API.

## Validation

Commands run:

```bash
pnpm --filter @appspine/mcp-server typecheck
pnpm --filter @appspine/mcp-server test
pnpm --filter @appspine/mcp-server build
pnpm lint
```

Test coverage added in `packages/mcp-server/src/idempotency.spec.ts`:

- canonical object-key hashing;
- operation name included in the request hash;
- missing operation id fails closed;
- first write completes and stores the result;
- duplicate same request replays the stored result;
- duplicate different request is rejected as conflict;
- duplicate active processing request is rejected as in progress;
- stale processing lease can be claimed and completed;
- handler failure is persisted;
- stored failure is replayed without rerunning the handler.

## Boundaries

- The adapter is not wired into `McpService` yet because T-10090 owns metadata
  parsing and write fail-closed integration.
- The concrete Prisma-backed store and migration guidance are deferred to
  T-10100.
