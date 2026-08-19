import type { IncomingMessage, ServerResponse } from 'node:http';
import { actingUserIdOf, isMachinePrincipal, type Principal } from '@appspine/plugin-api';
import { MachineAuthGuard } from '@appspine/plugin-host-nest';
import {
  hostHeaderValidation,
  type NodeIncomingMessageLike,
  type NodeServerResponseLike,
  originValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext } from './types';

const WORKFLOW_ID_HEADER = 'x-appspine-workflow-id';

/**
 * Extracts the correlation workflow id from request headers.
 */
export function extractWorkflowId(headers: Record<string, unknown>): string | null {
  const value = headers[WORKFLOW_ID_HEADER];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// MCP is for external agents (n8n, AI clients) authenticated via machine authentication (M2M API key) —
// same auth layer as the rest of the M2M surface (dev_docs 001 "MCP Server transport").
@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly registry: McpToolRegistry,
  ) {}

  @Post()
  @UseGuards(MachineAuthGuard)
  async handlePost(@Req() req: Request, @Res({ passthrough: false }) res: Response): Promise<void> {
    const user = (req as unknown as { user?: Principal }).user;

    const isApiKey = user ? isMachinePrincipal(user) : false;
    const scopes = user && 'scopes' in user && Array.isArray(user.scopes) ? user.scopes : [];
    const actingUserId = user ? actingUserIdOf(user) : null;

    const ctx: McpCallContext = {
      scopes,
      isApiKey,
      roleNames: user?.roleNames ?? [],
      actingUserId,
      sub: user?.sub ?? '',
      workflowId: extractWorkflowId((req.headers ?? {}) as Record<string, unknown>),
    };

    if (
      !hostHeaderValidation(readAllowedHostnames('MCP_ALLOWED_HOSTNAMES'))(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
      )
    ) {
      return;
    }

    if (
      !originValidation(readAllowedHostnames('MCP_ALLOWED_ORIGIN_HOSTNAMES'))(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
      )
    ) {
      return;
    }

    const authInfo: AuthInfo = {
      token: 'appspine-api-key',
      clientId: ctx.sub,
      scopes: ctx.scopes,
      extra: { mcpCallContext: ctx },
    };
    (req as Request & { auth?: AuthInfo }).auth = authInfo;

    const handler = this.mcpService.createHandler(ctx);
    const nodeHandler = toNodeHandler(handler);

    res.on('close', () => {
      void handler.close();
    });

    await nodeHandler(
      req as unknown as NodeIncomingMessageLike,
      res as unknown as NodeServerResponseLike,
      req.body as unknown,
    );
  }

  // The optional `challenge` echo lets the 023 discovery service (§2.1) verify control of an
  // app's MCP endpoint before accepting an endpoint-location change: it calls this same,
  // already-public, unauthenticated route with a nonce and checks the value comes back
  // unchanged, proving the caller can reach whatever is actually serving that URL. Read-only
  // and harmless -- it doesn't grant access to anything, so no new auth surface is needed.
  @Get('health')
  getHealth(@Query('challenge') challenge?: string): object {
    return {
      status: 'ok',
      serverInfo: {
        name: process.env.npm_package_name ?? 'appspine-app',
        version: process.env.npm_package_version ?? '1.0.0',
      },
      toolCount: this.registry.getToolCount(),
      ...(challenge !== undefined ? { challenge } : {}),
    };
  }
}

function readAllowedHostnames(variableName: string): string[] {
  const configured = process.env[variableName]
    ?.split(',')
    .map((hostname) => hostname.trim())
    .filter((hostname) => hostname.length > 0);

  // An absent allowlist must fail closed; deployment configuration owns the public host names.
  return configured ?? [];
}
