---
'@appspine/preset-standard': minor
'@appspine/plugin-cli': minor
---

Add `@appspine/preset-standard` and preset expansion (051 PL2-08).

A preset is shorthand for a list of plugins, and nothing else. After expansion the inventory reads
exactly as if the entries had been typed out, and nothing downstream — resolver, catalog, lockfile,
host — learns a preset was involved. Everything else follows from protecting that:

- The catalog and lockfile list **resolved plugins**, with versions and digests, and record the
  preset alongside as provenance. `standard@1.0.0` as the only entry would hide what an App actually
  runs behind a name whose meaning changes between releases.
- An entry an App writes explicitly overrides the preset's, **and the CLI says so**. A silent
  override is how an App ends up running something other than what its own file appears to say.
- A preset can only contribute, so adding one never swallows an app-local plugin.
- Two presets contributing the same instance is refused rather than resolved by ordering.
- The preset's own version is part of the source digest, so upgrading it makes every derived
  artefact drift instead of quietly describing a different set of plugins.

`add` and `remove` edit the file as written, never the expansion — otherwise the first `add` would
freeze a copy of the preset and upgrading it later would change nothing.

`appspine.plugins.json` accepted a `presets` field from v1 and rejected a non-empty one until an
expander existed. It no longer does.
