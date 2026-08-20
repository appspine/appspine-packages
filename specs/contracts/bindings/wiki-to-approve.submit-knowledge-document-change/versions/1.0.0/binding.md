---
type: integration-contract
scope: cross-repo
contract_kind: binding
contract_id: wiki-to-approve.submit-knowledge-document-change
version: 1.0.0
status: approved
interaction: command
transport: http
capability_ref:
  contract_id: approve.submit-knowledge-document-change
  version: 1.0.0
  digest: sha256:6b022f160e3035d8a609128bf84189f87f9230e5edb6ebd493435d78d8f47c66
source_app: wiki
destination_app: approve
destination_key: approve.integration.command
authentication:
  scheme: app-m2m
  delegated_identity: required
retry:
  timeout_ms: 10000
  max_attempts: 3
  uncertain_outcome: reconcile-with-status-query
maintainer: approve
required_reviewers:
  - wiki
created: 2026-08-07
updated: 2026-08-07
---

# wiki-to-approve.submit-knowledge-document-change

## Purpose

Bind Wiki's document-change submission caller to Approve's command capability.

## Participants and ownership

Wiki is the caller and Approve is the provider and maintainer. The exact capability version and
digest are pinned in `capability_ref`; reviewers are Wiki and the Approve maintainer.

## Trigger and business semantics

Wiki submits a user-approved document revision. The binding uses an environment-independent
destination key resolved by deployment configuration.

## Request / response or event schema

The capability schemas are copied into the app-local generated view. This binding adds no fields.

## Authentication and authorization

Use the Wiki-to-Approve app credential and a delegated actor reference. Secrets are resolved by
key ID and are never stored in this document.

## Idempotency and retry

Pass the stable `Idempotency-Key`. Retry network failures and `429`/`5xx`; reconcile uncertain
timeouts with the status binding before creating a new logical submission.

## Errors and failure handling

Preserve the provider's stable error code and request ID. Do not retry `401`, `403`, `409`, or
`422` without changing the logical request.

## Observability and audit

Record binding ID/version, capability digest, correlation ID, request ID, and redacted outcome.

## Compatibility and versioning

Changing destination key, authentication, timeout, retry policy, or reviewer ownership requires a
new binding version. Capability changes are represented by a new capability pin.

## Acceptance scenarios

- The binding refuses to start if the capability digest does not match the canonical index.
- A timeout leaves the caller in `PENDING` until the status query reconciles it.
- A payload conflict is terminal and visible in audit metadata.

## Open decisions

Deployment owns the destination key-to-endpoint mapping.
