import { describe, expect, it, vi } from 'vitest';
import type { PluginLifecycleHooks } from '../lifecycle';
import { readFixture } from '../test-support';
import {
  aggregateHealth,
  CapabilityRegistry,
  PluginLifecycleRunner,
  type RuntimeInstance,
} from './index';

const OPTIONAL_POLICY = {
  isolationBoundary: 'instance',
  degradedBehavior: { readiness: 'degraded', catalog: 'degraded', alert: 'required' },
} as const;

function instance(key: string, overrides: Partial<RuntimeInstance> = {}): RuntimeInstance {
  const [pluginId, instanceId = 'default'] = key.split('#');
  return {
    key,
    pluginId,
    instanceId,
    packageName: `@appspine/${pluginId}`,
    packageVersion: '1.0.0',
    digest: 'sha256:test',
    required: true,
    provides: [],
    requires: [],
    unresolvedOptional: [],
    config: {},
    ...overrides,
  };
}

function runner(instances: RuntimeInstance[], overrides: Record<string, unknown> = {}) {
  let clock = 0;
  return new PluginLifecycleRunner({
    instances,
    capabilities: new CapabilityRegistry(),
    now: () => (clock += 5),
    ...overrides,
  });
}

describe('boot', () => {
  it('runs validate -> register -> ready per instance, in dependency order', async () => {
    const calls: string[] = [];
    const hooks = (key: string): PluginLifecycleHooks => ({
      validate: () => void calls.push(`${key}:validate`),
      register: () => void calls.push(`${key}:register`),
      ready: () => void calls.push(`${key}:ready`),
    });

    const catalog = await runner([
      instance('audit-log', { hooks: hooks('audit-log') }),
      instance('rbac', { hooks: hooks('rbac') }),
    ]).boot();

    expect(calls).toEqual([
      'audit-log:validate',
      'audit-log:register',
      'audit-log:ready',
      'rbac:validate',
      'rbac:register',
      'rbac:ready',
    ]);
    expect(catalog.outcome).toBe('ready');
    expect(catalog.entries.map((e) => e.status)).toEqual(['ready', 'ready']);
  });

  it('aborts the boot and marks later instances not-reached when a required plugin fails', async () => {
    const fixture = readFixture('lifecycle/required-plugin-failure-aborts-boot.json') as {
      expectedCatalogStatus: Record<string, string>;
      simulatedFailure: { stage: string; reason: string };
    };

    const readyHook = vi.fn();
    const catalog = await runner([
      instance('audit-log', {
        hooks: {
          register: () => {
            throw new Error(fixture.simulatedFailure.reason);
          },
        },
      }),
      instance('health-check', { hooks: { ready: readyHook } }),
    ]).boot();

    expect(catalog.outcome).toBe('boot-aborted');
    expect(catalog.byKey['audit-log'].status).toBe(fixture.expectedCatalogStatus['audit-log']);
    expect(catalog.byKey['health-check'].status).toBe(
      fixture.expectedCatalogStatus['health-check'],
    );
    expect(readyHook).not.toHaveBeenCalled();
    expect(catalog.byKey['audit-log'].error).toMatchObject({ stage: 'register' });
    expect(catalog.diagnostics[0].code).toBe('lifecycle-stage-failed');
  });

  it('degrades an optional instance that declared a failure policy and keeps booting', async () => {
    const fixture = readFixture('lifecycle/optional-plugin-failure-degrades.json') as {
      expectedLifecycleOutcome: string;
      expectedCatalogStatus: Record<string, string>;
    };

    const warn = vi.fn();
    const catalog = await runner(
      [
        instance('health-check'),
        instance('master-data-client#hr-master-data', {
          required: false,
          optionalFailurePolicy: OPTIONAL_POLICY,
          hooks: {
            ready: () => {
              throw new Error('upstream endpoint unreachable');
            },
          },
        }),
      ],
      { logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() } },
    ).boot();

    expect(catalog.outcome).toBe(fixture.expectedLifecycleOutcome);
    expect(catalog.byKey['health-check'].status).toBe(
      fixture.expectedCatalogStatus['health-check'],
    );
    expect(catalog.byKey['master-data-client#hr-master-data'].status).toBe(
      fixture.expectedCatalogStatus['master-data-client#hr-master-data'],
    );
    // Degradation must be loud, not a swallowed catch (051 plan section 9).
    expect(warn).toHaveBeenCalledOnce();
    expect(catalog.diagnostics).toHaveLength(1);
  });

  it('treats an optional instance with no declared policy as a hard failure', async () => {
    const catalog = await runner([
      instance('health-check', {
        required: false,
        hooks: {
          ready: () => {
            throw new Error('nope');
          },
        },
      }),
    ]).boot();

    expect(catalog.outcome).toBe('boot-aborted');
    expect(catalog.byKey['health-check'].status).toBe('failed');
  });

  it('reports a hook that exceeds its stage budget as a timeout, not a generic failure', async () => {
    const catalog = await runner(
      [
        instance('slow', {
          hooks: { register: () => new Promise(() => undefined) },
        }),
      ],
      { stageTimeoutMs: 10, now: () => Date.now() },
    ).boot();

    expect(catalog.outcome).toBe('boot-aborted');
    expect(catalog.diagnostics[0].code).toBe('lifecycle-stage-timeout');
  });

  it('refuses to boot twice', async () => {
    const engine = runner([instance('health-check')]);
    await engine.boot();
    await expect(engine.boot()).rejects.toThrow(/only be called once/);
  });
});

