import { definePlugin } from '@appspine/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  expectBootOutcome,
  expectCatalogStatus,
  expectDiagnostic,
  expectNoErrorDiagnostics,
  expectRedacted,
  expectRegisteredBefore,
  expectResolutionError,
  expectResolutionOk,
} from './assertions';
import {
  backendFacet,
  buildInventory,
  buildManifest,
  DEGRADABLE,
  inventoryEntry,
  multiInstanceEntries,
  operationsFacet,
  optionalInventoryEntry,
} from './builders';
import {
  createFakeAuditSink,
  createFakeIdentityStore,
  createFakePrincipalContext,
  createFakeRbacPolicy,
  createFakeScopeMatcher,
} from './fakes';
import { bootHarness, createPluginHarness, resolveHarness } from './harness';
import { createLifecycleRecorder } from './recorder';

/**
 * Everything here is built from the testkit's own helpers — no workspace fixture paths, no relative
 * `../../` imports. That is the PL1-02 acceptance criterion: the same specs must run from an
 * installed tarball.
 */

const HOST = { 'appspine.prisma': { client: true } };

describe('manifest builder', () => {
  it('produces a valid minimal manifest from just an ID', () => {
    const manifest = buildManifest({ id: 'health-check' });
    expect(manifest.schemaVersion).toBe('appspine.plugin/v1');
    expect(manifest.cardinality).toBe('singleton');
    expect(manifest.facets.backend).toEqual({
      modulePath: './dist/health-check.module.js',
      exportName: 'HealthCheckModule',
    });
  });

  it('lets a test override exactly one field without restating the rest', () => {
    const manifest = buildManifest({
      id: 'master-data-client',
      cardinality: 'multiple',
      configSchema: { configRef: 'masterData' },
      optionalFailurePolicy: DEGRADABLE,
      facets: {
        backend: backendFacet('MasterDataClientModule'),
        operations: operationsFacet('master-data-client', { metricsPrefix: 'master_data_client' }),
      },
    });
    expect(manifest.cardinality).toBe('multiple');
    expect(manifest.displayName).toBe('master-data-client');
    expect(manifest.facets.operations?.metricsPrefix).toBe('master_data_client');
  });

  it('builds inventories for singleton, optional and multi-instance shapes', () => {
    expect(inventoryEntry('health-check')).toEqual({
      plugin: 'health-check',
      instanceId: 'default',
      enabled: true,
      required: true,
    });
    expect(optionalInventoryEntry('x').required).toBe(false);
    expect(
      multiInstanceEntries('master-data-client', ['hr', 'finance']).map((e) => e.instanceId),
    ).toEqual(['hr', 'finance']);
    expect(buildInventory([inventoryEntry('x')]).schemaVersion).toBe('appspine.plugins/v1');
  });
});

