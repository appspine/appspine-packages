/**
 * `appspine doctor` (PL2-03).
 *
 * 051 plan §7 lists what this has to report. Every item is answerable from the manifests, the
 * inventory and the *names* of the environment keys — never from a value, never by booting the
 * App, never by loading a plugin.
 *
 * The vocabulary is shared with the host on purpose. `enabled` / `disabled` are inventory facts,
 * so `doctor` reports them; `failed` / `degraded` are boot outcomes, so it reports them as
 * "unknown until boot" rather than guessing. A tool that says "degraded" when it has not run the
 * lifecycle is a tool whose output nobody can act on.
 */

import { diagnostic, type PluginDiagnostic } from '@appspine/plugin-api';
import type { CommandContext, CommandDefinition } from '../cli';
import type { CommandResult } from '../diagnostics';
import { ExitCode } from '../exit-codes';
import {
  CATALOG_ARTIFACT,
  detectDrift,
  driftDiagnostic,
  type GenerationInput,
  recordedSourceDigest,
  sourceDigest,
} from '../generate';
import { generateAll } from '../generators';
import { buildLockfile, compareLockfile, readLockfile } from '../lockfile';
import { presetSummary } from '../preset';
import { CLI_TOOL_NAME } from './build';
import { checkInventory, hasErrors, isLoaded, loadState } from './shared';

export const doctorCommand: CommandDefinition = {
  name: 'doctor',
  summary: 'report everything wrong with the current plugin setup',
  usage: 'appspine doctor [--json]',
  handler: doctor,
};

interface DoctorEntry {
  key: string;
  pluginId: string;
  packageName: string;
  packageVersion: string;
  /** Inventory-level state. Boot-level state (`failed`, `degraded`) is not knowable here. */
  state: 'enabled' | 'disabled' | 'unresolved' | 'manifest-missing';
  required: boolean;
  runtimeState: 'unknown-until-boot';
  missingEnvKeys: string[];
  unresolvedOptional: string[];
}

