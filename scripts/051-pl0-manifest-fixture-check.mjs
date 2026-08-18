#!/usr/bin/env node
// PL0-05 (051-plugin-platform-engineering-task-breakdown.md): validates every
// fixtures/051-manifest-v1/{positive,negative}/*.json fixture against
// knowledge/contracts/051-manifest-v1.schema.json's actual shape (loaded and interpreted
// here — no ajv dependency exists yet in this repo, and adding one is out of PL0-05's
// scope) plus the semantic rules called out in 051-plugin-platform-engineering-plan.md
// sections 4.2/4.5/6.3/9, WITHOUT executing any plugin runtime code (pure JSON structural
// checks). Exits non-zero on any mismatch between a fixture's actual validation result and
// its declared expectation in index.json.
//
// This is a Phase 0 acceptance checker, not the real manifest loader — PL1-04 implements
// that against @appspine/plugin-api once it exists, almost certainly with a real JSON
// Schema library. The validator below only interprets the subset of JSON Schema draft
// 2020-12 actually used by knowledge/contracts/051-manifest-v1.schema.json (object/array/
// string/boolean type, const, enum, pattern, minLength, minProperties, required,
// properties, additionalProperties, items, uniqueItems) — it is not a general-purpose
// implementation and will throw on schema features outside that subset, by design, so a
// schema edit that needs a feature this doesn't support fails loudly instead of silently
// under-validating.
//
// PL0-05's independent review (Gate G0, 2026-08-18) found the first version of this script
// hand-reimplemented a *subset* of the rules without ever reading the schema file, so
// schema and checker could drift apart silently. This version loads and interprets the
// schema directly so "structural check against schema" is actually true.

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const fixturesDir = path.join(repoRoot, 'fixtures/051-manifest-v1');
const index = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'index.json'), 'utf8'));
const schema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'knowledge/contracts/051-manifest-v1.schema.json'), 'utf8'),
);

// --- minimal JSON Schema (draft 2020-12 subset) interpreter ---------------------------

function validateAgainstSchema(node, value, pathParts, errors) {
  const pathStr = pathParts.join('.') || '(root)';

  if ('const' in node) {
    if (value !== node.const) {
      errors.push({ code: 'invalid-schema-version', path: pathStr });
    }
    return;
  }

  if (node.enum) {
    if (!node.enum.includes(value)) {
      errors.push({ code: 'invalid-enum-value', path: pathStr });
    }
    return;
  }

  if (node.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({ code: 'invalid-type', path: pathStr });
      return;
    }
    for (const requiredField of node.required ?? []) {
      if (!(requiredField in value)) {
        errors.push({
          code: 'required-field-missing',
          path: pathParts.concat(requiredField).join('.'),
        });
      }
    }
    if (node.additionalProperties === false) {
      const known = new Set(Object.keys(node.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!known.has(key)) {
          errors.push({ code: 'unknown-field', path: pathParts.concat(key).join('.') });
        }
      }
    }
    if (node.minProperties !== undefined && Object.keys(value).length < node.minProperties) {
      errors.push({ code: 'empty-facets', path: pathStr });
    }
    for (const [key, propSchema] of Object.entries(node.properties ?? {})) {
      if (key in value) {
        validateAgainstSchema(propSchema, value[key], pathParts.concat(key), errors);
      }
    }
    if (typeof node.additionalProperties === 'object') {
      const known = new Set(Object.keys(node.properties ?? {}));
      for (const [key, propValue] of Object.entries(value)) {
        if (!known.has(key)) {
          validateAgainstSchema(
            node.additionalProperties,
            propValue,
            pathParts.concat(key),
            errors,
          );
        }
      }
    }
    return;
  }

  if (node.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ code: 'invalid-type', path: pathStr });
      return;
    }
    if (node.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errors.push({ code: 'duplicate-array-entry', path: pathStr });
    }
    if (node.items) {
      value.forEach((item, i) => {
        validateAgainstSchema(node.items, item, pathParts.concat(`[${i}]`), errors);
      });
    }
    return;
  }

  if (node.type === 'string') {
    if (typeof value !== 'string') {
      errors.push({ code: 'invalid-type', path: pathStr });
      return;
    }
    if (node.minLength !== undefined && value.length < node.minLength) {
      errors.push({ code: 'invalid-string-length', path: pathStr });
    }
    if (node.pattern && !new RegExp(node.pattern).test(value)) {
      let code = 'invalid-capability-name';
      if (pathStr.includes('engine.')) code = 'invalid-engine-range';
      else if (pathStr === 'id' || pathStr.startsWith('conflicts')) code = 'invalid-plugin-id';
      errors.push({ code, path: pathStr });
    }
    return;
  }

  if (node.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push({ code: 'invalid-type', path: pathStr });
    }
    return;
  }

  throw new Error(`unsupported schema node at ${pathStr}: ${JSON.stringify(node)}`);
}

