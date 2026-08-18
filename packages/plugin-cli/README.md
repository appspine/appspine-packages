# @appspine/plugin-cli

The App-facing tool for `appspine.plugins.json`.

```bash
appspine <command> [--json] [--cwd <path>]
```

## What it owns

051 decision 10 splits the sources of truth, and this package owns exactly one of them:

| File / source | Owner |
| --- | --- |
| `appspine.plugins.json` | **this CLI** — plugin package, instance id, enabled, required, config reference |
| `appspine.config.ts` | the App developer — values, factories, programmatic wiring |
| environment | the operator — issuers, credentials, endpoints |
| `pnpm-lock.yaml` | pnpm — package versions and integrity |
| `appspine.plugin-lock.json` | the plugin resolver — the expanded capability graph and digests |

## What it will never do

- **Rewrite TypeScript.** When a plugin needs programmatic wiring, `appspine config-stub` prints a
  typed block with a `TODO` for the developer to review and paste. `appspine.config.ts` is never
  touched by the CLI.
- **Run your package manager.** `add` records the dependency in `package.json` and tells you to
  install it. Installing reaches the network and mutates `node_modules`; a tool that does that as a
  side effect of editing a config file is one nobody can run in CI.
- **Uninstall or delete data.** `remove` takes the entry out of the inventory and stops. The package
  may still be a transitive dependency, and 051 decision 13 is explicit that removing a plugin never
  removes its tables.
- **Execute plugin code.** Manifests are JSON, validated against a JSON Schema. Nothing in the
  shipped source can `import()` or `require()` a package by name, and a test asserts that.
- **Touch a credential.** The inventory holds a `configRef` — a dotted path — never a value. A
  `configRef` shaped like a token, a connection string or a PEM header is rejected, and the
  offending text is never echoed back into the diagnostic.

Build-time validation only requires that the secret env keys a manifest *declares* are declared.
It never needs a production value, so the whole thing runs in CI with no secrets available.

The CLI's entire write surface is two declarative JSON files: `appspine.plugins.json`, and the
`dependencies` block of `package.json` when `add` records a new package.

## Output

Text by default, one JSON document under `--json`:

```json
{
  "schemaVersion": "appspine.cli-result/v1",
  "ok": false,
  "command": "validate",
  "exitCode": 3,
  "exitCodeName": "VALIDATION_FAILED",
  "diagnostics": [
    { "code": "config-ref-mismatch", "severity": "error", "message": "…", "path": "plugins[0].configRef" }
  ]
}
```

Both renderings are produced from the same object, so `--json` cannot drift from what an operator
saw on screen.

## Exit codes

Stable, and part of the published contract: scripts branch on them.

| Code | Name | Meaning |
| ---: | --- | --- |
| 0 | `OK` | succeeded |
| 1 | `INTERNAL_ERROR` | the CLI itself broke — a bug, never a detected condition |
| 2 | `USAGE` | unknown command, missing argument, unknown flag; nothing read or written |
| 3 | `VALIDATION_FAILED` | an input is malformed: inventory, manifest, config reference, secret boundary |
| 4 | `RESOLUTION_FAILED` | inputs are well-formed but cannot be composed |
| 5 | `DRIFT_DETECTED` | generated artefacts do not match current inputs — re-run build |
| 6 | `NOT_FOUND` | no such plugin, instance or preset |
| 7 | `CONFLICT` | the requested edit would break the inventory |

Adding a code is a minor change; changing what an existing number means is a breaking one.

## Commands

| Command | What it does |
| --- | --- |
| `add <package>` | reads the manifest, checks the result resolves, then records the entry and the dependency |
| `remove <plugin>` | takes the entry out — refusing if anything still enabled needs what it provided |
| `list` | the inventory, its resolution status and the resolved order |
| `validate` | what CI runs: schema, manifests, config boundary, resolution |
| `config-stub <plugin>` | prints a block for `appspine.config.ts`; never applies it |

`add` and `remove` accept `--dry-run`, which stops between computing the plan and applying it, so
"what would this do" and "what did this do" are the same code path. Flags are declared per command,
so `--dry-run` on a read-only command is a usage error rather than a silent no-op.

## Status

PL2-01 shipped the shell — the inventory format and schema, the config/secret boundary, exit codes,
the JSON envelope, command dispatch. PL2-02 added the five commands above. `build` and `doctor`
arrive in PL2-03, the plugin lockfile in PL2-04, preset expansion in PL2-08. The programmatic API is
exported alongside the binary so PL2-09 and PL2-10 can run these checks from a script instead of
parsing stdout.
