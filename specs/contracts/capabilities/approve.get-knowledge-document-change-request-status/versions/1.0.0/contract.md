---
type: integration-contract
scope: cross-repo
contract_kind: capability
contract_id: approve.get-knowledge-document-change-request-status
version: 1.0.0
status: approved
interaction: query
transport: http
provider: approve
callers:
  - wiki
maintainer: approve
required_reviewers:
  - wiki
created: 2026-08-07
updated: 2026-08-07
---

# approve.get-knowledge-document-change-request-status

## Purpose

Reconcile the outcome of a document change submission after a timeout, retry, or asynchronous
review. Approve is authoritative for the change request lifecycle.

## Participants and ownership

Approve owns request state. Wiki is the caller and may use the result to update its local pending
state. The query does not mutate the request.

## Trigger and business semantics

The caller queries by `changeRequestId` or the original idempotency key. The response is safe to
poll and includes the latest provider request ID and terminal reason when applicable.

## Request / response or event schema

The HTTP schema is in `openapi.yaml`; the JSON response schema is in `schemas/response.schema.json`.

## Authentication and authorization

The caller app must be the source app bound to this capability. Approve checks tenant and document
visibility before returning status. A requester may only query requests it submitted.

## Idempotency and retry

Queries are read-only and may be retried with bounded backoff. `PENDING` is not a failure and must
not be converted to `FAILED` by a caller.

## Errors and failure handling

`404` means the request is not visible to the caller or does not exist; `401`/`403` preserve the
same non-disclosure behavior. `429` and `5xx` are retryable. A terminal request returns `FAILED`
with a safe reason code.

## Observability and audit

Query audit records contain request ID, caller app, change request ID, and outcome. They do not
contain document content or credentials.

## Compatibility and versioning

New response fields are optional-reader compatible. Existing status meanings and authorization
semantics are immutable within 1.x.

## Acceptance scenarios

- An accepted request returns `SUBMISSION_PENDING`.
- An approved request returns `CONFIRMED` and the approved revision reference.
- A rejected request returns `FAILED` and a stable reason code.
- A request from the wrong app cannot be enumerated through `404`.

## Open decisions

Retention of terminal request records is owned by Approve and is not part of this binding.
