# 043 deterministic two-app fixture

This fixture models the Z31 provider/caller flow without opening a network port or connecting to
an external database. It uses an in-memory provider store, caller reconciliation state, an outbox,
and a receipt store. The disposable configuration uses port `0` when a transport harness is added;
the fixture itself has no listener. `FIXTURE_V2_SECRET` is an environment-variable name only, not a
secret value.

Run it from the workspace root after building the shared packages:

```text
node fixtures/043-two-app/fixture.mjs
```

The command validates the pinned capability digests, deterministic payload digest, idempotent
submit/replay/conflict behavior, pending-to-approved reconciliation, Webhook v2 envelope creation,
duplicate receipt handling, and digest-mismatch rejection. Matrix cases are documented in
`reliability-matrix.json` and `security-matrix.json`.
