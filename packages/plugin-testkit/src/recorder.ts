/**
 * Lifecycle recorder.
 *
 * Wraps a plugin's hooks so a test can assert *what ran, in which order, with which config* without
 * writing bookkeeping in every spec. Returns real hooks, so the recorder also works as the hook set
 * for a stub plugin.
 */

import type {
  PluginLifecycleHooks,
  PluginLifecycleStage,
  PluginRuntimeContext,
} from '@appspine/plugin-api';

export interface RecordedCall {
  key: string;
  stage: PluginLifecycleStage;
  config: unknown;
}

export interface LifecycleRecorder {
  /** Hooks to hand to a plugin definition. Every stage is recorded, then delegated if present. */
  hooks(overrides?: PluginLifecycleHooks): PluginLifecycleHooks;
  readonly calls: RecordedCall[];
  /** `["health-check:validate", "health-check:register", ...]` — convenient for one assertion. */
  trace(): string[];
  stages(key: string): PluginLifecycleStage[];
  reset(): void;
}

const ALL_STAGES: PluginLifecycleStage[] = ['validate', 'register', 'ready', 'shutdown'];

export function createLifecycleRecorder(): LifecycleRecorder {
  const calls: RecordedCall[] = [];

  return {
    calls,
    hooks(overrides: PluginLifecycleHooks = {}) {
      const wrapped: PluginLifecycleHooks = {};
      for (const stage of ALL_STAGES) {
        wrapped[stage] = async (context: PluginRuntimeContext) => {
          calls.push({ key: context.key, stage, config: context.config });
          await overrides[stage]?.(context);
        };
      }
      return wrapped;
    },
    trace: () => calls.map((call) => `${call.key}:${call.stage}`),
    stages: (key: string) => calls.filter((call) => call.key === key).map((call) => call.stage),
    reset: () => {
      calls.length = 0;
    },
  };
}
