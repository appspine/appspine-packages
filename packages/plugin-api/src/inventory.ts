/**
 * App inventory: which plugin instances an App has installed.
 *
 * The inventory is the declarative half of 051 decision 10 — CLI-managed, human-reviewable, and
 * the only place `enabled`, `required` and `instanceId` are decided. Manifests describe what a
 * plugin *is*; the inventory decides what this App *runs*.
 */

export const INVENTORY_SCHEMA_VERSION = 'appspine.plugins/v1' as const;

export interface PluginInventoryEntry {
  /**
   * Package name (`@appspine/health-check`) or bare plugin ID (`health-check`). Both forms are
   * accepted: the CLI writes package names, while hand-written fixtures and the PL0-05 lifecycle
   * fixtures use plugin IDs. The resolver matches on either and reports the canonical package.
   */
  plugin: string;
  /** Stable per-install identity. Renaming one is a migration, not a config tweak. */
  instanceId: string;
  enabled: boolean;
  /**
   * `true` means a failure at validate/register/ready aborts boot. `false` is only legal when the
   * manifest declares an `optionalFailurePolicy` (051 plan section 9).
   */
  required: boolean;
  /** Dotted path into the App's runtime config. Must match the manifest's `configSchema.configRef`. */
  configRef?: string;
}

export interface PluginInventory {
  schemaVersion: typeof INVENTORY_SCHEMA_VERSION;
  plugins: PluginInventoryEntry[];
}

export const DEFAULT_INSTANCE_ID = 'default';

/**
 * Catalog / token / config / health / metric key for an instance, per the PL0-03 namespace rule.
 * A singleton's `default` instance keeps the bare plugin ID so existing operator-facing keys do
 * not churn; every other instance is qualified.
 */
export function instanceKey(pluginId: string, instanceId: string): string {
  return instanceId === DEFAULT_INSTANCE_ID ? pluginId : `${pluginId}#${instanceId}`;
}

export function parseInstanceKey(key: string): { pluginId: string; instanceId: string } {
  const hash = key.indexOf('#');
  if (hash === -1) return { pluginId: key, instanceId: DEFAULT_INSTANCE_ID };
  return { pluginId: key.slice(0, hash), instanceId: key.slice(hash + 1) };
}

/** Strips the `@scope/` prefix so `@appspine/health-check` and `health-check` compare equal. */
export function inventoryPluginIdOf(pluginRef: string): string {
  const slash = pluginRef.lastIndexOf('/');
  return slash === -1 ? pluginRef : pluginRef.slice(slash + 1);
}
