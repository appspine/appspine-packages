/**
 * Manifest and inventory builders.
 *
 * A plugin test almost never cares about 15 manifest fields — it cares about one. These builders
 * start from a valid `appspine.plugin/v1` manifest so a test can override just the field under
 * test, and so a schema change breaks the builder once instead of breaking every spec in the
 * workspace.
 */

import type {
  BackendFacetContribution,
  OperationsFacetContribution,
  OptionalFailurePolicy,
  PluginInventory,
  PluginInventoryEntry,
  PluginManifestV1,
} from '@appspine/plugin-api';
import { DEFAULT_INSTANCE_ID, INVENTORY_SCHEMA_VERSION } from '@appspine/plugin-api';

export const TESTKIT_ENGINE = Object.freeze({
  appspinePluginApi: '^1.0.0',
  node: '>=22.0.0',
});

/** The failure policy an instance must declare before it may be marked optional. */
export const DEGRADABLE: OptionalFailurePolicy = {
  isolationBoundary: 'instance',
  degradedBehavior: { readiness: 'degraded', catalog: 'degraded', alert: 'required' },
};

export function backendFacet(
  exportName: string,
  overrides: Partial<BackendFacetContribution> = {},
): BackendFacetContribution {
  return {
    modulePath: `./dist/${kebabCase(exportName.replace(/Module$/, ''))}.module.js`,
    exportName,
    ...overrides,
  };
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export function operationsFacet(
  pluginId: string,
  overrides: Partial<OperationsFacetContribution> = {},
): OperationsFacetContribution {
  return { healthIndicatorId: pluginId, ...overrides };
}

export interface BuildManifestOptions extends Partial<Omit<PluginManifestV1, 'id'>> {
  id: string;
}

/**
 * Produces a manifest that passes `@appspine/plugin-api/loader` validation unless a test
 * deliberately breaks it. Defaults mirror the smallest real plugin (`health-check`).
 */
export function buildManifest(options: BuildManifestOptions): PluginManifestV1 {
  const { id, facets, ...rest } = options;
  return {
    schemaVersion: 'appspine.plugin/v1',
    id,
    displayName: rest.displayName ?? id,
    cardinality: rest.cardinality ?? 'singleton',
    engine: rest.engine ?? { ...TESTKIT_ENGINE },
    provides: rest.provides ?? [],
    requires: rest.requires ?? [],
    ...rest,
    facets: facets ?? { backend: backendFacet(`${pascalCase(id)}Module`) },
  };
}

function pascalCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** A required singleton instance — the common case. */
export function inventoryEntry(
  plugin: string,
  overrides: Partial<PluginInventoryEntry> = {},
): PluginInventoryEntry {
  return {
    plugin,
    instanceId: DEFAULT_INSTANCE_ID,
    enabled: true,
    required: true,
    ...overrides,
  };
}

/** An optional instance. Pair it with a manifest that declares `optionalFailurePolicy`. */
export function optionalInventoryEntry(
  plugin: string,
  overrides: Partial<PluginInventoryEntry> = {},
): PluginInventoryEntry {
  return inventoryEntry(plugin, { required: false, ...overrides });
}

/** Several named instances of one `cardinality: multiple` plugin. */
export function multiInstanceEntries(
  plugin: string,
  instanceIds: readonly string[],
  overrides: Partial<PluginInventoryEntry> = {},
): PluginInventoryEntry[] {
  return instanceIds.map((instanceId) => inventoryEntry(plugin, { instanceId, ...overrides }));
}

export function buildInventory(entries: readonly PluginInventoryEntry[]): PluginInventory {
  return { schemaVersion: INVENTORY_SCHEMA_VERSION, plugins: [...entries] };
}
