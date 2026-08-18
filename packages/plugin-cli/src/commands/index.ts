/**
 * The command table (PL2-02).
 *
 * `runCli` takes this rather than importing it, so a test can run the shell with a subset — and so
 * PL2-03 can add `build` and `doctor` here without touching the shell at all.
 */

import type { CommandDefinition } from '../cli';
import { addCommand } from './add';
import { listCommand } from './list';
import { removeCommand } from './remove';
import { configStubCommand, validateCommand } from './validate';

export const COMMANDS: readonly CommandDefinition[] = [
  addCommand,
  removeCommand,
  listCommand,
  validateCommand,
  configStubCommand,
];

export * from './shared';
export { addCommand, configStubCommand, listCommand, removeCommand, validateCommand };
