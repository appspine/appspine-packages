/**
 * `@appspine/preset-standard` — the standard capability set as one versioned name (051 PL2-08).
 *
 * A preset is **shorthand for a list of plugins, and nothing else**. After expansion the inventory
 * reads exactly as if the entries had been typed out, and the host never learns a preset was
 * involved. That is the property everything else here protects:
 *
 *   - the catalog and the lockfile list the *resolved plugins*, with their versions and digests.
 *     "standard@1.0.0" as the only entry would hide what an App actually runs behind a name whose
 *     meaning changes between releases;
 *   - an App that names a plugin itself overrides the preset's entry for it, visibly;
 *   - an App-local plugin is never swallowed: a preset can only contribute, never remove.
 *
 * The JSON beside this file is what `@appspine/plugin-cli` reads, without executing anything —
 * same rule as a plugin manifest. This module is the typed half, and `preset.spec.ts` asserts the
 * two cannot drift.
 */

import type { PluginInventoryEntry } from '@appspine/plugin-api';

export const PRESET_SCHEMA_VERSION = 'appspine.preset/v1' as const;
export const PRESET_FILENAME = 'appspine.preset.json';

export interface PresetEntry {
  /** Package name, as it will appear in the expanded inventory. */
  plugin: string;
  instanceId: string;
  required: boolean;
  configRef?: string;
}

export interface AppspinePreset {
  schemaVersion: typeof PRESET_SCHEMA_VERSION;
  id: string;
  displayName: string;
  description: string;
  plugins: PresetEntry[];
}

/**
 * Mirrors `appspine.preset.json`, and `preset.spec.ts` fails the build if the two differ.
 *
 * Same reasoning as a plugin manifest (PL1-01 §2): `rootDir: ./src` means TypeScript cannot import
 * the package-root JSON, and a CLI has to be able to read the document without running any of this
 * package's code. Enforced duplication beats a runtime read.
 */
export const standardPreset: AppspinePreset = {
  schemaVersion: PRESET_SCHEMA_VERSION,
  id: 'standard',
  displayName: 'Appspine standard capabilities',
  description:
    "What appspine-app-template's AppModule imports by hand today, named once. A preset is a shorthand for a list of plugins, never a thing the host knows about: after expansion the inventory reads exactly as if these entries had been typed out.",
  plugins: [
    { plugin: '@appspine/health-check', instanceId: 'default', required: true },
    { plugin: '@appspine/audit-log', instanceId: 'default', required: true },
    { plugin: '@appspine/identity-core', instanceId: 'default', required: true },
    { plugin: '@appspine/oidc-auth', instanceId: 'default', required: true, configRef: 'oidc' },
    { plugin: '@appspine/notification', instanceId: 'default', required: true },
    { plugin: '@appspine/rbac', instanceId: 'default', required: true },
    { plugin: '@appspine/m2m-api-key', instanceId: 'default', required: true },
    { plugin: '@appspine/metadata-schema', instanceId: 'default', required: true },
    { plugin: '@appspine/domain-events', instanceId: 'default', required: true },
    { plugin: '@appspine/mcp-server', instanceId: 'default', required: true },
  ],
};

/** The entries this preset contributes, as ordinary inventory entries. */
export function presetEntries(preset: AppspinePreset = standardPreset): PluginInventoryEntry[] {
  return preset.plugins.map((entry) => ({
    plugin: entry.plugin,
    instanceId: entry.instanceId,
    enabled: true,
    required: entry.required,
    ...(entry.configRef ? { configRef: entry.configRef } : {}),
  }));
}

export default standardPreset;
