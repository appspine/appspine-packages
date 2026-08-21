#!/usr/bin/env node
// PL0-06 (051-plugin-platform-engineering-task-breakdown.md): permission lifecycle
// reconciliation fixtures. Phase 0 acceptance checker proving the rules from
// 051-plugin-platform-engineering-plan.md section 5.4 — immutable namespaced IDs,
// plan-based reconciliation, alias-based rename, orphan/retired-not-deleted removal, and
// downgrade detection — not the real reconciler (that is PL2-07, once plugin-cli exists).
//
// Verifies the two properties PL0-06 explicitly requires:
//   1. Same current/desired state reconciled in shuffled order produces an identical plan
//      digest.
//   2. A permission that disappears from desired state produces a "retire" op — the
//      reconciler has no "delete" or "drop-table" op type at all, so removal can never
//      silently destroy data.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const dir = path.join(repoRoot, 'fixtures/051-prisma-permission/permission');

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

// The reconciler's only op codes. "delete" and "drop-table" do not exist as op codes, so no
// code path can emit them (structural). The loop below is a *defense-in-depth* runtime
// assertion on top of that — not the sole guarantee, contrary to what an earlier version of
// this comment implied (Gate G0 independent review, 2026-08-18): it protects against a
// future edit accidentally introducing a new op string without updating OP_CODES, but the
// real guarantee is that "delete"/"drop-table" are simply never written anywhere below.
const OP_CODES = ['no-op', 'add', 'update-display', 'alias', 'retire'];

function reconcile(currentState, desiredState, targetGeneration) {
  const errors = [];

  // Checked on both sides — Gate G0 independent review (2026-08-18) found the first
  // version only checked desiredState, silently trusting currentState (e.g. a caller
  // reading directly from a compromised or hand-edited store) to already be well-formed.
  const seenDesiredIds = new Set();
  for (const entry of desiredState) {
    if (seenDesiredIds.has(entry.id)) {
      errors.push({ code: 'duplicate-permission-id', id: entry.id, where: 'desiredState' });
    }
    seenDesiredIds.add(entry.id);
  }
  const seenCurrentIds = new Set();
  for (const entry of currentState) {
    if (seenCurrentIds.has(entry.id)) {
      errors.push({ code: 'duplicate-permission-id', id: entry.id, where: 'currentState' });
    }
    seenCurrentIds.add(entry.id);
  }

  const maxCurrentGeneration = currentState.reduce(
    (max, e) => Math.max(max, e.schemaGeneration ?? 0),
    0,
  );
  if (targetGeneration !== undefined && maxCurrentGeneration > targetGeneration) {
    errors.push({
      code: 'downgrade-blocked',
      currentGeneration: maxCurrentGeneration,
      targetGeneration,
    });
  }

  if (errors.length > 0) {
    errors.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { errors, plan: null, digest: null };
  }

  const currentById = new Map(currentState.map((e) => [e.id, e]));
  const aliasedFromIds = new Set(desiredState.filter((e) => e.aliasOf).map((e) => e.aliasOf));
  const plan = [];

  for (const desired of desiredState) {
    const existing = currentById.get(desired.id);
    if (desired.aliasOf) {
      // Gate G0 independent review (2026-08-18): the previous version emitted an `alias`
      // op even when `aliasOf` pointed at a permission ID that doesn't exist in
      // currentState — a config typo would silently produce a plausible-looking plan
      // instead of failing. Validated here, not just structurally assumed.
      if (!currentById.has(desired.aliasOf)) {
        errors.push({ code: 'alias-target-not-found', id: desired.id, aliasOf: desired.aliasOf });
        continue;
      }
      plan.push({
        op: 'alias',
        id: desired.id,
        aliasOf: desired.aliasOf,
        displayName: desired.displayName,
      });
      continue;
    }
    if (!existing) {
      plan.push({ op: 'add', id: desired.id, displayName: desired.displayName });
      continue;
    }
    if (existing.displayName !== desired.displayName) {
      plan.push({
        op: 'update-display',
        id: desired.id,
        from: existing.displayName,
        to: desired.displayName,
      });
      continue;
    }
    plan.push({ op: 'no-op', id: desired.id });
  }

  for (const current of currentState) {
    const stillDesired = desiredState.some((d) => d.id === current.id);
    const referencedAsAlias = aliasedFromIds.has(current.id);
    if (!stillDesired && !referencedAsAlias) {
      // Never a delete — permission data (RolePermission rows, audit trail) is preserved;
      // only the catalog status changes. See plan section 5.4.
      plan.push({ op: 'retire', id: current.id });
    }
  }

  if (errors.length > 0) {
    errors.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { errors, plan: null, digest: null };
  }

  for (const entry of plan) {
    if (!OP_CODES.includes(entry.op)) {
      throw new Error(`internal error: unknown op code ${entry.op}`);
    }
  }

  plan.sort((a, b) => a.id.localeCompare(b.id));
  return { errors: [], plan, digest: digestOf(plan) };
}

let failed = 0;
let checked = 0;
function report(label, ok, detail) {
  checked++;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// --- positive scenario -------------------------------------------------------------------

const scenario = JSON.parse(
  fs.readFileSync(path.join(dir, 'scenarios/add-rename-retire.json'), 'utf8'),
);
const baseline = reconcile(scenario.currentState, scenario.desiredState, scenario.targetGeneration);
report(
  'scenarios/add-rename-retire.json (reconciles without error)',
  baseline.errors.length === 0,
  JSON.stringify(baseline.errors),
);

const opCodesPresent = new Set((baseline.plan ?? []).map((e) => e.op));
const expectedCodes = new Set(scenario.expectedPlanOpCodes);
report(
  'scenarios/add-rename-retire.json (plan contains exactly the expected op codes)',
  opCodesPresent.size === expectedCodes.size &&
    [...opCodesPresent].every((c) => expectedCodes.has(c)),
  `got ${[...opCodesPresent].sort().join(',')}, expected ${[...expectedCodes].sort().join(',')}`,
);

const forbidden = scenario.expectedOpsNeverIncluding ?? [];
const hasForbidden = (baseline.plan ?? []).some((e) => forbidden.includes(e.op));
report(
  'scenarios/add-rename-retire.json (never emits delete/drop-table ops)',
  !hasForbidden,
  hasForbidden ? 'forbidden op present' : undefined,
);

const currentOrderings = allPermutations(scenario.currentState);
const desiredOrderings = allPermutations(scenario.desiredState);
const digests = new Set();
for (const current of currentOrderings) {
  for (const desired of desiredOrderings) {
    digests.add(reconcile(current, desired, scenario.targetGeneration).digest);
  }
}
report(
  `scenarios/add-rename-retire.json (order-independent digest across all ${currentOrderings.length * desiredOrderings.length} orderings)`,
  digests.size === 1,
  `${digests.size} distinct digests`,
);

// --- negative scenarios -----------------------------------------------------------------

const negativeCases = [
  { file: 'negative/duplicate-permission-id.json' },
  { file: 'negative/downgrade-blocked.json' },
  { file: 'negative/alias-target-not-found.json' },
];

for (const { file } of negativeCases) {
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const result = reconcile(fixture.currentState, fixture.desiredState, fixture.targetGeneration);
  const matched = result.errors.some((e) => e.code === fixture.expectedFailure);
  report(
    file,
    matched,
    matched
      ? undefined
      : `expected "${fixture.expectedFailure}", got ${JSON.stringify(result.errors)}`,
  );
}

console.log(`\n${checked} checks run, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
