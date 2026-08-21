/**
 * The parts every command needs: load the inventory, load its manifests, resolve (PL2-02).
 *
 * Kept in one place because `add`, `remove`, `list` and `validate` must agree on what "the current
 * state is fine" means. If `add` used a laxer check than `validate`, the CLI could write an
 * inventory that its own validator rejects.
 */

import { diagnostic, type PluginDiagnostic } from '@appspine/plugin-api';
import type { LoadedPluginManifest } from '@appspine/plugin-api/loader';
import { type ResolutionGraph, resolvePlugins } from '@appspine/plugin-api/resolver';
import { checkConfigBoundary } from '../config-boundary';
import type { InventoryFile } from '../inventory-file';
import { readInventory } from '../inventory-file';
import { type ManifestSet, readManifestsFor } from '../manifest-source';
import { type ExpandedInventory, expandPresets } from '../preset';

/**
 * Capabilities an App supplies without any plugin: the host owns two, and the App's own Prisma
 * module the third. Mirrors `051-pl1-architecture-check.mjs`'s list.
 */
export const AMBIENT_CAPABILITIES = [
  'appspine.prisma',
  'appspine.principal-context',
  'appspine.authentication-strategy-registry',
];

export interface LoadedState {
  /**
   * The inventory **after preset expansion**. Everything downstream — resolver, catalog, lockfile,
   * generators — sees ordinary entries and never learns a preset was involved (PL2-08).
   */
  inventory: InventoryFile;
  /** The file as written, before expansion, for anything that edits it. */
  declared: InventoryFile;
  expanded: ExpandedInventory;
  manifests: ManifestSet;
  diagnostics: PluginDiagnostic[];
}

export function loadState(appRoot: string): LoadedState | { diagnostics: PluginDiagnostic[] } {
  const read = readInventory(appRoot);
  if (!read.ok) return { diagnostics: read.diagnostics };

  const expanded = expandPresets(appRoot, read.inventory);
  const inventory: InventoryFile = {
    schemaVersion: read.inventory.schemaVersion,
    plugins: expanded.entries,
  };

  const manifests = readManifestsFor(
    appRoot,
    inventory.plugins.map((entry) => entry.plugin),
  );

  return {
    inventory,
    declared: read.inventory,
    expanded,
    manifests,
    diagnostics: [...read.diagnostics, ...expanded.diagnostics, ...manifests.diagnostics],
  };
}

export function isLoaded(
  value: LoadedState | { diagnostics: PluginDiagnostic[] },
): value is LoadedState {
  return 'inventory' in value;
}

export interface ResolveCheck {
  graph: ResolutionGraph | null;
  diagnostics: PluginDiagnostic[];
}

/**
 * Resolves an inventory against the manifests that were actually found.
 *
 * When a manifest is missing the resolve is skipped rather than run on a partial set: resolving
 * without a plugin's manifest reports every capability it provides as unsatisfied, which buries
 * the one real problem ("that package is not installed") under a list of consequences.
 */
export function resolveInventory(
  inventory: InventoryFile,
  manifests: ManifestSet,
  hostCapabilities: readonly string[] = AMBIENT_CAPABILITIES,
): ResolveCheck {
  if (manifests.missing.length > 0) {
    return {
      graph: null,
      diagnostics: [
        diagnostic(
          'resolution-skipped',
          `cannot resolve while ${manifests.missing.length} manifest(s) are missing: ${manifests.missing.join(', ')}`,
          { severity: 'info' },
        ),
      ],
    };
  }

  const result = resolvePlugins({
    inventory: inventory.plugins,
    manifests: [...manifests.byRef.values()].map(toResolvable),
    hostCapabilities,
  });

  return result.ok
    ? { graph: result.graph, diagnostics: result.graph.diagnostics }
    : { graph: null, diagnostics: result.diagnostics };
}

function toResolvable(loaded: LoadedPluginManifest) {
  return {
    manifest: loaded.manifest,
    packageName: loaded.packageName,
    packageVersion: loaded.packageVersion,
    digest: loaded.digest,
  };
}

/** Schema, boundary and resolution diagnostics for a candidate inventory. */
export function checkInventory(
  inventory: InventoryFile,
  manifests: ManifestSet,
): { diagnostics: PluginDiagnostic[]; graph: ResolutionGraph | null } {
  const boundary = checkConfigBoundary(inventory, {
    manifests: manifests.byPluginId,
  });
  const resolved = resolveInventory(inventory, manifests);
  return {
    diagnostics: [...boundary, ...resolved.diagnostics],
    graph: resolved.graph,
  };
}

export function hasErrors(diagnostics: readonly PluginDiagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === 'error');
}
