---
'@appspine/plugin-api': minor
'@appspine/plugin-testkit': minor
'@appspine/plugin-host-nest': minor
---

Add the Phase 1 plugin platform core (051 PL1-01 to PL1-06, PL1-11).

`@appspine/plugin-api` is the contract every plugin and host agrees on: `appspine.plugin/v1`
manifest types and JSON Schema, the frozen capability-name registry, `Symbol.for` tokens with their
minimal ports, `definePlugin()`, and the lifecycle/diagnostic contracts. Four node-only subpaths sit
beside the root barrel — `./schema`, `./loader` (Ajv-backed manifest validation, canonical digests,
engine and framework range checks), `./resolver` (deterministic dependency graph, conflict,
cardinality and duplicate-contribution detection) and `./runtime` (the lifecycle engine and catalog
model shared by the host and the testkit).

`@appspine/plugin-testkit` gives a plugin package manifest and inventory builders, fake capability
implementations, a lifecycle harness and recorder, and runner-agnostic catalog/diagnostic
assertions — usable from an installed tarball, with no workspace paths.

`@appspine/plugin-host-nest` composes a resolved inventory into a NestJS module before bootstrap,
runs `validate -> register -> ready` per instance in dependency order, aborts startup when a
required plugin fails, degrades only when a manifest declared how, shuts down in reverse order with
a per-instance timeout, and exposes a redacted catalog and health view. It also owns the two host
capabilities every plugin can rely on: the authentication strategy registry (one interactive
provider maximum) and the principal context, with neutral `AppspineAuthGuard` /
`InteractiveAuthGuard` / `MachineAuthGuard` replacing provider-specific guard chains.
