---
'@appspine/plugin-api': minor
'@appspine/plugin-cli': minor
---

Reconcile permissions into a reviewable plan (051 PL2-07).

Two properties matter more than the rest. A permission **ID is immutable** — roles, audit rows and
customer-written policies all reference it, so renaming one is a new ID plus an alias, never an
edit. And **nothing is ever deleted**: a permission that leaves the desired state is *retired*,
which keeps every historical grant interpretable, the same principle 051 decision 13 applies to
Prisma data.

PL0-06 froze the rules, and the spec drives those fixtures through this implementation: the five op
codes of a realistic upgrade (`no-op`, `update-display`, `add`, `alias`, `retire`), the three
fail-fast cases (alias to a target that does not exist, a downgrade onto newer state, a duplicate
ID), and the assertion that `delete` never appears whatever left the desired state.

On any error the reconciler returns **no plan at all** rather than the ops it managed to work out.
A half-built plan is worse than none: an operator sees a list of changes that looks complete and
applies it.

`@appspine/plugin-api` tightens the `permissions` facet, the handover PL0-05 named PL2-07 for. An
entry is either a bare namespaced ID — the shape the frozen fixture uses — or an object carrying a
display name, an alias or a `frontendOnly` marker. `frontendOnly` is a visibility hint for the UI
and never an authorization decision; the permission is still in the plan.

The generated `permissions.json` holds the desired state and the plan a *fresh install* would need.
Reading the real current state would make a build-time generator depend on a running deployment, so
it does not: an apply adapter reconciles against reality when reality is available. This tool never
reads or writes an App database.
