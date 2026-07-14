# T-10090 - MCP Metadata Parsing and Write Fail-Closed Report

Status: **completed**.

This checkpoint wires Appspine MCP operation metadata from raw MCP
`tools/call` request `_meta` into `McpCallContext`, while keeping verified
M2M API-key identity separate from caller-supplied correlation fields.

## Implemented

Added `packages/mcp-server/src/metadata.ts` with:

- `APPSPINE_MCP_METADATA_NAMESPACE = "appspine"`;
- `McpOperationMetadata` for operation, run, deployment, workflow,
  execution, node, item, and optional source message/actor fields;
- `parseMcpOperationMetadata()` validation for:
  - namespace;
  - 32-character lowercase hex operation id;
  - bounded id-like run/deployment/workflow/execution/source fields;
  - bounded node name with no control characters;
  - non-negative bounded item index.

Updated `McpService.createServer()` so:

- write-scoped tools reject missing or malformed `_meta`;
- read-scoped tools remain compatible and tolerate malformed caller metadata;
- parsed metadata is passed as `ctx.operation`;
- verified API-key identity fields on `McpCallContext` remain unchanged.

`packages/mcp-server/src/index.ts` exports the metadata API.

## Validation

Commands run:

```bash
pnpm --filter @appspine/mcp-server typecheck
pnpm --filter @appspine/mcp-server test
pnpm --filter @appspine/mcp-server build
pnpm lint
```

Test coverage added or extended:

- absent `_meta` parses as no metadata;
- valid Appspine operation metadata parses;
- wrong namespace is rejected;
- missing or malformed operation id is rejected;
- control characters in node names are rejected;
- out-of-range item index is rejected;
- write tool handlers receive parsed `ctx.operation`;
- write tools reject missing metadata;
- write tools reject malformed metadata;
- read tools remain compatible when caller metadata is malformed.

## Boundaries

- This does not persist idempotency records. T-10100 owns the concrete
  `McpIdempotencyRecord` storage/migration work.
- This does not extend audit-log schema fields. T-10110 owns distributed trace
  audit persistence fields.
