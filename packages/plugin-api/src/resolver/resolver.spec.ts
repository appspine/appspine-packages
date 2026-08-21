import { describe, expect, it } from 'vitest';
import type { PluginInventoryEntry } from '../inventory';
import type { PluginManifestV1 } from '../manifest';
import { readFixture } from '../test-support';
import {
  type ResolutionResult,
  type ResolvableManifest,
  resolvePlugins,
  shutdownOrder,
  unwrapResolution,
} from './index';

function manifestOf(file: string): PluginManifestV1 {
  return readFixture(file) as PluginManifestV1;
}

const HEALTH = manifestOf('positive/health-check-minimal.json');
const AUDIT = manifestOf('positive/audit-log-with-prisma.json');
const RBAC = manifestOf('positive/rbac-full-facets.json');
const MASTER_DATA = manifestOf('positive/master-data-client-multiple.json');
const OIDC = manifestOf('positive/oidc-auth-interactive-provider.json');
const APP_LOCAL = manifestOf('positive/app-local-replaces-override.json');

function pkg(manifest: PluginManifestV1, overrides: Partial<ResolvableManifest> = {}) {
  return {
    manifest,
    packageName: `@appspine/${manifest.id}`,
    packageVersion: '1.0.0',
    ...overrides,
  } satisfies ResolvableManifest;
}

function entry(
  plugin: string,
  overrides: Partial<PluginInventoryEntry> = {},
): PluginInventoryEntry {
  return { plugin, instanceId: 'default', enabled: true, required: true, ...overrides };
}

/** Host supplies Prisma plus the two host-owned capabilities (PL0-03 section 3). */
const HOST_CAPABILITIES = [
  'appspine.prisma',
  'appspine.principal-context',
  'appspine.authentication-strategy-registry',
];

function codesOf(result: ResolutionResult): string[] {
  return result.ok
    ? result.graph.diagnostics.map((d) => d.code)
    : result.diagnostics.map((d) => d.code);
}

