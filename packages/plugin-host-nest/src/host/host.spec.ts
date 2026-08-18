import 'reflect-metadata';
import type { PluginLifecycleHooks } from '@appspine/plugin-api';
import { AUDIT_SINK, definePlugin, PluginContractError } from '@appspine/plugin-api';
import {
  backendFacet,
  buildManifest,
  DEGRADABLE,
  inventoryEntry,
  multiInstanceEntries,
  operationsFacet,
  optionalInventoryEntry,
} from '@appspine/plugin-testkit';
import { Inject, Injectable, Module, Optional } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppspinePluginHost } from './appspine-host';
import { createAppspineModule, createAppspineModuleAsync } from './host.module';

/**
 * Real Nest integration: every test below builds an actual injector and runs the real bootstrap /
 * shutdown hooks. The PL0-05 lifecycle fixtures froze these outcomes before the host existed;
 * these are the tests that make the host honour them.
 */

@Injectable()
class FakeAuditSink {
  readonly records: unknown[] = [];
  async record(input: unknown) {
    this.records.push(input);
    return input;
  }
}

@Module({
  providers: [FakeAuditSink, { provide: AUDIT_SINK, useExisting: FakeAuditSink }],
  exports: [FakeAuditSink, AUDIT_SINK],
})
class FakeAuditModule {}

const auditManifest = buildManifest({
  id: 'audit-log',
  provides: ['appspine.audit-sink'],
  requires: ['appspine.prisma'],
  facets: { backend: backendFacet('AuditLogModule') },
});

const consumerManifest = buildManifest({
  id: 'rbac',
  provides: ['appspine.rbac-policy'],
  requires: ['appspine.prisma', 'appspine.audit-sink'],
  facets: { backend: backendFacet('RbacModule'), operations: operationsFacet('rbac') },
});

@Injectable()
class AuditConsumer {
  constructor(@Optional() @Inject(AUDIT_SINK) readonly sink?: FakeAuditSink) {}
}

@Module({ providers: [AuditConsumer], exports: [AuditConsumer] })
class RbacFakeModule {}

const HOST_CAPABILITIES = { 'appspine.prisma': { $connect: () => undefined } };

function auditPlugin(lifecycle: PluginLifecycleHooks = {}) {
  return definePlugin({
    manifest: auditManifest,
    backend: () => FakeAuditModule,
    lifecycle,
  });
}

function rbacPlugin(lifecycle: PluginLifecycleHooks = {}) {
  return definePlugin({ manifest: consumerManifest, backend: () => RbacFakeModule, lifecycle });
}

/**
 * Boots a real Nest application context — not an HTTP app: the host has no HTTP surface of its own
 * in Phase 1, and requiring a platform adapter here would only test `@nestjs/platform-express`.
 * `init()` runs the real `onApplicationBootstrap` hooks and `close()` the real shutdown ones.
 */
async function bootApp(moduleDef: ReturnType<typeof createAppspineModule>) {
  const moduleRef = await Test.createTestingModule({ imports: [moduleDef] }).compile();
  await moduleRef.init();
  return moduleRef;
}

