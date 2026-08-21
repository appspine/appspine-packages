import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPABILITY,
  HOST_PROVIDED_CAPABILITIES,
  isRegisteredCapability,
  parseQualifiedCapability,
  qualifyCapability,
  REGISTERED_CAPABILITIES,
  STRATEGY_REGISTERED_CAPABILITIES,
} from './capabilities';
import { definePlugin, isDefinedPlugin } from './define-plugin';
import { isSecretLookingKey, REDACTED, redactConfig, redactConfigForManifest } from './diagnostics';
import { PluginContractError } from './errors';
import {
  DEFAULT_INSTANCE_ID,
  instanceKey,
  inventoryPluginIdOf,
  parseInstanceKey,
} from './inventory';
import type { PluginManifestV1 } from './manifest';
import { listDeclaredFacets, PLUGIN_FACET_IDS } from './manifest';
import { actingUserIdOf, isMachinePrincipal, type MachinePrincipal } from './principal';
import { manifestV1Schema } from './schema';
import { readFixture, readJsonFile } from './test-support';
import {
  AUDIT_SINK,
  CAPABILITY_TOKENS,
  capabilityInstanceToken,
  PRINCIPAL_CONTEXT,
} from './tokens';
import { PLUGIN_API_VERSION } from './version';

const HEALTH = readFixture('positive/health-check-minimal.json') as PluginManifestV1;
const MASTER_DATA = readFixture('positive/master-data-client-multiple.json') as PluginManifestV1;

describe('package version', () => {
  it('matches package.json, which the host reports for engine checks', () => {
    const pkg = readJsonFile(path.resolve(process.cwd(), 'package.json')) as { version: string };
    expect(PLUGIN_API_VERSION).toBe(pkg.version);
  });

  it('satisfies the ^1.0.0 engine range the PL0-05 fixtures were frozen against', () => {
    expect(PLUGIN_API_VERSION.startsWith('1.')).toBe(true);
  });
});

describe('capability registry', () => {
  it('is sorted and deduplicated so digests over it stay stable', () => {
    expect(REGISTERED_CAPABILITIES).toEqual([...REGISTERED_CAPABILITIES].sort());
    expect(new Set(REGISTERED_CAPABILITIES).size).toBe(REGISTERED_CAPABILITIES.length);
  });

  it('covers every registered capability with either a token or the strategy registry', () => {
    for (const capability of REGISTERED_CAPABILITIES) {
      const covered =
        CAPABILITY_TOKENS[capability] !== undefined ||
        STRATEGY_REGISTERED_CAPABILITIES.includes(capability);
      expect(covered, `${capability} has neither a token nor a registry entry`).toBe(true);
    }
  });

  it('deliberately exposes no injectable token for a login provider', () => {
    for (const capability of STRATEGY_REGISTERED_CAPABILITIES) {
      expect(CAPABILITY_TOKENS[capability]).toBeUndefined();
    }
  });

  it('uses Symbol.for so duplicated copies of this package share tokens', () => {
    expect(AUDIT_SINK).toBe(Symbol.for('appspine.audit-sink'));
    expect(PRINCIPAL_CONTEXT).toBe(Symbol.for(CAPABILITY.principalContext));
    expect(capabilityInstanceToken(CAPABILITY.masterDataClient, 'hr')).toBe(
      Symbol.for('appspine.master-data-client#hr'),
    );
  });

  it('marks the two host-owned capabilities and nothing else', () => {
    expect([...HOST_PROVIDED_CAPABILITIES].sort()).toEqual([
      'appspine.authentication-strategy-registry',
      'appspine.principal-context',
    ]);
  });

  it('round-trips instance qualification', () => {
    expect(parseQualifiedCapability(qualifyCapability('appspine.x', 'hr'))).toEqual({
      capability: 'appspine.x',
      instanceId: 'hr',
    });
    expect(parseQualifiedCapability('appspine.x')).toEqual({ capability: 'appspine.x' });
    expect(isRegisteredCapability('appspine.audit-sink')).toBe(true);
    expect(isRegisteredCapability('appspine.not-a-thing')).toBe(false);
  });
});

describe('facet identifiers', () => {
  it('matches the closed facet set in the shipped schema', () => {
    const schemaFacets = Object.keys(
      ((manifestV1Schema.properties as Record<string, { properties: object }>).facets
        .properties as object) ?? {},
    );
    expect([...PLUGIN_FACET_IDS].sort()).toEqual(schemaFacets.sort());
  });

  it('lists only the facets a manifest actually declares, in a stable order', () => {
    expect(listDeclaredFacets(HEALTH)).toEqual(['backend', 'operations']);
  });
});

describe('inventory keys', () => {
  it('keeps a singleton default instance on the bare plugin ID', () => {
    expect(instanceKey('health-check', DEFAULT_INSTANCE_ID)).toBe('health-check');
    expect(instanceKey('master-data-client', 'hr')).toBe('master-data-client#hr');
    expect(parseInstanceKey('master-data-client#hr')).toEqual({
      pluginId: 'master-data-client',
      instanceId: 'hr',
    });
    expect(parseInstanceKey('health-check')).toEqual({
      pluginId: 'health-check',
      instanceId: 'default',
    });
  });

  it('treats a package name and a bare plugin ID as the same reference', () => {
    expect(inventoryPluginIdOf('@appspine/health-check')).toBe('health-check');
    expect(inventoryPluginIdOf('health-check')).toBe('health-check');
  });
});

