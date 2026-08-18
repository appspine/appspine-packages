---
'@appspine/plugin-cli': minor
---

Add `build` and `doctor` (051 PL2-03).

`build` is a generation framework plus one concrete generator. PL2-05, PL2-06 and PL2-07 each
register a function against it, so determinism and drift detection are written once rather than
three times. `--check` runs the same generation and compares instead of writing: a drift check on a
different code path from the generator can only tell you the two disagree, never which is right.

Artefacts record the digest of the inputs they came from, which lets `--check` distinguish three
kinds of staleness — never generated, inputs changed, or the generator itself changed. That last
one matters in practice: upgrading the CLI makes every App drift at once, and an operator needs to
know that was not them.

`.appspine/generated/catalog.json` is what the manifests alone can say: ids, versions, digests,
enabled/disabled, provides/requires, routes, provider tokens, Prisma models, and environment key
**names** with their required/secret flags. Never a value — a test sets a sentinel secret in the
environment and asserts it does not appear, while the key's name must.

`build` refuses to generate from an inventory that does not resolve. Artefacts from a broken graph
would look authoritative, describe an App that cannot boot, and become what `doctor` compares
against.

`doctor` reports what is knowable without booting anything, and says so: `enabled` / `disabled` are
inventory facts, but every entry's `runtimeState` is `unknown-until-boot`, because `failed` and
`degraded` are lifecycle outcomes. Environment keys are checked for presence, never read. Drift gets
its own exit code — the fix is "run build", not "change your inputs" — but any other error outranks
it, so an unresolvable inventory is never reported as something a rebuild would fix.
