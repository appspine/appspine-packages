import type { ApiKeyUser } from '@appspine/auth';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpController } from './mcp.controller';
import type { McpCallContext } from './types';

const handleRequest = vi.fn().mockResolvedValue(undefined);
const closeTransport = vi.fn().mockResolvedValue(undefined);

vi.mock('@appspine/m2m-api-key', () => ({
  ApiKeyGuard: class {},
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest,
    close: closeTransport,
  })),
}));

const baseApiKeyUser = {
  sub: 'api-key-1',
  scopes: ['wiki-pages:read'],
  isApiKey: true,
  roleNames: ['ADMIN'],
  permissionPolicy: 'ALLOW_ALL',
  permissions: [],
} satisfies Omit<ApiKeyUser, 'actingUserId'>;

function createRequest(user: ApiKeyUser, headers: Record<string, string> = {}): Request {
  return { user, body: { jsonrpc: '2.0' }, headers } as unknown as Request;
}

function createResponse(): Response {
  return { on: vi.fn() } as unknown as Response;
}

describe('McpController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the bound acting user and API key id into the MCP call context', async () => {
    const contexts: McpCallContext[] = [];
    const server = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new McpController(
      {
        createServer: vi.fn((ctx: McpCallContext) => {
          contexts.push(ctx);
          return server;
        }),
      } as never,
      { getToolCount: vi.fn() } as never,
    );

    await controller.handlePost(
      createRequest({ ...baseApiKeyUser, actingUserId: 'service-user-1' }),
      createResponse(),
    );

    expect(contexts).toEqual([
      {
        scopes: ['wiki-pages:read'],
        isApiKey: true,
        roleNames: ['ADMIN'],
        actingUserId: 'service-user-1',
        sub: 'api-key-1',
        workflowId: null,
      },
    ]);
  });

  it('extracts workflowId from the X-Appspine-Workflow-Id header (023 §2.5)', async () => {
    const contexts: McpCallContext[] = [];
    const server = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new McpController(
      {
        createServer: vi.fn((ctx: McpCallContext) => {
          contexts.push(ctx);
          return server;
        }),
      } as never,
      { getToolCount: vi.fn() } as never,
    );

    await controller.handlePost(
      createRequest(
        { ...baseApiKeyUser, actingUserId: 'service-user-1' },
        { 'x-appspine-workflow-id': 'host-conv-123' },
      ),
      createResponse(),
    );

    expect(contexts[0]?.workflowId).toBe('host-conv-123');
  });

  it('leaves workflowId null when the header is absent (023 §2.5 "可選/非強制")', async () => {
    const contexts: McpCallContext[] = [];
    const server = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new McpController(
      {
        createServer: vi.fn((ctx: McpCallContext) => {
          contexts.push(ctx);
          return server;
        }),
      } as never,
      { getToolCount: vi.fn() } as never,
    );

    await controller.handlePost(
      createRequest({ ...baseApiKeyUser, actingUserId: 'service-user-1' }),
      createResponse(),
    );

    expect(contexts[0]?.workflowId).toBeNull();
  });

  it('forwards null when the API key has no active bound acting user', async () => {
    const contexts: McpCallContext[] = [];
    const server = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new McpController(
      {
        createServer: vi.fn((ctx: McpCallContext) => {
          contexts.push(ctx);
          return server;
        }),
      } as never,
      { getToolCount: vi.fn() } as never,
    );

    await controller.handlePost(
      createRequest({ ...baseApiKeyUser, actingUserId: null }),
      createResponse(),
    );

    expect(contexts[0]?.actingUserId).toBeNull();
    expect(contexts[0]?.sub).toBe('api-key-1');
  });
});

describe('McpController.getHealth', () => {
  it('omits the challenge key when no challenge query param is given', () => {
    const controller = new McpController({} as never, { getToolCount: () => 0 } as never);

    const result = controller.getHealth(undefined) as Record<string, unknown>;

    expect(result).not.toHaveProperty('challenge');
  });

  it('echoes the challenge query param back unchanged (023 §2.1 endpoint-change verification)', () => {
    const controller = new McpController({} as never, { getToolCount: () => 0 } as never);

    const result = controller.getHealth('nonce-abc-123') as Record<string, unknown>;

    expect(result.challenge).toBe('nonce-abc-123');
  });
});
