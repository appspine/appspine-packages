import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { Injectable } from '@nestjs/common';
import { classifyToolAsReadOnly, McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext } from './types';

@Injectable()
export class McpService {
  constructor(private readonly registry: McpToolRegistry) {}

  createHandler(ctx: McpCallContext) {
    return createMcpHandler(({ authInfo }) => {
      const authenticatedContext = getContextFromAuthInfo(authInfo);
      return this.createServer(authenticatedContext ?? ctx);
    });
  }

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

            const text = JSON.stringify(result) ?? String(result);
            const structuredContent =
              result !== null && typeof result === 'object' && !Array.isArray(result)
                ? (result as Record<string, unknown>)
                : undefined;

            return {
              content: [{ type: 'text' as const, text }],
              ...(structuredContent !== undefined ? { structuredContent } : {}),
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

function getContextFromAuthInfo(authInfo: AuthInfo | undefined): McpCallContext | undefined {
  const candidate = authInfo?.extra?.mcpCallContext;
  if (!candidate || typeof candidate !== 'object') return undefined;

  const context = candidate as Partial<McpCallContext>;
  if (
    !Array.isArray(context.scopes) ||
    typeof context.isApiKey !== 'boolean' ||
    !Array.isArray(context.roleNames) ||
    (typeof context.actingUserId !== 'string' && context.actingUserId !== null) ||
    typeof context.sub !== 'string' ||
    (typeof context.workflowId !== 'string' && context.workflowId !== null)
  ) {
    return undefined;
  }

  return context as McpCallContext;
}
