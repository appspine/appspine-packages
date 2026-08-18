---
'@appspine/plugin-api': minor
'@appspine/plugin-cli': minor
---

Compose `.appspine/generated/schema.prisma` from each plugin's own fragment (051 PL2-06).

The problem this solves is one Prisma has no syntax for: a model has exactly one owning package,
but a relation needs a field on both sides — so `rbac` needs `userRoles UserRole[]` to exist inside
`identity-core`'s `User`. Either identity-core declares a field for an optional plugin it must not
depend on, or somebody writes it in at composition time. This is that somebody.

PL0-06 froze the rules before any composer existed, and `prisma-composer.spec.ts` drives those same
fixtures through this implementation rather than restating their expectations — including the
`A`/`bc` versus `Ab`/`c` regression that a concatenated sort key would collapse.

`@appspine/plugin-api` tightens the `prisma` facet, the handover PL0-05 named PL2-06 for. An
augmentation declares `{targetModel, field, owner}` as PL0-05's frozen fixture does, plus an
optional `type`. It is optional only because that fixture predates the need for it, and the composer
cannot write a field without one — so it says so by name (`augmentation-without-type`) instead of the
schema rejecting a frozen fixture.

Beyond the frozen rules the composer adds three of its own: an augmentation naming the wrong owner,
two plugins owning one enum, and — as a warning, not an error — an augmentation the owner never
listed in `augmentedBy`, since that list is documentation worth surfacing rather than blocking on.

`build` composes first and refuses before writing anything. A schema with a missing relation field
fails much later, inside Prisma, as something that looks unrelated to the plugin that caused it. The
output is a schema and a migration *plan input*; nothing is applied, and the datasource and
generator blocks stay in the App's own schema because they are deployment configuration, not a
plugin contribution.
