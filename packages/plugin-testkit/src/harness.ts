/**
 * The plugin host harness.
 *
 * Resolves an inventory the same way a real App does (`@appspine/plugin-api/resolver`) and drives
 * the resulting graph through the same lifecycle engine the Nest host uses
 * (`@appspine/plugin-api/runtime`). It deliberately stops short of NestJS: a plugin author should
 * be able to assert ordering, degradation and shutdown semantics in a plain unit test, and the
 * Nest-specific wiring has its own integration tests in `@appspine/plugin-host-nest`.
 */

import type {
  AnyDefinedPlugin,
  HostShutdownOutcome,
  LifecycleEvent,
  PluginDiagnostic,
  PluginInventoryEntry,
  PluginLogger,
  PluginManifestV1,
} from '@appspine/plugin-api';
import { redactConfigForManifest } from '@appspine/plugin-api';
import type { ResolutionGraph, ResolutionResult } from '@appspine/plugin-api/resolver';
import { resolvePlugins, unwrapResolution } from '@appspine/plugin-api/resolver';
import type { HostCatalog, RuntimeInstance } from '@appspine/plugin-api/runtime';
import { CapabilityRegistry, PluginLifecycleRunner } from '@appspine/plugin-api/runtime';

export interface HarnessPlugin {
  /** Either a `definePlugin()` result or a bare manifest for a plugin with no runtime hooks. */
  plugin: AnyDefinedPlugin | { manifest: PluginManifestV1 };
  packageName?: string;
  packageVersion?: string;
  /** Config per instance ID, or a single value applied to every instance. */
  config?: unknown | Record<string, unknown>;
}

export interface HarnessOptions {
  plugins: readonly HarnessPlugin[];
  inventory: readonly PluginInventoryEntry[];
  /** Capabilities the App itself supplies, e.g. `appspine.prisma`. */
  hostCapabilities?: Record<string, unknown>;
  logger?: PluginLogger;
  stageTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  officialScope?: string;
}

export interface PluginHarness {
  graph: ResolutionGraph;
  capabilities: CapabilityRegistry;
  boot(): Promise<HostCatalog>;
  shutdown(): Promise<{ outcome: HostShutdownOutcome; events: LifecycleEvent[] }>;
  readonly events: readonly LifecycleEvent[];
}

function manifestOf(entry: HarnessPlugin): PluginManifestV1 {
  return entry.plugin.manifest;
}

function configFor(entry: HarnessPlugin, instanceId: string): unknown {
  if (entry.config === undefined) return {};
  if (typeof entry.config === 'object' && entry.config !== null && instanceId in entry.config) {
    return (entry.config as Record<string, unknown>)[instanceId];
  }
  return entry.config;
}

/**
 * Builds the harness. Resolution failures throw immediately with the full diagnostic list — a
 * test that meant to assert a resolution failure should call `resolveHarness` instead.
 */
export function createPluginHarness(options: HarnessOptions): PluginHarness {
  const resolution = resolveHarness(options);
  const graph = unwrapResolution(resolution);
  return harnessFromGraph(graph, options);
}

/** Resolution only, for tests that assert on rejection rather than on runtime behaviour. */
export function resolveHarness(options: HarnessOptions): ResolutionResult {
  return resolvePlugins({
    inventory: options.inventory,
    manifests: options.plugins.map((entry) => ({
      manifest: manifestOf(entry),
      packageName: entry.packageName ?? `@appspine/${manifestOf(entry).id}`,
      packageVersion: entry.packageVersion ?? '1.0.0',
    })),
    hostCapabilities: Object.keys(options.hostCapabilities ?? {}),
    officialScope: options.officialScope,
  });
}

function harnessFromGraph(graph: ResolutionGraph, options: HarnessOptions): PluginHarness {
  const capabilities = new CapabilityRegistry(options.hostCapabilities ?? {});
  const byPluginId = new Map(options.plugins.map((entry) => [manifestOf(entry).id, entry]));

  const instances: RuntimeInstance[] = graph.instances.map((resolved) => {
    const entry = byPluginId.get(resolved.pluginId) as HarnessPlugin;
    const defined = entry.plugin as Partial<AnyDefinedPlugin>;
    const config = configFor(entry, resolved.instanceId);

    return {
      key: resolved.key,
      pluginId: resolved.pluginId,
      instanceId: resolved.instanceId,
      packageName: resolved.packageName,
      packageVersion: resolved.packageVersion,
      digest: resolved.digest,
      required: resolved.required,
      provides: resolved.provides,
      requires: resolved.requires,
      unresolvedOptional: resolved.unresolvedOptional,
      config,
      redactedConfig: redactConfigForManifest(resolved.manifest, config),
      hooks: defined.lifecycle,
      optionalFailurePolicy: resolved.manifest.optionalFailurePolicy,
      healthIndicatorId: resolved.manifest.facets.operations?.healthIndicatorId,
      shutdownTimeoutMs:
        resolved.manifest.facets.operations?.shutdownTimeoutMs ?? options.shutdownTimeoutMs,
    };
  });

  const runner = new PluginLifecycleRunner({
    instances,
    capabilities,
    logger: options.logger,
    stageTimeoutMs: options.stageTimeoutMs,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });

  return {
    graph,
    capabilities,
    boot: () => runner.boot(),
    shutdown: () => runner.shutdown(),
    get events() {
      return runner.events;
    },
  };
}

/** Boot in one call, for the common "assert the catalog" test. */
export async function bootHarness(options: HarnessOptions): Promise<{
  harness: PluginHarness;
  catalog: HostCatalog;
}> {
  const harness = createPluginHarness(options);
  const catalog = await harness.boot();
  return { harness, catalog };
}

export type { PluginDiagnostic };
