---
'@appspine/plugin-cli': minor
---

Add `add`, `remove`, `list`, `validate` and `config-stub` (051 PL2-02).

Every mutating command computes a change plan first and applies it second, so `--dry-run` is
literally the same code path stopping in the middle rather than a second description that can
disagree with what actually happens. The diff it prints is a unified diff over the canonical
serialisation — the exact text a reviewer will see in the pull request.

The refusals are the substance:

- `add` requires the package to be installed, because the CLI cannot preflight a manifest it cannot
  read; it rejects a second identical entry with `CONFLICT` rather than silently doing nothing; and
  it refuses outright when the resulting inventory would not resolve.
- `remove` resolves the inventory *without* the entry and declines if anything still enabled needs a
  capability only that entry provided — the alternative is discovering it during a deploy.
- `list` never refuses to show the state just because it does not resolve. Someone running `list` is
  usually trying to find out why something is broken.
- `validate` separates "an input is malformed" (`VALIDATION_FAILED`) from "the inputs are fine but
  do not compose" (`RESOLUTION_FAILED`), because a caller reacts to those differently.

`add` records the dependency in `package.json` and stops there: installing reaches the network and
mutates `node_modules`, so the CLI names the step instead of taking it. `remove` leaves
`package.json` alone and says plainly that no data was deleted (051 decision 13).

`CommandDefinition` now declares its own `flags`, so `--dry-run` on a read-only command is a usage
error instead of a silent no-op.
