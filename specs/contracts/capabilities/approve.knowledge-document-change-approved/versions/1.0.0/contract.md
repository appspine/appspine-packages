---
type: integration-contract
scope: cross-repo
contract_kind: capability
contract_id: approve.knowledge-document-change-approved
version: 1.0.0
status: approved
interaction: event
transport: webhook
producer: approve
consumers:
  - wiki
maintainer: approve
required_reviewers:
  - wiki
created: 2026-08-07
updated: 2026-08-07
---

# approve.knowledge-document-change-approved

## Purpose

Publish the immutable fact that Approve accepted a proposed Wiki document revision. The event is a
fact, not a command, and consumers must not infer fields that are not in the pinned payload.

## Participants and ownership

Approve owns the approval decision and the approved revision reference. Wiki consumes the event and
owns applying the revision to its local document. Notification may consume a separately bound copy.

## Trigger and business semantics

The event is recorded in the Approve transaction that changes the request to approved and is
delivered through the transactional outbox. It is immutable and may be replayed.

## Request / response or event schema

The event payload is defined by `schemas/event.schema.json`. The external envelope is supplied by
the shared integration runtime.

## Authentication and authorization

The binding authenticates Approve as the producer and identifies the exact capability and binding.
Consumers verify the raw request signature before parsing the envelope.

## Idempotency and retry

Consumers use `(sourceApp, eventId)` as the inbox key and compare the payload digest on replay. A
duplicate with the same digest is acknowledged; a duplicate with a different digest is rejected.

## Errors and failure handling

Schema, source, binding, key, freshness, and signature failures fail closed. A temporary disabled
binding returns a retryable outcome; permanent consumer validation failures are terminal.

## Observability and audit

The producer records event ID, binding, capability version, payload digest, correlation ID, and
actor reference. Payload content and signature material are excluded from logs.

## Compatibility and versioning

Consumers use a tolerant reader for unknown optional fields. Removing or changing the meaning of an
existing field, changing classification, or changing duplicate semantics requires a major version.

## Acceptance scenarios

- A committed approval creates one immutable outbox event.
- The event contains document ID, change request ID, revision, checksum, approval time, and actor.
- A consumer can acknowledge a same-event replay without a second side effect.
- A tampered payload or cross-binding replay is rejected.

## Open decisions

The delivery transport may move from HTTPS webhook to a broker adapter without changing this event
capability, provided the binding records the transport change.