describe('harness', () => {
  const auditManifest = buildManifest({
    id: 'audit-log',
    provides: ['appspine.audit-sink'],
    requires: ['appspine.prisma'],
  });
  const consumerManifest = buildManifest({
    id: 'rbac',
    provides: ['appspine.rbac-policy'],
    requires: ['appspine.prisma', 'appspine.audit-sink'],
  });

  it('registers a provider before its consumer and reports a clean catalog', async () => {
    const recorder = createLifecycleRecorder();
    const { catalog, harness } = await bootHarness({
      plugins: [
        {
          plugin: definePlugin({
            manifest: auditManifest,
            backend: () => ({}),
            lifecycle: recorder.hooks(),
          }),
        },
        {
          plugin: definePlugin({
            manifest: consumerManifest,
            backend: () => ({}),
            lifecycle: recorder.hooks(),
          }),
        },
      ],
      inventory: [inventoryEntry('rbac'), inventoryEntry('audit-log')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectNoErrorDiagnostics(catalog.diagnostics);
    expectRegisteredBefore(harness.graph.order, 'audit-log', 'rbac');
    expectCatalogStatus(catalog, { 'audit-log': 'ready', rbac: 'ready' });
    expect(recorder.trace()).toEqual([
      'audit-log:validate',
      'audit-log:register',
      'audit-log:ready',
      'rbac:validate',
      'rbac:register',
      'rbac:ready',
    ]);
  });

  it('surfaces a resolution failure with its exact code instead of a generic throw', () => {
    const result = resolveHarness({
      plugins: [{ plugin: { manifest: consumerManifest } }],
      inventory: [inventoryEntry('rbac')],
      hostCapabilities: HOST,
    });
    const found = expectResolutionError(result, 'missing-required-capability');
    expect(found.pluginId).toBe('rbac');
  });

  it('degrades an optional instance and keeps the rest of the App up', async () => {
    const flaky = buildManifest({
      id: 'master-data-client',
      cardinality: 'multiple',
      configSchema: { configRef: 'masterData' },
      optionalFailurePolicy: DEGRADABLE,
      provides: ['appspine.master-data-client'],
      requires: [],
      facets: {
        backend: backendFacet('MasterDataClientModule'),
        operations: operationsFacet('master-data-client'),
      },
    });

    const { catalog } = await bootHarness({
      plugins: [
        { plugin: definePlugin({ manifest: auditManifest, backend: () => ({}) }) },
        {
          plugin: definePlugin({
            manifest: flaky,
            backend: () => ({}),
            configSchema: { parse: (input) => input },
            lifecycle: {
              ready: () => {
                throw new Error('upstream unreachable');
              },
            },
          }),
        },
      ],
      inventory: [
        inventoryEntry('audit-log'),
        optionalInventoryEntry('master-data-client', { instanceId: 'hr', configRef: 'masterData' }),
      ],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'degraded-ready');
    expectCatalogStatus(catalog, {
      'audit-log': 'ready',
      'master-data-client#hr': 'degraded',
    });
    expectDiagnostic(catalog.diagnostics, 'lifecycle-stage-failed');
  });

  it('passes per-instance config through and redacts secrets in the catalog', async () => {
    const manifest = buildManifest({
      id: 'master-data-client',
      cardinality: 'multiple',
      configSchema: { configRef: 'masterData' },
      environment: [
        { key: 'MASTER_DATA_API_KEY', required: true, secret: true },
        { key: 'MASTER_DATA_ENDPOINT', required: true, secret: false },
      ],
      provides: ['appspine.master-data-client'],
      requires: [],
    });

    const recorder = createLifecycleRecorder();
    const { catalog } = await bootHarness({
      plugins: [
        {
          plugin: definePlugin({
            manifest,
            backend: () => ({}),
            configSchema: { parse: (input) => input },
            lifecycle: recorder.hooks(),
          }),
          config: {
            hr: { endpoint: 'https://hr.example', masterDataApiKey: 'hr-secret' },
            finance: { endpoint: 'https://fin.example', masterDataApiKey: 'fin-secret' },
          },
        },
      ],
      inventory: multiInstanceEntries('master-data-client', ['hr', 'finance'], {
        configRef: 'masterData',
      }),
      hostCapabilities: HOST,
    });

    const hrValidate = recorder.calls.find(
      (call) => call.key === 'master-data-client#hr' && call.stage === 'validate',
    );
    expect(hrValidate?.config).toEqual({
      endpoint: 'https://hr.example',
      masterDataApiKey: 'hr-secret',
    });
    expectRedacted(catalog.entries, 'hr-secret', 'fin-secret');
    expect(catalog.byKey['master-data-client#hr'].config).toMatchObject({
      endpoint: 'https://hr.example',
    });
  });

  it('shuts down in reverse order', async () => {
    const recorder = createLifecycleRecorder();
    const harness = createPluginHarness({
      plugins: [
        {
          plugin: definePlugin({
            manifest: auditManifest,
            backend: () => ({}),
            lifecycle: recorder.hooks(),
          }),
        },
        {
          plugin: definePlugin({
            manifest: consumerManifest,
            backend: () => ({}),
            lifecycle: recorder.hooks(),
          }),
        },
      ],
      inventory: [inventoryEntry('audit-log'), inventoryEntry('rbac')],
      hostCapabilities: HOST,
    });

    await harness.boot();
    recorder.reset();
    const result = await harness.shutdown();

    expect(result.outcome).toBe('shutdown-completed');
    expect(recorder.trace()).toEqual(['rbac:shutdown', 'audit-log:shutdown']);
  });

  it('resolves a graph the caller can inspect without booting', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: { manifest: auditManifest } }],
        inventory: [inventoryEntry('audit-log')],
        hostCapabilities: HOST,
      }),
    );
    expect(graph.order).toEqual(['audit-log']);
    expect(graph.providers['appspine.audit-sink']).toEqual(['audit-log']);
  });
});

