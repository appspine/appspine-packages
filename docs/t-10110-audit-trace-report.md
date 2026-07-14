# T-10110 - Audit Log Distributed Trace Fields Report

Status: **completed**.

This checkpoint extends `@appspine/audit-log` with bounded distributed trace
fields for Chat/n8n/MCP correlation while keeping verified principals separate
from caller-supplied metadata.

## Implemented

Updated `packages/audit-log/src/audit-log.service.ts` with:

- `AuditTraceInput`;
- `AuditSourceOrigin`;
- `AuditTraceValidationError`;
- `normalizeAuditTrace()`;
- `RecordAuditLogDto.trace`;
- `AuditLogService.record()` persistence for trace fields when callers opt in.

Trace fields are nullable and only written when `trace` is passed. Existing
callers that do not pass `trace` keep the unmigrated-app behavior: new columns
are omitted from the Prisma write.

The persisted trace columns are:

- `runId`;
- `deploymentId`;
- `workflowId`;
- `executionId`;
- `operationId`;
- `sourceMessageId`;
- `sourceActorId`;
- `sourceOrigin`.

Updated `packages/audit-log/prisma/audit-log.prisma` with copyable nullable
fields and query indexes for run, operation, execution, and source message
lookups.

## Migration Guidance

Consuming apps should copy the updated `AuditLog` fields from
`@appspine/audit-log/prisma/audit-log.prisma` into their local Prisma schema and
generate an app-owned migration.

The migration must be backward compatible:

- add all new columns as nullable;
- do not backfill prompt, tool payload, capability material, M2M secrets, or
  complete attachment URLs;
- add the indexes from the fragment if the app needs trace lookup by run,
  operation, execution, or source message;
- deploy the migration before passing `trace` to `AuditLogService.record()`.

## Trust and Redaction

Verified identity remains in the existing fields:

- `actorId`;
- `actorEmail`;
- `actingApiKeyId`.

Caller correlation remains in the trace fields and must not be used for
authorization or actor attribution. `sourceActorId` may describe the human or
chat actor that initiated the workflow, but it does not replace the verified
service account or API-key identity that performed the target app mutation.

`normalizeAuditTrace()` only serializes the allowlisted scalar fields above.
Prompt text, M2M keys, capability tokens, full attachment URLs, and arbitrary
caller metadata are not represented by the API and are ignored even if present
on a wider JavaScript object.

## Validation

Commands run:

```bash
pnpm --filter @appspine/audit-log typecheck
pnpm --filter @appspine/audit-log test
pnpm --filter @appspine/audit-log build
pnpm lint
```

Test coverage added:

- existing callers still omit `workflowId` and new trace fields when absent;
- explicit `workflowId` and `workflowId: null` compatibility remains;
- migrated callers can persist run, deployment, workflow, execution,
  operation, source message, source actor, and source origin;
- verified principal fields remain separate from caller correlation fields;
- trace opt-in can write nullable fields;
- prompt, capability, and attachment URL shaped extra keys are not serialized;
- malformed operation ids are rejected before writing;
- control characters, overlong IDs, and unsupported source origins are rejected.

## Boundaries

- This package does not create migrations in consuming apps.
- This package does not add a central cross-app audit store.
- This package does not validate Chat run existence or n8n execution existence.
  Those are app/runtime responsibilities.
