# @appspine/integration-contracts

## 0.3.1

### Patch Changes

- Harden pinned contract enforcement, Webhook v2 raw-body and capability-digest verification,
  production destination policy, absolute request deadlines, receipt transactions, and dispatcher
  lease ownership.

## 0.3.0

### Minor Changes

- Pin integration envelopes to an immutable capability digest, harden JSON Schema and OpenAPI
  validation, generate concrete TypeScript payload types, and close SSRF/DNS-rebinding gaps.
- Recognize HTTP-date Retry-After values and require matching event IDs for already-processed 409
  responses.

## 0.2.0

### Minor Changes

- Add immutable integration envelopes, canonical SHA-256 manifests, schema validation and data classification.
- Add Webhook Protocol v2 signing/verification, compatibility profiles, delivery mapping and SSRF-safe destination policy.
