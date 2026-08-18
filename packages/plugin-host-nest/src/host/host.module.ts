/**
 * Composition (PL1-03, PL1-06).
 *
 * 051 plan section 4.3 fixes the order of what has to happen *before* Nest bootstraps:
 * schema/config validation, duplicate and engine checks, provides/requires resolution, cycle
 * detection and deterministic sort, then module assembly, then catalog/diagnostics. Everything
 * that can be known statically is decided here, so a misconfigured App fails while building the
 * module tree rather than half-way through serving traffic.
 */

import type { AnyDefinedPlugin, PluginRuntimeContext } from '@appspine/plugin-api';
import {
  CAPABILITY,
  diagnostic,
  PluginContractError,
  type PluginDiagnostic,
  redactConfigForManifest,
} from '@appspine/plugin-api';
import { resolvePlugins, unwrapResolution } from '@appspine/plugin-api/resolver';
import type { RuntimeInstance } from '@appspine/plugin-api/runtime';
import { CapabilityRegistry, silentLogger } from '@appspine/plugin-api/runtime';
import { type DynamicModule, Module } from '@nestjs/common';
import { AppspineAuthInfrastructureModule } from '../auth/auth-infrastructure.module';
import {
  type AppspineHostConfig,
  inventoryEntriesOf,
  resolveConfigRef,
} from '../config/host-config';
import { APPSPINE_HOST_STATE, AppspinePluginHost, type HostRuntimeState } from './appspine-host';

export const APPSPINE_HOST_CONFIG = Symbol.for('appspine.host-config');

/** Nest module or dynamic module a plugin's backend factory returns. */
export type PluginBackendModule = DynamicModule | (new (...args: never[]) => unknown);

interface PreparedComposition {
  state: HostRuntimeState;
  imports: PluginBackendModule[];
}

function registrationPackageName(registration: {
  plugin: AnyDefinedPlugin;
  packageName?: string;
}): string {
  return registration.packageName ?? `@appspine/${registration.plugin.manifest.id}`;
}

/**
 * Steps 1-4 of 051 plan section 4.3. Returns the runtime state plus the backend factories that
 * still have to be invoked — splitting that out is what lets the sync and async entry points share
 * every check and differ only in how they await a factory.
 */
