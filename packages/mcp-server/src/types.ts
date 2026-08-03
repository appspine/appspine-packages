import type { ZodType } from 'zod';

/// Multi-round-trip (MRTR) context for the current tool call (protocol revision 2026-07-28,
/// spec: basic/patterns/mrtr). A tool handler that needs more input before it can complete
/// returns `await ctx.mrtr.requestInput(inputRequests, data)` directly; `data` is opaque,
/// integrity-protected, and handed back via `resumed.data` on the retried call that echoes
/// the resulting requestState. Requires MCP_REQUEST_STATE_KEY to be configured for this app.
export interface McpMultiRoundContext {
  /// Present when this call is a retried round of a prior `requestInput` -- the verified
  /// payload from that call's `data` argument and the client's responses to what was asked,
  /// keyed by whatever identifiers the handler assigned in `inputRequests`. `inputResponses`
  /// values arrive from the client and are NOT validated by the SDK; treat them as untrusted.
  resumed?: {
    data: unknown;
    round: number;
    inputResponses: Record<string, unknown>;
  };
  requestInput(inputRequests: Record<string, unknown>, data: unknown): Promise<unknown>;
}

export interface McpCallContext {
  scopes: string[];
  isApiKey: boolean;
  roleNames: string[];
  /// Resolved acting user id for this M2M call; MCP is exclusively API-key-gated
  /// (see mcp.controller.ts), so this mirrors ApiKeyUser.actingUserId -- null when
  /// the calling key has no bound identity (fail-closed for write tools).
  actingUserId: string | null;
  /// The calling API key's id (ApiKeyUser.sub) -- needed for AuditLog.actingApiKeyId snapshots.
  sub: string;
  /// Caller-supplied correlation id from the X-Appspine-Workflow-Id request header (dev_docs
  /// 002/023 §2.5), already extracted via @appspine/audit-log's extractWorkflowId() -- tool
  /// handlers that write audit log entries should pass this straight through as
  /// RecordAuditLogDto.workflowId. Untrusted, optional, debugging/cross-app-tracing only.
  workflowId: string | null;
}

/// What a tool handler actually receives: the request-level McpCallContext plus the
/// per-call `mrtr` context mcp.service.ts builds fresh for every invocation. A handler typed
/// against the plain `McpCallContext` (every handler written before MRTR support existed)
/// remains valid here -- this only narrows `mrtr` from absent to present, it adds no new
/// required reads.
export type McpToolCallContext = McpCallContext & { mrtr: McpMultiRoundContext };

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodType;
  outputSchema?: ZodType;
  requiredScopes: string[];
  handler: (args: unknown, ctx: McpToolCallContext) => Promise<unknown>;
}