describe('resolution ordering', () => {
  it('orders dependants after their providers', () => {
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: [entry('audit-log'), entry('health-check'), entry('rbac')],
        manifests: [pkg(HEALTH), pkg(AUDIT), pkg(RBAC)],
        hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-store'],
      }),
    );

    expect(graph.order.indexOf('audit-log')).toBeLessThan(graph.order.indexOf('rbac'));
    expect(graph.order).toEqual(['audit-log', 'health-check', 'rbac']);
  });

  it('shuts down in exactly the reverse of registration order', () => {
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: [entry('health-check'), entry('audit-log'), entry('rbac')],
        manifests: [pkg(HEALTH), pkg(AUDIT), pkg(RBAC)],
        hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-store'],
      }),
    );
    expect(shutdownOrder(graph)).toEqual([...graph.order].reverse());
  });

  it('produces an identical order and digest for every input permutation', () => {
    const manifests = [pkg(HEALTH), pkg(AUDIT), pkg(RBAC)];
    const inventory = [entry('health-check'), entry('audit-log'), entry('rbac')];

    const permutations = <T>(items: T[]): T[][] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, index) =>
            permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
              item,
              ...rest,
            ]),
          );

    const results = permutations(inventory).flatMap((inv) =>
      permutations(manifests).map((mans) =>
        unwrapResolution(
          resolvePlugins({
            inventory: inv,
            manifests: mans,
            hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-store'],
          }),
        ),
      ),
    );

    expect(results).toHaveLength(36);
    const [first] = results;
    for (const graph of results) {
      expect(graph.order).toEqual(first.order);
      expect(graph.digest).toBe(first.digest);
    }
  });

  it('changes the digest when a package version changes', () => {
    const base = unwrapResolution(
      resolvePlugins({
        inventory: [entry('health-check')],
        manifests: [pkg(HEALTH)],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );
    const bumped = unwrapResolution(
      resolvePlugins({
        inventory: [entry('health-check')],
        manifests: [pkg(HEALTH, { packageVersion: '1.0.1' })],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );
    expect(bumped.digest).not.toBe(base.digest);
  });

  it('detects a dependency cycle instead of hanging or dropping nodes', () => {
    const a: PluginManifestV1 = {
      ...HEALTH,
      id: 'cycle-a',
      provides: ['appspine.audit-sink'],
      requires: ['appspine.notification-inbox'],
      facets: { backend: { modulePath: './a.js', exportName: 'A' } },
    };
    const b: PluginManifestV1 = {
      ...HEALTH,
      id: 'cycle-b',
      provides: ['appspine.notification-inbox'],
      requires: ['appspine.audit-sink'],
      facets: { backend: { modulePath: './b.js', exportName: 'B' } },
    };

    const result = resolvePlugins({
      inventory: [entry('cycle-a'), entry('cycle-b')],
      manifests: [pkg(a), pkg(b)],
      hostCapabilities: HOST_CAPABILITIES,
    });

    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('dependency-cycle');
    if (!result.ok) {
      expect(result.diagnostics.find((d) => d.code === 'dependency-cycle')?.message).toContain(
        'cycle-a',
      );
    }
  });
});

describe('requirements', () => {
  it('fails when a required capability has no provider', () => {
    const result = resolvePlugins({
      inventory: [entry('rbac')],
      manifests: [pkg(RBAC)],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missing = result.diagnostics.filter((d) => d.code === 'missing-required-capability');
    expect(missing.map((d) => d.message).join(' ')).toContain('appspine.audit-sink');
    expect(missing[0]).toMatchObject({ pluginId: 'rbac', path: 'requires' });
  });

  it('treats host-provided capabilities as satisfied without a plugin', () => {
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: [entry('health-check')],
        manifests: [pkg(HEALTH)],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );
    expect(graph.instances[0].dependsOn).toEqual([]);
  });

  it('records an unresolved optional requirement as info, not an error', () => {
    const result = resolvePlugins({
      inventory: [entry('master-data-client', { instanceId: 'hr', required: false })],
      manifests: [pkg(MASTER_DATA)],
      hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-delegation'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.graph.instances[0].unresolvedOptional).toEqual(['appspine.audit-sink']);
    expect(result.graph.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unresolved-optional-capability', severity: 'info' }),
    );
  });
});

describe('cardinality and instances', () => {
  it('rejects two enabled instances of a singleton', () => {
    const result = resolvePlugins({
      inventory: [entry('health-check'), entry('health-check', { instanceId: 'second' })],
      manifests: [pkg(HEALTH)],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('singleton-cardinality-violation');
  });

  it('allows several instances of a multiple plugin and namespaces their capabilities', () => {
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: [
          entry('master-data-client', { instanceId: 'hr', configRef: 'masterData' }),
          entry('master-data-client', { instanceId: 'finance', configRef: 'masterData' }),
        ],
        manifests: [pkg(MASTER_DATA)],
        hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-delegation'],
      }),
    );

    expect(graph.order).toEqual(['master-data-client#finance', 'master-data-client#hr']);
    expect(graph.providers['appspine.master-data-client#hr']).toEqual(['master-data-client#hr']);
    expect(graph.providers['appspine.master-data-client']).toEqual([
      'master-data-client#finance',
      'master-data-client#hr',
    ]);
  });

  it('orders by instance key, not by the inventory sort key', () => {
    // Gate G1's independent review showed the two determinism mechanisms — the inventory pre-sort
    // and the Kahn frontier sort — are mutually redundant: removing either one on its own left
    // every test green, so a future refactor could silently drop one and leave determinism resting
    // on a single point.
    //
    // This is the one input where they disagree, so it pins which one is the authority. A
    // singleton's `default` instance keeps the bare plugin ID as its key, while the inventory sorts
    // on `pluginId#instanceId`. For an instance whose ID sorts before `default`, the two disagree:
    // the pre-sort alone emits `#analytics` first, while sorting the frontier by *instance key*
    // puts the bare `master-data-client` first ('' < '#analytics'). The frontier sort is the
    // authority; this test goes red if it is removed.
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: [
          entry('master-data-client', { instanceId: 'analytics', configRef: 'masterData' }),
          entry('master-data-client', { configRef: 'masterData' }),
        ],
        manifests: [pkg(MASTER_DATA)],
        hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-delegation'],
      }),
    );

    expect(graph.order).toEqual(['master-data-client', 'master-data-client#analytics']);
  });

  it('rejects two inventory entries that collapse to the same instance key', () => {
    const result = resolvePlugins({
      inventory: [entry('health-check'), entry('@appspine/health-check')],
      manifests: [pkg(HEALTH)],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('duplicate-instance');
  });

  it('rejects an optional instance whose manifest has no failure policy', () => {
    const result = resolvePlugins({
      inventory: [entry('health-check', { required: false })],
      manifests: [pkg(HEALTH)],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('optional-without-failure-policy');
  });

  it('catalogues disabled entries without wiring them', () => {
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: [entry('health-check'), entry('audit-log', { enabled: false })],
        manifests: [pkg(HEALTH), pkg(AUDIT)],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );
    expect(graph.order).toEqual(['health-check']);
    expect(graph.disabled).toEqual([
      {
        key: 'audit-log',
        pluginId: 'audit-log',
        instanceId: 'default',
        packageName: '@appspine/audit-log',
      },
    ]);
  });

  it('rejects an unknown plugin reference', () => {
    const result = resolvePlugins({
      inventory: [entry('not-installed')],
      manifests: [pkg(HEALTH)],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('unknown-plugin');
  });

  it('rejects a configRef that does not match the manifest', () => {
    const result = resolvePlugins({
      inventory: [entry('master-data-client', { instanceId: 'hr', configRef: 'wrong' })],
      manifests: [pkg(MASTER_DATA)],
      hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-delegation'],
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('config-ref-mismatch');
  });
});

describe('conflicts, duplicates and overrides', () => {
  it('fails fast when two mutually exclusive interactive providers are enabled', () => {
    const localAuth: PluginManifestV1 = {
      ...OIDC,
      id: 'local-auth',
      displayName: 'Local Credential Authentication',
      provides: ['appspine.interactive-auth-provider'],
      conflicts: ['oidc-auth'],
      facets: { backend: { modulePath: './local.js', exportName: 'LocalAuthModule' } },
    };

    const result = resolvePlugins({
      inventory: [entry('oidc-auth'), entry('local-auth')],
      manifests: [pkg(OIDC), pkg(localAuth)],
      hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-store', 'appspine.audit-sink'],
    });

    expect(result.ok).toBe(false);
    const codes = codesOf(result);
    expect(codes).toContain('plugin-conflict');
    expect(codes).toContain('duplicate-capability-provider');
  });

  it('allows an app-local plugin to replace a stock contribution', () => {
    const notification: PluginManifestV1 = {
      ...HEALTH,
      id: 'notification',
      displayName: 'Notification',
      provides: ['appspine.notification-inbox'],
      requires: ['appspine.prisma'],
      facets: {
        backend: {
          modulePath: './notification.js',
          exportName: 'NotificationInboxProvider',
          controllerRoutes: ['/api/notification'],
        },
      },
    };

    const graph = unwrapResolution(
      resolvePlugins({
        inventory: [entry('notification'), entry('acme-custom-notification-channel')],
        manifests: [
          pkg(notification),
          pkg(APP_LOCAL, { packageName: 'acme-custom-notification-channel' }),
        ],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );

    expect(graph.order).toContain('acme-custom-notification-channel');
    expect(graph.providers['appspine.notification-inbox']).toEqual([
      'acme-custom-notification-channel',
      'notification',
    ]);
  });

  it('rejects an app-local claim coming from the official scope', () => {
    const result = resolvePlugins({
      inventory: [entry('acme-custom-notification-channel')],
      manifests: [pkg(APP_LOCAL)],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('app-local-claim-from-official-scope');
  });

  it('rejects a replaces declaration whose target is not enabled', () => {
    const result = resolvePlugins({
      inventory: [entry('acme-custom-notification-channel')],
      manifests: [pkg(APP_LOCAL, { packageName: 'acme-custom-notification-channel' })],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('replaces-target-missing');
  });

  it('rejects two plugins contributing the same route or provider token', () => {
    const one: PluginManifestV1 = {
      ...HEALTH,
      id: 'route-one',
      provides: ['appspine.audit-sink'],
      requires: [],
      facets: {
        backend: {
          modulePath: './one.js',
          exportName: 'One',
          controllerRoutes: ['/api/shared'],
          providerTokens: ['appspine.shared-token'],
        },
      },
    };
    const two: PluginManifestV1 = {
      ...one,
      id: 'route-two',
      provides: ['appspine.notification-inbox'],
      facets: {
        backend: {
          modulePath: './two.js',
          exportName: 'Two',
          controllerRoutes: ['/api/shared'],
          providerTokens: ['appspine.shared-token'],
        },
      },
    };

    const result = resolvePlugins({
      inventory: [entry('route-one'), entry('route-two')],
      manifests: [pkg(one), pkg(two)],
      hostCapabilities: HOST_CAPABILITIES,
    });

    expect(result.ok).toBe(false);
    const codes = codesOf(result);
    expect(codes).toContain('duplicate-route');
    expect(codes).toContain('duplicate-provider-token');
  });

  it('rejects two plugins owning the same Prisma model', () => {
    const other: PluginManifestV1 = {
      ...AUDIT,
      id: 'audit-fork',
      provides: ['appspine.notification-inbox'],
      facets: {
        backend: { modulePath: './fork.js', exportName: 'ForkModule' },
        prisma: { owns: ['AuditLog'], schemaFragment: 'prisma/fork.prisma' },
      },
    };

    const result = resolvePlugins({
      inventory: [entry('audit-log'), entry('audit-fork')],
      manifests: [pkg(AUDIT), pkg(other)],
      hostCapabilities: HOST_CAPABILITIES,
    });

    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('duplicate-prisma-model');
  });

  it('does not treat two instances of one multi-instance plugin as a duplicate contribution', () => {
    const result = resolvePlugins({
      inventory: [
        entry('master-data-client', { instanceId: 'hr', configRef: 'masterData' }),
        entry('master-data-client', { instanceId: 'finance', configRef: 'masterData' }),
      ],
      manifests: [pkg(MASTER_DATA)],
      hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-delegation'],
    });
    expect(result.ok).toBe(true);
    expect(codesOf(result)).not.toContain('duplicate-health-indicator');
  });

  it('rejects a plugin trying to provide a host-owned capability', () => {
    const impostor: PluginManifestV1 = {
      ...HEALTH,
      id: 'impostor',
      provides: ['appspine.principal-context'],
      requires: [],
      facets: { backend: { modulePath: './i.js', exportName: 'I' } },
    };
    const result = resolvePlugins({
      inventory: [entry('impostor')],
      manifests: [pkg(impostor)],
      hostCapabilities: HOST_CAPABILITIES,
    });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('host-capability-overridden');
  });
});

describe('PL0-05 lifecycle fixture inventories', () => {
  it('resolves the required-failure fixture inventory', () => {
    const fixture = readFixture('lifecycle/required-plugin-failure-aborts-boot.json') as {
      inventory: PluginInventoryEntry[];
    };
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: fixture.inventory,
        manifests: [pkg(HEALTH), pkg(AUDIT)],
        hostCapabilities: HOST_CAPABILITIES,
      }),
    );
    expect(graph.order).toEqual(['audit-log', 'health-check']);
    expect(graph.instances.every((instance) => instance.required)).toBe(true);
  });

  it('resolves the optional-degradation fixture inventory with an instance-qualified key', () => {
    const fixture = readFixture('lifecycle/optional-plugin-failure-degrades.json') as {
      inventory: PluginInventoryEntry[];
      expectedCatalogStatus: Record<string, string>;
    };
    const graph = unwrapResolution(
      resolvePlugins({
        inventory: fixture.inventory,
        manifests: [pkg(HEALTH), pkg(MASTER_DATA)],
        hostCapabilities: [...HOST_CAPABILITIES, 'appspine.identity-delegation'],
      }),
    );
    expect(graph.order.sort()).toEqual(Object.keys(fixture.expectedCatalogStatus).sort());
  });
});
