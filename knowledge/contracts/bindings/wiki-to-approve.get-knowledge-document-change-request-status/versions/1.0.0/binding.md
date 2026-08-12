---
type: integration-contract
scope: cross-repo
contract_kind: binding
contract_id: wiki-to-approve.get-knowledge-document-change-request-status
version: 1.0.0
status: approved
interaction: query
transport: http
capability_ref:
  contract_id: approve.get-knowledge-document-change-request-status
  version: 1.0.0
  digest: sha256:170352c088e811953462ec38588e0dc915944a3b74b746133ce7202eb2347ff3
source_app: wiki
destination_app: approve
destination_key: approve.integration.query
authentication:
  scheme: app-m2m
retry:
  timeout_ms: 10000
  max_attempts: 5
maintainer: approve
required_reviewers:
  - wiki
created: 2026-08-07
updated: 2026-08-07
---

# wiki-to-approve.get-knowledge-document-change-request-status

## Purpose

Bind Wiki's reconciliation query to Approve's document change status capability.

## Participants and ownership

Wiki is the caller. Approve owns status and authorization decisions. Both apps review changes to
the binding because the result drives Wiki's pending state.

## Trigger and business semantics

Wiki polls after a submission timeout or while a request remains pending. The query is read-only.

## Request / response or event schema

The exact query and response schema is pinned by the referenced capability.

## Authentication and authorization

Authenticate as Wiki and authorize only the originating tenant and request.

## Idempotency and retry

Read-only requests may be retried with bounded backoff. A `PENDING` response is a valid result.

## Errors and failure handling

Treat `404` as not visible/not found, `429` and `5xx` as retryable, and auth/schema failures as
terminal until the binding is corrected.

## Observability and audit

Record the request ID, change request ID, binding digest, and resulting status without document
content.

## Compatibility and versioning

This binding pins capability 1.0.0 exactly. Any status semantic change requires a new capability
and binding version.

## Acceptance scenarios

- `SUBMISSION_PENDING`, `CONFIRMED`, and `FAILED` pass through without reinterpretation.
- A wrong source app cannot enumerate another tenant's request.
- A transient provider error is retried without changing local state.

## Open decisions

The polling interval is app-local and must remain below the request retention window.