describe('shutdown', () => {
  it('runs in exactly the reverse of registration order', async () => {
    const fixture = readFixture('lifecycle/reverse-order-shutdown.json') as {
      registerOrder: string[];
      expectedShutdownOrder: string[];
    };

    const stopped: string[] = [];
    const instances = fixture.registerOrder.map((key) =>
      instance(key, { hooks: { shutdown: () => void stopped.push(key) } }),
    );

    const engine = runner(instances);
    await engine.boot();
    const result = await engine.shutdown();

    expect(stopped).toEqual(fixture.expectedShutdownOrder);
    expect(result.outcome).toBe('shutdown-completed');
  });

  it('steps over a hanging hook, reports it, and still stops the rest', async () => {
    const fixture = readFixture('lifecycle/reverse-order-shutdown.json') as {
      expectedLifecycleOutcome: string;
    };

    const stopped: string[] = [];
    const engine = runner(
      [
        instance('audit-log', { hooks: { shutdown: () => void stopped.push('audit-log') } }),
        instance('rbac', {
          hooks: { shutdown: () => new Promise(() => undefined) },
          shutdownTimeoutMs: 10,
        }),
        instance('mcp-server', { hooks: { shutdown: () => void stopped.push('mcp-server') } }),
      ],
      { now: () => Date.now() },
    );

    await engine.boot();
    const result = await engine.shutdown();

    expect(result.outcome).toBe(fixture.expectedLifecycleOutcome);
    // rbac hung, but the instance registered before it still got its shutdown call.
    expect(stopped).toEqual(['mcp-server', 'audit-log']);
    expect(result.events.find((e) => e.key === 'rbac')?.outcome).toBe('timeout');
  });

  it('does not shut down an instance that never reached register', async () => {
    const shutdown = vi.fn();
    const engine = runner([
      instance('audit-log', {
        hooks: {
          validate: () => {
            throw new Error('bad config');
          },
          shutdown,
        },
      }),
    ]);

    await engine.boot();
    await engine.shutdown();
    expect(shutdown).not.toHaveBeenCalled();
  });
});

describe('capability registry', () => {
  it('throws a named error for a missing required capability and returns undefined for optional', () => {
    const registry = new CapabilityRegistry({ 'appspine.prisma': { client: true } });
    expect(registry.get('appspine.prisma')).toEqual({ client: true });
    expect(registry.getOptional('appspine.audit-sink')).toBeUndefined();
    expect(() => registry.get('appspine.audit-sink')).toThrow(/appspine.audit-sink/);
    registry.register('appspine.audit-sink', { record: () => Promise.resolve() });
    expect(registry.list()).toEqual(['appspine.audit-sink', 'appspine.prisma']);
  });
});

describe('aggregateHealth', () => {
  it('surfaces degraded instances instead of reporting a clean bill of health', async () => {
    const catalog = await runner([
      instance('health-check'),
      instance('master-data-client#hr', {
        required: false,
        optionalFailurePolicy: OPTIONAL_POLICY,
        hooks: {
          ready: () => {
            throw new Error('down');
          },
        },
      }),
    ]).boot();

    expect(aggregateHealth(catalog)).toEqual({
      status: 'degraded',
      degraded: ['master-data-client#hr'],
      failed: [],
    });
  });
});
