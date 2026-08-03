import type { ServerContext } from '@modelcontextprotocol/server';
import { createMcpHandler, isInputRequiredResult, McpServer } from '@modelcontextprotocol/server';
import { Injectable, Logger } from '@nestjs/common';
import { classifyToolAsReadOnly, McpToolRegistry } from './mcp-tool.registry';
import {
  createMcpRequestStateStore,
  type McpMultiRoundStatePayload,
  type McpRequestStateCodec,
  readMcpRequestStateKey,
} from './request-state';
import type { McpCallContext, McpMultiRoundContext, McpToolCallContext } from './types';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  // Key material only -- read once, principal-independent. The codec itself is built fresh
  // per request in createServer() because its `bind` must close over that request's own
  // ctx.sub (see McpRequestStateOptions.principal for why it can't be the SDK's own
  // transport-level ctx.http.authInfo instead).
  private readonly requestStateKey: Uint8Array | undefined;

  constructor(private readonly registry: McpToolRegistry) {
    this.requestStateKey = readMcpRequestStateKey();
  }

  // A fresh handler is created per HTTP request (mcp.controller.ts), each already closed
  // over the ctx derived from that same request's auth -- there is no per-request authInfo
  // to round-trip through the SDK's factory callback here, unlike the SDK's own intended
  // usage of reusing one handler across many requests with differing authInfo.
  createHandler(ctx: McpCallContext) {
    return createMcpHandler(() => this.createServer(ctx));
  }

  createServer(ctx: McpCallContext): McpServer {
    const requestStateCodec = this.requestStateKey
      ? createMcpRequestStateStore({ key: this.requestStateKey, principal: ctx.sub })
      : undefined;
    const server = new McpServer(
      {
        name: process.env.npm_package_name ?? 'appspine-app',
        version: process.env.npm_package_version ?? '1.0.0',
      },
      requestStateCodec
        ? {
            requestState: { verify: (state, sdkCtx) => requestStateCodec.verify(state, sdkCtx) },
            inputRequired: { maxRounds: requestStateCodec.maxRounds },
          }
        : undefined,
    );

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
        async (args: unknown, sdkCtx: ServerContext) => {
          const callCtx: McpToolCallContext = {
            ...ctx,
            mrtr: buildMrtrContext(requestStateCodec, sdkCtx),
          };
          try {
            const result = await tool.handler(args, callCtx);

            // A handler that called `ctx.mrtr.requestInput(...)` returns the SDK's own
            // input_required shape directly -- pass it straight through the wire, bypassing
            // the content/structuredContent wrapping below (which is only for a completed
            // result), same as the SDK's own tools/call handler does for this discriminator.
            if (isInputRequiredResult(result)) return result;

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

function buildMrtrContext(
  requestStateCodec: McpRequestStateCodec | undefined,
  sdkCtx: ServerContext,
): McpMultiRoundContext {
  // Already verified by the SDK (via the `requestState.verify` hook passed to McpServer)
  // before this handler runs -- reading it here never re-checks integrity, it just reads
  // the hook's decoded result. undefined when this call carried no requestState at all.
  const resumedPayload = sdkCtx.mcpReq.requestState<McpMultiRoundStatePayload>();

  return {
    resumed:
      resumedPayload !== undefined
        ? {
            data: resumedPayload.data,
            round: resumedPayload.round,
            inputResponses: sdkCtx.mcpReq.inputResponses ?? {},
          }
        : undefined,
    async requestInput(inputRequests, data) {
      if (!requestStateCodec) {
        throw new Error(
          'ctx.mrtr.requestInput requires MCP_REQUEST_STATE_KEY to be configured for this app',
        );
      }
      const requestState =
        resumedPayload !== undefined
          ? await requestStateCodec.mintNextRound(data, resumedPayload.round, sdkCtx)
          : await requestStateCodec.mint(data, sdkCtx);
      return { resultType: 'input_required' as const, inputRequests, requestState };
    },
  };
}
