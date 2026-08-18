/**
 * Host configuration (PL1-03).
 *
 * 051 decision 10 splits the sources of truth: the CLI owns `appspine.plugins.json` (the
 * inventory), the App developer owns `appspine.config.ts` (this object), the operator owns
 * secrets, pnpm owns package resolution. So this type deliberately has no place to restate a
 * package version, and `runtime` holds values — never credentials the process should read from
 * the environment itself.
 */

import type {
  AnyDefinedPlugin,
  PluginInventory,
  PluginInventoryEntry,
  PluginLogger,
} from '@appspine/plugin-api';

/**
 * A plugin the App has statically imported. `@appspine/plugin-cli` (PL2-05) generates this list;
 * in Phase 1 the App or a preset writes it by hand. Static, not dynamic-imported by name — the
 * bundler, TypeScript and a security review all have to see the edge (051 plan section 6.4).
 */
export interface HostPluginRegistration {
  plugin: AnyDefinedPlugin;
  /** Defaults to `@appspine/<plugin id>`; set it when the package name differs. */
  packageName?: string;
  /** Defaults to `0.0.0-unknown`; the CLI supplies the real one from the lockfile. */
  packageVersion?: string;
}

export interface AppspineHostConfig {
  inventory: PluginInventory | readonly PluginInventoryEntry[];
  plugins: readonly HostPluginRegistration[];
  /**
   * Capabilities the App itself provides, keyed by capability name — `appspine.prisma` from the
   * App's own Prisma module, for instance. The host adds its own on top.
   */
  hostCapabilities?: Record<string, unknown>;
  /**
   * Per-plugin runtime config, keyed by the `configRef` its manifest declares. Values reach the
   * plugin's `configSchema.parse()`; secrets stay in the environment and are redacted everywhere
   * the host reports config back.
   */
  runtime?: Record<string, unknown>;
  logger?: PluginLogger;
  /** Per-stage budget during boot. */
  stageTimeoutMs?: number;
  /** Per-instance budget during shutdown, unless the manifest sets its own. */
  shutdownTimeoutMs?: number;
  /** Package scope treated as official when checking an `app-local` provenance claim. */
  officialScope?: string;
}

/** Identity function that gives an `appspine.config.ts` its type without importing NestJS. */
export function defineAppspineConfig(config: AppspineHostConfig): AppspineHostConfig {
  return config;
}

export function inventoryEntriesOf(
  inventory: AppspineHostConfig['inventory'],
): readonly PluginInventoryEntry[] {
  return Array.isArray(inventory)
    ? (inventory as readonly PluginInventoryEntry[])
    : (inventory as PluginInventory).plugins;
}

/** Reads `runtime` by dotted `configRef`, e.g. `masterData.hr`. */
export function resolveConfigRef(
  runtime: Record<string, unknown> | undefined,
  configRef: string | undefined,
): unknown {
  if (!configRef) return {};
  let cursor: unknown = runtime ?? {};
  for (const segment of configRef.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
