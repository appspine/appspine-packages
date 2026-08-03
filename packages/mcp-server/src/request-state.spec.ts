import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMcpRequestStateStore,
  McpRequestStateRoundLimitError,
  readMcpRequestStateKey,
} from './request-state';

function fakeCtx(method: string) {
  return { mcpReq: { method } } as Parameters<
    ReturnType<typeof createMcpRequestStateStore>['mint']
  >[1];
}

describe('createMcpRequestStateStore', () => {
  const key = randomBytes(32);

  it('round-trips a minted token back to the original payload at round 0', async () => {
    const store = createMcpRequestStateStore({ key, principal: 'api-key-1' });
    const ctx = fakeCtx('tools/call');
    const token = await store.mint({ step: 'confirm' }, ctx);
    const payload = await store.verify(token, ctx);
    expect(payload).toEqual({ round: 0, data: { step: 'confirm' } });
  });

  it('mintNextRound advances the round counter', async () => {
    const store = createMcpRequestStateStore({ key, principal: 'api-key-1' });
    const ctx = fakeCtx('tools/call');
    const token = await store.mintNextRound({ step: 'confirm-2' }, 0, ctx);
    const payload = await store.verify(token, ctx);
    expect(payload).toEqual({ round: 1, data: { step: 'confirm-2' } });
  });

  it('rejects a tampered token', async () => {
    const store = createMcpRequestStateStore({ key, principal: 'api-key-1' });
    const ctx = fakeCtx('tools/call');
    const token = await store.mint({ step: 'confirm' }, ctx);
    const tampered = `${token.slice(0, -4)}${token.slice(-4) === 'aaaa' ? 'bbbb' : 'aaaa'}`;
    await expect(store.verify(tampered, ctx)).rejects.toThrow();
  });

  it('rejects a token echoed under a different method (binding)', async () => {
    const store = createMcpRequestStateStore({ key, principal: 'api-key-1' });
    const token = await store.mint({ step: 'confirm' }, fakeCtx('tools/call'));
    await expect(store.verify(token, fakeCtx('prompts/get'))).rejects.toThrow();
  });

  it('rejects a token echoed by a different principal (cross-user replay)', async () => {
    const issuer = createMcpRequestStateStore({ key, principal: 'api-key-1' });
    const attacker = createMcpRequestStateStore({ key, principal: 'api-key-2' });
    const ctx = fakeCtx('tools/call');
    const token = await issuer.mint({ step: 'confirm' }, ctx);
    await expect(attacker.verify(token, ctx)).rejects.toThrow();
  });

  it('rejects a token past its TTL', async () => {
    // The codec's `exp` is computed via `Math.floor(Date.now() / 1000) + ttlSeconds` (whole
    // seconds), so a token minted right at the start of a second can still verify up to just
    // under 2 real seconds later with ttlSeconds: 1 -- wait comfortably past that boundary.
    const store = createMcpRequestStateStore({ key, principal: 'api-key-1', ttlSeconds: 1 });
    const ctx = fakeCtx('tools/call');
    const token = await store.mint({ step: 'confirm' }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await expect(store.verify(token, ctx)).rejects.toThrow();
  }, 5000);

  it('rejects verify once the round count reaches maxRounds', async () => {
    const store = createMcpRequestStateStore({ key, principal: 'api-key-1', maxRounds: 2 });
    const ctx = fakeCtx('tools/call');
    // Round 0 -> mintNextRound to round 1 (still under the cap of 2) -> mint round-1 token.
    const round1Token = await store.mintNextRound({ step: 'b' }, 0, ctx);
    const round1Payload = await store.verify(round1Token, ctx);
    expect(round1Payload.round).toBe(1);

    // Minting round 2 must be refused outright (2 >= maxRounds).
    await expect(store.mintNextRound({ step: 'c' }, 1, ctx)).rejects.toThrow(
      McpRequestStateRoundLimitError,
    );
  });

  it('rejects an out-of-band token whose round already meets maxRounds even if minted elsewhere', async () => {
    // A store with a laxer cap mints a genuine round-2 token (via two mintNextRound calls,
    // the only way to advance rounds); a stricter store must still refuse to verify it, even
    // though the token itself is validly signed.
    const laxStore = createMcpRequestStateStore({ key, principal: 'api-key-1', maxRounds: 10 });
    const strictStore = createMcpRequestStateStore({ key, principal: 'api-key-1', maxRounds: 2 });
    const ctx = fakeCtx('tools/call');
    const round2Token = await laxStore.mintNextRound({ step: 'c' }, 1, ctx);
    await expect(strictStore.verify(round2Token, ctx)).rejects.toThrow(
      McpRequestStateRoundLimitError,
    );
  });

  it('rejects a key shorter than 32 bytes', () => {
    expect(() =>
      createMcpRequestStateStore({ key: randomBytes(16), principal: 'api-key-1' }),
    ).toThrow();
  });

  it('rejects a non-positive-integer maxRounds', () => {
    expect(() => createMcpRequestStateStore({ key, principal: 'api-key-1', maxRounds: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      createMcpRequestStateStore({ key, principal: 'api-key-1', maxRounds: 1.5 }),
    ).toThrow(RangeError);
  });
});

describe('readMcpRequestStateKey', () => {
  const ORIGINAL = process.env.MCP_REQUEST_STATE_KEY;

  beforeEach(() => {
    delete process.env.MCP_REQUEST_STATE_KEY;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MCP_REQUEST_STATE_KEY;
    else process.env.MCP_REQUEST_STATE_KEY = ORIGINAL;
  });

  it('returns undefined when unset (MRTR stays opt-in)', () => {
    expect(readMcpRequestStateKey()).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    process.env.MCP_REQUEST_STATE_KEY = '';
    expect(readMcpRequestStateKey()).toBeUndefined();
  });

  it('decodes a valid base64 32-byte key', () => {
    const raw = randomBytes(32);
    process.env.MCP_REQUEST_STATE_KEY = raw.toString('base64');
    expect(readMcpRequestStateKey()).toEqual(raw);
  });

  it('throws when the decoded key is shorter than 32 bytes', () => {
    process.env.MCP_REQUEST_STATE_KEY = randomBytes(16).toString('base64');
    expect(() => readMcpRequestStateKey()).toThrow(RangeError);
  });
});
