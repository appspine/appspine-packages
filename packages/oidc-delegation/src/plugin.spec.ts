import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import {
  bootHarness,
  expectBootOutcome,
  expectCatalogStatus,
  expectResolutionOk,
  inventoryEntry,
  resolveHarness,
} from '@appspine/plugin-testkit';
import { describe, expect, it } from 'vitest';
import {
  IDENTITY_DELEGATION,
  OidcDelegationModule,
  OidcDelegationService,
  oidcDelegation,
  oidcDelegationConfigSchema,
  oidcDelegationManifest,
  oidcDelegationPlugin,
} from './plugin';
import { PolicyConfigurationError } from './policy-registry';
import type { OidcDelegationModuleOptions } from './types';

const packageRoot = process.cwd();

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = {
  'appspine.principal-context': {},
};

const VALID_CONFIG: OidcDelegationModuleOptions = {
  provider: 'keycloak',
  tokenEndpoint: 'https://keycloak.example.com/realms/test/protocol/openid-connect/token',
  sourceClientId: 'wiki-delegation',
  sourceClientSecret: 'super-secret-client-credential',
  subjectTokenIssuerClientId: 'wiki',
  policies: {
    'submit-document': {
      targetAudience: 'approve',
      requestedScopes: ['approve:knowledge-document-change:submit'],
      maxExpiresInSeconds: 120,
    },
  },
};

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(oidcDelegationManifest);
  });

  it('passes the real loader with a strict capability registry', () => {
    const result = parsePluginManifest(manifestFile, {
      packageName: packageJson.name as string,
      packageVersion: packageJson.version as string,
      host: defaultHostEngine({
        frameworks: {
          '@nestjs/common': '11.1.0',
          '@nestjs/core': '11.1.0',
        },
      }),
      strictCapabilityRegistry: true,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.manifest.provides).toEqual(['appspine.identity-delegation']);
    expect(result.value.manifest.requires).toEqual([]);
    expect(result.value.manifest.cardinality).toBe('singleton');
  });

  it('declares backend and operations facets correctly', () => {
    expect(oidcDelegationManifest.facets?.backend).toMatchObject({
      modulePath: './dist/oidc-delegation.module.js',
      exportName: 'OidcDelegationModule',
      providerTokens: ['appspine.identity-delegation'],
    });

    expect(oidcDelegationManifest.facets?.operations).toMatchObject({
      healthIndicatorId: 'oidc-delegation',
      metricsPrefix: 'oidc_delegation',
      shutdownTimeoutMs: 5000,
    });
  });

  it('declares secret redaction for sensitive environment variables', () => {
    const secretVar = oidcDelegationManifest.environment?.find(
      (env) => env.key === 'OIDC_DELEGATION_SOURCE_CLIENT_SECRET',
    );
    expect(secretVar).toBeDefined();
    expect(secretVar?.secret).toBe(true);

    const nonSecretVar = oidcDelegationManifest.environment?.find(
      (env) => env.key === 'OIDC_DELEGATION_SOURCE_CLIENT_ID',
    );
    expect(nonSecretVar).toBeDefined();
    expect(nonSecretVar?.secret).toBe(false);
  });

  it('declares integration contract references', () => {
    expect(oidcDelegationManifest.integrationContracts).toEqual([
      {
        contractId: 'approve.submit-knowledge-document-change',
        version: '1.0.0',
        role: 'delegation-transport',
      },
      {
        contractId: 'wiki-to-approve.submit-knowledge-document-change',
        version: '1.0.0',
        role: 'delegation-client',
      },
    ]);
  });
});

describe('resolution', () => {
  it('resolves cleanly as a singleton provider for appspine.identity-delegation', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: oidcDelegationPlugin }],
        inventory: [inventoryEntry('oidc-delegation')],
        hostCapabilities: HOST,
      }),
    );
    expect(graph.providers['appspine.identity-delegation']).toEqual(['oidc-delegation']);
    expect(graph.order).toContain('oidc-delegation');
  });
});

describe('config schema and validation', () => {
  it('validates a correct configuration', () => {
    const parsed = oidcDelegationConfigSchema.parse(VALID_CONFIG);
    expect(parsed).toEqual(VALID_CONFIG);
  });

  it('rejects an invalid provider', () => {
    expect(() =>
      oidcDelegationConfigSchema.parse({
        ...VALID_CONFIG,
        provider: 'auth0' as never,
      }),
    ).toThrow(PolicyConfigurationError);
  });

  it('rejects missing policies', () => {
    expect(() =>
      oidcDelegationConfigSchema.parse({
        ...VALID_CONFIG,
        policies: {},
      }),
    ).toThrow(PolicyConfigurationError);
  });

  it('rejects insecure HTTP token endpoint without explicit flag', () => {
    expect(() =>
      oidcDelegationConfigSchema.parse({
        ...VALID_CONFIG,
        tokenEndpoint: 'http://insecure.example.com/token',
        allowInsecureTokenEndpoint: false,
      }),
    ).toThrow(PolicyConfigurationError);
  });
});

describe('backend factory and legacy parity', () => {
  it('instantiates OidcDelegationModule and binds IDENTITY_DELEGATION token via plugin descriptor', async () => {
    const backend = await oidcDelegationPlugin.backend?.({
      config: VALID_CONFIG,
    } as never);

    expect(backend?.module).toBe(OidcDelegationModule);
    expect(backend?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: IDENTITY_DELEGATION,
          useExisting: OidcDelegationService,
        }),
      ]),
    );
  });

  it('oidcDelegation() helper returns the defined plugin', () => {
    expect(oidcDelegation()).toBe(oidcDelegationPlugin);
  });

  it('OidcDelegationModule.forRoot() also binds and exports IDENTITY_DELEGATION token', () => {
    const dynamicModule = OidcDelegationModule.forRoot(VALID_CONFIG);
    expect(dynamicModule.module).toBe(OidcDelegationModule);
    expect(dynamicModule.exports).toContain(IDENTITY_DELEGATION);
    expect(dynamicModule.exports).toContain(OidcDelegationService);
  });
});

describe('catalog and diagnostics', () => {
  it('boots ready and contributes oidc-delegation to catalog', async () => {
    const { catalog } = await bootHarness({
      plugins: [{ plugin: oidcDelegationPlugin, packageVersion: packageJson.version as string }],
      inventory: [inventoryEntry('oidc-delegation')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, { 'oidc-delegation': 'ready' });
    expect(catalog.byKey['oidc-delegation'].provides).toEqual(['appspine.identity-delegation']);
  });
});
