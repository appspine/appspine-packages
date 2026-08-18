#!/usr/bin/env node
/**
 * The only place in this package that calls `process.exit` (PL2-01).
 *
 * Everything else returns an exit code, so a test — or a future programmatic caller — can run a
 * command that is supposed to fail without taking the process down with it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runCli } from './cli';
import { ExitCode } from './exit-codes';

function version(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(path.join(__dirname, '../package.json'), 'utf8'),
    ) as { version?: string };
    return packageJson.version ?? '0.0.0-unknown';
  } catch {
    return '0.0.0-unknown';
  }
}

runCli(process.argv.slice(2), { version: version() })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = ExitCode.INTERNAL_ERROR;
  });