describe('fakes', () => {
  it('records audit writes and can simulate a sink outage', async () => {
    const sink = createFakeAuditSink();
    await sink.record({
      entityType: 'User',
      entityId: 'u1',
      action: 'CREATE',
      actorId: 'u1',
      actorEmail: 'a@b.c',
      appName: 'test',
    });
    expect(sink.records).toHaveLength(1);

    sink.failNext();
    await expect(
      sink.record({
        entityType: 'User',
        entityId: 'u2',
        action: 'CREATE',
        actorId: 'u2',
        actorEmail: 'b@b.c',
        appName: 'test',
      }),
    ).rejects.toThrow(/unavailable/);
    expect(sink.records).toHaveLength(1);
  });

  it('enforces email uniqueness the way the real User table does', async () => {
    const store = createFakeIdentityStore();
    store.seed({ id: 'u1', email: 'taken@example.com' });
    await expect(store.create({ email: 'taken@example.com' })).rejects.toThrow(
      /already registered/,
    );

    const created = await store.create({ email: 'new@example.com', name: 'New' });
    expect(created).toMatchObject({ email: 'new@example.com', isActive: true });
    expect(store.created).toHaveLength(2);
  });

  it('separates identity lookups with and without roles', async () => {
    const store = createFakeIdentityStore();
    store.seed({
      id: 'u1',
      email: 'a@b.c',
      roles: [{ name: 'ADMIN', permissionPolicy: 'ALLOW_ALL', permissions: [] }],
    });
    expect(await store.findByEmail('a@b.c')).not.toHaveProperty('roles');
    expect((await store.findWithRolesByEmail('a@b.c'))?.roles).toHaveLength(1);
    expect(await store.findById('missing')).toBeNull();
  });

  it('flattens roles with the most permissive policy and a deduped permission union', () => {
    expect(
      createFakeRbacPolicy().flatten([
        { name: 'USER', permissionPolicy: 'DENY_ALL', permissions: [{ permission: 'a' }] },
        {
          name: 'EDITOR',
          permissionPolicy: 'READ_ALL',
          permissions: [{ permission: 'a' }, { permission: 'b' }],
        },
      ]),
    ).toEqual({
      roleNames: ['USER', 'EDITOR'],
      permissionPolicy: 'READ_ALL',
      permissions: ['a', 'b'],
    });
  });

  it('matches scopes including the wildcard', () => {
    const matcher = createFakeScopeMatcher();
    expect(matcher.matches(['read'], 'read')).toBe(true);
    expect(matcher.matches(['read'], 'write')).toBe(false);
    expect(matcher.matches(['*'], 'write')).toBe(true);
  });

  it('fails closed when no principal is set', () => {
    const context = createFakePrincipalContext();
    expect(context.current()).toBeNull();
    expect(() => context.require()).toThrow(/No principal/);

    context.set({
      sub: 'u1',
      email: 'a@b.c',
      name: null,
      roleName: 'ADMIN',
      roleNames: ['ADMIN'],
      permissionPolicy: 'ALLOW_ALL',
      permissions: [],
    });
    expect(context.require().sub).toBe('u1');
  });
});

describe('assertions', () => {
  it('names the actual value when an expectation fails', () => {
    const catalog = {
      outcome: 'ready' as const,
      entries: [],
      byKey: {},
      diagnostics: [],
    };
    expect(() => expectCatalogStatus(catalog, { missing: 'ready' })).toThrow(
      /Catalog has no entry "missing"/,
    );
    expect(() => expectBootOutcome(catalog, 'degraded-ready')).toThrow(/is "ready"/);
    expect(() => expectRedacted({ token: 'leaked' }, 'leaked')).toThrow(/leaked/);
    expect(() => expectRegisteredBefore(['a', 'b'], 'b', 'a')).toThrow(
      /"b" must be registered before "a"/,
    );
  });
});
