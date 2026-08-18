#!/usr/bin/env node
/**
 * PL2-10 — deterministic generation gate.
 *
 * Everything Phase 2 generates claims to be deterministic and drift-checkable. This is the gate
 * that makes those claims falsifiable, on a fixture App committed to this repository:
 *
 *   1. generate, and compare byte-for-byte against committed goldens;
 *   2. generate again into a *different* directory and compare the two — determinism has to mean
 *      "same inputs, same bytes", not "same machine, same run";
 *   3. run `prisma validate` on the composed schema, which is the thing PL2-06 could not do;
 *   4. `--self-test`: break each artefact in turn and prove the gate catches it. A drift check
 *      nobody has watched fail is a drift check nobody knows works — the lesson Gate G0 and Gate
 *      G1 both taught, twice each.
 *
 * The fixture App is deliberately in this repository rather than in the template: the template's
 * dependencies cannot be installed until Phase 2 publishes (see PL2-09), and a CI gate that only
 * runs after the thing it guards has shipped guards nothing.
 *
 * Usage:
 *   node scripts/051-pl2-10-generation-gate.mjs             # check goldens
 *   node scripts/051-pl2-10-generation-gate.mjs --update    # rewrite goldens (review the diff)
 *   node scripts/051-pl2-10-generation-gate.mjs --self-test # prove each check can fail
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const fixtureDir = path.join(repoRoot, 'fixtures/051-pl2-generation');
const goldenDir = path.join(fixtureDir, 'golden');
const appTemplateDir = path.join(fixtureDir, 'app');
const update = process.argv.includes('--update');
const selfTest = process.argv.includes('--self-test');

const GENERATED = [
  '.appspine/generated/backend/composition.ts',
  '.appspine/generated/catalog.json',
  '.appspine/generated/permissions.json',
  '.appspine/generated/schema.prisma',
  'appspine.plugin-lock.json',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  return result;
}

/**
 * Windows holds file handles a moment longer than the process that opened them — `prisma validate`
 * in particular — so a plain `rmSync` on a temp directory can fail with EPERM on a run that
 * otherwise passed. Cleaning up is not what this gate is testing, so it retries and then gives up
 * quietly rather than failing a green run.
 */
function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // The OS will reclaim it; a leftover temp directory is not a finding.
  }
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

/** A throwaway copy of the fixture App, so a run never mutates what is committed. */
function materialise() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appspine-pl2-10-'));
  copyTree(appTemplateDir, dir);
  return dir;
}

function buildIn(appDir, args = []) {
  return run(
    process.execPath,
    [path.join(repoRoot, 'packages/plugin-cli/dist/bin.js'), 'build', ...args],
    { cwd: appDir, shell: false },
  );
}

const findings = [];
function check(label, ok, detail) {
  if (!ok) findings.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  return ok;
}

