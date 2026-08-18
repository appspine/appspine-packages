# @appspine/preset-standard

The standard Appspine capability set as one versioned name.

```json
{
  "schemaVersion": "appspine.plugins/v1",
  "presets": ["@appspine/preset-standard"],
  "plugins": []
}
```

## What a preset is

Shorthand for a list of plugins, and nothing else. After `appspine build` expands it, the inventory
reads exactly as if the entries had been typed out, and the host never learns a preset was involved.

That is deliberate, and it is why the catalog and the lockfile list the **resolved plugins** — their
versions, digests and capability graph — with the preset recorded alongside as provenance.
`standard@1.0.0` as the only entry would hide what an App actually runs behind a name whose meaning
changes between releases.

## What it cannot do

- **Remove anything.** A preset only contributes, so adding one can never swallow an app-local
  plugin.
- **Win an argument.** An entry an App writes in `appspine.plugins.json` overrides the preset's, and
  the CLI says so rather than silently preferring one.
- **Imply an order.** Registration order comes from the resolver's capability graph. A preset that
  also implied one would be a second, weaker answer to the same question.

Two presets contributing the same instance is refused outright: the App has to say which it means.

## Contents

`health-check`, `audit-log`, `identity-core`, `oidc-auth` — what `appspine-app-template`'s
`AppModule` imports by hand today. The rest of the standard capabilities join as they migrate in
Phase 4.
