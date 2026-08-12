#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const registryToken = process.env.GITHUB_TOKEN;
const runNpm = (args) => spawnSync(
  process.platform === 'win32'
    ? process.execPath
    : 'npm',
  process.platform === 'win32'
    ? [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args]
    : args,
  {
    stdio: 'inherit',
  },
);

const result = runNpm([
    'install',
    '--ignore-scripts',
    '--omit=peer',
    '--no-audit',
    '--no-fund',
    '--@appspine:registry=https://npm.pkg.github.com',
    ...(registryToken ? [`--//npm.pkg.github.com/:_authToken=${registryToken}`] : []),
]);
if (result.status !== 0) process.exit(result.status ?? 1);

const generated = runNpm(['exec', '--', 'prisma', 'generate', '--schema', 'prisma/schema.prisma']);
if (generated.status !== 0) process.exit(generated.status ?? 1);

const tree = runNpm(['ls', '--all', '--omit=peer']);
if (tree.status !== 0) process.exit(tree.status ?? 1);
