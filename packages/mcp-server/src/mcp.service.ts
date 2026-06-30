import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext } from './types';

@Injectable()
export class McpService {
  constructor(private readonly registry: McpToolRegistry) {}

  createServer(ctx: McpCallContext): McpServer {
    const server = new McpServer({
      name: process.env.npm_package_name ?? 'appspine-app',
      version: process.env.npm_package_version ?? '1.0.0',
    });

    const tools = this.registry.listTools(ctx);

    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
        },
        async (args: unknown) => {
          try {
            const result = await tool.handler(args, ctx);

            if (
              result !== null &&
              typeof result === 'object' &&
              'error' in result &&
              (result as { error: unknown }).error
            ) {
              const msg = (result as { message?: string }).message ?? 'Unknown error';
              return { isError: true, content: [{ type: 'text' as const, text: msg }] };
            }

            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { isError: true, content: [{ type: 'text' as const, text: msg }] };
          }
        },
      );
    }

    return server;
  }
}
