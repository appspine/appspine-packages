---
'@appspine/plugin-cli': minor
'@appspine/plugin-api': patch
---

Add `@appspine/plugin-cli` (051 PL2-01).

The App-facing tool that owns `appspine.plugins.json`, and nothing else. This release is the shell
the rest of Phase 2 registers commands against: the inventory file format and its JSON Schema
(`appspine.plugins/v1`), canonical read/write, the config and secret boundary, stable exit codes,
and a single machine-readable result envelope (`appspine.cli-result/v1`) rendered from the same
object as the human output. `add` / `remove` / `list` / `validate` land in PL2-02, `build` /
`doctor` in PL2-03.

Three constraints are enforced by tests rather than by convention: the CLI writes exactly one file
(asserted by listing the App directory before and after), it cannot load a package by name at
runtime (no `import()`, `require()` or child process anywhere in the shipped source), and a
`configRef` shaped like a credential — a token, a connection string, a PEM header — is rejected
without the offending text ever appearing in the diagnostic.

`@appspine/plugin-api` replaces four literal NUL bytes in `sortDiagnostics`' key separator with
`\u0000` escapes. Behaviour is identical; the bytes made the file read as binary to grep, diff and
review tooling, which is how a control character stayed invisible in a reviewed source file.
