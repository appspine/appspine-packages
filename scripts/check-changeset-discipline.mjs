#!/usr/bin/env node
// CI guard: if a package's version changes between BASE and HEAD, its
// CHANGELOG.md must change too, and CHANGELOG.md's first "## " heading must
// equal the new version.
//
// This is agnostic to *how* the version was bumped — the changesets/action
// "Version Packages" PR (release.yml) always satisfies it, since
// `changeset version` updates package.json and CHANGELOG.md together. What it
// catches is a version hand-edited directly in package.json without going
// through that flow, which silently orphans any changeset files that were
// supposed to produce that release (see the 033 execution review, 2026-07-22:
// this happened twice to the same package before this check existed).
//
// Usage: node scripts/check-changeset-discipline.mjs [baseRef] (default: HEAD^)
import { execFileSync } from 'node:child_process';

const baseRef = process.argv[2] ?? 'HEAD^';

function sh(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function changedFiles(base) {
  try {
    return sh(['diff', '--name-only', `${base}...HEAD`, '--diff-filter=ACMR'])
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    console.error(`check-changeset-discipline: failed to diff against ${base}:`, error.message);
    process.exit(1);
  }
}

function readAt(ref, path) {
  try {
    return sh(['show', `${ref}:${path}`]);
  } catch {
    return null; // file doesn't exist at that ref
  }
}

function versionOf(content) {
  if (!content) return undefined;
  try {
    return JSON.parse(content).version;
  } catch {
    return undefined;
  }
}

const files = changedFiles(baseRef);
const packageJsonFiles = files.filter((f) => /^packages\/[^/]+\/package\.json$/.test(f));
const failures = [];

for (const pkgJsonPath of packageJsonFiles) {
  const headVersion = versionOf(readAt('HEAD', pkgJsonPath));
  const baseVersion = versionOf(readAt(baseRef, pkgJsonPath));
  if (!headVersion || headVersion === baseVersion) continue;

  const pkgDir = pkgJsonPath.replace(/\/package\.json$/, '');
  const changelogPath = `${pkgDir}/CHANGELOG.md`;

  if (!files.includes(changelogPath)) {
    failures.push(
      `${pkgJsonPath}: version changed (${baseVersion ?? '‹new package›'} -> ${headVersion}) but ` +
        `${changelogPath} did not change in the same range.`,
    );
    continue;
  }

  const changelog = readAt('HEAD', changelogPath) ?? '';
  const heading = changelog.match(/^##\s+(\S+)/m);
  if (!heading || heading[1] !== headVersion) {
    failures.push(
      `${pkgJsonPath}: version is ${headVersion}, but ${changelogPath}'s first "## " heading is ` +
        `${heading ? heading[1] : '‹missing›'}.`,
    );
  }
}

if (failures.length > 0) {
  console.error('\ncheck-changeset-discipline: version bump without a matching CHANGELOG entry:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nDon't hand-edit a package's version. Add a changeset (`pnpm changeset`) and let " +
      'the changesets/action release PR ("Version Packages") bump the version and generate ' +
      'the CHANGELOG entry — or, if intentionally publishing outside that flow, write the ' +
      'CHANGELOG.md entry yourself in the same change.\n',
  );
  process.exit(1);
}