function validateStructure(manifest) {
  const errors = [];
  validateAgainstSchema(schema, manifest, [], errors);
  return errors;
}

// --- semantic rules the schema alone cannot express (cross-field business rules) ------

const SECRET_LOOKING_KEY = /SECRET|PASSWORD|TOKEN|API_KEY|CREDENTIAL/;

function validateSemantics(manifest) {
  const errors = [];
  const provides = manifest.provides ?? [];
  const conflicts = manifest.conflicts ?? [];

  if (provides.includes('appspine.interactive-auth-provider') && conflicts.length === 0) {
    errors.push({ code: 'interactive-provider-without-conflicts', path: 'conflicts' });
  }

  // `conflicts` holds plugin IDs (plan section 6.3: "oidc-auth ... conflicts: [local-auth]"),
  // NOT capability names — so the only self-evident contradiction expressible without a
  // full dependency-graph resolver (that's PL1-05) is a plugin declaring conflict with its
  // own ID. A provides/conflicts capability-name overlap check was removed here (Gate G0
  // independent review, 2026-08-18): it was comparing two different namespaces
  // (capability names vs plugin IDs) and could never fire correctly.
  if (manifest.id && conflicts.includes(manifest.id)) {
    errors.push({ code: 'self-conflict', path: 'conflicts' });
  }

  if ((manifest.replaces?.length ?? 0) > 0 && manifest.distribution !== 'app-local') {
    errors.push({ code: 'replacement-not-app-local', path: 'distribution' });
  }

  for (const [i, entry] of (manifest.environment ?? []).entries()) {
    if (
      typeof entry.key === 'string' &&
      SECRET_LOOKING_KEY.test(entry.key) &&
      entry.secret !== true
    ) {
      errors.push({ code: 'secret-field-not-marked-secret', path: `environment[${i}].secret` });
    }
  }

  return errors;
}

function validateManifest(manifest) {
  return [...validateStructure(manifest), ...validateSemantics(manifest)];
}

let failed = 0;
let checked = 0;

