/**
 * `appspine validate` and `appspine config-stub <plugin>` (PL2-02).
 *
 * `validate` is the command CI runs. It has to distinguish the two failures a caller reacts to
 * differently, which is why the exit code is not a single "invalid":
 *
 *   VALIDATION_FAILED — an input is malformed. Someone edits a file.
 *   RESOLUTION_FAILED — every input is well-formed but they do not compose. Someone changes what
 *                       is installed or enabled.
 */

import { diagnostic } from '@appspine/plugin-api';
import type { CommandContext, CommandDefinition } from '../cli';
import { configStub } from '../config-boundary';
import type { CommandResult } from '../diagnostics';
import { ExitCode } from '../exit-codes';
import { pluginIdOf, readInventory } from '../inventory-file';
import { readManifestFor, readManifestsFor } from '../manifest-source';
import { checkInventory, hasErrors } from './shared';

export const validateCommand: CommandDefinition = {
  name: 'validate',
  summary: 'check the inventory, its manifests and whether they resolve',
  usage: 'appspine validate [--json]',
  handler: validate,
};

function validate(context: CommandContext): CommandResult {
  const command = 'validate';
  const { appRoot } = context;

  const read = readInventory(appRoot);
  if (!read.ok) {
    return { command, exitCode: ExitCode.VALIDATION_FAILED, diagnostics: read.diagnostics };
  }

  const manifests = readManifestsFor(
    appRoot,
    read.inventory.plugins.map((entry) => entry.plugin),
  );

  // A missing or malformed manifest is a *validation* failure, not a resolution one: nothing was
  // composed yet, and the fix is to install or correct a package rather than to change the graph.
  if (manifests.missing.length > 0) {
    return {
      command,
      exitCode: ExitCode.VALIDATION_FAILED,
      diagnostics: [...read.diagnostics, ...manifests.diagnostics],
      data: { missing: manifests.missing },
    };
  }

  const checked = checkInventory(read.inventory, manifests);
  const diagnostics = [...read.diagnostics, ...manifests.diagnostics, ...checked.diagnostics];

  if (hasErrors(diagnostics)) {
    return { command, exitCode: ExitCode.RESOLUTION_FAILED, diagnostics };
  }

  return {
    command,
    exitCode: ExitCode.OK,
    diagnostics: [
      ...diagnostics,
      diagnostic(
        'validated',
        `${read.inventory.plugins.length} entrie(s) valid; ${checked.graph?.order.length ?? 0} instance(s) resolve`,
        { severity: 'info' },
      ),
    ],
    data: {
      order: checked.graph?.order ?? null,
      resolutionDigest: checked.graph?.digest ?? null,
    },
  };
}

export const configStubCommand: CommandDefinition = {
  name: 'config-stub',
  summary: 'print a typed appspine.config.ts block for a plugin, to paste yourself',
  usage: 'appspine config-stub <plugin>',
  handler: (context) => {
    const command = 'config-stub';
    const ref = context.args.positionals[0];
    if (!ref) {
      return {
        command,
        exitCode: ExitCode.USAGE,
        diagnostics: [diagnostic('missing-argument', `usage: ${configStubCommand.usage}`)],
      };
    }

    const manifest = readManifestFor(context.appRoot, ref);
    if (!manifest.ok) {
      return { command, exitCode: ExitCode.NOT_FOUND, diagnostics: manifest.diagnostics };
    }

    const stub = configStub(manifest.loaded.manifest);
    // Printed, never applied. 051 plan §7: the CLI does not rewrite arbitrary TypeScript, so the
    // developer reviews this and pastes it. That is the whole mechanism, not a missing feature.
    context.io.stdout(stub);

    return {
      command,
      exitCode: ExitCode.OK,
      diagnostics: [
        diagnostic(
          'stub-printed',
          `paste the block above into appspine.config.ts. The CLI will not edit it for you`,
          { severity: 'info', pluginId: pluginIdOf(ref) },
        ),
      ],
      data: { stub },
    };
  },
};
