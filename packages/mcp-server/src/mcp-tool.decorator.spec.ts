import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { McpTool, registerMcpToolsFromInstance } from './mcp-tool.decorator';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext } from './types';

class FakeToolProvider {
  lastArgs: unknown;
  lastCtx: McpCallContext | undefined;

  @McpTool({
    name: 'echo_acting_user',
    description: 'test',
    inputSchema: z.object({}),
    requiredScopes: ['wiki-pages:read'],
  })
  async echo(args: unknown, ctx: McpCallContext) {
    this.lastArgs = args;
    this.lastCtx = ctx;
    return { actingUserId: ctx.actingUserId };
  }
}

describe('registerMcpToolsFromInstance', () => {
  it('forwards both args and ctx into the decorated method', async () => {
    const registry = new McpToolRegistry();
    const provider = new FakeToolProvider();
    registerMcpToolsFromInstance(provider, registry);

    const tool = registry.getTool('echo_acting_user');
    expect(tool).toBeDefined();

    const ctx: McpCallContext = {
      scopes: ['wiki-pages:read'],
      isApiKey: true,
      roleNames: [],
      actingUserId: 'service-user-1',
      sub: 'api-key-1',
      workflowId: null,
    };

    const result = await tool?.handler({ q: 'x' }, ctx);

    expect(provider.lastArgs).toEqual({ q: 'x' });
    expect(provider.lastCtx).toEqual(ctx);
    expect(result).toEqual({ actingUserId: 'service-user-1' });
  });
});
