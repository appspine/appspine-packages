import { McpServer } from '@modelcontextprotocol/server';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext, McpToolDefinition } from './types';

const ctx: McpCallContext = {
  scopes: ['*'],
  isApiKey: true,
  roleNames: [],
  actingUserId: null,
  sub: 'k1',
  workflowId: null,
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

function handlerOf(calls: Array<[string, unknown, ...unknown[]]>, toolName: string) {
  const handler = calls.find((c) => c[0] === toolName)?.[2] as
    | ((
        args: unknown,
        sdkCtx: unknown,
      ) => Promise<{
        content: Array<{ type: string; text?: string }>;
        isError?: boolean;
        structuredContent?: unknown;
        resultType?: string;
        requestState?: string;
      }>)
    | undefined;
  if (!handler) throw new Error(`no handler registered for ${toolName}`);
  return handler;
}

// Minimal stand-in for the SDK's ServerContext -- only what mcp.service.ts's registerTool
// callback actually reads (mcpReq.requestState()/inputResponses) via buildMrtrContext.
function fakeSdkCtx(requestState?: unknown, inputResponses?: Record<string, unknown>) {
  return { mcpReq: { requestState: () => requestState, inputResponses } };
}

describe('McpService.createServer tool result shaping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes an array result as structuredContent, not just plain objects', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(
      makeTool({ name: 'list_items', handler: async () => [{ id: 'a' }, { id: 'b' }] }),
    );
    new McpService(registry).createServer(ctx);

    const result = await handlerOf(registerToolSpy.mock.calls, 'list_items')({}, fakeSdkCtx());
    expect(result.structuredContent).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.isError).toBeUndefined();
  });

  it('exposes a primitive result as structuredContent', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool({ name: 'get_count', handler: async () => 42 }));
    new McpService(registry).createServer(ctx);

    const result = await handlerOf(registerToolSpy.mock.calls, 'get_count')({}, fakeSdkCtx());
    expect(result.structuredContent).toBe(42);
    expect(result.content[0]?.text).toBe('42');
  });

  it('does not treat a business result containing a truthy `error` field as a tool failure', async () => {
    // Regression: the old special-case for `'error' in result` discarded the rest of the
    // result (including its own `error` string) and replaced it with a bare "Unknown error"
    // text, even though the tool's own outputSchema could legitimately describe this shape.
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(
      makeTool({
        name: 'partial_sync',
        handler: async () => ({ items: ['a', 'b'], error: 'one source timed out' }),
      }),
    );
    new McpService(registry).createServer(ctx);

    const result = await handlerOf(registerToolSpy.mock.calls, 'partial_sync')({}, fakeSdkCtx());
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ items: ['a', 'b'], error: 'one source timed out' });
  });

  it('reports a void-returning tool as success with empty text, not the literal string "undefined"', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool({ name: 'do_nothing', handler: async () => undefined }));
    new McpService(registry).createServer(ctx);

    const result = await handlerOf(registerToolSpy.mock.calls, 'do_nothing')({}, fakeSdkCtx());
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe('');
    expect(result.structuredContent).toBeUndefined();
  });

  it('logs a thrown handler error server-side in addition to returning it to the caller', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const registry = new McpToolRegistry();
    registry.registerTool(
      makeTool({
        name: 'boom',
        handler: async () => {
          throw new Error('connect ECONNREFUSED 10.0.3.14:5432');
        },
      }),
    );
    new McpService(registry).createServer(ctx);

    const result = await handlerOf(registerToolSpy.mock.calls, 'boom')({}, fakeSdkCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('ECONNREFUSED');
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('boom'), expect.anything());
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED'),
      expect.anything(),
    );
  });
});
