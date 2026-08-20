---
type: integration-contract
scope: cross-repo
contract_kind: binding
contract_id: approve-to-wiki.knowledge-document-change-approved
version: 1.0.0
status: approved
interaction: event
transport: webhook
capability_ref:
  contract_id: approve.knowledge-document-change-approved
  version: 1.0.0
  digest: sha256:28896c7a209f49c430e74565f00058d4cac11475f8000421668dc502b9108742
source_app: approve
destination_app: wiki
destination_key: wiki.integration.events
authentication:
  scheme: webhook-v2-hmac-sha256
  key_rotation: current-and-previous
retry:
  timeout_ms: 10000
  max_attempts: 8
  backoff: exponential
maintainer: approve
required_reviewers:
  - wiki
created: 2026-08-07
updated: 2026-08-07
---

# approve-to-wiki.knowledge-document-change-approved

## Purpose

Deliver the approved document-change fact from Approve to Wiki using Webhook Protocol v2.

## Participants and ownership

Approve is the producer and delivery owner. Wiki is the consumer and owns the local document
update and receipt transaction.

## Trigger and business semantics

Approve emits after its approval transaction commits. Wiki verifies, records an inbox receipt, and
applies the revision and any local outbox side effects in one transaction.

## Request / response or event schema

The event schema is pinned by `capability_ref`; the external envelope is version 2. Webhook headers
pin event, capability, binding, source, and key identity.

## Authentication and authorization

Wiki resolves the configured key ID and verifies the raw-body HMAC in constant time, timestamp
freshness, source app, exact capability, and exact binding before parsing JSON.

## Idempotency and retry

Wiki uses `(sourceApp, eventId)` as a unique receipt key. Same-digest duplicates return the standard
already-processed response. Digest mismatches are terminal failures.

## Errors and failure handling

`2xx` is processed, `409` with `already_processed` is processed, `408`/`425`/`429`/`5xx` are
retryable, and other `4xx` responses are terminal. The producer bounds `Retry-After`.

## Observability and audit

Log event ID, binding ID/version, capability digest, correlation ID, receipt result, and redacted
outcome. Never log raw signatures, secrets, or full payloads.

## Compatibility and versioning

Consumers use a tolerant reader for optional fields. Protocol v1 is read-only compatibility during
migration; this binding writes v2 and refuses cross-binding replay.

## Acceptance scenarios

- A valid event applies exactly once despite duplicate delivery.
- A stale timestamp, altered body, wrong key, source, capability, or binding is rejected.
- A temporary disabled binding responds retryably and does not create a business side effect.
- An oversized or SSRF-generated destination is rejected before delivery.

## Open decisions

The deployment maps `wiki.integration.events` to an HTTPS endpoint and key resolver.
