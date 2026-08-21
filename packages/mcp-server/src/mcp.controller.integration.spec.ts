import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response as ExpressResponse } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpToolDefinition } from './types';

const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSION = '2025-11-25';

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

function makeModernBody(method: string, params: Record<string, unknown>, id: number): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': {
          name: 'appspine-controller-test',
          version: '0.0.0',
        },
      },
    },
  });
}

function makeLegacyBody(method: string, params: Record<string, unknown>, id: number): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params });
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

describe('McpController v2 Node adapter integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes modern and legacy requests through the actual Nest controller handler', async () => {
    vi.stubEnv('MCP_ALLOWED_HOSTNAMES', '127.0.0.1');
    vi.stubEnv('MCP_ALLOWED_ORIGIN_HOSTNAMES', '127.0.0.1');

    const registry = new McpToolRegistry();
    const tool: McpToolDefinition = {
      name: 'echo',
      description: 'Controller integration tool.',
      inputSchema: z.object({ message: z.string() }),
      requiredScopes: ['pages:read'],
      handler: async (args) => ({ answer: (args as { message: string }).message }),
    };
    registry.registerTool(tool);
    const controller = new McpController(new McpService(registry), registry);

    const server = createServer((req, res) => {
      void (async () => {
        (req as IncomingMessage & { body?: unknown; user?: unknown }).body = await parseBody(req);
        (req as IncomingMessage & { user?: unknown }).user = {
          sub: 'api-key-1',
          scopes: ['pages:read'],
          isApiKey: true,
          roleNames: [],
          actingUserId: 'user-1',
          permissionPolicy: 'ALLOW_ALL',
          permissions: [],
        };
        await controller.handlePost(req as never, res as unknown as ExpressResponse);
      })().catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const endpoint = `http://127.0.0.1:${port}/mcp`;

    try {
      const modern = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': MODERN_VERSION,
          'Mcp-Method': 'tools/list',
        },
        body: makeModernBody('tools/list', {}, 1),
      });
      const modernBody = await readJson(modern);
      expect((modernBody.result as { tools?: Array<{ name: string }> }).tools?.[0]?.name).toBe(
        'echo',
      );

      const legacy = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': LEGACY_VERSION,
        },
        body: makeLegacyBody(
          'initialize',
          {
            protocolVersion: LEGACY_VERSION,
            capabilities: {},
            clientInfo: { name: 'legacy-controller-test', version: '0.0.0' },
          },
          2,
        ),
      });
      const legacyBody = await readJson(legacy);
      expect((legacyBody.result as { protocolVersion?: string }).protocolVersion).toBe(
        LEGACY_VERSION,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