function readGenerated(appDir) {
  const out = new Map();
  for (const relative of GENERATED) {
    const file = path.join(appDir, relative);
    out.set(relative, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
  }
  return out;
}

function normalise(contents) {
  // The CLI stamps its own version into every artefact. Pinning that into a golden would make
  // every release of the CLI a golden update with no signal in it, so it is normalised away —
  // the drift check in `build --check` still covers it, because it compares like for like.
  return contents
    .replaceAll(/"version": "[^"]*"/g, '"version": "<cli>"')
    .replaceAll(/version: "[^"]*" \}/g, 'version: "<cli>" }');
}

function goldenCheck() {
  const appDir = materialise();
  try {
    const built = buildIn(appDir);
    if (
      !check(
        'build succeeds on the fixture App',
        built.status === 0,
        built.stderr?.trim() || built.stdout?.trim(),
      )
    ) {
      return;
    }

    const generated = readGenerated(appDir);
    for (const [relative, contents] of generated) {
      if (contents === null) {
        check(`${relative} was generated`, false, 'file missing');
        continue;
      }
      const goldenFile = path.join(goldenDir, relative);
      if (update) {
        fs.mkdirSync(path.dirname(goldenFile), { recursive: true });
        fs.writeFileSync(goldenFile, contents, 'utf8');
        console.log(`UPDATED ${relative}`);
        continue;
      }
      if (!fs.existsSync(goldenFile)) {
        check(`${relative} has a golden`, false, 'run with --update and review the diff');
        continue;
      }
      const golden = fs.readFileSync(goldenFile, 'utf8');
      check(`${relative} matches its golden`, normalise(contents) === normalise(golden));
    }

    if (update) return;

    // Determinism, properly: a second generation in a *different* directory.
    const second = materialise();
    try {
      buildIn(second);
      const again = readGenerated(second);
      for (const [relative, contents] of generated) {
        check(
          `${relative} is byte-identical in a second, independent run`,
          normalise(contents ?? '') === normalise(again.get(relative) ?? ''),
        );
      }
    } finally {
      cleanup(second);
    }

    const recheck = buildIn(appDir, ['--check']);
    check(
      'build --check is clean immediately after build',
      recheck.status === 0,
      recheck.stdout?.trim(),
    );

    // What PL2-06 could not do: hand the composed schema to Prisma itself.
    const schema = path.join(appDir, '.appspine/generated/schema.prisma');
    const withDatasource = path.join(appDir, 'validate.prisma');
    fs.writeFileSync(
      withDatasource,
      [
        'datasource db {',
        '  provider = "postgresql"',
        '  url      = env("DATABASE_URL")',
        '}',
        '',
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        fs.readFileSync(schema, 'utf8'),
      ].join('\n'),
      'utf8',
    );
    const validated = run(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules/prisma/build/index.js'),
        'validate',
        '--schema',
        withDatasource,
      ],
      {
        cwd: appDir,
        shell: false,
        env: { ...process.env, DATABASE_URL: 'postgresql://u:p@localhost:5432/d' },
      },
    );
    check(
      'the composed schema is valid Prisma',
      validated.status === 0,
      `${validated.stdout ?? ''}${validated.stderr ?? ''}`
        .trim()
        .split('\n')
        .slice(0, 6)
        .join(' | '),
    );
  } finally {
    cleanup(appDir);
  }
}

/** Each mutation must make `build --check` fail. Anything that stays green is a hole. */
const MUTATIONS = [
  {
    name: 'a hand-edited generated artefact',
    apply: (appDir) => {
      const file = path.join(appDir, '.appspine/generated/catalog.json');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"order"', '"ORDER"'), 'utf8');
    },
  },
  {
    name: 'a hand-edited generated composition',
    apply: (appDir) => {
      const file = path.join(appDir, '.appspine/generated/backend/composition.ts');
      fs.appendFileSync(file, '\n// edited by hand\n', 'utf8');
    },
  },
  {
    name: 'a modified plugin manifest',
    apply: (appDir) => {
      const file = path.join(appDir, 'node_modules/@appspine/demo-audit/appspine.plugin.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      parsed.displayName = 'Tampered';
      fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    },
  },
  {
    name: 'a modified plugin lockfile',
    apply: (appDir) => {
      const file = path.join(appDir, 'appspine.plugin-lock.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      parsed.resolutionDigest =
        'sha256:0000000000000000000000000000000000000000000000000000000000000000';
      fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    },
  },
  {
    name: 'a modified Prisma fragment inside an installed package',
    apply: (appDir) => {
      const file = path.join(appDir, 'node_modules/@appspine/demo-identity/prisma/user.prisma');
      fs.appendFileSync(file, '\n// changed\n', 'utf8');
    },
  },
  {
    name: 'a changed inventory',
    apply: (appDir) => {
      const file = path.join(appDir, 'appspine.plugins.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      parsed.plugins = parsed.plugins.filter((entry) => !entry.plugin.includes('demo-health'));
      fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    },
  },
];

function runSelfTest() {
  let failed = 0;
  for (const mutation of MUTATIONS) {
    const appDir = materialise();
    try {
      const built = buildIn(appDir);
      if (built.status !== 0) {
        console.log(`FAIL self-test: ${mutation.name} — the baseline build did not succeed`);
        failed += 1;
        continue;
      }
      mutation.apply(appDir);
      const checked = buildIn(appDir, ['--check']);
      const caught = checked.status !== 0;
      if (!caught) failed += 1;
      console.log(`${caught ? 'PASS' : 'FAIL'} self-test: ${mutation.name} is caught`);
    } finally {
      cleanup(appDir);
    }
  }
  console.log(`\n${MUTATIONS.length} self-tests run, ${failed} failed`);
  return failed;
}

if (selfTest) {
  process.exit(runSelfTest() === 0 ? 0 : 1);
}

goldenCheck();
console.log(`\n${findings.length === 0 ? 'generation gate: OK' : `${findings.length} finding(s)`}`);
process.exit(findings.length === 0 ? 0 : 1);
