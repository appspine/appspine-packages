/**
 * The command table (PL2-02, extended by PL2-03).
 *
 * `runCli` takes this rather than importing it, so a test can run the shell with a subset. PL2-03
 * added `build` and `doctor` here without touching the shell, which is what that was for.
 */

import type { CommandDefinition } from '../cli';
import { addCommand } from './add';
import { buildCommand } from './build';
import { doctorCommand } from './doctor';
import { listCommand } from './list';
import { removeCommand } from './remove';
import { configStubCommand, validateCommand } from './validate';

export const COMMANDS: readonly CommandDefinition[] = [
  addCommand,
  removeCommand,
  listCommand,
  validateCommand,
  buildCommand,
  doctorCommand,
  configStubCommand,
];

export * from './shared';
export {
  addCommand,
  buildCommand,
  configStubCommand,
  doctorCommand,
  listCommand,
  removeCommand,
  validateCommand,
};
