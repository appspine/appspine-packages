import { createServer } from 'node:http';
import { strict as assert } from 'node:assert';
import { handler, nodeHandler, sseHandler, sseNodeHandler, strictHandler, strictNodeHandler } from './server.ts';

const legacyVersion = '2025-11-25';
const modernVersion = '2026-07-28';
const modernMeta = {
  'io.modelcontextprotocol/protocolVersion': modernVersion,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'appspine-mcp-v2-spike-client', version: '0.0.0' },
};

const server = createServer((req, res) => {
  const requestHandler = req.url?.startsWith('/strict')
    ? strictNodeHandler
    : req.url?.startsWith('/sse')
      ? sseNodeHandler
      : nodeHandler;
  void requestHandler(req, res);
});

const address = await new Promise<{ port: number }>((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address() as { port: number }));
});

const endpoint = `http://127.0.0.1:${address.port}`;

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function readJsonRpc(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('text/event-stream')) return response.json() as Promise<Record<string, unknown>>;

  const text = await response.text();
  const data = text
    .split(/\r?\n/)
    .filter((line: string) => line.startsWith('data:'))
    .map((line: string) => line.slice('data:'.length).trim())
    .reverse()
    .find((line: string) => line.length > 0);
  assert.ok(data, 'SSE response did not contain a data event');
  return JSON.parse(data) as Record<string, unknown>;
}

function jsonRpcRequest(method: string, params: Record<string, unknown>, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

try {
  const legacyInitialize = await post(
    '/mcp',
    jsonRpcRequest('initialize', {
      protocolVersion: legacyVersion,
      capabilities: {},
      clientInfo: { name: 'appspine-mcp-v2-spike-client', version: '0.0.0' },
    }),
    { 'MCP-Protocol-Version': legacyVersion },
  );
  assert.equal(legacyInitialize.status, 200);
  const legacyInitializeBody = (await readJsonRpc(legacyInitialize)) as { result?: { protocolVersion?: string } };
  assert.equal(legacyInitializeBody.result?.protocolVersion, legacyVersion);

  const legacyTools = await post(
    '/mcp',
    jsonRpcRequest('tools/list', {}, 2),
    { 'MCP-Protocol-Version': legacyVersion },
  );
  assert.equal(legacyTools.status, 200);
  const legacyToolsBody = (await readJsonRpc(legacyTools)) as { result?: { tools?: Array<{ name: string }> } };
  assert.equal(legacyToolsBody.result?.tools?.some((tool) => tool.name === 'echo'), true);

  const modernTools = await post(
    '/mcp',
    jsonRpcRequest('tools/list', { _meta: modernMeta }, 3),
    { 'MCP-Protocol-Version': modernVersion, 'Mcp-Method': 'tools/list' },
  );
  assert.equal(modernTools.status, 200);
  const modernToolsBody = (await readJsonRpc(modernTools)) as {
    result?: { tools?: Array<{ name: string }>; ttlMs?: number; cacheScope?: string };
  };
  assert.equal(modernToolsBody.result?.tools?.some((tool) => tool.name === 'echo'), true);
  assert.equal(typeof modernToolsBody.result?.ttlMs, 'number');
  assert.equal(modernToolsBody.result?.cacheScope, 'private');

  const modernHeaderWithoutEnvelope = await post(
    '/mcp',
    jsonRpcRequest('tools/list', {}, 7),
    { 'MCP-Protocol-Version': modernVersion },
  );
  assert.equal(modernHeaderWithoutEnvelope.status, 400);
  const modernHeaderWithoutEnvelopeBody = (await readJsonRpc(modernHeaderWithoutEnvelope)) as {
    error?: { code?: number };
  };
  assert.equal(modernHeaderWithoutEnvelopeBody.error?.code, -32602);

  const mismatchedHeader = await post(
    '/mcp',
    jsonRpcRequest('tools/list', { _meta: modernMeta }, 8),
    { 'MCP-Protocol-Version': legacyVersion, 'Mcp-Method': 'tools/list' },
  );
  assert.equal(mismatchedHeader.status, 400);
  const mismatchedHeaderBody = (await readJsonRpc(mismatchedHeader)) as { error?: { code?: number } };
  assert.equal(mismatchedHeaderBody.error?.code, -32020);

  const missingContentType = await fetch(`${endpoint}/mcp`, {
    method: 'POST',
    body: JSON.stringify(jsonRpcRequest('tools/list', { _meta: modernMeta }, 9)),
  });
  assert.equal(missingContentType.status, 415);

  const sseTools = await post('/sse', jsonRpcRequest('tools/list', { _meta: modernMeta }, 4), {
    'MCP-Protocol-Version': modernVersion,
    'Mcp-Method': 'tools/list',
  });
  assert.equal(sseTools.status, 200);
  assert.match(sseTools.headers.get('content-type') ?? '', /^text\/event-stream/);
  assert.match(await sseTools.text(), /tools/);

  const rejectedLegacy = await post(
    '/strict',
    jsonRpcRequest('tools/list', {}, 5),
    { 'MCP-Protocol-Version': legacyVersion },
  );
  assert.equal(rejectedLegacy.status, 400);

  const directModern = await handler.fetch(
    new Request(`${endpoint}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': modernVersion,
        'Mcp-Method': 'tools/list',
      },
      body: JSON.stringify(jsonRpcRequest('tools/list', { _meta: modernMeta }, 6)),
    }),
  );
  assert.equal(directModern.status, 200);

  console.log('MCP v2 smoke passed: protocol matrix, modern/legacy responses, validation ladder, strict rejection, and cleanup.');
} finally {
  await Promise.all([handler.close(), strictHandler.close(), sseHandler.close()]);
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