describe('composition', () => {
  it('keeps capability re-exports scoped to the App that imports the host composition', () => {
    const composed = createAppspineModule({
      inventory: [inventoryEntry('audit-log')],
      plugins: [{ plugin: auditPlugin() }],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(composed.global).not.toBe(true);
    expect(
      composed.exports?.some(
        (entry) =>
          entry === FakeAuditModule ||
          (typeof entry === 'object' &&
            entry !== null &&
            'module' in entry &&
            entry.module === FakeAuditModule),
      ),
    ).toBe(true);
  });

  it('boots an App whose plugins resolve, and exposes a catalog', async () => {
    const order: string[] = [];
    const app = await bootApp(
      createAppspineModule({
        inventory: [inventoryEntry('rbac'), inventoryEntry('audit-log')],
        plugins: [
          {
            plugin: auditPlugin({ ready: () => void order.push('audit-log') }),
            packageVersion: '1.0.1',
          },
          { plugin: rbacPlugin({ ready: () => void order.push('rbac') }), packageVersion: '2.0.0' },
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );

    const host = app.get(AppspinePluginHost);
    expect(app.get(AuditConsumer).sink).toBeInstanceOf(FakeAuditSink);
    expect(host.catalog.outcome).toBe('ready');
    expect(order).toEqual(['audit-log', 'rbac']);

    const described = host.describe();
    expect(described.order).toEqual(['audit-log', 'rbac']);
    expect(described.shutdownOrder).toEqual(['rbac', 'audit-log']);
    expect(described.plugins.map((entry) => entry.package)).toEqual([
      '@appspine/audit-log@1.0.1',
      '@appspine/rbac@2.0.0',
    ]);
    expect(host.health()).toEqual({ status: 'ready', degraded: [], failed: [] });

    await app.close();
  });

  it('binds a resolved capability to its stable token so a lifecycle hook can use it', async () => {
    const seen: unknown[] = [];
    const app = await bootApp(
      createAppspineModule({
        inventory: [inventoryEntry('audit-log'), inventoryEntry('rbac')],
        plugins: [
          { plugin: auditPlugin() },
          {
            plugin: rbacPlugin({
              ready: (context) => {
                seen.push(context.capabilities.get('appspine.audit-sink'));
              },
            }),
          },
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );

    expect(seen[0]).toBeInstanceOf(FakeAuditSink);
    await app.close();
  });

  it('rejects the whole composition when a required capability has no provider', () => {
    expect(() =>
      createAppspineModule({
        inventory: [inventoryEntry('rbac')],
        plugins: [{ plugin: rbacPlugin() }],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    ).toThrowError(/missing-required-capability/);
  });

  it('rejects duplicate routes before Nest ever sees them', () => {
    const one = buildManifest({
      id: 'alpha',
      provides: ['appspine.audit-sink'],
      facets: {
        backend: backendFacet('AlphaModule', { controllerRoutes: ['/api/shared'] }),
      },
    });
    const two = buildManifest({
      id: 'beta',
      provides: ['appspine.notification-inbox'],
      facets: { backend: backendFacet('BetaModule', { controllerRoutes: ['/api/shared'] }) },
    });

    expect(() =>
      createAppspineModule({
        inventory: [inventoryEntry('alpha'), inventoryEntry('beta')],
        plugins: [
          { plugin: definePlugin({ manifest: one, backend: () => RbacFakeModule }) },
          { plugin: definePlugin({ manifest: two, backend: () => RbacFakeModule }) },
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    ).toThrowError(/duplicate-route/);
  });

  it('validates plugin config before bootstrap and never echoes the value', () => {
    const manifest = buildManifest({
      id: 'master-data-client',
      cardinality: 'multiple',
      configSchema: { configRef: 'masterData' },
      provides: ['appspine.master-data-client'],
      environment: [{ key: 'MASTER_DATA_API_KEY', required: true, secret: true }],
    });

    let thrown: unknown;
    try {
      createAppspineModule({
        inventory: multiInstanceEntries('master-data-client', ['hr'], { configRef: 'masterData' }),
        plugins: [
          {
            plugin: definePlugin({
              manifest,
              backend: () => RbacFakeModule,
              configSchema: {
                parse: (input) => {
                  const value = input as { endpoint?: unknown };
                  if (typeof value.endpoint !== 'string') throw new Error('endpoint is required');
                  return value;
                },
              },
            }),
          },
        ],
        runtime: { masterData: { masterDataApiKey: 'super-secret' } },
        hostCapabilities: HOST_CAPABILITIES,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PluginContractError);
    const message = (thrown as PluginContractError).message;
    expect(message).toContain('invalid-plugin-config');
    expect(message).toContain('masterData');
    expect(message).not.toContain('super-secret');
  });

  it('redacts secret config in the catalog an operator can read', async () => {
    const manifest = buildManifest({
      id: 'master-data-client',
      cardinality: 'multiple',
      configSchema: { configRef: 'masterData' },
      provides: ['appspine.master-data-client'],
      environment: [{ key: 'MASTER_DATA_API_KEY', required: true, secret: true }],
    });

    const app = await bootApp(
      createAppspineModule({
        inventory: multiInstanceEntries('master-data-client', ['hr'], { configRef: 'masterData' }),
        plugins: [
          {
            plugin: definePlugin({
              manifest,
              backend: () => RbacFakeModule,
              configSchema: { parse: (input) => input },
            }),
          },
        ],
        runtime: {
          masterData: { endpoint: 'https://hr.example', masterDataApiKey: 'super-secret' },
        },
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );

    const described = app.get(AppspinePluginHost).describe();
    expect(JSON.stringify(described)).not.toContain('super-secret');
    expect(described.plugins[0].config).toMatchObject({ endpoint: 'https://hr.example' });
    await app.close();
  });

  it('tells the caller to use the async entry point instead of leaking a Promise into imports', () => {
    expect(() =>
      createAppspineModule({
        inventory: [inventoryEntry('audit-log')],
        plugins: [
          {
            plugin: definePlugin({
              manifest: auditManifest,
              backend: async () => FakeAuditModule,
            }),
          },
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    ).toThrowError(/createAppspineModuleAsync/);
  });

  it('supports an asynchronous backend factory through the async entry point', async () => {
    const app = await bootApp(
      await createAppspineModuleAsync({
        inventory: [inventoryEntry('audit-log')],
        plugins: [
          {
            plugin: definePlugin({
              manifest: auditManifest,
              backend: async () => FakeAuditModule,
            }),
          },
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );

    expect(app.get(AppspinePluginHost).catalog.outcome).toBe('ready');
    await app.close();
  });
});

describe('lifecycle failure policy', () => {
  it('aborts App startup when a required plugin fails', async () => {
    const moduleDef = createAppspineModule({
      inventory: [inventoryEntry('audit-log'), inventoryEntry('rbac')],
      plugins: [
        {
          plugin: auditPlugin({
            register: () => {
              throw new Error('Prisma connection refused');
            },
          }),
        },
        { plugin: rbacPlugin() },
      ],
      hostCapabilities: HOST_CAPABILITIES,
    });

    const app = await Test.createTestingModule({ imports: [moduleDef] }).compile();

    await expect(app.init()).rejects.toThrowError(/plugin boot aborted/i);
    expect(app.get(AppspinePluginHost).catalog.byKey.rbac.status).toBe('not-reached');
    // No close() here: Nest's close() re-enters init() on a context that never initialised, which
    // would re-raise this same boot failure as an unhandled rejection. A real App exits instead.
  });

  it('boots degraded when an optional plugin with a declared policy fails', async () => {
    const flaky = buildManifest({
      id: 'master-data-client',
      cardinality: 'multiple',
      configSchema: { configRef: 'masterData' },
      optionalFailurePolicy: DEGRADABLE,
      provides: ['appspine.master-data-client'],
      facets: {
        backend: backendFacet('MasterDataClientModule'),
        operations: operationsFacet('master-data-client'),
      },
    });

    const app = await bootApp(
      createAppspineModule({
        inventory: [
          inventoryEntry('audit-log'),
          optionalInventoryEntry('master-data-client', {
            instanceId: 'hr',
            configRef: 'masterData',
          }),
        ],
        plugins: [
          { plugin: auditPlugin() },
          {
            plugin: definePlugin({
              manifest: flaky,
              backend: () => RbacFakeModule,
              configSchema: { parse: (input) => input },
              lifecycle: {
                ready: () => {
                  throw new Error('upstream unreachable');
                },
              },
            }),
          },
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );

    const host = app.get(AppspinePluginHost);
    expect(host.catalog.outcome).toBe('degraded-ready');
    expect(host.health()).toEqual({
      status: 'degraded',
      degraded: ['master-data-client#hr'],
      failed: [],
    });
    await app.close();
  });

  it('releases plugin resources in reverse order on app.close()', async () => {
    const stopped: string[] = [];
    const app = await bootApp(
      createAppspineModule({
        inventory: [inventoryEntry('audit-log'), inventoryEntry('rbac')],
        plugins: [
          { plugin: auditPlugin({ shutdown: () => void stopped.push('audit-log') }) },
          { plugin: rbacPlugin({ shutdown: () => void stopped.push('rbac') }) },
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );

    await app.close();
    expect(stopped).toEqual(['rbac', 'audit-log']);
  });

  it('has no hot-unload API — v1 deliberately does not promise one', () => {
    const host = AppspinePluginHost.prototype as unknown as Record<string, unknown>;
    for (const forbidden of ['unload', 'reload', 'disablePlugin', 'enablePlugin']) {
      expect(host[forbidden]).toBeUndefined();
    }
  });
});

describe('boot diagnostics', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('refuses to expose a catalog before bootstrap', async () => {
    const moduleDef = createAppspineModule({
      inventory: [inventoryEntry('audit-log')],
      plugins: [{ plugin: auditPlugin() }],
      hostCapabilities: HOST_CAPABILITIES,
    });
    const moduleRef = await Test.createTestingModule({ imports: [moduleDef] }).compile();
    expect(() => moduleRef.get(AppspinePluginHost).catalog).toThrowError(/not available until/);
    warn.mockRestore();
  });
});
