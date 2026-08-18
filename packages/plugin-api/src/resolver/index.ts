/**
 * `@appspine/plugin-api/resolver` — inventory + manifests -> deterministic resolution graph (PL1-05).
 *
 * Deterministic means two things here, and both are load-bearing:
 *   - the same *set* of inputs always produces the same order and the same digest, regardless of
 *     the order they were handed in (the plugin lockfile in PL2-04 depends on this), and
 *   - every rejection names an exact path, because "the graph did not resolve" is useless to an
 *     operator at 3am.
 *
 * Framework-neutral on purpose: `@appspine/plugin-host-nest` turns a graph into Nest modules and
 * `@appspine/plugin-cli` writes the same graph into a lockfile, so neither may own this code.
 */

import { parseQualifiedCapability, qualifyCapability } from '../capabilities';
import { diagnostic, hasErrors, type PluginDiagnostic, sortDiagnostics } from '../diagnostics';
import { PluginContractError } from '../errors';
import {
  DEFAULT_INSTANCE_ID,
  instanceKey,
  inventoryPluginIdOf,
  type PluginInventoryEntry,
} from '../inventory';
import { canonicalJsonString } from '../loader/canonicalize';
import { manifestDigest as computeManifestDigest } from '../loader/digest';
import type { PluginCardinality, PluginManifestV1, ReplacementDeclaration } from '../manifest';

/** Just enough of `LoadedPluginManifest` to resolve, so tests can build one by hand. */
export interface ResolvableManifest {
  manifest: PluginManifestV1;
  packageName: string;
  packageVersion: string;
  manifestDigest?: string;
  digest?: string;
}

export interface ResolvedPluginInstance {
  key: string;
  pluginId: string;
  instanceId: string;
  packageName: string;
  packageVersion: string;
  cardinality: PluginCardinality;
  required: boolean;
  configRef?: string;
  manifestDigest: string;
  digest: string;
  /** Bare capability names, plus instance-qualified ones for `cardinality: multiple`. */
  provides: string[];
  requires: string[];
  optionalRequires: string[];
  /** Instance keys this one must be registered after. Sorted. */
  dependsOn: string[];
  /** Optional capabilities nothing provides. The instance still boots, degraded by its own policy. */
  unresolvedOptional: string[];
  replaces: ReplacementDeclaration[];
  manifest: PluginManifestV1;
}

export interface ResolutionGraph {
  /** Instance keys in registration order. Shutdown runs this reversed. */
  order: string[];
  instances: ResolvedPluginInstance[];
  /** Capability name -> providing instance keys, sorted. */
  providers: Record<string, string[]>;
  hostCapabilities: string[];
  /** Instances present in the inventory but disabled. Catalogued, never wired. */
  disabled: { key: string; pluginId: string; instanceId: string; packageName: string }[];
  /** Stable across input reordering; the value PL2-04's lockfile records. */
  digest: string;
  diagnostics: PluginDiagnostic[];
}

export type ResolutionResult =
  | { ok: true; graph: ResolutionGraph }
  | { ok: false; diagnostics: PluginDiagnostic[] };

export interface ResolveOptions {
  inventory: readonly PluginInventoryEntry[];
  manifests: readonly ResolvableManifest[];
  /**
   * Capabilities the App itself supplies — `appspine.prisma` from the App's Prisma module, plus
   * whatever the host owns. A requirement satisfied here needs no plugin.
   */
  hostCapabilities?: readonly string[];
  /** Official package scope. An `app-local` claim from inside it is a provenance failure. */
  officialScope?: string;
}

const DEFAULT_OFFICIAL_SCOPE = '@appspine/';

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

function indexManifests(
  manifests: readonly ResolvableManifest[],
  diagnostics: PluginDiagnostic[],
): Map<string, ResolvableManifest> {
  const byRef = new Map<string, ResolvableManifest>();
  for (const entry of manifests) {
    for (const ref of [entry.packageName, entry.manifest.id]) {
      const existing = byRef.get(ref);
      if (existing && existing !== entry) {
        diagnostics.push(
          diagnostic(
            'ambiguous-plugin-reference',
            `"${ref}" resolves to both ${existing.packageName} and ${entry.packageName}`,
            { pluginId: entry.manifest.id },
          ),
        );
        continue;
      }
      byRef.set(ref, entry);
    }
  }
  return byRef;
}

