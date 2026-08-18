/**
 * The running host (PL1-06).
 *
 * Composition happens before Nest boots (see `host.module.ts`); this service owns everything that
 * happens *after* the injector exists: binding resolved capabilities to the registry, driving the
 * lifecycle, exposing the catalog and health, and shutting down in reverse order.
 *
 * Boot failure of a required instance throws out of `onApplicationBootstrap`, which is how "App
 * 啟動失敗" (051 plan section 9) is actually enforced — not by logging and continuing.
 */

import type { LifecycleEvent, PluginDiagnostic } from '@appspine/plugin-api';
import {
  CAPABILITY,
  CAPABILITY_TOKENS,
  capabilityInstanceToken,
  PluginContractError,
} from '@appspine/plugin-api';
import type { ResolutionGraph } from '@appspine/plugin-api/resolver';
import { shutdownOrder } from '@appspine/plugin-api/resolver';
import type { HostCatalog, RuntimeInstance } from '@appspine/plugin-api/runtime';
import {
  aggregateHealth,
  CapabilityRegistry,
  PluginLifecycleRunner,
} from '@appspine/plugin-api/runtime';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthenticationStrategyRegistry } from '../auth/strategy-registry';

export interface HostRuntimeState {
  graph: ResolutionGraph;
  instances: RuntimeInstance[];
  capabilities: CapabilityRegistry;
  stageTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

export const APPSPINE_HOST_STATE = Symbol.for('appspine.host-state');

@Injectable()
export class AppspinePluginHost implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('AppspinePluginHost');
  private readonly runner: PluginLifecycleRunner;
  private catalogValue: HostCatalog | null = null;

  constructor(
    // Explicit tokens on every injected parameter: `emitDecoratorMetadata` is a TypeScript-only
    // feature, and a host that silently requires it cannot be unit-tested under esbuild/SWC or
    // consumed by an App that compiles with anything else.
    @Inject(APPSPINE_HOST_STATE) private readonly state: HostRuntimeState,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(AuthenticationStrategyRegistry)
    private readonly strategies: AuthenticationStrategyRegistry,
  ) {
    this.runner = new PluginLifecycleRunner({
      instances: state.instances,
      capabilities: state.capabilities,
      logger: {
        debug: (message) => this.logger.debug(message),
        info: (message) => this.logger.log(message),
        warn: (message) => this.logger.warn(message),
        error: (message) => this.logger.error(message),
      },
      stageTimeoutMs: state.stageTimeoutMs,
      shutdownTimeoutMs: state.shutdownTimeoutMs,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    this.bindResolvedCapabilities();
    const catalog = await this.runner.boot();
    this.catalogValue = catalog;

    if (catalog.outcome === 'boot-aborted') {
      const failed = catalog.entries.filter((entry) => entry.status === 'failed');
      throw new PluginContractError(
        'plugin-boot-aborted',
        `Appspine plugin boot aborted: required plugin${failed.length === 1 ? '' : 's'} ${failed
          .map((entry) => `"${entry.key}"`)
          .join(', ')} failed`,
        catalog.diagnostics,
      );
    }

    if (catalog.outcome === 'degraded-ready') {
      this.logger.warn(
        `Appspine started degraded: ${catalog.entries
          .filter((entry) => entry.status === 'degraded')
          .map((entry) => entry.key)
          .join(', ')}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const result = await this.runner.shutdown();
    if (result.outcome !== 'shutdown-completed') {
      this.logger.error(`Appspine shutdown finished with issues: ${result.outcome}`);
    }
  }

  /**
   * Looks each resolved capability up in the Nest injector and puts the concrete instance in the
   * registry, so a lifecycle hook can ask for a capability by name. `strict: false` because the
   * provider lives in whichever plugin module exported it, not in the host's own module.
   */
  private bindResolvedCapabilities(): void {
    for (const [capability, providerKeys] of Object.entries(this.state.graph.providers)) {
      const token = CAPABILITY_TOKENS[capability] ?? this.instanceTokenFor(capability);
      if (!token) continue;
      try {
        this.state.capabilities.register(capability, this.moduleRef.get(token, { strict: false }));
      } catch {
        // A capability without a provider token is normal — `appspine.health-indicator` is a
        // contribution, not an injectable. The resolver already proved the *declaration* exists;
        // this only makes the concrete object reachable when there is one.
        this.logger.debug(
          `Capability "${capability}" (from ${providerKeys.join(', ')}) has no injectable provider bound to its token`,
        );
      }
    }
  }

  private instanceTokenFor(capability: string): symbol | undefined {
    const hash = capability.indexOf('#');
    if (hash === -1) return undefined;
    return capabilityInstanceToken(capability.slice(0, hash), capability.slice(hash + 1));
  }

  /** The plugin catalog (051 plan section 9). Config values are already redacted. */
  get catalog(): HostCatalog {
    if (!this.catalogValue) {
      throw new Error('The plugin catalog is not available until the App has bootstrapped');
    }
    return this.catalogValue;
  }

  get graph(): ResolutionGraph {
    return this.state.graph;
  }

  get diagnostics(): readonly PluginDiagnostic[] {
    return this.catalogValue?.diagnostics ?? [];
  }

  get lifecycleEvents(): readonly LifecycleEvent[] {
    return this.runner.events;
  }

  /** Readiness for a health endpoint; a degraded instance is always visible here. */
  health() {
    return aggregateHealth(this.catalog);
  }

  /**
   * Operator-facing summary. Deliberately assembled from already-redacted catalog entries plus
   * public metadata — there is no path here that could reach a raw config value.
   */
  describe() {
    return {
      outcome: this.catalog.outcome,
      order: this.state.graph.order,
      shutdownOrder: shutdownOrder(this.state.graph),
      resolutionDigest: this.state.graph.digest,
      authenticationStrategies: this.strategies.describe(),
      hostCapabilities: this.state.capabilities.list(),
      plugins: this.catalog.entries.map((entry) => ({
        key: entry.key,
        pluginId: entry.pluginId,
        instanceId: entry.instanceId,
        package: `${entry.packageName}@${entry.packageVersion}`,
        digest: entry.digest,
        status: entry.status,
        required: entry.required,
        provides: entry.provides,
        requires: entry.requires,
        unresolvedOptional: entry.unresolvedOptional,
        startupMs: entry.startupMs,
        error: entry.error?.message,
        config: entry.config,
      })),
      disabled: this.state.graph.disabled,
    };
  }
}

/** Re-exported for consumers that only need the well-known capability names. */
export { CAPABILITY };
