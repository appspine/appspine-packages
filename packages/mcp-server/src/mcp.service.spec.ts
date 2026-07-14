import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import { APPSPINE_MCP_METADATA_NAMESPACE } from './metadata';
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

function callbackOf(calls: Array<[string, unknown, ...unknown[]]>, toolName: string) {
  return calls.find((c) => c[0] === toolName)?.[2] as
    | ((args: unknown, extra: { _meta?: unknown }) => Promise<unknown>)
    | undefined;
}

const validMetadata = {
  namespace: APPSPINE_MCP_METADATA_NAMESPACE,
  operationId: '0123456789abcdef0123456789abcdef',
  runId: 'run-1',
  deploymentId: 'deployment-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  nodeName: 'Appspine MCP Tool',
  itemIndex: 0,
};

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

describe('McpService.createServer operation metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes parsed operation metadata to write tool handlers', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    let seenCtx: McpCallContext | undefined;
    registry.registerTool(
      makeTool({
        name: 'create_page',
        requiredScopes: ['pages:create'],
        handler: async (_args, callCtx) => {
          seenCtx = callCtx;
          return { id: 'page-1' };
        },
      }),
    );

    new McpService(registry).createServer(ctx);
    const callback = callbackOf(registerToolSpy.mock.calls, 'create_page');
    const result = await callback?.({ title: 'A' }, { _meta: validMetadata });

    expect(result).toEqual({ content: [{ type: 'text', text: '{"id":"page-1"}' }] });
    expect(seenCtx?.operation).toEqual(validMetadata);
  });

  it('rejects write tools when operation metadata is missing', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool({ name: 'create_page', requiredScopes: ['pages:create'] }));

    new McpService(registry).createServer(ctx);
    const callback = callbackOf(registerToolSpy.mock.calls, 'create_page');
    const result = await callback?.({ title: 'A' }, {});

    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'write MCP tools require operation metadata' }],
    });
  });

  it('rejects write tools when operation metadata is malformed', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool({ name: 'create_page', requiredScopes: ['pages:create'] }));

    new McpService(registry).createServer(ctx);
    const callback = callbackOf(registerToolSpy.mock.calls, 'create_page');
    const result = await callback?.(
      { title: 'A' },
      { _meta: { ...validMetadata, namespace: 'other' } },
    );

    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: '_meta.namespace is invalid' }],
    });
  });

  it('keeps read tools compatible when caller metadata is malformed', async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, 'registerTool');
    const registry = new McpToolRegistry();
    let seenCtx: McpCallContext | undefined;
    registry.registerTool(
      makeTool({
        name: 'list_pages',
        requiredScopes: ['pages:read'],
        handler: async (_args, callCtx) => {
          seenCtx = callCtx;
          return { pages: [] };
        },
      }),
    );

    new McpService(registry).createServer(ctx);
    const callback = callbackOf(registerToolSpy.mock.calls, 'list_pages');
    const result = await callback?.({}, { _meta: { namespace: 'other' } });

    expect(result).toEqual({ content: [{ type: 'text', text: '{"pages":[]}' }] });
    expect(seenCtx?.operation).toBeNull();
  });
});
