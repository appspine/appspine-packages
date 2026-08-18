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
 */

import { diagnostic } from '@appspine/plugin-api';
import type { CommandContext, CommandDefinition } from '../cli';
import type { CommandResult } from '../diagnostics';
import { ExitCode } from '../exit-codes';
import {
  CATALOG_ARTIFACT,
  detectDrift,
  driftDiagnostic,
  type GenerationInput,
  generateAll,
  recordedSourceDigest,
  sourceDigest,
  writeArtifacts,
} from '../generate';
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
  const artifacts = generateAll(input);
  const expected = sourceDigest(input);

  if (args.flags.get('check') === true) {
    const drift = detectDrift(appRoot, artifacts);
    if (drift.length === 0) {
      return {
        command,
        exitCode: ExitCode.OK,
        diagnostics: [
          diagnostic('artifacts-current', `${artifacts.length} artefact(s) up to date`, {
            severity: 'info',
          }),
        ],
        data: { checked: artifacts.map((a) => a.path), sourceDigest: expected },
      };
    }
    return {
      command,
      exitCode: ExitCode.DRIFT_DETECTED,
      diagnostics: drift.map((entry) =>
        driftDiagnostic(entry, expected, recordedSourceDigest(appRoot, entry.path)),
      ),
      data: { drift, sourceDigest: expected },
    };
  }

  const written = writeArtifacts(appRoot, artifacts);
  return {
    command,
    exitCode: ExitCode.OK,
    diagnostics: [
      diagnostic(
        'artifacts-written',
        written.length > 0
          ? `wrote ${written.join(', ')}`
          : 'all artefacts were already up to date',
        { severity: 'info' },
      ),
    ],
    data: {
      written,
      artifacts: artifacts.map((a) => a.path),
      catalog: CATALOG_ARTIFACT,
      sourceDigest: expected,
    },
  };
}
