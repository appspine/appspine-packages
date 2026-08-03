import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  'io.modelcontextprotocol/clientCapabilities': { elicitation: { form: {} } },
  'io.modelcontextprotocol/clientInfo': { name: 'appspine-mrtr-test', version: '0.0.0' },
};

function modernRequest(params: Record<string, unknown>, id: number): Request {
  const headers = new Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': MODERN_VERSION,
    'Mcp-Method': 'tools/call',
  });
  if (typeof params.name === 'string') {
    headers.set('Mcp-Name', `=?base64?${Buffer.from(params.name).toString('base64')}?=`);
  }
  return new Request('https://appspine.example.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { ...params, _meta: MODERN_META },
    }),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

function registerConfirmDeleteTool(registry: McpToolRegistry): void {
  const tool: McpToolDefinition = {
    name: 'delete_page',
    description: 'Deletes a page after the caller confirms.',
    inputSchema: z.object({ id: z.string() }),
    requiredScopes: ['pages:delete'],
    handler: async (args, callContext) => {
      const { id } = args as { id: string };
      if (!callContext.mrtr.resumed) {
        return callContext.mrtr.requestInput(
          { confirm: { method: 'elicitation/create', params: { message: `Delete ${id}?` } } },
          { step: 'confirm-delete', targetId: id },
        );
      }
      const confirmed = (
        callContext.mrtr.resumed.inputResponses.confirm as { confirmed?: boolean } | undefined
      )?.confirmed;
      const resumedData = callContext.mrtr.resumed.data as { step: string; targetId: string };
      return {
        deleted: confirmed === true,
        targetId: resumedData.targetId,
        round: callContext.mrtr.resumed.round,
      };
    },
  };
  registry.registerTool(tool);
}

const ctxFor = (sub: string): McpCallContext => ({
  scopes: ['pages:delete'],
  isApiKey: true,
  roleNames: [],
  actingUserId: 'user-1',
  sub,
  workflowId: null,
});

describe('MRTR requestState: end-to-end through the real handler', () => {
  const ORIGINAL_KEY = process.env.MCP_REQUEST_STATE_KEY;

  beforeEach(() => {
    process.env.MCP_REQUEST_STATE_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.MCP_REQUEST_STATE_KEY;
    else process.env.MCP_REQUEST_STATE_KEY = ORIGINAL_KEY;
  });

  it('issues a requestState on first call, then resumes with the client-supplied inputResponses on retry', async () => {
    const registry = new McpToolRegistry();
    registerConfirmDeleteTool(registry);
    const handler = new McpService(registry).createHandler(ctxFor('api-key-1'));

    try {
      const first = await handler.fetch(
        modernRequest({ name: 'delete_page', arguments: { id: 'page-1' } }, 1),
      );
      const firstBody = await readJson(first);
      const firstResult = firstBody.result as {
        resultType?: string;
        inputRequests?: Record<string, unknown>;
        requestState?: string;
      };
      expect(firstResult.resultType).toBe('input_required');
      expect(firstResult.inputRequests?.confirm).toBeDefined();
      expect(typeof firstResult.requestState).toBe('string');

      const second = await handler.fetch(
        modernRequest(
          {
            name: 'delete_page',
            arguments: { id: 'page-1' },
            requestState: firstResult.requestState,
            inputResponses: { confirm: { confirmed: true } },
          },
          2,
        ),
      );
      const secondBody = await readJson(second);
      const secondResult = secondBody.result as {
        structuredContent?: { deleted: boolean; targetId: string; round: number };
      };
      // round 0: the flow's one and only ask-then-resume leg -- round only advances past 0
      // when a handler calls requestInput a second time from inside an already-resumed call.
      expect(secondResult.structuredContent).toEqual({
        deleted: true,
        targetId: 'page-1',
        round: 0,
      });
    } finally {
      await handler.close();
    }
  });

  it('rejects a requestState echoed by a different API key (cross-principal replay)', async () => {
    const registry = new McpToolRegistry();
    registerConfirmDeleteTool(registry);
    const issuer = new McpService(registry).createHandler(ctxFor('api-key-1'));
    const attacker = new McpService(registry).createHandler(ctxFor('api-key-2'));

    try {
      const first = await issuer.fetch(
        modernRequest({ name: 'delete_page', arguments: { id: 'page-1' } }, 1),
      );
      const { requestState } = (await readJson(first)).result as { requestState?: string };

      const replay = await attacker.fetch(
        modernRequest(
          {
            name: 'delete_page',
            arguments: { id: 'page-1' },
            requestState,
            inputResponses: { confirm: { confirmed: true } },
          },
          2,
        ),
      );
      const replayBody = (await replay.json()) as {
        error?: { message?: string };
        result?: {
          isError?: boolean;
          content?: Array<{ text?: string }>;
          structuredContent?: unknown;
        };
      };
      // Whether the seam surfaces this as a JSON-RPC-level error or the SDK's tool-error
      // envelope is an implementation detail; either way, it must NOT be the completed
      // deletion result, and the raw reason must be the SDK's frozen, non-leaking message.
      expect(replayBody.result?.structuredContent).toBeUndefined();
      const message = replayBody.error?.message ?? replayBody.result?.content?.[0]?.text ?? '';
      expect(message).toMatch(/invalid.*requestState/i);
    } finally {
      await issuer.close();
      await attacker.close();
    }
  });

  it('rejects a tampered requestState instead of silently resuming with attacker-controlled data', async () => {
    const registry = new McpToolRegistry();
    registerConfirmDeleteTool(registry);
    const handler = new McpService(registry).createHandler(ctxFor('api-key-1'));

    try {
      const first = await handler.fetch(
        modernRequest({ name: 'delete_page', arguments: { id: 'page-1' } }, 1),
      );
      const { requestState } = (await readJson(first)).result as { requestState: string };
      const tampered = `${requestState.slice(0, -2)}${requestState.slice(-2) === 'zz' ? 'yy' : 'zz'}`;

      const retried = await handler.fetch(
        modernRequest(
          {
            name: 'delete_page',
            arguments: { id: 'page-1' },
            requestState: tampered,
            inputResponses: { confirm: { confirmed: true } },
          },
          2,
        ),
      );
      const retriedBody = (await retried.json()) as {
        error?: { message?: string };
        result?: {
          isError?: boolean;
          content?: Array<{ text?: string }>;
          structuredContent?: unknown;
        };
      };
      expect(retriedBody.result?.structuredContent).toBeUndefined();
      const message = retriedBody.error?.message ?? retriedBody.result?.content?.[0]?.text ?? '';
      expect(message).toMatch(/invalid.*requestState/i);
    } finally {
      await handler.close();
    }
  });

  it('throws a clear, actionable error when a handler calls requestInput without MCP_REQUEST_STATE_KEY configured', async () => {
    delete process.env.MCP_REQUEST_STATE_KEY;
    const registry = new McpToolRegistry();
    registerConfirmDeleteTool(registry);
    const handler = new McpService(registry).createHandler(ctxFor('api-key-1'));

    try {
      const response = await handler.fetch(
        modernRequest({ name: 'delete_page', arguments: { id: 'page-1' } }, 1),
      );
      const body = await readJson(response);
      const result = body.result as { isError?: boolean; content?: Array<{ text?: string }> };
      expect(result.isError).toBe(true);
      expect(result.content?.[0]?.text).toMatch(/MCP_REQUEST_STATE_KEY/);
    } finally {
      await handler.close();
    }
  });
});
