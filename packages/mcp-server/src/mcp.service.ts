import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { classifyToolAsReadOnly, McpToolRegistry } from './mcp-tool.registry';
import { parseMcpOperationMetadata } from './metadata';
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
          // Derived from `requiredScopes` at listing time, not hand-set per app (dev_docs 002
          // "Scope 的 action 讀/寫分類規則", dev_docs 023 §2.3/§6.4). This is the wire-format
          // channel the AI Agent Team app's single-write-per-invocation check reads from
          // (023 §3.5) — `requiredScopes` itself never leaves the server.
          annotations: { readOnlyHint: classifyToolAsReadOnly(tool.requiredScopes) },
        },
        async (args: unknown, extra: { _meta?: unknown }) => {
          try {
            const metadata = parseMcpOperationMetadata(extra._meta);
            const isReadOnly = classifyToolAsReadOnly(tool.requiredScopes);
            if (!isReadOnly && (!metadata.ok || metadata.metadata === null)) {
              const reason = metadata.ok
                ? 'write MCP tools require operation metadata'
                : metadata.reason;
              return { isError: true, content: [{ type: 'text' as const, text: reason }] };
            }

            const result = await tool.handler(args, {
              ...ctx,
              operation: metadata.ok ? metadata.metadata : null,
            });

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
