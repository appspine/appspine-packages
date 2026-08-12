# @appspine/integration-contracts

Shared runtime primitives for app-to-app integration contracts.

The package deliberately has no NestJS, Prisma, or application dependency. It provides deterministic
JSON and SHA-256 digests, immutable external event envelopes, Draft 2020-12-compatible validation for
the contract subset used by Appspine, the `x-appspine-data-classification` vocabulary, Webhook Protocol
v2 signing and verification, delivery outcome mapping, and SSRF-safe destination validation.

Consumers should pin a canonical capability and binding by exact SemVer plus digest. Build the
contract-specific payload before calling `@appspine/domain-events`; the domain-events package freezes
the payload and persists its digest in the same transaction as the business change.
