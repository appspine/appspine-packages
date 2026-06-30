import type { ZodType } from 'zod';
import type { McpToolRegistry } from './mcp-tool.registry';

export const MCP_TOOL_PROVIDERS = 'MCP_TOOL_PROVIDERS';

export interface McpToolOptions {
  name: string;
  description: string;
  inputSchema: ZodType;
  requiredScopes?: string[];
}

export function McpTool(options: McpToolOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    Reflect.defineMetadata('mcp:tool', options, target, propertyKey);
  };
}

/** Scans an instance for @McpTool()-decorated methods and registers them with the registry. */
export function registerMcpToolsFromInstance(instance: object, registry: McpToolRegistry): void {
  const proto = Object.getPrototypeOf(instance) as object;
  for (const key of Object.getOwnPropertyNames(proto)) {
    const options = Reflect.getMetadata('mcp:tool', proto, key) as McpToolOptions | undefined;
    if (!options) continue;

    const method = (instance as Record<string, unknown>)[key];
    if (typeof method !== 'function') continue;

    registry.registerTool({
      name: options.name,
      description: options.description,
      inputSchema: options.inputSchema,
      requiredScopes: options.requiredScopes ?? [],
      handler: (args: unknown) =>
        (method as (args: unknown) => Promise<unknown>).call(instance, args),
    });
  }
}