function providedCapabilities(manifest: PluginManifestV1, instanceId: string): string[] {
  if (manifest.cardinality !== 'multiple') return [...manifest.provides];
  // A multi-instance plugin answers to both the bare name ("is anything providing this?") and the
  // instance-qualified one ("give me the HR one specifically") — PL0-03 section 4.
  return manifest.provides.flatMap((capability) => [
    capability,
    qualifyCapability(capability, instanceId),
  ]);
}

interface Contribution {
  kind: string;
  value: string;
  key: string;
  pluginId: string;
}

function collectContributions(instance: ResolvedPluginInstance): Contribution[] {
  const out: Contribution[] = [];
  const push = (kind: string, value: string) =>
    out.push({ kind, value, key: instance.key, pluginId: instance.pluginId });

  const backend = instance.manifest.facets.backend;
  for (const route of backend?.controllerRoutes ?? []) push('route', route);
  for (const token of backend?.providerTokens ?? []) push('provider-token', token);
  for (const worker of backend?.workers ?? []) push('worker', worker);
  if (backend?.exportName) push('backend-module', `${instance.packageName}#${backend.exportName}`);

  const operations = instance.manifest.facets.operations;
  if (operations?.healthIndicatorId) {
    // Instance-qualified: two instances of the same multi-instance plugin legitimately both
    // contribute a health indicator, and they must not collide (051 plan section 4.4).
    push(
      'health-indicator',
      instance.cardinality === 'multiple'
        ? qualifyCapability(operations.healthIndicatorId, instance.instanceId)
        : operations.healthIndicatorId,
    );
  }

  const prisma = instance.manifest.facets.prisma as { owns?: unknown } | undefined;
  if (Array.isArray(prisma?.owns)) {
    for (const model of prisma.owns) {
      if (typeof model === 'string') push('prisma-model', model);
    }
  }

  return out;
}

/** Contribution kinds several instances of the same plugin legitimately share. */
const SHARED_ACROSS_INSTANCES = new Set(['backend-module', 'prisma-model']);

const DUPLICATE_CODES: Record<string, string> = {
  route: 'duplicate-route',
  'provider-token': 'duplicate-provider-token',
  worker: 'duplicate-worker',
  'backend-module': 'duplicate-backend-module',
  'health-indicator': 'duplicate-health-indicator',
  'prisma-model': 'duplicate-prisma-model',
};

/** `replaces` entries suppress the replaced plugin's contribution from duplicate detection. */
function replacementKeysOf(instances: readonly ResolvedPluginInstance[]): Set<string> {
  const suppressed = new Set<string>();
  for (const instance of instances) {
    for (const replacement of instance.replaces) {
      suppressed.add(`${replacement.plugin}::${replacement.contribution}`);
    }
  }
  return suppressed;
}

function topologicalOrder(
  instances: readonly ResolvedPluginInstance[],
  diagnostics: PluginDiagnostic[],
): string[] {
  const remaining = new Map(
    instances.map((instance) => [instance.key, new Set(instance.dependsOn)]),
  );
  const order: string[] = [];

  while (remaining.size > 0) {
    // Lexicographic tie-break over every currently-ready node: Kahn's algorithm is only
    // deterministic if the frontier is ordered, and a shuffled input must not reorder the output.
    const ready = sorted(
      [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([key]) => key),
    );

    if (ready.length === 0) {
      const cycle = sorted(remaining.keys());
      diagnostics.push(
        diagnostic('dependency-cycle', `dependency cycle between: ${cycle.join(' -> ')}`, {
          path: 'requires',
        }),
      );
      return order;
    }

    for (const key of ready) {
      order.push(key);
      remaining.delete(key);
    }
    for (const deps of remaining.values()) {
      for (const key of ready) deps.delete(key);
    }
  }

  return order;
}

