import type { ZodType } from 'zod';
import type { McpToolRegistry } from './mcp-tool.registry';
import type { McpToolCallContext } from './types';

export const MCP_TOOL_PROVIDERS = 'MCP_TOOL_PROVIDERS';

export interface McpToolOptions {
  name: string;
  description: string;
  inputSchema: ZodType;
  outputSchema?: ZodType;
  /** Required, even for an intentionally public tool (pass `[]` explicitly) -- an omitted
   * value used to default to `[]` silently, so a tool that simply forgot to declare its
   * scopes was callable by every API key regardless of what scopes it actually holds. */
  requiredScopes: string[];
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

    if (!Array.isArray(options.requiredScopes)) {
      throw new Error(
        `@McpTool "${options.name}" must declare requiredScopes explicitly (pass [] for an intentionally public tool)`,
      );
    }

    registry.registerTool({
      name: options.name,
      description: options.description,
      inputSchema: options.inputSchema,
      outputSchema: options.outputSchema,
      requiredScopes: options.requiredScopes,
      handler: (args: unknown, ctx: McpToolCallContext) =>
        (method as (args: unknown, ctx: McpToolCallContext) => Promise<unknown>).call(
          instance,
          args,
          ctx,
        ),
    });
  }
}