describe('definePlugin', () => {
  it('accepts a descriptor that matches its manifest', () => {
    const plugin = definePlugin({
      manifest: HEALTH,
      backend: () => ({ module: 'HealthModule' }),
    });

    expect(plugin.id).toBe('health-check');
    expect(plugin.cardinality).toBe('singleton');
    expect(plugin.provides).toEqual(['appspine.health-indicator']);
    expect(isDefinedPlugin(plugin)).toBe(true);
    expect(isDefinedPlugin({ id: 'health-check' })).toBe(false);
  });

  it('rejects a backend facet with no factory, and a factory with no facet', () => {
    expect(() => definePlugin({ manifest: HEALTH })).toThrowError(PluginContractError);

    const noBackend: PluginManifestV1 = {
      ...HEALTH,
      facets: { operations: { healthIndicatorId: 'health-check' } },
    };
    try {
      definePlugin({ manifest: noBackend, backend: () => ({}) });
      throw new Error('expected definePlugin to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PluginContractError);
      expect((error as PluginContractError).diagnostics.map((d) => d.code)).toEqual([
        'undeclared-backend-factory',
      ]);
    }
  });

  it('requires a config parser exactly when the manifest declares configSchema', () => {
    expect(() => definePlugin({ manifest: MASTER_DATA, backend: () => ({}) })).toThrowError(
      /missing-config-parser/,
    );

    const plugin = definePlugin({
      manifest: MASTER_DATA,
      backend: () => ({}),
      configSchema: { parse: (input) => input as { endpoint: string } },
    });
    expect(plugin.id).toBe('master-data-client');
  });

  it('rejects an unsupported manifest schema version before reading anything else', () => {
    try {
      definePlugin({
        manifest: { ...HEALTH, schemaVersion: 'appspine.plugin/v2' } as unknown as PluginManifestV1,
      });
      throw new Error('expected definePlugin to throw');
    } catch (error) {
      expect((error as PluginContractError).diagnostics.map((d) => d.code)).toEqual([
        'unsupported-manifest-schema-version',
      ]);
    }
  });

  it('freezes the descriptor so a consumer cannot mutate a shared plugin', () => {
    const plugin = definePlugin({ manifest: HEALTH, backend: () => ({}) });
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});

describe('secret redaction', () => {
  it('redacts by key name even when nothing declared the key', () => {
    expect(isSecretLookingKey('apiKey')).toBe(true);
    expect(isSecretLookingKey('endpoint')).toBe(false);

    // Keys that carry a credential without being named after one. Gate G1's review found the
    // first three reaching the catalog in the clear.
    for (const key of [
      'databaseUrl',
      'connectionString',
      'dsn',
      'DATABASE_URL',
      'redisUri',
      'passphrase',
      'webhookUrl',
    ]) {
      expect(isSecretLookingKey(key), `${key} should be redacted`).toBe(true);
    }
    // ...and keys that must stay readable, or the diagnostic stops being one.
    for (const key of ['issuer', 'audience', 'baseUrl', 'timeoutMs', 'region']) {
      expect(isSecretLookingKey(key), `${key} should stay visible`).toBe(false);
    }

    expect(redactConfig({ endpoint: 'https://x', apiKey: 'super-secret' })).toEqual({
      endpoint: 'https://x',
      apiKey: REDACTED,
    });
  });

  it('redacts declared secret env keys, matching case and underscores loosely', () => {
    const redacted = redactConfigForManifest(MASTER_DATA, {
      masterDataEndpoint: 'https://x',
      masterDataApiKey: 'secret-value',
      nested: { MASTER_DATA_API_KEY: 'secret-value' },
    }) as Record<string, unknown>;

    expect(redacted.masterDataEndpoint).toBe('https://x');
    expect(redacted.masterDataApiKey).toBe(REDACTED);
    expect((redacted.nested as Record<string, unknown>).MASTER_DATA_API_KEY).toBe(REDACTED);
    expect(JSON.stringify(redacted)).not.toContain('secret-value');
  });

  it('keeps the shape so a diagnostic still shows which keys exist', () => {
    expect(redactConfig({ a: { token: 'x', b: [1, 2] } })).toEqual({
      a: { token: REDACTED, b: [1, 2] },
    });
  });

  it('stops at a depth limit instead of recursing forever', () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 30; i++) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    expect(() => redactConfig(deep)).not.toThrow();
  });
});

describe('principal helpers', () => {
  const machine: MachinePrincipal = {
    sub: 'key-1',
    scopes: ['read'],
    isApiKey: true,
    actingUserId: 'user-1',
    roleNames: [],
    permissionPolicy: 'DENY_ALL',
    permissions: [],
  };

  it('discriminates on isApiKey, exactly as the legacy runtime objects do', () => {
    expect(isMachinePrincipal(machine)).toBe(true);
    expect(
      isMachinePrincipal({
        sub: 'u1',
        email: 'a@b.c',
        name: null,
        roleName: 'ADMIN',
        roleNames: ['ADMIN'],
        permissionPolicy: 'ALLOW_ALL',
        permissions: [],
      }),
    ).toBe(false);
  });

  it('fails closed for a machine principal with no bound acting user', () => {
    expect(actingUserIdOf(machine)).toBe('user-1');
    expect(actingUserIdOf({ ...machine, actingUserId: null })).toBeNull();
  });
});
