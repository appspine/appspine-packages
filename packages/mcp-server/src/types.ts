import type { ZodType } from 'zod';

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

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodType;
  requiredScopes: string[];
  handler: (args: unknown, ctx: McpCallContext) => Promise<unknown>;
}
