# PL2-10 generation fixture

A complete App, on disk, that exercises every generator: a backend facet with routes and provider
tokens, two Prisma owners and a cross-package augmentation, and permissions in three of the shapes
the schema allows.

It lives here rather than in the template because the template cannot install Phase 2's packages
until they are published (PL2-09), and a CI gate that only runs after the thing it guards has
shipped guards nothing.

`node_modules/@appspine/*` are hand-written packages, not installed ones. Each ships a `dist` module
that throws the moment anything loads it, so every run of the gate re-proves that generation never
executes plugin code.

Regenerate the goldens with `node scripts/051-pl2-10-generation-gate.mjs --update`, and read the
diff before committing it — that diff is the only review a generated artefact ever gets.
