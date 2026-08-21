/**
 * Preset expansion (PL2-08).
 *
 * A preset is shorthand for a list of plugins. After expansion the inventory reads exactly as if
 * those entries had been typed out, and nothing downstream — resolver, catalog, lockfile, host —
 * learns a preset was involved. Everything below protects that one property:
 *
 *   - **The catalog and lock list resolved plugins, never the preset name.** "standard@1.0.0" as
 *     the only entry would hide what an App actually runs behind a name whose meaning changes
 *     between releases. The preset is recorded as *provenance* on each entry, not instead of it.
 *   - **An explicit entry wins, visibly.** An App that names a plugin the preset also names keeps
 *     its own version of that entry, and the CLI says so rather than silently preferring one.
 *   - **A preset can only contribute.** It never removes an entry, so an app-local plugin cannot be
 *     swallowed by adding a preset.
 *
 * Reading a preset is `readFileSync` on JSON, same as a manifest. Nothing here executes package
 * code.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PluginDiagnostic, PluginInventoryEntry } from '@appspine/plugin-api';
import { diagnostic, instanceKey } from '@appspine/plugin-api';
import type { InventoryFile } from './inventory-file';
import { pluginIdOf } from './inventory-file';

export const PRESET_FILENAME = 'appspine.preset.json';
export const PRESET_SCHEMA_VERSION = 'appspine.preset/v1';

export interface PresetDocument {
  schemaVersion: string;
  id: string;
  displayName?: string;
  description?: string;
  plugins: {
    plugin: string;
    instanceId: string;
    required: boolean;
    configRef?: string;
  }[];
}

export interface LoadedPreset {
  packageName: string;
  packageVersion: string;
  document: PresetDocument;
}

export interface ExpandedInventory {
  entries: PluginInventoryEntry[];
  /** Instance key -> the preset package that contributed it. Absent means the App wrote it. */
  provenance: Map<string, string>;
  presets: LoadedPreset[];
  diagnostics: PluginDiagnostic[];
}

export function readPreset(appRoot: string, packageName: string): LoadedPreset | null {
  const dir = path.join(appRoot, 'node_modules', packageName);
  const presetPath = path.join(dir, PRESET_FILENAME);
  const packageJsonPath = path.join(dir, 'package.json');
  if (!existsSync(presetPath) || !existsSync(packageJsonPath)) return null;

  try {
    const document = JSON.parse(readFileSync(presetPath, 'utf8')) as PresetDocument;
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
    return {
      packageName,
      packageVersion: packageJson.version ?? '0.0.0-unknown',
      document,
    };
  } catch {
    return null;
  }
}

/**
 * Expands every preset the inventory names, then layers the App's own entries on top.
 *
 * Order matters and is the point: presets first, App last. "Last one wins" is only safe when the
 * winner is the one a human wrote in the file they own.
 */
export function expandPresets(appRoot: string, inventory: InventoryFile): ExpandedInventory {
  const diagnostics: PluginDiagnostic[] = [];
  const presets: LoadedPreset[] = [];
  const byKey = new Map<string, PluginInventoryEntry>();
  const provenance = new Map<string, string>();

  // The same instance key the resolver, catalog and lockfile use: a singleton's `default`
  // instance keeps the bare plugin id. Using a different shape here would silently drop every
  // provenance lookup downstream.
  const keyOf = (entry: PluginInventoryEntry) =>
    instanceKey(pluginIdOf(entry.plugin), entry.instanceId);

  for (const packageName of [...(inventory.presets ?? [])].sort()) {
    const preset = readPreset(appRoot, packageName);
    if (!preset) {
      diagnostics.push(
        diagnostic(
          'preset-not-found',
          `no ${PRESET_FILENAME} in node_modules/${packageName}. Install the preset package first`,
          { path: 'presets' },
        ),
      );
      continue;
    }
    if (preset.document.schemaVersion !== PRESET_SCHEMA_VERSION) {
      diagnostics.push(
        diagnostic(
          'preset-schema-version-unsupported',
          `${packageName} declares ${preset.document.schemaVersion}; this CLI understands ${PRESET_SCHEMA_VERSION}`,
          { path: 'presets' },
        ),
      );
      continue;
    }

    presets.push(preset);
    for (const entry of preset.document.plugins) {
      const expanded: PluginInventoryEntry = {
        plugin: entry.plugin,
        instanceId: entry.instanceId,
        enabled: true,
        required: entry.required,
        ...(entry.configRef ? { configRef: entry.configRef } : {}),
      };
      const key = keyOf(expanded);
      const previous = provenance.get(key);
      if (previous && previous !== packageName) {
        // Two presets naming the same instance is not something the CLI should resolve by
        // ordering. The App has to say which it means.
        diagnostics.push(
          diagnostic(
            'preset-overlap',
            `"${key}" is contributed by both ${previous} and ${packageName}. Name it explicitly in appspine.plugins.json to say which you mean`,
            { path: 'presets' },
          ),
        );
        continue;
      }
      byKey.set(key, expanded);
      provenance.set(key, packageName);
    }
  }

  for (const entry of inventory.plugins) {
    const key = keyOf(entry);
    if (provenance.has(key)) {
      // Explicit wins — and says so. A silent override is how an App ends up running something
      // other than what its own file appears to say.
      diagnostics.push(
        diagnostic(
          'preset-entry-overridden',
          `"${key}" comes from ${provenance.get(key)}, and appspine.plugins.json overrides it`,
          { severity: 'info', path: 'plugins' },
        ),
      );
      provenance.delete(key);
    }
    byKey.set(key, entry);
  }

  const entries = [...byKey.values()].sort((a, b) => {
    const left = `${pluginIdOf(a.plugin)} ${a.instanceId}`;
    const right = `${pluginIdOf(b.plugin)} ${b.instanceId}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  return { entries, provenance, presets, diagnostics };
}

/** Preset provenance for the catalog and the lockfile — resolved plugins first, name second. */
export function presetSummary(expanded: ExpandedInventory): {
  presets: { package: string; version: string; id: string; contributes: string[] }[];
} {
  return {
    presets: expanded.presets
      .map((preset) => ({
        package: preset.packageName,
        version: preset.packageVersion,
        id: preset.document.id,
        contributes: [...expanded.provenance.entries()]
          .filter(([, owner]) => owner === preset.packageName)
          .map(([key]) => key)
          .sort(),
      }))
      .sort((a, b) => (a.package < b.package ? -1 : 1)),
  };
}
