/**
 * Plugin lifecycle contract.
 *
 * v1 defines exactly four stages — `validate`, `register`, `ready`, `shutdown` — and deliberately
 * promises no hot unload (051 plan section 5.1). Shutdown runs in reverse dependency order with a
 * per-instance timeout; a hook that hangs is reported, never silently swallowed
 * (051 plan section 9, frozen by `fixtures/051-manifest-v1/lifecycle/reverse-order-shutdown.json`).
 */

import type { PluginDiagnostic } from './diagnostics';

export const PLUGIN_LIFECYCLE_STAGES = Object.freeze([
  'validate',
  'register',
  'ready',
  'shutdown',
] as const);

export type PluginLifecycleStage = (typeof PLUGIN_LIFECYCLE_STAGES)[number];

/** Boot stages. `shutdown` is excluded: failing it degrades an already-running App, not a boot. */
export const PLUGIN_BOOT_STAGES: readonly PluginLifecycleStage[] = Object.freeze([
  'validate',
  'register',
  'ready',
]);

export type PluginInstanceStatus =
  | 'pending'
  | 'validated'
  | 'registered'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'not-reached'
  | 'disabled'
  | 'stopped';

/** Minimal logger so a plugin never has to depend on the host's logging stack. */
export interface PluginLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Capability lookup handed to a plugin at runtime. Resolution is by capability name, never by
 * package: that is what keeps `requires` in the manifest and the runtime dependency honest.
 */
export interface CapabilityLookup {
  get<T>(capability: string): T;
  getOptional<T>(capability: string): T | undefined;
  has(capability: string): boolean;
}

export interface PluginRuntimeContext<TConfig = unknown> {
  pluginId: string;
  instanceId: string;
  /** `instanceKey(pluginId, instanceId)` — the catalog/metric/log key for this instance. */
  key: string;
  config: TConfig;
  logger: PluginLogger;
  capabilities: CapabilityLookup;
}

export interface PluginLifecycleHooks<TConfig = unknown> {
  /** Pure checks only: config shape, cross-field rules. Must not open connections. */
  validate?(context: PluginRuntimeContext<TConfig>): void | Promise<void>;
  /** Claim resources the App needs before serving traffic (pools, clients, subscriptions). */
  register?(context: PluginRuntimeContext<TConfig>): void | Promise<void>;
  /** Everything is wired; start background work here so it is registered for shutdown. */
  ready?(context: PluginRuntimeContext<TConfig>): void | Promise<void>;
  /** Must be idempotent and finish inside the instance's shutdown budget. */
  shutdown?(context: PluginRuntimeContext<TConfig>): void | Promise<void>;
}

export interface LifecycleEvent {
  key: string;
  pluginId: string;
  instanceId: string;
  stage: PluginLifecycleStage;
  outcome: 'ok' | 'failed' | 'timeout' | 'skipped';
  durationMs: number;
  diagnostics?: PluginDiagnostic[];
}

/** Outcome vocabulary frozen by the PL0-05 lifecycle fixtures. */
export type HostBootOutcome = 'ready' | 'degraded-ready' | 'boot-aborted';

export type HostShutdownOutcome =
  | 'shutdown-completed'
  | 'shutdown-completed-with-reported-timeout'
  | 'shutdown-completed-with-reported-failure';
