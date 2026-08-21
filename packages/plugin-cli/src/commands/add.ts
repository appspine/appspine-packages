/**
 * `appspine add <package> [--instance-id <id>] [--optional] [--dry-run]` (PL2-02).
 *
 * 051 plan §7 gives `plugin add` six steps. This command owns the first three and refuses to
 * proceed without them: read the manifest without executing anything, check engine / dependency /
 * conflict / provenance, then update the package dependency and the inventory. Steps 4–6 —
 * generated artefacts, the plugin lockfile, consumer typecheck — belong to PL2-03 / PL2-04 /
 * PL2-05 and are named in the output rather than silently skipped.
 */

import { DEFAULT_INSTANCE_ID, diagnostic, type PluginDiagnostic } from '@appspine/plugin-api';
import type { CommandContext, CommandDefinition } from '../cli';
import type { CommandResult } from '../diagnostics';
import { ExitCode } from '../exit-codes';
import { type InventoryFile, pluginIdOf } from '../inventory-file';
import { readManifestFor } from '../manifest-source';
import {
  applyPlan,
  type ChangePlan,
  inventoryChange,
  packageJsonChange,
  renderPlan,
} from '../plan';
import { checkInventory, hasErrors, isLoaded, loadState } from './shared';

export const addCommand: CommandDefinition = {
  name: 'add',
  summary: 'add a plugin instance to appspine.plugins.json',
  usage: 'appspine add <package> [--instance-id <id>] [--optional] [--dry-run]',
  flags: ['instance-id', 'optional', 'dry-run'],
  handler: add,
};