export function resolvePlugins(options: ResolveOptions): ResolutionResult {
  const diagnostics: PluginDiagnostic[] = [];
  const officialScope = options.officialScope ?? DEFAULT_OFFICIAL_SCOPE;
  const hostCapabilities = sorted(new Set(options.hostCapabilities ?? []));
  const byRef = indexManifests(options.manifests, diagnostics);

  const instances: ResolvedPluginInstance[] = [];
  const disabled: ResolutionGraph['disabled'] = [];
  const seenKeys = new Set<string>();

  // Inventory order must not leak into the output, so sort before doing anything with it.
  //
  // Belt and braces, honestly labelled: `topologicalOrder()` sorts its frontier by instance key, so
  // today this pre-sort has no *observable* effect on `order` — Gate G1's independent review proved
  // that by deleting each one separately and watching the suite stay green. It is kept because it
  // makes the order in which inventory entries are *processed* deterministic, which is what any
  // future order-sensitive diagnostic would rest on. The frontier sort is the authority for output
  // order, and `resolver.spec.ts`'s "orders by instance key, not by the inventory sort key" pins it
  // there.
  const entries = [...options.inventory].sort((a, b) => {
    const left = `${inventoryPluginIdOf(a.plugin)}#${a.instanceId}`;
    const right = `${inventoryPluginIdOf(b.plugin)}#${b.instanceId}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  for (const entry of entries) {
    const found = byRef.get(entry.plugin) ?? byRef.get(inventoryPluginIdOf(entry.plugin));
    if (!found) {
      diagnostics.push(
        diagnostic('unknown-plugin', `inventory references unknown plugin "${entry.plugin}"`, {
          instanceId: entry.instanceId,
          path: 'inventory.plugin',
        }),
      );
      continue;
    }

    const manifest = found.manifest;
    const instanceId = entry.instanceId || DEFAULT_INSTANCE_ID;
    const key = instanceKey(manifest.id, instanceId);

    if (seenKeys.has(key)) {
      diagnostics.push(
        diagnostic('duplicate-instance', `two inventory entries resolve to "${key}"`, {
          pluginId: manifest.id,
          instanceId,
          path: 'inventory.instanceId',
        }),
      );
      continue;
    }
    seenKeys.add(key);

    if (!entry.enabled) {
      disabled.push({
        key,
        pluginId: manifest.id,
        instanceId,
        packageName: found.packageName,
      });
      continue;
    }

    if (!entry.required && !manifest.optionalFailurePolicy) {
      diagnostics.push(
        diagnostic(
          'optional-without-failure-policy',
          `"${key}" is marked optional but its manifest declares no optionalFailurePolicy (051 plan section 9)`,
          { pluginId: manifest.id, instanceId, path: 'inventory.required' },
        ),
      );
    }

    if (
      entry.configRef &&
      manifest.configSchema &&
      entry.configRef !== manifest.configSchema.configRef
    ) {
      // A mismatch here means the App is feeding config from a path the plugin never declared,
      // which build-time validation would otherwise pass and bootstrap would silently ignore.
      diagnostics.push(
        diagnostic(
          'config-ref-mismatch',
          `inventory configRef "${entry.configRef}" does not match the manifest's "${manifest.configSchema.configRef}"`,
          { pluginId: manifest.id, instanceId, path: 'inventory.configRef' },
        ),
      );
    }

    if (manifest.distribution === 'app-local' && found.packageName.startsWith(officialScope)) {
      diagnostics.push(
        diagnostic(
          'app-local-claim-from-official-scope',
          `"${found.packageName}" claims distribution "app-local" from the official scope "${officialScope}"`,
          { pluginId: manifest.id, instanceId, path: 'distribution' },
        ),
      );
    }

    instances.push({
      key,
      pluginId: manifest.id,
      instanceId,
      packageName: found.packageName,
      packageVersion: found.packageVersion,
      cardinality: manifest.cardinality,
      required: entry.required,
      configRef: entry.configRef ?? manifest.configSchema?.configRef,
      manifestDigest: found.manifestDigest ?? computeManifestDigest(manifest),
      digest: found.digest ?? computeManifestDigest(manifest),
      provides: sorted(providedCapabilities(manifest, instanceId)),
      requires: sorted(manifest.requires),
      optionalRequires: sorted(manifest.optionalRequires ?? []),
      dependsOn: [],
      unresolvedOptional: [],
      replaces: [...(manifest.replaces ?? [])],
      manifest,
    });
  }

  // --- cardinality ---------------------------------------------------------------------------
  const byPluginId = new Map<string, ResolvedPluginInstance[]>();
  for (const instance of instances) {
    const list = byPluginId.get(instance.pluginId) ?? [];
    list.push(instance);
    byPluginId.set(instance.pluginId, list);
  }
  for (const [pluginId, list] of [...byPluginId.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (list[0].cardinality === 'singleton' && list.length > 1) {
      diagnostics.push(
        diagnostic(
          'singleton-cardinality-violation',
          `"${pluginId}" is a singleton but ${list.length} instances are enabled: ${sorted(
            list.map((i) => i.key),
          ).join(', ')}`,
          { pluginId, path: 'cardinality' },
        ),
      );
    }
  }

  // --- conflicts -----------------------------------------------------------------------------
  const enabledPluginIds = new Set(instances.map((instance) => instance.pluginId));
  for (const instance of instances) {
    for (const conflicting of instance.manifest.conflicts ?? []) {
      if (enabledPluginIds.has(conflicting)) {
        diagnostics.push(
          diagnostic(
            'plugin-conflict',
            `"${instance.pluginId}" declares a conflict with "${conflicting}", which is also enabled`,
            { pluginId: instance.pluginId, instanceId: instance.instanceId, path: 'conflicts' },
          ),
        );
      }
    }
  }

  // --- capability providers --------------------------------------------------------------------
  const providers = new Map<string, string[]>();
  for (const instance of instances) {
    for (const capability of instance.provides) {
      const list = providers.get(capability) ?? [];
      list.push(instance.key);
      providers.set(capability, list);
    }
  }

  const replacedPlugins = new Set(
    instances.flatMap((instance) => instance.replaces.map((entry) => entry.plugin)),
  );

  for (const [capability, keys] of [...providers.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (keys.length < 2) continue;
    const ownerIds = new Set(keys.map((key) => key.split('#')[0]));
    // Several instances of one multi-instance plugin sharing a bare capability name is the
    // designed behaviour, not a collision.
    if (ownerIds.size === 1) continue;
    // An app-local plugin that legitimately `replaces` the stock one is allowed to co-provide.
    const contested = [...ownerIds].filter((id) => !replacedPlugins.has(id));
    if (contested.length < 2) continue;

    diagnostics.push(
      diagnostic(
        'duplicate-capability-provider',
        `"${capability}" is provided by ${sorted(keys).join(', ')} with no replaces declaration`,
        { path: 'provides' },
      ),
    );
  }

  for (const capability of hostCapabilities) {
    if (providers.has(capability)) {
      diagnostics.push(
        diagnostic(
          'host-capability-overridden',
          `"${capability}" is host-owned but also provided by ${sorted(providers.get(capability) ?? []).join(', ')}`,
          { path: 'provides' },
        ),
      );
    }
  }

  // --- replaces targets --------------------------------------------------------------------
  for (const instance of instances) {
    for (const [index, replacement] of instance.replaces.entries()) {
      if (!enabledPluginIds.has(replacement.plugin)) {
        diagnostics.push(
          diagnostic(
            'replaces-target-missing',
            `"${instance.key}" replaces a contribution of "${replacement.plugin}", which is not enabled`,
            {
              pluginId: instance.pluginId,
              instanceId: instance.instanceId,
              path: `replaces[${index}].plugin`,
            },
          ),
        );
      }
    }
  }

  // --- requirements ---------------------------------------------------------------------------
  const hostCapabilitySet = new Set(hostCapabilities);
  for (const instance of instances) {
    const dependsOn = new Set<string>();

    for (const capability of instance.requires) {
      if (hostCapabilitySet.has(capability)) continue;
      const keys = providers.get(capability) ?? [];
      const external = keys.filter((key) => key !== instance.key);
      if (external.length === 0) {
        const { instanceId: wanted } = parseQualifiedCapability(capability);
        diagnostics.push(
          diagnostic(
            'missing-required-capability',
            `"${instance.key}" requires "${capability}"${
              wanted ? ` (instance "${wanted}")` : ''
            } and nothing provides it`,
            { pluginId: instance.pluginId, instanceId: instance.instanceId, path: 'requires' },
          ),
        );
        continue;
      }
      for (const key of external) dependsOn.add(key);
    }

    for (const capability of instance.optionalRequires) {
      if (hostCapabilitySet.has(capability)) continue;
      const external = (providers.get(capability) ?? []).filter((key) => key !== instance.key);
      if (external.length === 0) {
        instance.unresolvedOptional.push(capability);
        diagnostics.push(
          diagnostic(
            'unresolved-optional-capability',
            `"${instance.key}" runs without optional capability "${capability}"`,
            {
              pluginId: instance.pluginId,
              instanceId: instance.instanceId,
              path: 'optionalRequires',
              severity: 'info',
            },
          ),
        );
        continue;
      }
      for (const key of external) dependsOn.add(key);
    }

    instance.dependsOn = sorted(dependsOn);
    instance.unresolvedOptional = sorted(instance.unresolvedOptional);
  }

  // --- duplicate contributions ------------------------------------------------------------
  const suppressed = replacementKeysOf(instances);
  const contributionOwners = new Map<string, Contribution[]>();
  for (const instance of instances) {
    for (const contribution of collectContributions(instance)) {
      if (suppressed.has(`${contribution.pluginId}::${contribution.value}`)) continue;
      const id = `${contribution.kind}::${contribution.value}`;
      const list = contributionOwners.get(id) ?? [];
      list.push(contribution);
      contributionOwners.set(id, list);
    }
  }
  for (const [id, owners] of [...contributionOwners.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (owners.length < 2) continue;
    const [kind, value] = id.split('::');
    // Two instances of one multi-instance plugin share their module class and their Prisma models
    // by construction — that is the whole point of instancing. Routes, tokens and workers are a
    // different story: those really would collide, so a multi-instance plugin has to qualify them
    // with its instance ID (PL0-03 section 4) and is reported here when it does not.
    if (SHARED_ACROSS_INSTANCES.has(kind) && new Set(owners.map((o) => o.pluginId)).size === 1) {
      continue;
    }
    diagnostics.push(
      diagnostic(
        DUPLICATE_CODES[kind] ?? 'duplicate-contribution',
        `${kind} "${value}" is contributed by ${sorted(owners.map((o) => o.key)).join(', ')}`,
        { path: `facets.${kind}` },
      ),
    );
  }

  // --- ordering --------------------------------------------------------------------------------
  const order = topologicalOrder(instances, diagnostics);

  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }

  const orderedInstances = order.map(
    (key) => instances.find((instance) => instance.key === key) as ResolvedPluginInstance,
  );

  const graph: ResolutionGraph = {
    order,
    instances: orderedInstances,
    providers: Object.fromEntries(
      [...providers.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([capability, keys]) => [capability, sorted(keys)]),
    ),
    hostCapabilities,
    disabled: disabled.sort((a, b) => (a.key < b.key ? -1 : 1)),
    digest: '',
    diagnostics: sortDiagnostics(diagnostics),
  };

  graph.digest = resolutionDigest(graph);
  return { ok: true, graph };
}

/**
 * Digest over the *resolved* graph, not the inputs: it has to change when a version, a manifest,
 * an edge or the order changes, and stay identical when only input ordering differs.
 */
/**
 * `configRef` is deliberately absent from the per-instance entries below, and that is not an
 * omission: `config-ref-mismatch` forces an inventory entry's `configRef` to equal the manifest's
 * own `configSchema.configRef`, and the manifest is already inside `instance.digest`. Gate G1's
 * review flagged it as a possible gap for PL2-04's lockfile; adding it changed no digest anywhere,
 * because there is no input that can move one without moving the other.
 */
export function resolutionDigest(graph: ResolutionGraph): string {
  return computeManifestDigest({
    order: graph.order,
    hostCapabilities: graph.hostCapabilities,
    providers: graph.providers,
    disabled: graph.disabled.map((entry) => entry.key),
    instances: graph.instances.map((instance) => ({
      key: instance.key,
      packageName: instance.packageName,
      packageVersion: instance.packageVersion,
      digest: instance.digest,
      required: instance.required,
      dependsOn: instance.dependsOn,
      unresolvedOptional: instance.unresolvedOptional,
    })),
  });
}

/** Shutdown order: exactly the reverse of registration (051 plan section 9). */
export function shutdownOrder(graph: ResolutionGraph): string[] {
  return [...graph.order].reverse();
}

export function unwrapResolution(result: ResolutionResult): ResolutionGraph {
  if (result.ok) return result.graph;
  throw new PluginContractError(
    'plugin-resolution-failed',
    'Plugin resolution failed',
    result.diagnostics,
  );
}

/** Re-exported so a caller can digest an arbitrary sub-tree with the same rules. */
export { canonicalJsonString };
