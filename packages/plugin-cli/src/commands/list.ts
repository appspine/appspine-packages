/**
 * `appspine list [--json]` (PL2-02).
 *
 * Read-only, and it never fails because the inventory is unresolvable — an operator reaching for
 * `list` is usually trying to find out *why* something is broken, and a command that refuses to
 * show them the state is useless at exactly that moment. Problems come back as diagnostics with a
 * non-zero exit code, alongside the listing.
 */

import { diagnostic } from '@appspine/plugin-api';
import type { CommandContext, CommandDefinition } from '../cli';
import type { CommandResult } from '../diagnostics';
import { ExitCode } from '../exit-codes';
import { pluginIdOf } from '../inventory-file';
import { checkInventory, hasErrors, isLoaded, loadState } from './shared';

export const listCommand: CommandDefinition = {
  name: 'list',
  summary: 'show the inventory and what it resolves to',
  usage: 'appspine list [--json]',
  handler: list,
};

interface ListedEntry {
  plugin: string;
  pluginId: string;
  instanceId: string;
  enabled: boolean;
  required: boolean;
  configRef?: string;
  packageVersion: string | null;
  provides: string[];
  requires: string[];
  /** `resolved` | `disabled` | `unresolved` | `manifest-missing` */
  status: string;
}

function list(context: CommandContext): CommandResult {
  const command = 'list';
  const state = loadState(context.appRoot);
  if (!isLoaded(state)) {
    return { command, exitCode: ExitCode.VALIDATION_FAILED, diagnostics: state.diagnostics };
  }

  const checked = checkInventory(state.inventory, state.manifests);
  const resolvedKeys = new Set(checked.graph?.order ?? []);

  const entries: ListedEntry[] = state.inventory.plugins
    .map((entry) => {
      const loaded = state.manifests.byRef.get(entry.plugin);
      const pluginId = loaded?.manifest.id ?? pluginIdOf(entry.plugin);
      const key = entry.instanceId === 'default' ? pluginId : `${pluginId}#${entry.instanceId}`;
      return {
        plugin: entry.plugin,
        pluginId,
        instanceId: entry.instanceId,
        enabled: entry.enabled,
        required: entry.required,
        ...(entry.configRef ? { configRef: entry.configRef } : {}),
        packageVersion: loaded?.packageVersion ?? null,
        provides: loaded ? [...loaded.manifest.provides] : [],
        requires: loaded ? [...loaded.manifest.requires] : [],
        status: !loaded
          ? 'manifest-missing'
          : !entry.enabled
            ? 'disabled'
            : resolvedKeys.has(key)
              ? 'resolved'
              : 'unresolved',
      };
    })
    .sort((a, b) => {
      const left = [a.pluginId, a.instanceId].join(' ');
      const right = [b.pluginId, b.instanceId].join(' ');
      return left < right ? -1 : left > right ? 1 : 0;
    });

  const rendered = entries.map(
    (entry) =>
      `${entry.status.padEnd(16)} ${entry.pluginId}#${entry.instanceId} ${
        entry.packageVersion ?? '(version unknown)'
      }${entry.required ? '' : ' [optional]'}`,
  );

  const diagnostics = [
    ...state.diagnostics,
    ...checked.diagnostics,
    diagnostic(
      'inventory-listing',
      rendered.length > 0 ? `\n${rendered.join('\n')}` : 'the inventory is empty',
      { severity: 'info' },
    ),
  ];

  return {
    command,
    exitCode: hasErrors(diagnostics) ? ExitCode.RESOLUTION_FAILED : ExitCode.OK,
    diagnostics,
    data: {
      entries,
      order: checked.graph?.order ?? null,
      resolutionDigest: checked.graph?.digest ?? null,
    },
  };
}