function add(context: CommandContext): CommandResult {
  const { appRoot, args } = context;
  const ref = args.positionals[0];
  const command = 'add';

  if (!ref) {
    return {
      command,
      exitCode: ExitCode.USAGE,
      diagnostics: [
        diagnostic('missing-argument', `usage: ${addCommand.usage}`, { severity: 'error' }),
      ],
    };
  }

  const state = loadState(appRoot);
  if (!isLoaded(state)) {
    return { command, exitCode: ExitCode.VALIDATION_FAILED, diagnostics: state.diagnostics };
  }

  // Step 1: read the manifest. No package, no add — the CLI will not write an entry for a plugin
  // it has never been able to look at.
  const manifest = readManifestFor(appRoot, ref);
  if (!manifest.ok) {
    // "there is no such package" and "the package is there but its manifest is wrong" need
    // different responses - install something, versus fix or report a bug against the plugin.
    const notFound = manifest.diagnostics.some(
      (entry) => entry.code === 'plugin-package-not-found',
    );
    return {
      command,
      exitCode: notFound ? ExitCode.NOT_FOUND : ExitCode.VALIDATION_FAILED,
      diagnostics: manifest.diagnostics,
    };
  }

  const instanceId =
    typeof args.flags.get('instance-id') === 'string'
      ? (args.flags.get('instance-id') as string)
      : DEFAULT_INSTANCE_ID;
  const optional = args.flags.get('optional') === true;

  const existing = state.inventory.plugins.find(
    (entry) =>
      pluginIdOf(entry.plugin) === manifest.loaded.manifest.id && entry.instanceId === instanceId,
  );
  if (existing) {
    // Idempotent by refusal, not by silent no-op: an operator who typed this twice should be told
    // the second one did nothing, and a script should be able to tell "already there" from "added".
    return {
      command,
      exitCode: ExitCode.CONFLICT,
      diagnostics: [
        diagnostic(
          'instance-already-present',
          `"${manifest.loaded.manifest.id}" instance "${instanceId}" is already in the inventory`,
          { pluginId: manifest.loaded.manifest.id, instanceId },
        ),
      ],
      data: { added: false },
    };
  }

  if (optional && !manifest.loaded.manifest.optionalFailurePolicy) {
    // 051 plan §9: without a declared degraded behaviour there is nothing for the host to fall
    // back to, so "optional" would mean "fail silently".
    return {
      command,
      exitCode: ExitCode.VALIDATION_FAILED,
      diagnostics: [
        diagnostic(
          'optional-without-policy',
          `"${manifest.loaded.manifest.id}" declares no optionalFailurePolicy, so it cannot be added as optional`,
          { pluginId: manifest.loaded.manifest.id, instanceId },
        ),
      ],
    };
  }

  const configRef = manifest.loaded.manifest.configSchema?.configRef;
  const next: InventoryFile = {
    ...state.declared,
    plugins: [
      ...state.declared.plugins,
      {
        plugin: manifest.loaded.packageName,
        instanceId,
        enabled: true,
        required: !optional,
        ...(configRef ? { configRef } : {}),
      },
    ],
  };

  // Step 2: the candidate must survive the same checks `validate` applies to a committed file.
  const manifestsWithNew = {
    ...state.manifests,
    packageDirs: new Map(state.manifests.packageDirs),
    byRef: new Map(state.manifests.byRef).set(manifest.loaded.packageName, manifest.loaded),
    byPluginId: new Map(state.manifests.byPluginId).set(
      manifest.loaded.manifest.id,
      manifest.loaded.manifest,
    ),
  };
  const checked = checkInventory(next, manifestsWithNew);
  if (hasErrors(checked.diagnostics)) {
    return {
      command,
      exitCode: ExitCode.RESOLUTION_FAILED,
      diagnostics: checked.diagnostics,
      data: { added: false },
    };
  }

  // Step 3: the two declarative files, and only those.
  const changes = [inventoryChange(appRoot, state.declared, next)];
  const dependency = packageJsonChange(
    appRoot,
    manifest.loaded.packageName,
    `^${manifest.loaded.packageVersion}`,
  );
  if (dependency) changes.push(dependency);

  const plan: ChangePlan = {
    summary: `add ${manifest.loaded.manifest.id}#${instanceId}`,
    changes,
    diagnostics: checked.diagnostics,
  };

  const followUps = nextSteps(manifest.loaded.manifest.id, dependency !== null, configRef);
  const dryRun = args.flags.get('dry-run') === true;

  if (dryRun) {
    return {
      command,
      exitCode: ExitCode.OK,
      diagnostics: [
        ...plan.diagnostics,
        diagnostic('dry-run', `would ${plan.summary}`, { severity: 'info' }),
        ...followUps,
      ],
      data: { added: false, dryRun: true, plan: planData(plan), diff: renderPlan(plan) },
    };
  }

  const written = applyPlan(appRoot, plan);
  return {
    command,
    exitCode: ExitCode.OK,
    diagnostics: [...plan.diagnostics, ...followUps],
    data: { added: true, written, plan: planData(plan), diff: renderPlan(plan) },
  };
}

/**
 * The steps this command deliberately does not take.
 *
 * Naming them is the point: an operator who reads "added" and assumes the App is ready to boot has
 * been misled, and the install is an external action the CLI must not perform on its own.
 */
function nextSteps(
  pluginId: string,
  dependencyAdded: boolean,
  configRef: string | undefined,
): PluginDiagnostic[] {
  const steps: PluginDiagnostic[] = [];
  if (dependencyAdded) {
    steps.push(
      diagnostic(
        'install-required',
        'package.json changed: run your package manager to install it. The CLI never runs it for you',
        { severity: 'info' },
      ),
    );
  }
  if (configRef) {
    steps.push(
      diagnostic(
        'config-stub-pending',
        `"${pluginId}" reads config at "${configRef}". Run \`appspine config-stub ${pluginId}\` and paste the block into appspine.config.ts yourself — the CLI does not rewrite TypeScript`,
        { severity: 'info', pluginId },
      ),
    );
  }
  return steps;
}

export function planData(plan: ChangePlan) {
  return {
    summary: plan.summary,
    files: plan.changes
      .filter((change) => change.before !== change.after)
      .map((change) => change.file),
  };
}
