#!/usr/bin/env node
// PL0-06 (051-plugin-platform-engineering-task-breakdown.md): Prisma owns/augments
// composition fixtures. This is a Phase 0 acceptance checker proving the *rules* — owner
// collision detection, missing augmentation targets, and order-independent deterministic
// output — not the real composer (that is PL2-06, once plugin-cli/manifest loading exist).
//
// Verifies the two properties PL0-06 explicitly requires:
//   1. Same contribution set composed in shuffled order produces an identical digest.
//   2. Composition never mutates or drops data; owner/target errors fail fast instead of
//      silently resolving.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const dir = path.join(repoRoot, 'fixtures/051-prisma-permission/prisma');

function digestOf(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Exhaustive, not sampled: Gate G0 independent review (2026-08-18) found the previous
// seeded-shuffle version claimed "6 orderings" while only covering 4 of the 6 possible
// permutations of a 3-element array (two seeds collided). For inputs this small, generating
// every permutation is cheap and removes any doubt about coverage.
function allPermutations(array) {
  if (array.length <= 1) return [array];
  const results = [];
  for (let i = 0; i < array.length; i++) {
    const rest = [...array.slice(0, i), ...array.slice(i + 1)];
    for (const perm of allPermutations(rest)) {
      results.push([array[i], ...perm]);
    }
  }
  return results;
}

function compose(contributions) {
  const errors = [];
  const ownerByModel = new Map();

  for (const contribution of contributions) {
    for (const owned of contribution.owns ?? []) {
      const existingOwner = ownerByModel.get(owned.model);
      if (existingOwner && existingOwner !== contribution.plugin) {
        errors.push({
          code: 'owner-collision',
          model: owned.model,
          owners: [existingOwner, contribution.plugin].sort(),
        });
      } else {
        ownerByModel.set(owned.model, contribution.plugin);
      }
    }
  }

  for (const contribution of contributions) {
    for (const augment of contribution.augments ?? []) {
      if (!ownerByModel.has(augment.targetModel)) {
        errors.push({
          code: 'missing-augmentation-target',
          model: augment.targetModel,
          plugin: contribution.plugin,
          field: augment.field,
        });
      }
    }
  }

  if (errors.length > 0) {
    // Deterministic error order regardless of input order — same principle as the
    // canonical schema below, so callers get identical error reports on retry.
    errors.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { errors, canonicalSchema: null, digest: null };
  }

  const canonicalModels = [...contributions]
    .flatMap((c) =>
      (c.owns ?? []).map((o) => ({
        model: o.model,
        owner: c.plugin,
        fields: [...o.fields].sort(),
      })),
    )
    .sort((a, b) => a.model.localeCompare(b.model));

  const canonicalAugmentations = [...contributions]
    .flatMap((c) => (c.augments ?? []).map((a) => ({ ...a, plugin: c.plugin })))
    .sort(
      (a, b) =>
        a.targetModel.localeCompare(b.targetModel) ||
        a.field.localeCompare(b.field) ||
        a.plugin.localeCompare(b.plugin) ||
        String(a.type ?? '').localeCompare(String(b.type ?? '')),
    );

  const canonicalSchema = { models: canonicalModels, augmentations: canonicalAugmentations };
  return { errors: [], canonicalSchema, digest: digestOf(canonicalSchema) };
}

let failed = 0;
let checked = 0;
function report(label, ok, detail) {
  checked++;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// --- positive scenario: deterministic digest across 5 shuffles ------------------------

const scenarioPath = path.join(dir, 'scenarios/identity-rbac-apikey.json');
const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
const baseline = compose(scenario.contributions);
report(
  'scenarios/identity-rbac-apikey.json (composes without error)',
  baseline.errors.length === 0,
  JSON.stringify(baseline.errors),
);

const allOrderings = allPermutations(scenario.contributions);
const digests = new Set(allOrderings.map((ordering) => compose(ordering).digest));
report(
  `scenarios/identity-rbac-apikey.json (order-independent digest across all ${allOrderings.length} permutations)`,
  digests.size === 1,
  `${digests.size} distinct digests`,
);

// Regression: concatenating targetModel + field is not an injective sort key (`A`/`bc`
// and `Ab`/`c` both become `Abc`). The canonical comparator must compare tuple elements.
const ambiguousSortKeyScenario = JSON.parse(
  fs.readFileSync(path.join(dir, 'scenarios/ambiguous-augmentation-sort-key.json'), 'utf8'),
);
const ambiguousDigests = new Set(
  allPermutations(ambiguousSortKeyScenario.contributions).map(
    (ordering) => compose(ordering).digest,
  ),
);
report(
  'scenarios/ambiguous-augmentation-sort-key.json (tuple sort is order-independent)',
  ambiguousDigests.size === 1 && !ambiguousDigests.has(null),
  `${ambiguousDigests.size} distinct digests`,
);

// --- negative scenarios -----------------------------------------------------------------

const negativeCases = [
  { file: 'negative/owner-collision.json', expectedCode: 'owner-collision' },
  {
    file: 'negative/missing-augmentation-target.json',
    expectedCode: 'missing-augmentation-target',
  },
];

for (const { file, expectedCode } of negativeCases) {
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const result = compose(fixture.contributions);
  const matched = result.errors.some((e) => e.code === expectedCode);
  report(
    file,
    matched,
    matched ? undefined : `expected "${expectedCode}", got ${JSON.stringify(result.errors)}`,
  );
}

console.log(`\n${checked} checks run, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
