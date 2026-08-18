---
'@appspine/plugin-cli': minor
---

Add `appspine.plugin-lock.json` (051 PL2-04).

The lockfile is derived and committed, and that pair decides everything else about it. Derived, so
`appspine build` regenerates it and `build --check` can assert it is current. Committed, so it is
sorted, canonically formatted, and says as little as it can get away with — a human reads it as a
diff.

It records the *result* of resolution: registration order, the capability graph, each instance's
dependencies, and per package the version, manifest digest and Prisma fragment digest. It does not
record tarball resolution or integrity — `pnpm-lock.yaml` owns those, and a second source of truth
for which bytes are installed goes stale silently with nothing to say which one is right. It records
environment keys by name only.

The two lockfiles have to be read together, which is what the drift diagnostics are for. Upgrading a
package through pnpm without rebuilding leaves a plugin lock describing the previous version's
capability graph, and the App would boot on a graph nobody reviewed. Each kind of drift is named
separately because the fix differs: a changed version means the package manager ran without a
rebuild; a changed manifest digest at the *same* version means the installed package was modified in
place, which `doctor` deliberately does not treat as something a rebuild fixes.

`build` now brings both kinds of derived state up to date in one command, because a repository where
only one of them was refreshed is a repository whose lock describes a graph the App does not run.
