#!/usr/bin/env node
// PL0-07 (051-plugin-platform-engineering-task-breakdown.md): one-shot codemod that adds
// TypeScript project references to every package's tsconfig.build.json (composite:true +
// references to local @appspine/* deps) and writes a root solution tsconfig.json. Derives
// the reference graph from fixtures/051-pl0-baseline/snapshot.json's
// `localWorkspaceDependencyUnion` (PL0-02), which PL0-02's summary doc already verified has
// zero drift against actual `packages/*/src` cross-package imports.
//
// Idempotent: re-running after the graph changes (new package, new dependency) regenerates
// the same output deterministically. Only touches `references`/`composite` — does not
// touch any other compilerOptions, scripts, or the build/typecheck/test command surface.

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const snapshot = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'fixtures/051-pl0-baseline/snapshot.json'), 'utf8'),
);

const nameToDir = {};
for (const [name, info] of Object.entries(snapshot.packages)) {
  nameToDir[name] = info.dir.replace(/^packages\//, '');
}
const packageNames = Object.keys(nameToDir).sort();

for (const name of packageNames) {
  const dir = nameToDir[name];
  const tsconfigBuildPath = path.join(repoRoot, 'packages', dir, 'tsconfig.build.json');
  const tsconfigBuild = JSON.parse(fs.readFileSync(tsconfigBuildPath, 'utf8'));

  const localDeps = Object.keys(snapshot.packages[name].localWorkspaceDependencyUnion).sort();
  const references = localDeps.map((depName) => ({
    path: `../${nameToDir[depName]}/tsconfig.build.json`,
  }));

  tsconfigBuild.compilerOptions ??= {};
  tsconfigBuild.compilerOptions.composite = true;
  // Explicit (not strictly required — this is composite's actual default location) so the
  // choice is visible and never accidentally moved into dist/: every package's `files`
  // allowlist publishes the whole dist/ directory, and a .tsbuildinfo inside it would ship
  // in every tarball (caught by Gate G0 independent review via `npm pack --dry-run`).
  // Kept out of dist/, gitignored via `*.tsbuildinfo` instead — clean-build verification
  // must delete these explicitly, `rm -rf packages/*/dist` alone will not remove them.
  tsconfigBuild.compilerOptions.tsBuildInfoFile = './tsconfig.build.tsbuildinfo';
  if (references.length > 0) {
    tsconfigBuild.references = references;
  } else {
    delete tsconfigBuild.references;
  }

  fs.writeFileSync(tsconfigBuildPath, `${JSON.stringify(tsconfigBuild, null, 2)}\n`, 'utf8');
  console.log(`updated packages/${dir}/tsconfig.build.json (${references.length} reference(s))`);
}

const rootTsconfig = {
  files: [],
  references: packageNames.map((name) => ({
    path: `packages/${nameToDir[name]}/tsconfig.build.json`,
  })),
};
fs.writeFileSync(
  path.join(repoRoot, 'tsconfig.json'),
  `${JSON.stringify(rootTsconfig, null, 2)}\n`,
  'utf8',
);
console.log(
  `wrote root tsconfig.json (${rootTsconfig.references.length} reference(s), solution-style, no direct compilation)`,
);
