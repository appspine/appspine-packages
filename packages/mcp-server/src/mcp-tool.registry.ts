import { Injectable, Logger } from '@nestjs/common';
import type { McpCallContext, McpToolDefinition } from './types';

export function matchScope(grantedScopes: string[], requiredScope: string): boolean {
  if (grantedScopes.includes('*')) return true;
  const [reqModule, reqAction] = requiredScope.split(':');
  return grantedScopes.some((g) => {
    if (g === '*') return true;
    const [gModule, gAction] = g.split(':');
    if (gModule !== reqModule) return false;
    return gAction === '*' || gAction === reqAction;
  });
}

// Tools are registered exclusively by the app via @McpTool() + registerMcpToolsFromInstance()
// — this framework package does not auto-generate CRUD tools from the Prisma schema
// (dev_docs 001 "MCP tool 產生方式：By app 自行產生").
@Injectable()
export class McpToolRegistry {
  private readonly logger = new Logger(McpToolRegistry.name);
  private readonly toolMap = new Map<string, McpToolDefinition>();

  listTools(ctx: McpCallContext): McpToolDefinition[] {
    return Array.from(this.toolMap.values()).filter((tool) =>
      tool.requiredScopes.every((scope) => matchScope(ctx.scopes, scope)),
    );
  }

  getTool(name: string): McpToolDefinition | undefined {
    return this.toolMap.get(name);
  }

  getToolCount(): number {
    return this.toolMap.size;
  }

  registerTool(tool: McpToolDefinition): void {
    if (this.toolMap.has(tool.name)) {
      this.logger.log(`Tool "${tool.name}" re-registered, overriding the previous definition`);
    }
    this.toolMap.set(tool.name, tool);
  }
}
