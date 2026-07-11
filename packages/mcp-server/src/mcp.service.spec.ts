import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext, McpToolDefinition } from './types';

const ctx: McpCallContext = {
  scopes: ['*'],
  isApiKey: true,
  roleNames: [],
  actingUserId: null,
  sub: 'k1',
};

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

function readOnlyHintOf(
  calls: Array<[string, unknown, ...unknown[]]>,
  toolName: string,
): boolean | undefined {
  const config = calls.find((c) => c[0] === toolName)?.[1] as
    | { annotations?: { readOnlyHint?: boolean } }
    | undefined;
  return config?.annotations?.readOnlyHint;
}

describe('McpService.createServer readOnlyHint annotation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks a read-scoped tool as readOnlyHint: true', () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool({ name: 'list_pages', requiredScopes: ['pages:read'] }));

    new McpService(registry).createServer(ctx);

    expect(readOnlyHintOf(registerToolSpy.mock.calls, 'list_pages')).toBe(true);
  });

  it('marks a write-scoped tool as readOnlyHint: false', () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool({ name: 'create_page', requiredScopes: ['pages:create'] }));

    new McpService(registry).createServer(ctx);

    expect(readOnlyHintOf(registerToolSpy.mock.calls, 'create_page')).toBe(false);
  });

  it('marks a mixed read/write-scoped tool as readOnlyHint: false', () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(
      makeTool({
        name: 'attach_and_read',
        requiredScopes: ['pages:read', 'attachments:write'],
      }),
    );

    new McpService(registry).createServer(ctx);

    expect(readOnlyHintOf(registerToolSpy.mock.calls, 'attach_and_read')).toBe(false);
  });
});
