/**
 * `@appspine/plugin-api/runtime` — the framework-neutral lifecycle engine and catalog model.
 *
 * Why this lives here and not in the Nest host: `@appspine/plugin-testkit` must be able to drive a
 * lifecycle without depending on the host (PL1-03 depends on the testkit, so the reverse edge would
 * be a cycle), and two independent implementations of "required fails -> abort, optional fails ->
 * degrade, shutdown in reverse with a timeout" is exactly the kind of divergence the PL0-05
 * lifecycle fixtures exist to prevent. The host owns Nest module composition; this owns the state
 * machine both of them run.
 *
 * No `node:fs`, no NestJS, no Prisma — a plugin author can run this in a plain unit test.
 */

import { diagnostic, type PluginDiagnostic, sortDiagnostics } from '../diagnostics';
import type {
  CapabilityLookup,
  HostBootOutcome,
  HostShutdownOutcome,
  LifecycleEvent,
  PluginInstanceStatus,
  PluginLifecycleHooks,
  PluginLifecycleStage,
  PluginLogger,
  PluginRuntimeContext,
} from '../lifecycle';
import { PLUGIN_BOOT_STAGES } from '../lifecycle';
import type { OptionalFailurePolicy } from '../manifest';

export const DEFAULT_STAGE_TIMEOUT_MS = 30_000;
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/** One resolved instance, flattened into everything the runner needs. */
export interface RuntimeInstance<TConfig = unknown> {
  key: string;
  pluginId: string;
  instanceId: string;
  packageName: string;
  packageVersion: string;
  digest: string;
  required: boolean;
  provides: readonly string[];
  requires: readonly string[];
  unresolvedOptional: readonly string[];
  config: TConfig;
  /** Already redacted by the caller — the runner never sees raw secret values. */
  redactedConfig?: unknown;
  hooks?: PluginLifecycleHooks<TConfig>;
  optionalFailurePolicy?: OptionalFailurePolicy;
  healthIndicatorId?: string;
  shutdownTimeoutMs?: number;
}

export interface CatalogEntry {
  key: string;
  pluginId: string;
  instanceId: string;
  packageName: string;
  packageVersion: string;
  digest: string;
  status: PluginInstanceStatus;
  required: boolean;
  provides: string[];
  requires: string[];
  unresolvedOptional: string[];
  startupMs: number;
  healthIndicatorId?: string;
  /** Redacted config, or `undefined` when the instance declared none. */
  config?: unknown;
  error?: { stage: PluginLifecycleStage; message: string };
}

export interface HostCatalog {
  outcome: HostBootOutcome;
  entries: CatalogEntry[];
  byKey: Record<string, CatalogEntry>;
  diagnostics: PluginDiagnostic[];
}

/** In-memory capability registry. The Nest host binds the same objects to provider tokens. */
export class CapabilityRegistry implements CapabilityLookup {
  private readonly values = new Map<string, unknown>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [capability, value] of Object.entries(initial)) this.values.set(capability, value);
  }

  register(capability: string, value: unknown): void {
    this.values.set(capability, value);
  }

  has(capability: string): boolean {
    return this.values.has(capability);
  }

  get<T>(capability: string): T {
    if (!this.values.has(capability)) {
      throw new Error(`Capability "${capability}" is not available`);
    }
    return this.values.get(capability) as T;
  }

  getOptional<T>(capability: string): T | undefined {
    return this.values.get(capability) as T | undefined;
  }

  /** Capability names currently registered, sorted. */
  list(): string[] {
    return [...this.values.keys()].sort();
  }
}

export const silentLogger: PluginLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

class StageTimeoutError extends Error {
  constructor(stage: PluginLifecycleStage, key: string, timeoutMs: number) {
    super(`"${key}" exceeded its ${timeoutMs}ms budget during ${stage}`);
    this.name = 'StageTimeoutError';
  }
}

async function withTimeout<T>(
  work: () => T | Promise<T>,
  timeoutMs: number,
  stage: PluginLifecycleStage,
  key: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new StageTimeoutError(stage, key, timeoutMs)), timeoutMs);
        // A hook we have already given up on must not keep the process alive.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface LifecycleRunnerOptions {
  /** Instances in registration order — normally `ResolutionGraph.order` applied to the instances. */
  instances: readonly RuntimeInstance[];
  capabilities: CapabilityLookup;
  logger?: PluginLogger;
  stageTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  /** Injectable clock so tests can assert durations without sleeping. */
  now?: () => number;
}