function report(file, ok, detail) {
  checked++;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${file}${detail ? ` — ${detail}` : ''}`);
}

for (const { file } of index.positive) {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
  const errors = validateManifest(manifest);
  report(file, errors.length === 0, errors.length ? JSON.stringify(errors) : undefined);
}

for (const { file, expectedFailure } of index.negative) {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
  const errors = validateManifest(manifest);
  const matched = errors.some((e) => e.code === expectedFailure);
  report(
    file,
    matched,
    matched ? undefined : `expected "${expectedFailure}", got ${JSON.stringify(errors)}`,
  );
}

for (const { file } of index.lifecycle) {
  const fixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
  const errors = [];
  if (typeof fixture.description !== 'string' || fixture.description.length === 0) {
    errors.push('description is required');
  }
  if (typeof fixture.expectedLifecycleOutcome !== 'string') {
    errors.push('expectedLifecycleOutcome is required');
  }
  if (typeof fixture.notes !== 'string' || fixture.notes.length === 0) {
    errors.push('notes are required');
  }

  if (Array.isArray(fixture.inventory)) {
    const failure = fixture.simulatedFailure;
    const failedInstance = fixture.inventory.find(
      (entry) => entry.plugin === failure?.plugin && entry.instanceId === failure?.instanceId,
    );
    if (!failedInstance) errors.push('simulatedFailure must identify an inventory instance');
    if (!['validate', 'register', 'ready'].includes(failure?.stage)) {
      errors.push('failure stage must be validate/register/ready');
    }
    for (const entry of fixture.inventory) {
      if (
        typeof entry.plugin !== 'string' ||
        typeof entry.instanceId !== 'string' ||
        typeof entry.enabled !== 'boolean' ||
        typeof entry.required !== 'boolean'
      ) {
        errors.push('every inventory entry needs plugin/instanceId/enabled/required');
      }
    }
    if (failedInstance?.required === true && fixture.expectedLifecycleOutcome !== 'boot-aborted') {
      errors.push('required plugin failure must abort boot');
    }
    if (failedInstance?.required === false) {
      if (fixture.expectedLifecycleOutcome !== 'degraded-ready') {
        errors.push('optional plugin failure must produce degraded-ready');
      }
      if (typeof fixture.manifestFixture !== 'string') {
        errors.push('optional failure fixture must reference its manifest');
      } else {
        const manifestPath = path.join(fixturesDir, fixture.manifestFixture);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const manifestErrors = validateManifest(manifest);
        if (manifestErrors.length > 0) {
          errors.push(`referenced manifest is invalid: ${JSON.stringify(manifestErrors)}`);
        }
        if (manifest.id !== failedInstance.plugin) {
          errors.push('referenced manifest id must match failed plugin');
        }
        const policy = manifest.optionalFailurePolicy;
        if (
          policy?.isolationBoundary !== 'instance' ||
          policy?.degradedBehavior?.readiness !== 'degraded' ||
          policy?.degradedBehavior?.catalog !== 'degraded' ||
          policy?.degradedBehavior?.alert !== 'required'
        ) {
          errors.push('optional plugin manifest must define complete degraded behavior');
        }
      }
    }
  } else if (Array.isArray(fixture.registerOrder)) {
    const expectedReverse = [...fixture.registerOrder].reverse();
    if (JSON.stringify(fixture.expectedShutdownOrder) !== JSON.stringify(expectedReverse)) {
      errors.push('expectedShutdownOrder must be the exact reverse dependency order');
    }
    if (!Number.isInteger(fixture.shutdownTimeoutMs) || fixture.shutdownTimeoutMs <= 0) {
      errors.push('shutdownTimeoutMs must be a positive integer');
    }
    if (fixture.simulatedFailure?.stage !== 'shutdown') {
      errors.push('shutdown fixture failure stage must be shutdown');
    }
  } else {
    errors.push('fixture must define inventory or registerOrder');
  }

  report(file, errors.length === 0, errors.length ? errors.join('; ') : undefined);
}

const indexedFiles = new Set(
  [...index.positive, ...index.negative, ...index.lifecycle].map((entry) => entry.file),
);
const fixtureFiles = ['positive', 'negative', 'lifecycle'].flatMap((directory) =>
  fs
    .readdirSync(path.join(fixturesDir, directory))
    .filter((file) => file.endsWith('.json'))
    .map((file) => `${directory}/${file}`),
);
const unindexedFiles = fixtureFiles.filter((file) => !indexedFiles.has(file));
const missingFiles = [...indexedFiles].filter(
  (file) => !fs.existsSync(path.join(fixturesDir, file)),
);
report(
  'fixture index covers every JSON fixture exactly once',
  unindexedFiles.length === 0 &&
    missingFiles.length === 0 &&
    indexedFiles.size === fixtureFiles.length,
  `unindexed=${JSON.stringify(unindexedFiles)}, missing=${JSON.stringify(missingFiles)}`,
);

// --- self-test: prove the schema is actually being enforced, not silently bypassed ----
// (Gate G0 independent review fed a manifest violating 4 schema constraints at once into
// the pre-fix version of this script and got zero errors back. This must never regress.)

const schemaViolatingManifest = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'NOT-A-VALID-ID!!',
  displayName: 'x',
  cardinality: 'singleton',
  engine: { appspinePluginApi: '1' },
  provides: [],
  requires: [],
  configSchema: { bogus: 1 },
  facets: { backend: {} },
};
const selfTestErrors = validateManifest(schemaViolatingManifest);
const selfTestCodes = new Set(selfTestErrors.map((e) => e.code));
const expectedSelfTestCodes = [
  'invalid-plugin-id', // id pattern
  'required-field-missing', // engine.node missing
  'invalid-engine-range', // appspinePluginApi "1" fails X.Y.Z pattern
  'unknown-field', // configSchema.bogus
];
const selfTestOk = expectedSelfTestCodes.every((c) => selfTestCodes.has(c));
report(
  'self-test: schema violations in 4+ fields are all caught',
  selfTestOk,
  selfTestOk ? undefined : `got ${JSON.stringify(selfTestErrors)}`,
);

console.log(`\n${checked} fixtures checked, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
