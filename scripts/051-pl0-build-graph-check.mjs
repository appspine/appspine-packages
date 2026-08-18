#!/usr/bin/env node
// PL0-07 (051-plugin-platform-engineering-task-breakdown.md) verification: cross-checks
// that TypeScript project references (packages/*/tsconfig.build.json `references`),
// package.json local dependency declarations, and actual `packages/*/src` cross-package
// imports all agree. Re-run after any dependency or tsconfig change; PL1-07 builds a fuller
// architecture checker (peers, forbidden paths, manifest requirements) on top of this.
//
// Gate G0 independent review (2026-08-18) found the first version of this script compared
// fixtures/051-pl0-baseline/snapshot.json against itself — both "declared dependencies" and
// "actual imports" were read from the same generated file, so a bug in the snapshot
// generator could never be caught here. This version re-derives both directly from
// packages/*/package.json and packages/*/src on every run — it does not read snapshot.json
// at all, and is independent of whether that file is stale or regenerated.

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');
const packageDirNames = fs.readdirSync(packagesDir).sort();

const dirToName = {};
const nameToDir = {};
for (const dirName of packageDirNames) {
  const pkgJsonPath = path.join(packagesDir, dirName, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  dirToName[dirName] = pkg.name;
  nameToDir[pkg.name] = dirName;
}

function walkTsFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(fullPath, results);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) results.push(fullPath);
  }
  return results;
}

/**
 * Anchored to a line that actually starts an import or export clause, and bounded by the
 * first semicolon.
 *
 * The unanchored version matched `from '@appspine/x'` anywhere - including inside string
 * literals. It made `plugin-cli` look like it imported `@appspine/plugin-host-nest` because a
 * code *generator* emits that import as text, and like it imported three plugin packages
 * because its specs assert on the generated output. Neither is a dependency.
 */
const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)[^;]*?from\s+['"]@appspine\/([a-zA-Z0-9._-]+)(?:\/[^'"]*)?['"]/g;

/**
 * Comments are prose about code. A `from '@appspine/x'` inside one is documentation, not a
 * dependency, and counting it makes this scan disagree with the compiler.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

let failed = 0;
let checked = 0;
function report(label, ok, detail) {
  checked++;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

for (const dirName of packageDirNames) {
  const pkgName = dirToName[dirName];
  if (!pkgName) continue;

  // Declared: independently read from this package's own package.json (dependencies +
  // peerDependencies + devDependencies), not from any generated snapshot.
  const pkg = JSON.parse(fs.readFileSync(path.join(packagesDir, dirName, 'package.json'), 'utf8'));
  const declaredDeps = new Set(
    Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies }).filter(
      (n) => n.startsWith('@appspine/'),
    ),
  );

  // Actual: independently re-scan this package's own src/ for @appspine/* imports.
  //
  // Split into build imports and test-only imports (PL1-02 made this matter): tsconfig.build.json
  // excludes `*.spec.ts` and `test-support.ts`, so a project reference for a package that only the
  // specs import would be an unused reference — and demanding one would force a build edge that
  // does not exist. package.json must still declare both, which the third check below covers.
  const actualImports = new Set();
  const testOnlyImports = new Set();
  for (const file of walkTsFiles(path.join(packagesDir, dirName, 'src'))) {
    const isTestFile = /\.(spec|test)\.tsx?$/.test(file) || /[\\/]test-support\.ts$/.test(file);
    const content = stripComments(fs.readFileSync(file, 'utf8'));
    let match = IMPORT_PATTERN.exec(content);
    while (match) {
      const toPkg = `@appspine/${match[1]}`;
      if (toPkg !== pkgName) (isTestFile ? testOnlyImports : actualImports).add(toPkg);
      match = IMPORT_PATTERN.exec(content);
    }
  }
  const allImports = new Set([...actualImports, ...testOnlyImports]);

  // TS references: read from this package's own tsconfig.build.json.
  const tsconfigBuildPath = path.join(packagesDir, dirName, 'tsconfig.build.json');
  const tsconfigBuild = JSON.parse(fs.readFileSync(tsconfigBuildPath, 'utf8'));
  const tsReferencedPkgs = new Set(
    (tsconfigBuild.references ?? [])
      .map((r) =>
        path.basename(path.dirname(path.resolve(path.dirname(tsconfigBuildPath), r.path))),
      )
      .map((d) => dirToName[d])
      .filter(Boolean),
  );

  const missingFromReferences = [...actualImports].filter((p) => !tsReferencedPkgs.has(p));
  const extraInReferences = [...tsReferencedPkgs].filter((p) => !actualImports.has(p));
  const missingFromPackageJson = [...allImports].filter((p) => !declaredDeps.has(p));

  report(
    `${pkgName}: tsconfig references cover every actual import`,
    missingFromReferences.length === 0,
    missingFromReferences.join(', '),
  );
  report(
    `${pkgName}: tsconfig references have no unused entries`,
    extraInReferences.length === 0,
    extraInReferences.join(', '),
  );
  report(
    `${pkgName}: package.json declares every actual import`,
    missingFromPackageJson.length === 0,
    missingFromPackageJson.join(', '),
  );
  report(`${pkgName}: composite is enabled`, tsconfigBuild.compilerOptions?.composite === true);
}

console.log(`\n${checked} checks run, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
