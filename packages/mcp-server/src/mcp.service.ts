import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { Injectable, Logger } from '@nestjs/common';
import { classifyToolAsReadOnly, McpToolRegistry } from './mcp-tool.registry';
import type { McpCallContext } from './types';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(private readonly registry: McpToolRegistry) {}

  // A fresh handler is created per HTTP request (mcp.controller.ts), each already closed
  // over the ctx derived from that same request's auth -- there is no per-request authInfo
  // to round-trip through the SDK's factory callback here, unlike the SDK's own intended
  // usage of reusing one handler across many requests with differing authInfo.
  createHandler(ctx: McpCallContext) {
    return createMcpHandler(() => this.createServer(ctx));
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
          outputSchema: tool.outputSchema,
          // Derived from `requiredScopes` at listing time, not hand-set per app (dev_docs 002
          // "Scope 的 action 讀/寫分類規則", dev_docs 023 §2.3/§6.4). This is the wire-format
          // channel the AI Agent Team app's single-write-per-invocation check reads from
          // (023 §3.5) — `requiredScopes` itself never leaves the server.
          annotations: { readOnlyHint: classifyToolAsReadOnly(tool.requiredScopes) },
        },
        async (args: unknown) => {
          try {
            const result = await tool.handler(args, ctx);

            // `structuredContent` is exposed for any serializable result (object, array, or
            // primitive) -- not just plain objects. The v2 SDK's own wire codec
            // (projectCallToolResult) wraps non-object structuredContent in `{ result: ... }`
            // for eras that require it; restricting this to plain objects meant every tool
            // declaring a non-object outputSchema (e.g. an array or string) failed
            // `validateToolOutput`'s "no structured content was provided" check on every
            // successful call.
            const text = result === undefined ? '' : (JSON.stringify(result) ?? String(result));

            return {
              content: [{ type: 'text' as const, text }],
              ...(result !== undefined && result !== null ? { structuredContent: result } : {}),
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            // The caller-facing message is unchanged here (many tools intentionally throw a
            // descriptive validation error that the calling agent needs to see); what was
            // missing is that this failure was otherwise invisible server-side, so an infra
            // error (a stack trace, a DB host/user) reached an external API-key holder while
            // this app's own logs and alerting never saw it at all.
            this.logger.error(
              `Tool ${tool.name} threw: ${msg}`,
              err instanceof Error ? err.stack : undefined,
            );
            return { isError: true, content: [{ type: 'text' as const, text: msg }] };
          }
        },
      );
    }

    return server;
  }
}
