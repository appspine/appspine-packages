#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const packagesDir = path.resolve(process.cwd(), 'packages');
const pkgs = fs
  .readdirSync(packagesDir)
  .filter((p) => fs.statSync(path.join(packagesDir, p)).isDirectory());

console.log(
  '| Package | Local Version | Remote Canary Version | Remote Dist-Tags | Target Stable Version |',
);
console.log('|---|---|---|---|---|');

for (const pkg of pkgs) {
  const pkgJsonPath = path.join(packagesDir, pkg, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const name = pkgJson.name;
  const localVer = pkgJson.version;

  let distTagsStr = 'unknown';
  let canaryVer = 'none';

  try {
    const rawTags = execSync(
      `npm view ${name} dist-tags --registry=https://npm.pkg.github.com --json`,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    const distTags = JSON.parse(rawTags);
    distTagsStr = Object.entries(distTags)
      .map(([t, v]) => `${t}: ${v}`)
      .join(', ');
    canaryVer = distTags.canary || 'none';
  } catch (_err) {
    distTagsStr = 'fetch error / not published';
  }

  // Determine target stable version: if local is 2.0.0 (semver) and canary is 2.0.0, target stable is 2.0.0
  const targetStable = localVer.replace(/-canary.*$/, '');

  console.log(
    `| \`${name}\` | \`${localVer}\` | \`${canaryVer}\` | \`${distTagsStr}\` | \`${targetStable}\` |`,
  );
}
