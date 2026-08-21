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

import { McpModule, mcpServerManifest, mcpServerPlugin } from './plugin';

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

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(mcpServerManifest);
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
    expect(result.value.manifest.provides).toEqual(['appspine.mcp-tools']);
    expect(result.value.manifest.requires).toEqual(['appspine.principal-context']);
    expect(result.value.manifest.optionalRequires).toEqual([
      'appspine.audit-sink',
      'appspine.machine-auth-provider',
      'appspine.scope-matcher',
    ]);
  });

  it('declares backend and operations facets correctly', () => {
    expect(mcpServerManifest.facets?.backend).toMatchObject({
      modulePath: './dist/mcp.module.js',
      exportName: 'McpModule',
      controllerRoutes: ['mcp'],
      providerTokens: ['appspine.mcp-tools'],
    });
    expect(mcpServerManifest.facets?.backend?.global).toBeUndefined();
    expect(mcpServerManifest.facets?.operations).toMatchObject({
      healthIndicatorId: 'mcp-server',
      shutdownTimeoutMs: 5000,
    });
  });
});

describe('resolution', () => {
  it('resolves against a host that supplies principal-context', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: mcpServerPlugin }],
        inventory: [inventoryEntry('mcp-server')],
        hostCapabilities: HOST,
      }),
    );
    expect(graph.providers['appspine.mcp-tools']).toEqual(['mcp-server']);
    expect(graph.order).toContain('mcp-server');
  });

  it('resolves against a host that supplies principal-context and optional capabilities', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: mcpServerPlugin }],
        inventory: [inventoryEntry('mcp-server')],
        hostCapabilities: {
          ...HOST,
          'appspine.scope-matcher': {},
          'appspine.audit-sink': {},
          'appspine.machine-auth-provider': {},
        },
      }),
    );
    expect(graph.providers['appspine.mcp-tools']).toEqual(['mcp-server']);
    expect(graph.order).toContain('mcp-server');
  });
});

describe('backend factory', () => {
  it('instantiates McpModule and descriptor correctly', async () => {
    const backend = await mcpServerPlugin.backend?.(
      {} as unknown as import('@appspine/plugin-api').PluginRuntimeContext,
    );
    expect(backend).toBe(McpModule);
  });
});

describe('catalog and diagnostics', () => {
  it('boots ready and contributes mcp-server to catalog', async () => {
    const { catalog } = await bootHarness({
      plugins: [{ plugin: mcpServerPlugin, packageVersion: packageJson.version as string }],
      inventory: [inventoryEntry('mcp-server')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, { 'mcp-server': 'ready' });
    expect(catalog.byKey['mcp-server'].provides).toEqual(['appspine.mcp-tools']);
  });
});
