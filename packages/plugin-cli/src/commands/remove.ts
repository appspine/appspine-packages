/**
 * `appspine remove <plugin> [--instance-id <id>] [--dry-run]` (PL2-02).
 *
 * Removing is the direction where a mistake is expensive, so the refusal is the interesting part:
 * the CLI resolves the inventory *without* the entry and declines if anything still enabled needs
 * a capability only that entry provided. Discovering that at the next deploy instead is the
 * failure this command exists to prevent.
 *
 * It leaves `package.json` alone. Uninstalling is a separate decision — the same package may still
 * be a transitive dependency, or wanted for a re-add tomorrow — and 051 decision 13 is explicit
 * that removing a plugin never removes its data either.
 */

import { DEFAULT_INSTANCE_ID, diagnostic } from '@appspine/plugin-api';
import type { CommandContext, CommandDefinition } from '../cli';
import type { CommandResult } from '../diagnostics';
import { ExitCode } from '../exit-codes';
import { type InventoryFile, pluginIdOf } from '../inventory-file';
import { applyPlan, type ChangePlan, inventoryChange, renderPlan } from '../plan';
import { planData } from './add';
import { checkInventory, hasErrors, isLoaded, loadState } from './shared';

export const removeCommand: CommandDefinition = {
  name: 'remove',
  summary: 'remove a plugin instance from appspine.plugins.json',
  usage: 'appspine remove <plugin> [--instance-id <id>] [--dry-run]',
  flags: ['instance-id', 'dry-run'],
  handler: remove,
};

function remove(context: CommandContext): CommandResult {
  const { appRoot, args } = context;
  const command = 'remove';
  const ref = args.positionals[0];

  if (!ref) {
    return {
      command,
      exitCode: ExitCode.USAGE,
      diagnostics: [diagnostic('missing-argument', `usage: ${removeCommand.usage}`)],
    };
  }

  const state = loadState(appRoot);
  if (!isLoaded(state)) {
    return { command, exitCode: ExitCode.VALIDATION_FAILED, diagnostics: state.diagnostics };
  }

  const instanceId =
    typeof args.flags.get('instance-id') === 'string'
      ? (args.flags.get('instance-id') as string)
      : DEFAULT_INSTANCE_ID;
  const targetId = pluginIdOf(ref);
  const target = state.inventory.plugins.find(
    (entry) => pluginIdOf(entry.plugin) === targetId && entry.instanceId === instanceId,
  );

  if (!target) {
    return {
      command,
      exitCode: ExitCode.NOT_FOUND,
      diagnostics: [
        diagnostic(
          'instance-not-found',
          `no inventory entry for "${targetId}" instance "${instanceId}"`,
          { pluginId: targetId, instanceId },
        ),
      ],
      data: { removed: false },
    };
  }

  const next: InventoryFile = {
    ...state.declared,
    plugins: state.declared.plugins.filter((entry) => entry !== target),
  };

  const checked = checkInventory(next, state.manifests);
  if (hasErrors(checked.diagnostics)) {
    // The remaining inventory no longer resolves, so this removal is refused rather than applied
    // and reported. The resolver's own diagnostics say which capability went missing.
    return {
      command,
      exitCode: ExitCode.CONFLICT,
      diagnostics: [
        diagnostic(
          'removal-breaks-inventory',
          `removing "${targetId}#${instanceId}" leaves the inventory unresolvable; disable the plugins that depend on it first`,
          { pluginId: targetId, instanceId },
        ),
        ...checked.diagnostics,
      ],
      data: { removed: false },
    };
  }

  const plan: ChangePlan = {
    summary: `remove ${targetId}#${instanceId}`,
    changes: [inventoryChange(appRoot, state.declared, next)],
    diagnostics: checked.diagnostics,
  };

  const dataNote = diagnostic(
    'data-retained',
    'Removing a plugin does not delete its data or its Prisma tables (051 decision 13). Dropping them is a separate, reviewed migration',
    { severity: 'info', pluginId: targetId },
  );

  if (args.flags.get('dry-run') === true) {
    return {
      command,
      exitCode: ExitCode.OK,
      diagnostics: [
        ...plan.diagnostics,
        diagnostic('dry-run', `would ${plan.summary}`, { severity: 'info' }),
        dataNote,
      ],
      data: { removed: false, dryRun: true, plan: planData(plan), diff: renderPlan(plan) },
    };
  }

  const written = applyPlan(appRoot, plan);
  return {
    command,
    exitCode: ExitCode.OK,
    diagnostics: [...plan.diagnostics, dataNote],
    data: { removed: true, written, plan: planData(plan), diff: renderPlan(plan) },
  };
}
