import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@appspine/m2m-api-key', () => ({
  matchScope: (grantedScopes: string[], requiredScope: string) => {
    if (grantedScopes.includes('*')) return true;
    const [requiredModule, requiredAction] = requiredScope.split(':');
    return grantedScopes.some((scope) => {
      const [module, action] = scope.split(':');
      return module === requiredModule && (action === '*' || action === requiredAction);
    });
  },
}));

import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext, McpToolDefinition } from './types';

const MODERN_VERSION = '2026-07-28';
const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'appspine-contract-test', version: '0.0.0' },
};

const ctx: McpCallContext = {
  scopes: ['pages:read'],
  isApiKey: true,
  roleNames: ['ADMIN'],
  actingUserId: 'user-1',
  sub: 'api-key-1',
  workflowId: 'workflow-1',
};

function modernRequest(method: string, params: Record<string, unknown>, id: number): Request {
  const headers = new Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': MODERN_VERSION,
    'Mcp-Method': method,
  });

  if (typeof params.name === 'string') {
    headers.set('Mcp-Name', `=?base64?${Buffer.from(params.name).toString('base64')}?=`);
  }

  return new Request('https://appspine.example.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: MODERN_META } }),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.startsWith('application/json'))
    return (await response.json()) as Record<string, unknown>;

  const data = (await response.text())
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .find((line) => line.length > 0);
  expect(data).toBeDefined();
  return JSON.parse(data as string) as Record<string, unknown>;
}

function registerEchoTool(registry: McpToolRegistry): void {
  const tool: McpToolDefinition = {
    name: 'echo',
    description: 'Returns a structured echo result.',
    inputSchema: z.object({ message: z.string() }),
    requiredScopes: ['pages:read'],
    handler: async (args, callContext) => ({
      answer: (args as { message: string }).message,
      apiKeyId: callContext.sub,
    }),
  };
  registry.registerTool(tool);
}

describe('McpService MCP v2 contract', () => {
  it('serves discover, tools/list, and tools/call through the actual package handler', async () => {
    const registry = new McpToolRegistry();
    registerEchoTool(registry);
    const handler = new McpService(registry).createHandler(ctx);

    try {
      const discover = await handler.fetch(modernRequest('server/discover', {}, 1));
      const discoverBody = await readJson(discover);
      expect((discoverBody.result as { supportedVersions?: string[] }).supportedVersions).toContain(
        MODERN_VERSION,
      );

      const list = await handler.fetch(modernRequest('tools/list', {}, 2));
      const listBody = await readJson(list);
      const tools = (listBody.result as { tools?: Array<{ name: string }> }).tools;
      expect(tools?.some((tool) => tool.name === 'echo')).toBe(true);

      const call = await handler.fetch(
        modernRequest('tools/call', { name: 'echo', arguments: { message: 'hello' } }, 3),
      );
      const callBody = await readJson(call);
      const result = callBody.result as {
        content?: Array<{ type: string; text?: string }>;
        structuredContent?: { answer?: string; apiKeyId?: string };
      };
      expect(result.content?.[0]?.text).toBe(
        JSON.stringify({ answer: 'hello', apiKeyId: 'api-key-1' }),
      );
      expect(result.structuredContent).toEqual({ answer: 'hello', apiKeyId: 'api-key-1' });
    } finally {
      await handler.close();
    }
  });
});
