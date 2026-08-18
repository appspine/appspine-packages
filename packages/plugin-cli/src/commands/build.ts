/**
 * `appspine build [--check]` (PL2-03).
 *
 * `--check` is the same generation, compared instead of written. That is deliberate: a drift check
 * that runs a different code path from the generator can only tell you the two disagree, never
 * which one is right.
 *
 * Generation refuses to run on an inventory that does not resolve. Emitting artefacts from a
 * broken graph would produce files that look authoritative and describe something the App cannot
 * boot — and `doctor` would then be comparing against them.
 *
 * It brings two different kinds of derived state up to date: `.appspine/generated/*`, which is
 * regenerable output nobody reads, and `appspine.plugin-lock.json`, which is committed and read as
 * a diff. One command, because they are derived from the same inputs and a repository where only
 * one of them was refreshed is a repository whose lock describes a graph the App does not run.
 */

import { diagnostic } from '@appspine/plugin-api';
import type { CommandContext, CommandDefinition } from '../cli';
import { compositionPreflight } from '../composition';
import type { CommandResult } from '../diagnostics';
import { ExitCode } from '../exit-codes';
import {
  CATALOG_ARTIFACT,
  detectDrift,
  driftDiagnostic,
  type GenerationInput,
  recordedSourceDigest,
  sourceDigest,
  writeArtifacts,
} from '../generate';
import { generateAll } from '../generators';
import {
  buildLockfile,
  compareLockfile,
  LOCKFILE_NAME,
  readLockfile,
  writeLockfile,
} from '../lockfile';
import { compose } from '../prisma-composer';
import { checkInventory, hasErrors, isLoaded, loadState } from './shared';

export const CLI_TOOL_NAME = '@appspine/plugin-cli';

export const buildCommand: CommandDefinition = {
  name: 'build',
  summary: 'generate .appspine/generated artefacts from the inventory',
  usage: 'appspine build [--check]',
  flags: ['check'],
  handler: build,
};

function build(context: CommandContext): CommandResult {
  const command = 'build';
  const { appRoot, args } = context;

  const state = loadState(appRoot);
  if (!isLoaded(state)) {
    return { command, exitCode: ExitCode.VALIDATION_FAILED, diagnostics: state.diagnostics };
  }
  if (state.manifests.missing.length > 0) {
    return {
      command,
      exitCode: ExitCode.VALIDATION_FAILED,
      diagnostics: [...state.diagnostics, ...state.manifests.diagnostics],
    };
  }

  const checked = checkInventory(state.inventory, state.manifests);
  if (!checked.graph || hasErrors(checked.diagnostics)) {
    return {
      command,
      exitCode: ExitCode.RESOLUTION_FAILED,
      diagnostics: [
        diagnostic(
          'generation-refused',
          'the inventory does not resolve, so no artefacts were generated. Generating from a broken graph would produce files that describe something the App cannot boot',
        ),
        ...checked.diagnostics,
      ],
    };
  }

  const input: GenerationInput = {
    inventory: state.inventory,
    manifests: state.manifests,
    graph: checked.graph,
    generatedBy: { tool: CLI_TOOL_NAME, version: context.version },
  };
  // Compose the Prisma schema first, and refuse before writing anything if it cannot be composed.
  // Emitting a schema with a missing relation field fails much later, inside Prisma, as something
  // that looks unrelated to the plugin that caused it.
  const prisma = compose(input);
  if (prisma.schema === null) {
    return {
      command,
      exitCode: ExitCode.RESOLUTION_FAILED,
      diagnostics: [
        diagnostic(
          'prisma-composition-failed',
          'the installed plugins cannot be composed into one Prisma schema, so nothing was generated',
        ),
        ...prisma.diagnostics,
      ],
    };
  }

  const preflight = [...compositionPreflight(input), ...prisma.diagnostics];
  const artifacts = generateAll(input);
  const expected = sourceDigest(input);
  // The lock records the artefacts' digests, so it has to be built from the same artefact objects
  // that were (or would be) written - not from a second generation pass that could differ.
  const lock = buildLockfile(input, artifacts, state.manifests.packageDirs);

  if (args.flags.get('check') === true) {
    const drift = detectDrift(appRoot, artifacts);
    const lockDiagnostics = compareLockfile(readLockfile(appRoot), lock);

    if (drift.length === 0 && lockDiagnostics.length === 0) {
      return {
        command,
        exitCode: ExitCode.OK,
        diagnostics: [
          diagnostic(
            'artifacts-current',
            `${artifacts.length} artefact(s) and ${LOCKFILE_NAME} up to date`,
            { severity: 'info' },
          ),
        ],
        data: {
          checked: [...artifacts.map((a) => a.path), LOCKFILE_NAME],
          sourceDigest: expected,
          resolutionDigest: lock.resolutionDigest,
        },
      };
    }
    return {
      command,
      exitCode: ExitCode.DRIFT_DETECTED,
      diagnostics: [
        ...drift.map((entry) =>
          driftDiagnostic(entry, expected, recordedSourceDigest(appRoot, entry.path)),
        ),
        ...lockDiagnostics,
      ],
      data: { drift, sourceDigest: expected, lockDrift: lockDiagnostics.map((d) => d.code) },
    };
  }

  const written = writeArtifacts(appRoot, artifacts);
  if (writeLockfile(appRoot, lock)) written.push(LOCKFILE_NAME);

  return {
    command,
    exitCode: ExitCode.OK,
    diagnostics: [
      ...preflight,
      diagnostic(
        'artifacts-written',
        written.length > 0 ? `wrote ${written.join(', ')}` : 'everything was already up to date',
        { severity: 'info' },
      ),
      ...(written.includes(LOCKFILE_NAME)
        ? [
            diagnostic(
              'lockfile-review',
              `${LOCKFILE_NAME} changed. It is committed and reviewed as a diff - read it before merging`,
              { severity: 'info', path: LOCKFILE_NAME },
            ),
          ]
        : []),
    ],
    data: {
      written,
      artifacts: artifacts.map((a) => a.path),
      catalog: CATALOG_ARTIFACT,
      lockfile: LOCKFILE_NAME,
      schemaDigest: prisma.digest,
      migrationPlan: prisma.plan,
      sourceDigest: expected,
      resolutionDigest: lock.resolutionDigest,
    },
  };
}
