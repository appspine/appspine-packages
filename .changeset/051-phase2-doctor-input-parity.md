---
'@appspine/plugin-cli': patch
---

Give `doctor` the same generation inputs as `build` (051 PL2-09).

`doctor` built its `GenerationInput` without the preset provenance `build` passes, so every
artefact came out different and it reported drift against files `build --check` had just called
current. Found against the real template, where it claimed four stale artefacts and four lockfile
findings on a freshly built App.

A diagnostic tool that cries wolf is a diagnostic tool people learn to ignore, so this is a
correctness fix rather than cosmetics. `preset.spec.ts` now asserts a clean `doctor` immediately
after a successful `build`, and goes red if the two inputs diverge again.