function prepare(config: AppspineHostConfig): {
  state: HostRuntimeState;
  factories: {
    instance: RuntimeInstance;
    factory: NonNullable<AnyDefinedPlugin['backend']>;
    context: PluginRuntimeContext;
  }[];
} {
  const inventory = inventoryEntriesOf(config.inventory);
  const hostCapabilityNames = [
    ...Object.keys(config.hostCapabilities ?? {}),
    CAPABILITY.principalContext,
    CAPABILITY.authenticationStrategyRegistry,
  ];

  const graph = unwrapResolution(
    resolvePlugins({
      inventory,
      manifests: config.plugins.map((registration) => ({
        manifest: registration.plugin.manifest,
        packageName: registrationPackageName(registration),
        packageVersion: registration.packageVersion ?? '0.0.0-unknown',
      })),
      hostCapabilities: hostCapabilityNames,
      officialScope: config.officialScope,
    }),
  );

  const byPluginId = new Map(
    config.plugins.map((registration) => [registration.plugin.manifest.id, registration]),
  );

  const capabilities = new CapabilityRegistry(config.hostCapabilities ?? {});
  const configDiagnostics: PluginDiagnostic[] = [];
  const instances: RuntimeInstance[] = [];
  const factories: {
    instance: RuntimeInstance;
    factory: NonNullable<AnyDefinedPlugin['backend']>;
    context: PluginRuntimeContext;
  }[] = [];
  const logger = config.logger ?? silentLogger;

  for (const resolved of graph.instances) {
    const registration = byPluginId.get(resolved.pluginId);
    if (!registration) {
      // The resolver already proved the manifest exists, so this can only happen if a caller
      // hand-built a graph; keep the failure explicit rather than dereferencing undefined.
      throw new PluginContractError(
        'plugin-registration-missing',
        `No statically imported plugin registration for "${resolved.pluginId}"`,
      );
    }

    const plugin = registration.plugin;
    const rawConfig = resolveConfigRef(config.runtime, resolved.configRef);

    let parsedConfig: unknown = rawConfig ?? {};
    if (plugin.configSchema) {
      try {
        parsedConfig = plugin.configSchema.parse({
          ...(plugin.defaultConfig ?? {}),
          ...((rawConfig as Record<string, unknown>) ?? {}),
        });
      } catch (error) {
        // Only the configRef path and the parser's own message — never the value, which is exactly
        // where a mistyped secret would be sitting.
        configDiagnostics.push(
          diagnostic(
            'invalid-plugin-config',
            `config at "${resolved.configRef ?? '(none)'}" for "${resolved.key}" is invalid: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
            { pluginId: resolved.pluginId, instanceId: resolved.instanceId, path: 'configSchema' },
          ),
        );
        continue;
      }
    }

    const instance: RuntimeInstance = {
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
      config: parsedConfig,
      redactedConfig: redactConfigForManifest(resolved.manifest, parsedConfig),
      hooks: plugin.lifecycle,
      optionalFailurePolicy: resolved.manifest.optionalFailurePolicy,
      healthIndicatorId: resolved.manifest.facets.operations?.healthIndicatorId,
      shutdownTimeoutMs:
        resolved.manifest.facets.operations?.shutdownTimeoutMs ?? config.shutdownTimeoutMs,
    };
    instances.push(instance);

    if (plugin.backend) {
      factories.push({
        instance,
        factory: plugin.backend,
        context: {
          pluginId: instance.pluginId,
          instanceId: instance.instanceId,
          key: instance.key,
          config: parsedConfig,
          logger,
          // Capabilities are bound after the injector exists (see AppspinePluginHost); a backend
          // factory builds a module, it must not resolve services yet.
          capabilities,
        },
      });
    }
  }

  if (configDiagnostics.length > 0) {
    throw new PluginContractError(
      'invalid-plugin-config',
      'Plugin configuration validation failed',
      configDiagnostics,
    );
  }

  return {
    state: {
      graph,
      instances,
      capabilities,
      stageTimeoutMs: config.stageTimeoutMs,
      shutdownTimeoutMs: config.shutdownTimeoutMs,
    },
    factories,
  };
}

function buildModule(config: AppspineHostConfig, prepared: PreparedComposition): DynamicModule {
  return {
    module: AppspineHostModule,
    // The composition module is intentionally not global. It may re-export capability modules for
    // the App that explicitly imports it, without making their providers visible everywhere.
    imports: [AppspineAuthInfrastructureModule, ...prepared.imports],
    providers: [
      { provide: APPSPINE_HOST_CONFIG, useValue: config },
      { provide: APPSPINE_HOST_STATE, useValue: prepared.state },
      AppspinePluginHost,
    ],
    exports: [
      APPSPINE_HOST_CONFIG,
      APPSPINE_HOST_STATE,
      AppspinePluginHost,
      AppspineAuthInfrastructureModule,
      ...prepared.imports,
    ],
  };
}

/**
 * Nest module visibility follows imports, not the resolver graph. Mirror each resolved dependency
 * edge into the consumer's DynamicModule so stable capability tokens are visible without making
 * capability modules global. Host auth infrastructure is imported explicitly for the two
 * host-owned tokens every backend may use.
 */
function withResolvedImports(
  produced: PluginBackendModule,
  dependencies: PluginBackendModule[],
): DynamicModule {
  const imports = [AppspineAuthInfrastructureModule, ...dependencies];
  if (typeof produced === 'object' && produced !== null && 'module' in produced) {
    return {
      ...produced,
      imports: [...imports, ...(produced.imports ?? [])],
    };
  }
  return { module: produced, imports };
}

function resolvedDependencyModules(
  state: HostRuntimeState,
  instanceKey: string,
  modulesByKey: ReadonlyMap<string, PluginBackendModule>,
): PluginBackendModule[] {
  const resolved = state.graph.instances.find((instance) => instance.key === instanceKey);
  if (!resolved) return [];
  return resolved.dependsOn.flatMap((key) => {
    const dependency = modulesByKey.get(key);
    return dependency ? [dependency] : [];
  });
}

/**
 * Composes the App's plugins into a single Nest module.
 *
 * Synchronous: every backend factory must return a module, not a promise. A plugin that needs to
 * await something during composition is a plugin the App should wire with
 * `createAppspineModuleAsync`, and saying so explicitly beats silently putting a `Promise` into
 * Nest's `imports` where the failure surfaces as an unrelated DI error.
 */
export function createAppspineModule(config: AppspineHostConfig): DynamicModule {
  const { state, factories } = prepare(config);
  const imports: PluginBackendModule[] = [];
  const modulesByKey = new Map<string, PluginBackendModule>();

  for (const { instance, factory, context } of factories) {
    const produced = factory(context);
    if (produced instanceof Promise) {
      throw new PluginContractError(
        'async-backend-factory',
        `Plugin "${instance.key}" returned a Promise from its backend factory; use createAppspineModuleAsync()`,
      );
    }
    const composed = withResolvedImports(
      produced as PluginBackendModule,
      resolvedDependencyModules(state, instance.key, modulesByKey),
    );
    imports.push(composed);
    modulesByKey.set(instance.key, composed);
  }

  return buildModule(config, { state, imports });
}

/** Same as `createAppspineModule`, for Apps whose plugins build their module asynchronously. */
export async function createAppspineModuleAsync(
  config: AppspineHostConfig,
): Promise<DynamicModule> {
  const { state, factories } = prepare(config);
  const imports: PluginBackendModule[] = [];
  const modulesByKey = new Map<string, PluginBackendModule>();

  for (const { instance, factory, context } of factories) {
    const composed = withResolvedImports(
      (await factory(context)) as PluginBackendModule,
      resolvedDependencyModules(state, instance.key, modulesByKey),
    );
    imports.push(composed);
    modulesByKey.set(instance.key, composed);
  }

  return buildModule(config, { state, imports });
}

/**
 * Anchor class for the dynamic module. Never imported directly by an App — `createAppspineModule`
 * is the entry point, and importing this bare would give an App a host with no plugins.
 */
@Module({})
export class AppspineHostModule {}