/**
 * Drives `validate -> register -> ready` per instance in dependency order, then
 * `shutdown` in exactly the reverse order.
 *
 * Per-instance rather than stage-by-stage: a dependant must not start registering before the
 * provider it depends on is ready, and the PL0-05 fixture
 * `required-plugin-failure-aborts-boot.json` freezes the consequence — when the first instance
 * fails, later ones are reported as `not-reached`, not as half-validated.
 */
export class PluginLifecycleRunner {
  private readonly instances: readonly RuntimeInstance[];
  private readonly capabilities: CapabilityLookup;
  private readonly logger: PluginLogger;
  private readonly stageTimeoutMs: number;
  private readonly defaultShutdownTimeoutMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly recorded: LifecycleEvent[] = [];
  /** Instances that reached at least `register` and therefore own resources to release. */
  private readonly started: RuntimeInstance[] = [];
  private booted = false;

  constructor(options: LifecycleRunnerOptions) {
    this.instances = options.instances;
    this.capabilities = options.capabilities;
    this.logger = options.logger ?? silentLogger;
    this.stageTimeoutMs = options.stageTimeoutMs ?? DEFAULT_STAGE_TIMEOUT_MS;
    this.defaultShutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());

    for (const instance of this.instances) {
      this.entries.set(instance.key, {
        key: instance.key,
        pluginId: instance.pluginId,
        instanceId: instance.instanceId,
        packageName: instance.packageName,
        packageVersion: instance.packageVersion,
        digest: instance.digest,
        status: 'pending',
        required: instance.required,
        provides: [...instance.provides],
        requires: [...instance.requires],
        unresolvedOptional: [...instance.unresolvedOptional],
        startupMs: 0,
        healthIndicatorId: instance.healthIndicatorId,
        config: instance.redactedConfig,
      });
    }
  }

  get events(): readonly LifecycleEvent[] {
    return this.recorded;
  }

  private contextFor(instance: RuntimeInstance): PluginRuntimeContext {
    return {
      pluginId: instance.pluginId,
      instanceId: instance.instanceId,
      key: instance.key,
      config: instance.config,
      logger: this.logger,
      capabilities: this.capabilities,
    };
  }

  private record(event: LifecycleEvent): void {
    this.recorded.push(event);
  }

  async boot(): Promise<HostCatalog> {
    if (this.booted) throw new Error('boot() may only be called once');
    this.booted = true;

    const diagnostics: PluginDiagnostic[] = [];
    let aborted = false;
    let degraded = false;

    for (const instance of this.instances) {
      const entry = this.entries.get(instance.key) as CatalogEntry;

      if (aborted) {
        entry.status = 'not-reached';
        continue;
      }

      const failure = await this.runBootStages(instance, entry);
      if (!failure) continue;

      diagnostics.push(failure.diagnostic);
      if (instance.required || !instance.optionalFailurePolicy) {
        entry.status = 'failed';
        aborted = true;
        continue;
      }

      // 051 plan section 9: an optional instance may only degrade if its manifest declared how.
      entry.status = 'degraded';
      degraded = true;
      this.logger.warn(
        `Plugin "${instance.key}" is degraded: ${failure.diagnostic.message}. Readiness and catalog report degraded; this is not a silent failure.`,
      );
    }

    const outcome: HostBootOutcome = aborted
      ? 'boot-aborted'
      : degraded
        ? 'degraded-ready'
        : 'ready';

    return {
      outcome,
      entries: [...this.entries.values()],
      byKey: Object.fromEntries(this.entries),
      diagnostics: sortDiagnostics(diagnostics),
    };
  }

  private async runBootStages(
    instance: RuntimeInstance,
    entry: CatalogEntry,
  ): Promise<{ diagnostic: PluginDiagnostic } | null> {
    const startedAt = this.now();

    for (const stage of PLUGIN_BOOT_STAGES) {
      const hook = instance.hooks?.[stage];
      const stageStartedAt = this.now();

      if (!hook) {
        this.record({
          key: instance.key,
          pluginId: instance.pluginId,
          instanceId: instance.instanceId,
          stage,
          outcome: 'skipped',
          durationMs: 0,
        });
        this.advance(entry, stage);
        if (stage === 'register') this.started.push(instance);
        continue;
      }

      try {
        await withTimeout(
          () => hook.call(instance.hooks, this.contextFor(instance)),
          this.stageTimeoutMs,
          stage,
          instance.key,
        );
      } catch (error) {
        const timedOut = error instanceof StageTimeoutError;
        this.record({
          key: instance.key,
          pluginId: instance.pluginId,
          instanceId: instance.instanceId,
          stage,
          outcome: timedOut ? 'timeout' : 'failed',
          durationMs: this.now() - stageStartedAt,
        });
        entry.error = { stage, message: messageOf(error) };
        entry.startupMs = this.now() - startedAt;
        return {
          diagnostic: diagnostic(
            timedOut ? 'lifecycle-stage-timeout' : 'lifecycle-stage-failed',
            `"${instance.key}" failed during ${stage}: ${messageOf(error)}`,
            { pluginId: instance.pluginId, instanceId: instance.instanceId, path: stage },
          ),
        };
      }

      this.record({
        key: instance.key,
        pluginId: instance.pluginId,
        instanceId: instance.instanceId,
        stage,
        outcome: 'ok',
        durationMs: this.now() - stageStartedAt,
      });
      this.advance(entry, stage);
      if (stage === 'register') this.started.push(instance);
    }

    entry.startupMs = this.now() - startedAt;
    return null;
  }

  private advance(entry: CatalogEntry, stage: PluginLifecycleStage): void {
    const next: Record<string, PluginInstanceStatus> = {
      validate: 'validated',
      register: 'registered',
      ready: 'ready',
    };
    const status = next[stage];
    if (status) entry.status = status;
  }

  /**
   * Reverse-order shutdown with a per-instance budget. A hook that hangs is reported and stepped
   * over — it must not stop the instances behind it from releasing their resources
   * (`fixtures/051-manifest-v1/lifecycle/reverse-order-shutdown.json`).
   */
  async shutdown(): Promise<{ outcome: HostShutdownOutcome; events: LifecycleEvent[] }> {
    const events: LifecycleEvent[] = [];
    let timedOut = false;
    let failed = false;

    for (const instance of [...this.started].reverse()) {
      const entry = this.entries.get(instance.key) as CatalogEntry;
      const hook = instance.hooks?.shutdown;
      const startedAt = this.now();

      if (!hook) {
        entry.status = 'stopped';
        const event: LifecycleEvent = {
          key: instance.key,
          pluginId: instance.pluginId,
          instanceId: instance.instanceId,
          stage: 'shutdown',
          outcome: 'skipped',
          durationMs: 0,
        };
        events.push(event);
        this.record(event);
        continue;
      }

      try {
        await withTimeout(
          () => hook.call(instance.hooks, this.contextFor(instance)),
          instance.shutdownTimeoutMs ?? this.defaultShutdownTimeoutMs,
          'shutdown',
          instance.key,
        );
        entry.status = 'stopped';
        const event: LifecycleEvent = {
          key: instance.key,
          pluginId: instance.pluginId,
          instanceId: instance.instanceId,
          stage: 'shutdown',
          outcome: 'ok',
          durationMs: this.now() - startedAt,
        };
        events.push(event);
        this.record(event);
      } catch (error) {
        const isTimeout = error instanceof StageTimeoutError;
        if (isTimeout) timedOut = true;
        else failed = true;
        entry.error = { stage: 'shutdown', message: messageOf(error) };
        this.logger.error(
          `Plugin "${instance.key}" shutdown ${isTimeout ? 'timed out' : 'failed'}: ${messageOf(error)}`,
        );
        const event: LifecycleEvent = {
          key: instance.key,
          pluginId: instance.pluginId,
          instanceId: instance.instanceId,
          stage: 'shutdown',
          outcome: isTimeout ? 'timeout' : 'failed',
          durationMs: this.now() - startedAt,
        };
        events.push(event);
        this.record(event);
      }
    }

    const outcome: HostShutdownOutcome = timedOut
      ? 'shutdown-completed-with-reported-timeout'
      : failed
        ? 'shutdown-completed-with-reported-failure'
        : 'shutdown-completed';

    return { outcome, events };
  }
}

/** Aggregate readiness for a `/health` style endpoint. Never hides a degraded instance. */
export function aggregateHealth(catalog: HostCatalog): {
  status: 'ready' | 'degraded' | 'failed';
  degraded: string[];
  failed: string[];
} {
  const degraded = catalog.entries
    .filter((e) => e.status === 'degraded')
    .map((e) => e.key)
    .sort();
  const failed = catalog.entries
    .filter((e) => e.status === 'failed' || e.status === 'not-reached')
    .map((e) => e.key)
    .sort();

  if (failed.length > 0) return { status: 'failed', degraded, failed };
  if (degraded.length > 0) return { status: 'degraded', degraded, failed };
  return { status: 'ready', degraded, failed };
}
