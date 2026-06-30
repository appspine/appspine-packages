import type { ZodType } from 'zod';

export interface McpCallContext {
  scopes: string[];
  isApiKey: boolean;
  roleNames: string[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodType;
  requiredScopes: string[];
  handler: (args: unknown, ctx: McpCallContext) => Promise<unknown>;
}