function doctor(context: CommandContext): CommandResult {
  const command = 'doctor';
  const { appRoot } = context;
  const diagnostics: PluginDiagnostic[] = [];

  const state = loadState(appRoot);
  if (!isLoaded(state)) {
    return { command, exitCode: ExitCode.VALIDATION_FAILED, diagnostics: state.diagnostics };
  }
  diagnostics.push(...state.diagnostics);

  if (state.inventory.presets && state.inventory.presets.length > 0) {
    diagnostics.push(
      diagnostic(
        'preset-expansion-unavailable',
        `inventory declares preset(s) ${state.inventory.presets.join(', ')}, which cannot be expanded yet (051 PL2-08). Everything below ignores them, so it is incomplete`,
        { path: 'presets' },
      ),
    );
  }

  const checked = checkInventory(state.inventory, state.manifests);
  diagnostics.push(...checked.diagnostics);

  const resolvedKeys = new Set(checked.graph?.order ?? []);
  const entries: DoctorEntry[] = [];

  for (const entry of state.inventory.plugins) {
    const loaded = state.manifests.byRef.get(entry.plugin);
    const pluginId = loaded?.manifest.id ?? entry.plugin;
    const key = entry.instanceId === 'default' ? pluginId : `${pluginId}#${entry.instanceId}`;
    const resolved = checked.graph?.instances.find((instance) => instance.key === key);

    // Presence only. `process.env[key]` is never read — 051 plan §7: report the *name* of a
    // missing key, never a value, and never require a production secret to validate a config.
    const missingEnvKeys = (loaded?.manifest.environment ?? [])
      .filter((env) => env.required && !(env.key in process.env))
      .map((env) => env.key)
      .sort();

    entries.push({
      key,
      pluginId,
      packageName: loaded?.packageName ?? entry.plugin,
      packageVersion: loaded?.packageVersion ?? 'unknown',
      state: !loaded
        ? 'manifest-missing'
        : !entry.enabled
          ? 'disabled'
          : resolvedKeys.has(key)
            ? 'enabled'
            : 'unresolved',
      required: entry.required,
      runtimeState: 'unknown-until-boot',
      missingEnvKeys,
      unresolvedOptional: resolved ? [...resolved.unresolvedOptional] : [],
    });

    for (const missing of missingEnvKeys) {
      diagnostics.push(
        diagnostic('missing-required-env-key', `"${pluginId}" requires ${missing} to be set`, {
          pluginId,
          instanceId: entry.instanceId,
          severity: entry.enabled ? 'error' : 'warning',
        }),
      );
    }
  }

  // Generated-artefact drift, but only when the graph is good enough to generate from. Reporting
  // drift against a broken resolution would blame the artefacts for the inventory's problem.
  let drift: { path: string; reason: string }[] = [];
  let lockDiagnostics: PluginDiagnostic[] = [];
  if (checked.graph && state.manifests.missing.length === 0 && !hasErrors(checked.diagnostics)) {
    const input: GenerationInput = {
      inventory: state.inventory,
      manifests: state.manifests,
      graph: checked.graph,
      generatedBy: { tool: CLI_TOOL_NAME, version: context.version },
    };
    const artifacts = generateAll(input);
    const expected = sourceDigest(input);
    const found = detectDrift(appRoot, artifacts);
    drift = found.map((entry) => ({ path: entry.path, reason: entry.reason }));
    for (const entry of found) {
      diagnostics.push(driftDiagnostic(entry, expected, recordedSourceDigest(appRoot, entry.path)));
    }

    // The two lockfiles have to be read together. A package upgraded through pnpm without a
    // rebuild leaves a plugin lock describing the previous version's capability graph, and the App
    // would boot on a graph nobody reviewed. That is what these diagnostics are for.
    lockDiagnostics = compareLockfile(
      readLockfile(appRoot),
      buildLockfile(input, artifacts, state.manifests.packageDirs),
    );
    diagnostics.push(...lockDiagnostics);
  }

  const summary = {
    enabled: entries.filter((e) => e.state === 'enabled').length,
    disabled: entries.filter((e) => e.state === 'disabled').length,
    unresolved: entries.filter((e) => e.state === 'unresolved').length,
    manifestMissing: entries.filter((e) => e.state === 'manifest-missing').length,
  };

  diagnostics.push(
    diagnostic(
      'doctor-summary',
      `${summary.enabled} enabled, ${summary.disabled} disabled, ${summary.unresolved} unresolved, ${summary.manifestMissing} without a manifest; ${drift.length} artefact(s) out of date; ${lockDiagnostics.length} lockfile finding(s)`,
      { severity: 'info' },
    ),
  );

  return {
    command,
    exitCode: hasErrors(diagnostics)
      ? hasErrorsExcludingDrift(diagnostics)
        ? ExitCode.RESOLUTION_FAILED
        : ExitCode.DRIFT_DETECTED
      : ExitCode.OK,
    diagnostics,
    data: {
      entries,
      summary,
      drift,
      lockfile: lockDiagnostics.map((entry) => entry.code),
      catalog: CATALOG_ARTIFACT,
    },
  };
}

/**
 * Drift alone gets its own exit code, because the fix is "run build" rather than "change your
 * inputs". Anything else outranks it: telling an operator to rebuild when their inventory does not
 * resolve would send them down the wrong path.
 */
const REBUILDABLE_CODES = new Set([
  'artifact-stale',
  'artifact-missing',
  'plugin-lock-missing',
  'plugin-lock-package-added',
  'plugin-lock-package-removed',
  'plugin-lock-version-drift',
  'plugin-lock-schema-drift',
  'plugin-lock-resolution-drift',
  'plugin-lock-artifact-drift',
]);

function hasErrorsExcludingDrift(diagnostics: readonly PluginDiagnostic[]): boolean {
  return diagnostics.some(
    (entry) => entry.severity === 'error' && !REBUILDABLE_CODES.has(entry.code),
  );
}
