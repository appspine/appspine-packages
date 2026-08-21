import type { Principal } from '@appspine/plugin-api';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpController } from './mcp.controller';

const principal: Principal = {
  sub: 'api-key-1',
  scopes: [],
  isApiKey: true,
  roleNames: [],
  actingUserId: null,
  permissionPolicy: 'ALLOW_ALL',
  permissions: [],
};

function createRequest(host: string, origin?: string): Request {
  return {
    user: principal,
    body: {},
    headers: { host, ...(origin === undefined ? {} : { origin }) },
  } as unknown as Request;
}

function createResponse(): Response {
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as Response;
}

describe('McpController MCP request guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a Host header outside the configured allowlist before creating a handler', async () => {
    vi.stubEnv('MCP_ALLOWED_HOSTNAMES', 'allowed.example.test');
    vi.stubEnv('MCP_ALLOWED_ORIGIN_HOSTNAMES', 'allowed.example.test');
    const response = createResponse();
    const createHandler = vi.fn();
    const controller = new McpController({ createHandler } as never, {} as never);

    await controller.handlePost(createRequest('attacker.example.test'), response);

    expect((response.writeHead as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(403);
    expect(createHandler).not.toHaveBeenCalled();
  });

  it('rejects an Origin hostname outside the configured allowlist', async () => {
    vi.stubEnv('MCP_ALLOWED_HOSTNAMES', 'allowed.example.test');
    vi.stubEnv('MCP_ALLOWED_ORIGIN_HOSTNAMES', 'allowed.example.test');
    const response = createResponse();
    const createHandler = vi.fn();
    const controller = new McpController({ createHandler } as never, {} as never);

    await controller.handlePost(
      createRequest('allowed.example.test', 'https://attacker.example.test'),
      response,
    );

    expect((response.writeHead as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(403);
    expect(createHandler).not.toHaveBeenCalled();
  });

  it('fails closed when the Host allowlist is not configured', async () => {
    vi.stubEnv('MCP_ALLOWED_HOSTNAMES', '');
    vi.stubEnv('MCP_ALLOWED_ORIGIN_HOSTNAMES', 'allowed.example.test');
    const response = createResponse();
    const createHandler = vi.fn();
    const controller = new McpController({ createHandler } as never, {} as never);

    await controller.handlePost(createRequest('allowed.example.test'), response);

    expect((response.writeHead as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(403);
    expect(createHandler).not.toHaveBeenCalled();
  });
});
