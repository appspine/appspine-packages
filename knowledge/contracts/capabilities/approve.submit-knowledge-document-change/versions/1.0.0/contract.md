---
type: integration-contract
scope: cross-repo
contract_kind: capability
contract_id: approve.submit-knowledge-document-change
version: 1.0.0
status: approved
interaction: command
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

# approve.submit-knowledge-document-change

## Purpose

Submit a proposed Wiki document revision to Approve for human review. The command creates or
reuses one change request for an idempotency key and returns an accepted request identifier.

## Participants and ownership

Approve owns the change request, its lifecycle, and the authoritative delegated-identity checks.
Wiki is the caller and remains the owner of the source document until the approved event is
consumed. The capability maintainer is Approve; Wiki is the required reviewer.

## Trigger and business semantics

The caller sends the immutable document identity, base revision, proposed content checksum, and
the delegated human actor. A repeated idempotency key with the same request fingerprint returns
the original request. Reusing it with a different fingerprint is a conflict.

## Request / response or event schema

Request and response schemas are in `openapi.yaml` and `schemas/request.schema.json` /
`schemas/response.schema.json`.

## Authentication and authorization

The caller authenticates as the Wiki app using its app credential. The delegated actor is an
attributed user reference, not a bearer credential. Approve verifies the caller identity,
delegated actor, tenant, document ownership, and allowed department before creating the request.

## Idempotency and retry

`Idempotency-Key` is required and must be stable for a logical submission. `201` means a new
request; `200` means the same request was replayed. `409` means the key was reused with a different
payload. A timeout has an uncertain outcome and must be reconciled through the status capability.

## Errors and failure handling

`400` malformed transport, `401` unauthenticated caller, `403` unauthorized actor or document,
`409` idempotency conflict, `422` invalid document revision or checksum, `429` rate limited, and
`5xx` provider failure. Error bodies contain a stable `code`, safe `message`, and `requestId`.

## Observability and audit

The provider records request ID, correlation ID, idempotency key hash, caller app, delegated actor,
document ID, base revision, and outcome. It never records access tokens or document content in
logs. The caller propagates the correlation ID.

## Compatibility and versioning

Consumers must use the pinned exact capability version and digest from the binding. Adding an
optional request or response field is minor-compatible. Removing a field, changing requiredness,
authorization, or status semantics requires a major version.

## Acceptance scenarios

- A valid first submission returns `201` and a stable `changeRequestId`.
- The same key and payload returns the same request without a second request.
- The same key with a changed checksum returns `409`.
- A provider timeout can be reconciled through the status query.
- A spoofed delegated actor is rejected without exposing document data.

## Open decisions

The provider chooses the concrete HTTP destination key per environment; the binding must not store
an environment-specific URL.
