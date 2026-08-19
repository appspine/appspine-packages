import { bootHarness, inventoryEntry } from '@appspine/plugin-testkit';
import { describe, expect, it, vi } from 'vitest';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import { mcpServerPlugin } from './plugin';

const { nodeHandler } = vi.hoisted(() => ({
  nodeHandler: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@modelcontextprotocol/node', () => ({
  hostHeaderValidation: vi.fn(() => () => true),
  originValidation: vi.fn(() => () => true),
  toNodeHandler: vi.fn(() => nodeHandler),
}));

const HOST = {
  'appspine.principal-context': {},
};

describe('McpServer shutdown and lifecycle cleanup', () => {
  it('completes shutdown lifecycle cleanly through the plugin harness', async () => {
    const { harness } = await bootHarness({
      plugins: [{ plugin: mcpServerPlugin, packageVersion: '0.6.8' }],
      inventory: [inventoryEntry('mcp-server')],
      hostCapabilities: HOST,
    });

    const result = await harness.shutdown();
    expect(result.outcome).toBe('shutdown-completed');
  });

  it('closes active MCP handler when client response closes', async () => {
    const registry = new McpToolRegistry();
    const service = new McpService(registry);
    const controller = new McpController(service, registry);

    const closeHandler = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(service, 'createHandler').mockReturnValue({
      close: closeHandler,
      fetch: vi.fn(),
    } as never);

    let closeListener: (() => void) | undefined;
    const req = {
      user: { sub: 'k1', isApiKey: true, scopes: [], roleNames: [], actingUserId: null },
      headers: { host: '127.0.0.1' },
      body: {},
    };
    const res = {
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'close') closeListener = listener;
      }),
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    vi.stubEnv('MCP_ALLOWED_HOSTNAMES', '127.0.0.1');
    vi.stubEnv('MCP_ALLOWED_ORIGIN_HOSTNAMES', '127.0.0.1');

    await controller.handlePost(req as never, res as never);

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(closeListener).toBeDefined();

    // Trigger close
    closeListener?.();
    expect(closeHandler).toHaveBeenCalledTimes(1);

    vi.unstubAllEnvs();
  });
});
