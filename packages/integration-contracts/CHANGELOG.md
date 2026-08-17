# @appspine/integration-contracts

## 0.4.0

### Minor Changes

- 3282f18: Security audit fixes across the shared framework packages.

  **BREAKING (`@appspine/m2m-api-key`)** — `ScopeGuard` now fails **closed** for API-key
  principals. Previously, a route with no `@Scopes()` metadata reachable on either the handler
  or the controller class returned `true`, so adding a handler to a `ScopeGuard`-protected
  controller without a `@Scopes()` decorator silently granted every API key full access to it.
  API-key callers are now rejected with 403 when no scope requirement is declared at all; JWT
  callers are unaffected (scopes have never applied to them). Every M2M-reachable route must
  now carry an explicit `@Scopes(...)` on the handler or the controller class. Note that
  `@Scopes('*')` is not an "any key" escape hatch — `matchScope` requires the key to actually
  hold the `*` wildcard scope for that to pass.

  - `@appspine/common`: `LoggingModule` now redacts `req.headers.cookie` and
    `res.headers["set-cookie"]` (consuming apps run CORS with `credentials: true`, so session
    cookies were reaching plaintext logs), plus `proxy-authorization`,
    `x-appspine-signature`, and the common token-bearing body fields.
  - `@appspine/common`: `GlobalExceptionFilter` now validates `X-Request-Id` against
    `/^[A-Za-z0-9._-]{1,64}$/` before using it as the trace id, falling back to a generated
    UUID. An embedded newline previously let a caller forge whole log lines and reflect
    arbitrary content into the JSON error body.
  - `@appspine/integration-contracts`: `resolveSafeDestination()` now expands IPv6 literals
    before classifying them. Loopback and unique-local addresses written in a non-canonical
    form (`0:0:0:0:0:0:0:1`, `fc00:0:0:0:0:0:0:1`) bypassed the string-prefix blocklist
    entirely. Also blocks NAT64 (`64:ff9b::/96`), 6to4 (`2002::/16`), Teredo, and the
    `192.88.99.0/24` 6to4 relay anycast range.
  - `@appspine/domain-events`: `postDomainEventWebhook` (v1) now applies the same
    `resolveSafeDestination()` guard `postDomainEventWebhookV2` uses and pins the connection to
    the validated address, closing an SSRF primitive against an admin-supplied destination URL.
    It takes an optional `destinationPolicy` and is marked `@deprecated` in favour of v2.
  - `@appspine/frontend-shell`: admin request helpers now `encodeURIComponent()` ids
    interpolated into fetch paths, so an id containing `../` or `?` can no longer retarget the
    request at a different API route.

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
