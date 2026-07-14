# T-10100 - MCP Idempotency Record and Prisma Adapter Report

Status: **completed**.

This checkpoint promotes the T-10080 idempotency semantics into a reusable
storage shape for consuming Appspine applications. The package still avoids any
dependency on an app-generated Prisma client.

## T-10030 and T-10080 Reuse Review

Reusable:

- T-10030 confirmed the n8n private adapter can operate against the Appspine
  MCP server through authenticated tool calls.
- T-10080 provided the storage-agnostic idempotency state machine, canonical
  request hash, transaction runner contract, stale lease behavior, replay, and
  conflict semantics.

Not reused directly:

- The T-10030 POC workflow and adapter scaffolding remain proof-of-concept
  assets, not production package code for this server package.
- T-10080's memory store remains test-only. Production consumers must bind the
  port to a transactional database store.

## Implemented

Updated `packages/mcp-server/src/idempotency.ts` so the idempotency scope is
explicitly isolated by:

- verified API key or service-account id;
- logical MCP tool name;
- caller operation id.

Added `packages/mcp-server/src/prisma-idempotency.ts` with:

- `PrismaMcpIdempotencyStore`;
- `PrismaMcpTransactionRunner`;
- structural Prisma delegate/client interfaces;
- `createPrismaMcpIdempotencyStore()`;
- `createPrismaMcpTransactionRunner()`.

The adapter expects the consuming app Prisma model to expose a composite unique
selector named `mcp_idempotency_scope_operation_unique`. It only relies on
structural methods (`findUnique`, `create`, `updateMany`, `$transaction`) and
does not import `@prisma/client`.

Added `packages/mcp-server/prisma/mcp-idempotency.prisma` as a copyable Prisma
fragment. Consumers should copy this model into their app schema and create the
app-owned migration there.

Added `packages/mcp-server/scripts/Invoke-IdempotencyPostgresDrill.ps1` for a
disposable real-Postgres validation drill using pinned `postgres:16-alpine`.

## Semantics

- First writer inserts a `processing` record inside the caller transaction.
- Same scope, operation id, and request hash returns the saved result after a
  successful completion.
- Same scope and operation id with a different request hash is a conflict.
- In-flight operations fail closed while the lease is still valid.
- Stale processing rows are only reclaimed by the explicit recovery path.
- Completion and failure updates are guarded by scope, operation id,
  request hash, and `processing` status.

## Security and Retention

- Stored failures are reduced to `{ name, message }`.
- Stored results are caller supplied. Providers should redact secrets before
  completing an operation.
- The Prisma fragment includes `expiresAt` and an expiry index for app-owned
  retention jobs.
- Provider side effects that must be delivered out of process should use an
  outbox hook in the same app transaction. This adapter does not claim
  cross-system ACID behavior.

## Validation

Commands run:

```bash
pnpm --filter @appspine/mcp-server typecheck
pnpm --filter @appspine/mcp-server test
pnpm --filter @appspine/mcp-server build
pnpm lint
powershell -ExecutionPolicy Bypass -File packages/mcp-server/scripts/Invoke-IdempotencyPostgresDrill.ps1
```

Test and drill coverage:

- canonical hash remains stable;
- same operation id is isolated by API key and tool name;
- replay returns the saved successful result;
- hash conflict rejects a mismatched request;
- in-progress operations fail closed before lease expiry;
- stale lease recovery requires the explicit claim path;
- failures store only normalized error name and message;
- Prisma adapter maps composite unique conflicts to acquire failure;
- Prisma adapter completion is guarded by processing status and request hash;
- real Postgres unique key behavior under concurrent acquire attempts;
- real Postgres transaction rollback;
- real Postgres retention pruning query;
- real Postgres stale lease recovery query.

## Boundaries

- This does not wire idempotency into concrete write tools. That work belongs
  with the write-tool implementation tasks.
- This does not add audit-log trace persistence fields. T-10110 owns those
  distributed trace audit fields.
- This does not create migrations in a consuming app. The app that owns the
  Prisma schema must copy the fragment and generate its own migration.
