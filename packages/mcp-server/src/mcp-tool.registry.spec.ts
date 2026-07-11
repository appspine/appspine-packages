import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyToolAsReadOnly,
  getConfiguredToolPrefix,
  McpToolRegistry,
} from './mcp-tool.registry';
import type { McpToolDefinition } from './types';

function makeTool(overrides: Partial<McpToolDefinition> = {}): McpToolDefinition {
  return {
    name: 'list_pages',
    description: 'test',
    inputSchema: {} as McpToolDefinition['inputSchema'],
    requiredScopes: ['pages:read'],
    handler: async () => ({}),
    ...overrides,
  };
}

describe('classifyToolAsReadOnly', () => {
  it('classifies read/list/get actions as read-only', () => {
    expect(classifyToolAsReadOnly(['pages:read'])).toBe(true);
    expect(classifyToolAsReadOnly(['pages:list'])).toBe(true);
    expect(classifyToolAsReadOnly(['pages:get'])).toBe(true);
  });

  it('classifies any other action as a write', () => {
    expect(classifyToolAsReadOnly(['pages:write'])).toBe(false);
    expect(classifyToolAsReadOnly(['pages:create'])).toBe(false);
    expect(classifyToolAsReadOnly(['pages:update'])).toBe(false);
    expect(classifyToolAsReadOnly(['pages:delete'])).toBe(false);
  });

  it('classifies a mix of read and write scopes as a write (any-write wins)', () => {
    expect(classifyToolAsReadOnly(['pages:read', 'attachments:write'])).toBe(false);
  });

  it('fails closed to write when no scopes are declared', () => {
    expect(classifyToolAsReadOnly([])).toBe(false);
  });
});

describe('getConfiguredToolPrefix', () => {
  afterEach(() => {
    delete process.env.MCP_TOOL_PREFIX;
  });

  it('returns undefined when unset (transition window default)', () => {
    delete process.env.MCP_TOOL_PREFIX;
    expect(getConfiguredToolPrefix()).toBeUndefined();
  });

  it('returns the prefix when it matches the allowed character set', () => {
    process.env.MCP_TOOL_PREFIX = 'wiki';
    expect(getConfiguredToolPrefix()).toBe('wiki');
  });

  it('throws at read time when the prefix contains disallowed characters', () => {
    process.env.MCP_TOOL_PREFIX = 'wiki app!';
    expect(() => getConfiguredToolPrefix()).toThrow(/MCP_TOOL_PREFIX/);
  });
});

describe('McpToolRegistry dual registration', () => {
  afterEach(() => {
    delete process.env.MCP_TOOL_PREFIX;
  });

  it('registers only the unprefixed name when MCP_TOOL_PREFIX is unset', () => {
    delete process.env.MCP_TOOL_PREFIX;
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool());

    expect(registry.getTool('list_pages')).toBeDefined();
    expect(registry.getTool('wiki_list_pages')).toBeUndefined();
    expect(registry.getToolCount()).toBe(1);
  });

  it('registers both the legacy and prefixed name pointing at the same handler when set', async () => {
    process.env.MCP_TOOL_PREFIX = 'wiki';
    const registry = new McpToolRegistry();
    registry.registerTool(makeTool());

    const legacy = registry.getTool('list_pages');
    const prefixed = registry.getTool('wiki_list_pages');
    expect(legacy).toBeDefined();
    expect(prefixed).toBeDefined();
    expect(prefixed?.requiredScopes).toEqual(legacy?.requiredScopes);
    expect(registry.getToolCount()).toBe(2);

    await expect(legacy?.handler(undefined, {} as never)).resolves.toEqual(
      await prefixed?.handler(undefined, {} as never),
    );
  });

  it('throws when registering with an invalid MCP_TOOL_PREFIX', () => {
    process.env.MCP_TOOL_PREFIX = 'wiki!';
    const registry = new McpToolRegistry();
    expect(() => registry.registerTool(makeTool())).toThrow(/MCP_TOOL_PREFIX/);
  });
});
