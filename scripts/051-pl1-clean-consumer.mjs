#!/usr/bin/env node
/**
 * PL1-14 — install the Phase 1 packages from real tarballs into an isolated consumer.
 *
 * 051 plan §8.4: "stable publish 前由 template 使用真實 registry tarball 驗證，不得只靠 workspace
 * symlink". A workspace link resolves to `packages/*` on disk, so it happily serves files the
 * package does not publish and dependencies it does not declare — every `files` allowlist and
 * `exports` mistake is invisible until a consumer installs for real.
 *
 * `pnpm pack` (not `npm pack`) because it rewrites `workspace:*` to the concrete version, which is
 * exactly what publishing does. npm `overrides` then pins every transitive `@appspine/*` resolution
 * to the local tarball, so nothing is silently fetched from the registry.
 *
 * Usage:
 *   node scripts/051-pl1-clean-consumer.mjs             # build, pack, install, run
 *   node scripts/051-pl1-clean-consumer.mjs --keep      # leave the temp consumer for inspection
 *   node scripts/051-pl1-clean-consumer.mjs --no-build  # trust the existing dist/ (CI: don't)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const fixtureDir = path.join(repoRoot, 'fixtures/051-pl1-clean-consumer');
const keep = process.argv.includes('--keep');

/** Packed in dependency order; `overrides` makes the order irrelevant to npm, but not to a reader. */
const PACKAGES = [
  'plugin-api',
  'plugin-testkit',
  'plugin-host-nest',
  'common',
  'audit-log',
  'health-check',
  'identity-core',
  'rbac',
  'oidc-auth',
  'auth',
];

/** Peers the consumer must provide itself. Pinned so a range change cannot silently alter the run. */
const RUNTIME_DEPS = {
  '@nestjs/common': '11.1.27',
  '@nestjs/core': '11.1.27',
  '@nestjs/passport': '11.0.5',
  '@nestjs/terminus': '11.1.1',
  '@nestjs/testing': '11.1.27',
  '@prisma/client': '6.19.3',
  express: '5.2.1',
  passport: '0.7.0',
  pino: '10.3.1',
  'pino-http': '11.0.0',
  'reflect-metadata': '0.2.2',
  rxjs: '7.8.2',
  zod: '4.4.3',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    if (options.quiet) process.stdout.write(result.stdout ?? '');
    if (options.quiet) process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
  return result.stdout ?? '';
}

function packAll(destination) {
  const tarballs = new Map();
  for (const name of PACKAGES) {
    const packageDir = path.join(repoRoot, 'packages', name);
    const before = new Set(fs.readdirSync(destination));
    run('pnpm', ['pack', '--pack-destination', destination], { cwd: packageDir, quiet: true });
    const produced = fs.readdirSync(destination).filter((file) => !before.has(file));
    if (produced.length !== 1) {
      throw new Error(`pnpm pack produced ${produced.length} files for ${name}`);
    }
    tarballs.set(`@appspine/${name}`, path.join(destination, produced[0]));
    console.log(`packed @appspine/${name} -> ${produced[0]}`);
  }
  return tarballs;
}

function main() {
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 22) {
    throw new Error(`PL1-14 requires Node >=22; running ${process.version}`);
  }
  console.log(`PL1-14 runtime: ${process.version}`);

  // `pnpm pack` copies whatever is in `dist/` right now. Running this as its own CI step, or after
  // editing a source file, would otherwise verify the *previous* build and report it as green —
  // the "no pre-built local dist illusion" this task exists to prevent (Gate G1 review S8).
  // `tsc -b` is incremental, so the cost is near zero when the tree is already built.
  if (process.argv.includes('--no-build')) {
    console.log('skipping the build: --no-build was passed, so dist/ is taken on trust');
  } else {
    console.log('building the workspace so the tarballs contain the current sources');
    run(
      process.execPath,
      [path.join(repoRoot, 'node_modules/typescript/bin/tsc'), '-b', 'tsconfig.json'],
      {
        cwd: repoRoot,
        shell: false,
      },
    );
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appspine-pl1-consumer-'));
  const tarballDir = path.join(workDir, 'tarballs');
  const consumerDir = path.join(workDir, 'consumer');
  fs.mkdirSync(tarballDir);
  fs.mkdirSync(consumerDir);

  try {
    const tarballs = packAll(tarballDir);

    const fileSpec = (tarball) => `file:${tarball.split(path.sep).join('/')}`;
    const appspineDeps = Object.fromEntries(
      [...tarballs.entries()].map(([name, tarball]) => [name, fileSpec(tarball)]),
    );

    fs.writeFileSync(
      path.join(consumerDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'appspine-051-pl1-clean-consumer',
          private: true,
          type: 'commonjs',
          dependencies: { ...appspineDeps, ...RUNTIME_DEPS },
          // Pins every *transitive* @appspine resolution to the same tarball, so nothing reaches
          // the registry and no two copies of a package can end up in the tree.
          overrides: appspineDeps,
          devDependencies: { prisma: '6.19.3', typescript: '5.9.3' },
          scripts: {
            typecheck: 'tsc --noEmit',
            build: 'tsc',
            test: 'node --test consumer.test.cjs',
            bootstrap: 'node consumer.mjs',
          },
        },
        null,
        2,
      )}\n`,
    );

    fs.mkdirSync(path.join(consumerDir, 'prisma'), { recursive: true });
    fs.copyFileSync(
      path.join(fixtureDir, 'prisma/schema.prisma'),
      path.join(consumerDir, 'prisma/schema.prisma'),
    );
    for (const file of [
      'consumer.mjs',
      'consumer.test.cjs',
      'typecheck-consumer.ts',
      'tsconfig.json',
    ]) {
      fs.copyFileSync(path.join(fixtureDir, file), path.join(consumerDir, file));
    }

    console.log(`\ninstalling into ${consumerDir}`);
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], {
      cwd: consumerDir,
    });

    // `--ignore-scripts` above keeps a tarball from running install hooks (051 plan §9); Prisma's
    // client still has to be generated, so do it explicitly and visibly.
    run('npx', ['prisma', 'generate', '--schema', 'prisma/schema.prisma'], { cwd: consumerDir });

    // `npm ls` renders a linked dependency as `name@version -> ./relative/path`. Finding one would
    // mean a package resolved to the workspace instead of to its tarball, which would make every
    // files/exports assertion in consumer.mjs meaningless.
    const tree = run('npm', ['ls', '--all'], { cwd: consumerDir, quiet: true });
    const linked = tree.split('\n').filter((line) => / -> /.test(line));
    if (linked.length > 0) {
      throw new Error(
        `the consumer tree contains workspace links, so the tarball test is invalid:\n${linked.join('\n')}`,
      );
    }

    console.log('\nrunning consumer typecheck, build, test and bootstrap');
    const tsc = path.join(consumerDir, 'node_modules/typescript/bin/tsc');
    console.log('typecheck');
    run(process.execPath, [tsc, '--noEmit'], { cwd: consumerDir, shell: false });
    console.log('build');
    run(process.execPath, [tsc], { cwd: consumerDir, shell: false });
    console.log('test');
    run(process.execPath, ['--test', 'consumer.test.cjs'], { cwd: consumerDir, shell: false });
    console.log('bootstrap');
    run(process.execPath, ['consumer.mjs'], { cwd: consumerDir, shell: false });

    console.log('\nPL1-14 clean consumer: OK');
  } finally {
    if (keep) {
      console.log(`\nkept: ${workDir}`);
    } else {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}

main();
