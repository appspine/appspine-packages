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

// Cross-app tool naming prefix (dev_docs 002 "跨 app 統一的 app 前綴", dev_docs 023 §2.2) —
// only `[a-zA-Z0-9_-]` is allowed because the prefixed name must also satisfy MCP tool-calling
// name constraints (dev_docs 023 §3.1).
const TOOL_PREFIX_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Reads the app-level tool prefix from `MCP_TOOL_PREFIX` (002 env var convention). Returns
 * `undefined` during the dual-registration transition window for apps that haven't set it yet
 * (dev_docs 023 §2.2) — in that case only the unprefixed legacy name is registered.
 */
export function getConfiguredToolPrefix(): string | undefined {
  const prefix = process.env.MCP_TOOL_PREFIX;
  if (!prefix) return undefined;
  if (!TOOL_PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      `MCP_TOOL_PREFIX="${prefix}" is invalid — must match ${TOOL_PREFIX_PATTERN} (dev_docs 023 §2.2).`,
    );
  }
  return prefix;
}

// Read/write action classification (dev_docs 002 "Scope 的 action 讀/寫分類規則",
// dev_docs 023 §2.3/§6.4) — this is the source `readOnlyHint` in mcp.service.ts is derived
// from, and what the AI Agent Team app's single-write-per-invocation check (023 §3.5) relies
// on. A tool with no declared scopes can't be classified, so it fails closed as a write tool
// (same fail-closed posture as `actingUserId` in types.ts).
const READ_ACTIONS = new Set(['read', 'list', 'get']);

export function classifyToolAsReadOnly(requiredScopes: string[]): boolean {
  if (requiredScopes.length === 0) return false;
  return requiredScopes.every((scope) => {
    const action = scope.split(':')[1];
    return action !== undefined && READ_ACTIONS.has(action);
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

  /**
   * Registers `tool` under its own name, and — when `MCP_TOOL_PREFIX` is configured — also
   * under `<prefix>_<name>` pointing at the same handler/scopes (dual registration, dev_docs
   * 023 §2.2). Both names stay registered through the transition window; only the unprefixed
   * name is dropped once it's retired (dev_docs 023 §6.5).
   */
  registerTool(tool: McpToolDefinition): void {
    this.registerSingle(tool);

    const prefix = getConfiguredToolPrefix();
    if (prefix) {
      this.registerSingle({ ...tool, name: `${prefix}_${tool.name}` });
    }
  }

  private registerSingle(tool: McpToolDefinition): void {
    if (this.toolMap.has(tool.name)) {
      this.logger.log(`Tool "${tool.name}" re-registered, overriding the previous definition`);
    }
    this.toolMap.set(tool.name, tool);
  }
}
