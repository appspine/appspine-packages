import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/m2m-api-key', () => ({
  matchScope: (grantedScopes: string[], requiredScope: string) => {
    if (grantedScopes.includes('*')) return true;
    const [reqModule, reqAction] = requiredScope.split(':');
    return grantedScopes.some((g) => {
      if (g === '*') return true;
      const [gModule, gAction] = g.split(':');
      if (gModule !== reqModule) return false;
      return gAction === '*' || gAction === reqAction;
    });
  },
}));

import { DiscoveryPushService } from './discovery-push.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpToolDefinition } from './types';

function makeTool(overrides: Partial<McpToolDefinition> = {}): McpToolDefinition {
  return {
    name: 'list_pages',
    description: 'test',
    inputSchema: {} as McpToolDefinition['inputSchema'],
    requiredScopes: ['pages:read'],
    handler: async () => ({}),
    ...overrides,
  };
}

describe('DiscoveryPushService.onApplicationBootstrap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DISCOVERY_PUSH_URL;
    delete process.env.DISCOVERY_PUSH_TOKEN;
    delete process.env.PUBLIC_BASE_URL;
  });

  it('does nothing when DISCOVERY_PUSH_URL/TOKEN are unset (opt-in only)', async () => {
    delete process.env.DISCOVERY_PUSH_URL;
    delete process.env.DISCOVERY_PUSH_TOKEN;
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool());

    await new DiscoveryPushService(registry).onApplicationBootstrap();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('pushes the catalog snapshot with the push token header when configured', async () => {
    process.env.DISCOVERY_PUSH_URL = 'http://localhost:3070';
    process.env.DISCOVERY_PUSH_TOKEN = 'disc_push_abc';
    process.env.PUBLIC_BASE_URL = 'http://localhost:3010';
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const registry = new McpToolRegistry();
    registry.registerTool(makeTool());

    await new DiscoveryPushService(registry).onApplicationBootstrap();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3070/discovery/push');
    expect((init.headers as Record<string, string>)['x-discovery-push-token']).toBe(
      'disc_push_abc',
    );
    const body = JSON.parse(init.body as string) as {
      toolCatalogSnapshot: unknown[];
      mcpEndpointUrl?: string;
      metadataEndpointUrl?: string;
    };
    expect(body.toolCatalogSnapshot).toEqual(registry.getCatalogSnapshot());
    expect(body.mcpEndpointUrl).toBe('http://localhost:3010/mcp');
    expect(body.metadataEndpointUrl).toBe('http://localhost:3010/metadata/schema');
  });

  it('swallows a failed push instead of throwing', async () => {
    process.env.DISCOVERY_PUSH_URL = 'http://localhost:3070';
    process.env.DISCOVERY_PUSH_TOKEN = 'disc_push_abc';
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const registry = new McpToolRegistry();
    await expect(
      new DiscoveryPushService(registry).onApplicationBootstrap(),
    ).resolves.toBeUndefined();
  });
});
