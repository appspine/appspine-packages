import type { ServerContext } from '@modelcontextprotocol/server';
import { createRequestStateCodec } from '@modelcontextprotocol/server';

/// Wraps the SDK's own `createRequestStateCodec` (protocol revision 2026-07-28's
/// multi-round-trip `requestState`, spec: basic/patterns/mrtr) with the two properties it
/// deliberately leaves to the server author: the signing key (sourced from
/// `MCP_REQUEST_STATE_KEY`, one per app -- same convention as GATEWAY_VAULT_MASTER_KEY) and
/// a monotonic round counter, since the codec's own `mint`/`verify` are otherwise stateless
/// and have no way to cap how many times a single flow can re-enter across independent HTTP
/// requests (its `bind` option only proves the state wasn't forged or replayed under a
/// different principal/method, not how many times it's been echoed back).
///
/// Binding: every minted token is tied to `${method}\0${principal}` (following the SDK's own
/// documented `bind` pattern, but against the caller-supplied principal rather than
/// `ctx.http.authInfo` -- see McpRequestStateOptions.principal for why) -- a token minted for
/// one API key's `tools/call` cannot be resumed by a different key or a different method,
/// closing the cross-user-replay gap the 038 migration plan described but never actually
/// implemented.

export interface McpRequestStateOptions {
  /** Exactly 32 bytes. Same key must be available to every instance of this app that may
   * receive an echoed requestState (i.e. every replica behind the same deployment). */
  key: Uint8Array;
  /** @default 600 (10 minutes) */
  ttlSeconds?: number;
  /** Handler re-entries a single flow may go through before resume() refuses it.
   * @default 8 */
  maxRounds?: number;
  /** The authenticated caller to bind minted state to (together with the SDK's own
   * `ctx.mcpReq.method`) -- pass the caller's own resolved identity (e.g.
   * McpCallContext.sub from mcp.controller.ts's ApiKeyGuard-validated user), not something
   * read off the SDK's transport-level `ctx.http.authInfo`: that field is populated by
   * whichever transport adapter is in front of a given request (toNodeHandler reading
   * Express's `req.auth`), and a caller-supplied principal is the one binding source that
   * doesn't depend on that propagation path actually running for a given entry point. */
  principal: string;
}

export interface McpMultiRoundStatePayload<T = unknown> {
  round: number;
  data: T;
}

export class McpRequestStateRoundLimitError extends Error {
  constructor(readonly maxRounds: number) {
    super(`MCP requestState round limit exceeded (max ${maxRounds})`);
    this.name = 'McpRequestStateRoundLimitError';
  }
}

export interface McpRequestStateCodec {
  readonly maxRounds: number;
  /** Drop-in for `ServerOptions.requestState.verify` -- decodes and integrity-checks an
   * echoed requestState, additionally enforcing the round cap `mint` tracks. */
  verify(state: string, ctx: ServerContext): Promise<McpMultiRoundStatePayload>;
  /** Seals `data` for round 0 of a new flow. */
  mint(data: unknown, ctx: ServerContext): Promise<string>;
  /** Seals `data` for the round *after* `previousRound` (i.e. resuming a verified payload).
   * Throws McpRequestStateRoundLimitError if that would exceed maxRounds. */
  mintNextRound(data: unknown, previousRound: number, ctx: ServerContext): Promise<string>;
}

export function createMcpRequestStateStore(options: McpRequestStateOptions): McpRequestStateCodec {
  const maxRounds = options.maxRounds ?? 8;
  if (!Number.isInteger(maxRounds) || maxRounds <= 0) {
    throw new RangeError('requestState maxRounds must be a positive integer');
  }

  const codec = createRequestStateCodec<McpMultiRoundStatePayload>({
    key: options.key,
    ttlSeconds: options.ttlSeconds,
    bind: (ctx) => `${ctx.mcpReq.method}\0${options.principal}`,
  });

  return {
    maxRounds,
    async verify(state, ctx) {
      const payload = await codec.verify(state, ctx);
      if (payload.round >= maxRounds) throw new McpRequestStateRoundLimitError(maxRounds);
      return payload;
    },
    mint(data, ctx) {
      return codec.mint({ round: 0, data }, ctx);
    },
    async mintNextRound(data, previousRound, ctx) {
      const nextRound = previousRound + 1;
      if (nextRound >= maxRounds) throw new McpRequestStateRoundLimitError(maxRounds);
      return codec.mint({ round: nextRound, data }, ctx);
    },
  };
}

/// Reads and base64-decodes `MCP_REQUEST_STATE_KEY`. Deliberately opt-in, not required at
/// module load: an app that never calls `ctx.mrtr.requestInput` shouldn't have to provision
/// a secret it doesn't use. Throws only when a tool handler actually tries to use MRTR
/// without the key configured -- see McpService.
export function readMcpRequestStateKey(): Uint8Array | undefined {
  const raw = process.env.MCP_REQUEST_STATE_KEY;
  if (raw === undefined || raw.length === 0) return undefined;
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.byteLength < 32) {
    throw new RangeError(
      `MCP_REQUEST_STATE_KEY must decode to at least 32 bytes (got ${decoded.byteLength}); generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return decoded;
}
