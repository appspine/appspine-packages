import type { ApiKeyUser } from '@appspine/auth';
import { ApiKeyGuard } from '@appspine/m2m-api-key';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext } from './types';

const WORKFLOW_ID_HEADER = 'x-appspine-workflow-id';

// Deliberately re-implemented here rather than imported from @appspine/audit-log's identical
// extractWorkflowId(): this monorepo's tsconfig.base.json uses classic "Node"
// moduleResolution, which can't resolve package.json `exports` subpaths, and importing
// audit-log's default entrypoint transitively pulls in AuditLogService's @prisma/client
// dependency (a generated client this package never `prisma generate`s), breaking at require
// time. Four lines, zero behavior drift risk -- not worth a moduleResolution-wide change.
function extractWorkflowId(headers: Record<string, unknown>): string | null {
  const value = headers[WORKFLOW_ID_HEADER];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// MCP is for external agents (n8n, AI clients) authenticated via M2M API key —
// same auth layer as the rest of the M2M surface (dev_docs 001 "MCP Server transport").
@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly registry: McpToolRegistry,
  ) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  async handlePost(@Req() req: Request, @Res({ passthrough: false }) res: Response): Promise<void> {
    const user = (req as unknown as { user?: ApiKeyUser }).user;

    const ctx: McpCallContext = {
      scopes: user?.scopes ?? [],
      isApiKey: user?.isApiKey ?? false,
      roleNames: user?.roleNames ?? [],
      actingUserId: user?.actingUserId ?? null,
      sub: user?.sub ?? '',
      workflowId: extractWorkflowId(req.headers as Record<string, unknown>),
    };

    const server = this.mcpService.createServer(ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
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
