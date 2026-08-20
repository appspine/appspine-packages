import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import { expectResolutionOk, inventoryEntry, resolveHarness } from '@appspine/plugin-testkit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  PrismaService: class PrismaService {},
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  paginate: () => ({}),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  AuditAction: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  paginationQuerySchema: {},
  ZodValidationPipe: class {},
}));

import {
  ApiKeyMachineStrategy,
  M2M_API_KEY_SCHEMA_DIGEST,
  m2mApiKeyManifest,
  m2mApiKeyPlugin,
  SCOPE_MATCHER,
  ScopeMatcherService,
} from './plugin';

const packageRoot = process.cwd();

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = {
  'appspine.identity-store': {},
  'appspine.prisma': {},
  'appspine.principal-context': {},
  'appspine.authentication-strategy-registry': {},
};

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(m2mApiKeyManifest);
  });

  it('passes the real loader with a strict capability registry', () => {
    const result = parsePluginManifest(manifestFile, {
      packageName: packageJson.name as string,
      packageVersion: packageJson.version as string,
      host: defaultHostEngine({
        frameworks: {
          '@nestjs/common': '11.1.0',
          '@nestjs/core': '11.1.0',
          '@prisma/client': '6.2.0',
        },
      }),
      strictCapabilityRegistry: true,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.manifest.provides).toEqual([
      'appspine.machine-auth-provider',
      'appspine.scope-matcher',
    ]);
  });

  it('records a schema digest that matches the shipped Prisma fragment', () => {
    const raw = readFileSync(path.join(packageRoot, 'prisma', 'api-key.prisma'), 'utf8');
    const normalized = raw.replace(/\r\n/g, '\n');
    const computed = `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
    expect(computed).toBe(M2M_API_KEY_SCHEMA_DIGEST);
    expect(m2mApiKeyManifest.facets?.prisma?.schemaDigest).toBe(computed);
  });

  it('declares full backend, frontend, prisma, and permissions facets', () => {
    expect(m2mApiKeyManifest.facets?.backend).toMatchObject({
      modulePath: './dist/api-keys.module.js',
      exportName: 'ApiKeysModule',
      controllerRoutes: ['api-keys'],
      providerTokens: ['appspine.scope-matcher'],
    });
    expect(m2mApiKeyManifest.facets?.backend?.global).toBeUndefined();
    expect(m2mApiKeyManifest.facets?.frontend).toBeDefined();
    expect(m2mApiKeyManifest.facets?.prisma?.owns).toEqual(['ApiKey']);
    expect(m2mApiKeyManifest.facets?.permissions?.definitions).toContain('m2m:api-key:read');
  });
});

describe('resolution', () => {
  it('resolves against a host that supplies identity-store, prisma, principal-context, and authentication-strategy-registry', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: m2mApiKeyPlugin }],
        inventory: [inventoryEntry('m2m-api-key')],
        hostCapabilities: HOST,
      }),
    );

    expect(graph.providers['appspine.machine-auth-provider']).toEqual(['m2m-api-key']);
    expect(graph.providers['appspine.scope-matcher']).toEqual(['m2m-api-key']);
  });
});

describe('descriptor and exports', () => {
  it('exposes the backend factory returning ApiKeysModule', () => {
    expect(m2mApiKeyPlugin.manifest.id).toBe('m2m-api-key');
    expect(
      m2mApiKeyPlugin.backend?.(
        {} as unknown as import('@appspine/plugin-api').PluginRuntimeContext,
      ),
    ).toBeDefined();
  });

  it('exports stable tokens and services', () => {
    expect(SCOPE_MATCHER).toBe(Symbol.for('appspine.scope-matcher'));
    expect(ApiKeyMachineStrategy).toBeDefined();
    expect(ScopeMatcherService).toBeDefined();
  });
});
