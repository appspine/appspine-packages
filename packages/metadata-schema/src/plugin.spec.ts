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
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  Prisma: {
    dmmf: {
      datamodel: {
        models: [],
        enums: [],
      },
    },
  },
}));

import {
  METADATA_SCHEMA,
  MetaModule,
  MetaService,
  metadataSchemaManifest,
  metadataSchemaPlugin,
} from './plugin';

const packageRoot = process.cwd();

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST_WITH_PRISMA = {
  'appspine.prisma': {},
};

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(metadataSchemaManifest);
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
    expect(result.value.manifest.provides).toEqual(['appspine.metadata-schema']);
    expect(result.value.manifest.requires).toEqual(['appspine.prisma']);
    expect(result.value.manifest.optionalRequires).toEqual(['appspine.scope-matcher']);
  });

  it('declares backend and permissions facets correctly', () => {
    expect(metadataSchemaManifest.facets?.backend).toMatchObject({
      modulePath: './dist/meta.module.js',
      exportName: 'MetaModule',
      controllerRoutes: ['metadata'],
      providerTokens: ['appspine.metadata-schema'],
    });
    expect(metadataSchemaManifest.facets?.permissions?.definitions).toContain(
      'metadata:schema:read',
    );
  });
});

describe('resolution', () => {
  it('resolves against a host that supplies prisma', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: metadataSchemaPlugin }],
        inventory: [inventoryEntry('metadata-schema')],
        hostCapabilities: HOST_WITH_PRISMA,
      }),
    );
    expect(graph.providers['appspine.metadata-schema']).toEqual(['metadata-schema']);
    expect(graph.order).toContain('metadata-schema');
  });

  it('resolves against a host that supplies both prisma and optional scope-matcher', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: metadataSchemaPlugin }],
        inventory: [inventoryEntry('metadata-schema')],
        hostCapabilities: {
          ...HOST_WITH_PRISMA,
          'appspine.scope-matcher': {},
        },
      }),
    );
    expect(graph.providers['appspine.metadata-schema']).toEqual(['metadata-schema']);
    expect(graph.order).toContain('metadata-schema');
  });
});

describe('backend factory', () => {
  it('instantiates MetaModule and binds METADATA_SCHEMA token', async () => {
    const backend = await metadataSchemaPlugin.backend?.({} as never);
    expect(backend?.module).toBe(MetaModule);
    expect(backend?.providers).toEqual([
      {
        provide: METADATA_SCHEMA,
        useExisting: MetaService,
      },
    ]);
  });
});

describe('catalog and diagnostics', () => {
  it('boots ready and contributes metadata-schema to catalog', async () => {
    const { catalog } = await bootHarness({
      plugins: [{ plugin: metadataSchemaPlugin, packageVersion: packageJson.version as string }],
      inventory: [inventoryEntry('metadata-schema')],
      hostCapabilities: HOST_WITH_PRISMA,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, { 'metadata-schema': 'ready' });
    expect(catalog.byKey['metadata-schema'].provides).toEqual(['appspine.metadata-schema']);
  });
});
