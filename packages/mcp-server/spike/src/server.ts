import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export const createMcpServer = () => {
  const server = new McpServer({ name: 'appspine-mcp-v2-spike', version: '0.0.0' });

  server.registerTool(
    'echo',
    {
      description: 'Returns the supplied message.',
      inputSchema: { message: z.string() },
    },
    async ({ message }) => ({
      content: [{ type: 'text', text: message }],
    }),
  );

  return server;
};

export const handler = createMcpHandler(createMcpServer);
export const strictHandler = createMcpHandler(createMcpServer, { legacy: 'reject' });
export const sseHandler = createMcpHandler(createMcpServer, { responseMode: 'sse' });
export const nodeHandler = toNodeHandler(handler);
export const strictNodeHandler = toNodeHandler(strictHandler);
export const sseNodeHandler = toNodeHandler(sseHandler);
