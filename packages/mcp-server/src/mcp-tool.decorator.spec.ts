import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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

  it('refuses to register a tool whose requiredScopes was omitted, rather than defaulting to fail-open', () => {
    // TypeScript now makes requiredScopes a required field, but nothing stops a plain-JS
    // caller or hand-crafted metadata from omitting it -- this is the runtime backstop for
    // the same gap: a tool that forgot to declare scopes used to be silently callable by
    // every API key regardless of what scopes it actually holds.
    class UnscopedToolProvider {
      async run() {
        return {};
      }
    }
    Reflect.defineMetadata(
      'mcp:tool',
      { name: 'unscoped_tool', description: 'test', inputSchema: z.object({}) },
      UnscopedToolProvider.prototype,
      'run',
    );

    const registry = new McpToolRegistry();
    expect(() => registerMcpToolsFromInstance(new UnscopedToolProvider(), registry)).toThrow(
      /unscoped_tool.*requiredScopes/,
    );
  });
});
