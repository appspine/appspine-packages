#!/usr/bin/env node
// PL0-04 acceptance cases for the frozen identity boundary. These are contract tests for
// Phase 1, not a replacement for oidc-auth's future persistence implementation.

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const fixture = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'fixtures/051-identity-boundary/cases.json'), 'utf8'),
);

function externalIdentityKey(identity) {
  if (typeof identity.issuer !== 'string' || identity.issuer.length === 0) {
    throw new Error('issuer-required');
  }
  if (typeof identity.subject !== 'string' || identity.subject.length === 0) {
    throw new Error('subject-required');
  }
  // Tuple serialization avoids ambiguous delimiter concatenation.
  return JSON.stringify([identity.issuer, identity.subject]);
}

function conflictPairs(manifests, installedPluginIds) {
  const installed = new Set(installedPluginIds);
  const pairs = new Set();
  for (const manifest of manifests) {
    for (const conflict of manifest.conflicts ?? []) {
      if (!installed.has(conflict)) continue;
      pairs.add([manifest.id, conflict].sort().join('<->'));
    }
  }
  return [...pairs].sort();
}

let checked = 0;
let failed = 0;
function report(label, ok, detail) {
  checked++;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

for (const testCase of fixture.identityKeyCases) {
  const same = externalIdentityKey(testCase.left) === externalIdentityKey(testCase.right);
  const expectedSame = testCase.expected === 'same';
  report(testCase.name, same === expectedSame, `expected ${testCase.expected}`);
}

for (const testCase of fixture.invalidIdentityCases) {
  let failure;
  try {
    externalIdentityKey(testCase.identity);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  report(
    testCase.name,
    failure === testCase.expectedFailure,
    `expected ${testCase.expectedFailure}, got ${failure ?? 'no failure'}`,
  );
}

const conflict = fixture.interactiveProviderConflict;
const actualPairs = conflictPairs(conflict.manifests, conflict.installedPluginIds);
report(
  'oidc-auth and local-auth are mutually exclusive',
  JSON.stringify(actualPairs) === JSON.stringify(conflict.expectedConflictPairs),
  `got ${JSON.stringify(actualPairs)}`,
);

console.log(`\n${checked} identity contract checks run, ${failed} failed.`);
if (failed > 0) process.exit(1);
