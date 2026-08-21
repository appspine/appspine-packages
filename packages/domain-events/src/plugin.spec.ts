import { createHash } from 'node:crypto';
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
import { z } from 'zod';

vi.mock('@appspine/common', () => ({
  PrismaService: class PrismaService {},
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  paginate: () => ({}),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  AuditAction: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  paginationQuerySchema: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  ZodValidationPipe: class {},
}));

import { DOMAIN_EVENTS_SCHEMA_DIGEST, domainEventsManifest, domainEventsPlugin } from './plugin';

const packageRoot = process.cwd();

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = {
  'appspine.prisma': {},
  'appspine.principal-context': {},
};

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(domainEventsManifest);
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
    expect(result.value.manifest.provides).toEqual(['appspine.domain-events']);
    expect(result.value.manifest.requires).toEqual([
      'appspine.prisma',
      'appspine.principal-context',
    ]);
  });

  it('records a schema digest that matches the shipped prisma fragment', () => {
    const fragment = readFileSync(
      path.join(packageRoot, 'prisma/domain-events.prisma'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const computed = `sha256:${createHash('sha256').update(fragment, 'utf8').digest('hex')}`;
    expect(computed).toBe(DOMAIN_EVENTS_SCHEMA_DIGEST);
    expect(domainEventsManifest.facets.prisma?.schemaDigest).toBe(DOMAIN_EVENTS_SCHEMA_DIGEST);
  });

  it('declares all 5 facets: backend, frontend, prisma, permissions, operations', () => {
    expect(domainEventsManifest.facets.backend).toBeDefined();
    expect(domainEventsManifest.facets.frontend).toBeDefined();
    expect(domainEventsManifest.facets.prisma).toBeDefined();
    expect(domainEventsManifest.facets.permissions).toBeDefined();
    expect(domainEventsManifest.facets.operations).toBeDefined();

    expect(domainEventsManifest.facets.backend?.exportName).toBe('DomainEventsModule');
    expect(domainEventsManifest.facets.backend?.controllerRoutes).toEqual(['domain-events']);
    expect(domainEventsManifest.facets.backend?.providerTokens).toEqual(['appspine.domain-events']);

    expect(domainEventsManifest.facets.operations?.healthIndicatorId).toBe('domain-events');
    expect(domainEventsManifest.facets.operations?.metricsPrefix).toBe('domain_events');
    expect(domainEventsManifest.facets.operations?.shutdownTimeoutMs).toBe(5000);
  });
});

describe('resolution', () => {
  it('resolves against a host that supplies prisma and principal-context', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: domainEventsPlugin }],
        inventory: [inventoryEntry('domain-events')],
        hostCapabilities: HOST,
      }),
    );

    expect(graph.providers['appspine.domain-events']).toEqual(['domain-events']);
  });
});

describe('boot harness & lifecycle', () => {
  it('boots ready and contributes domain-events to catalog', async () => {
    const { catalog } = await bootHarness({
      plugins: [{ plugin: domainEventsPlugin, packageVersion: packageJson.version as string }],
      inventory: [inventoryEntry('domain-events')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, { 'domain-events': 'ready' });
    expect(catalog.byKey['domain-events'].provides).toEqual(['appspine.domain-events']);
  });
});

describe('descriptor', () => {
  it('exposes the backend factory returning DomainEventsModule', () => {
    expect(domainEventsPlugin.manifest.id).toBe('domain-events');
    expect(
      domainEventsPlugin.backend?.(
        {} as unknown as import('@appspine/plugin-api').PluginRuntimeContext,
      ),
    ).toBeDefined();
  });
});
