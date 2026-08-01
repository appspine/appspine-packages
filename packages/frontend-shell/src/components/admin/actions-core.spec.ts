import { describe, expect, it, vi } from 'vitest';

import {
  type ApiFetchLike,
  createApiKeyRequest,
  createUserRequest,
  deleteUserRequest,
} from './actions-core.js';

function isApiError(e: unknown): e is { message: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string'
  );
}

describe('actions-core (runAction)', () => {
  it('returns {} on success', async () => {
    const apiFetch: ApiFetchLike = vi.fn().mockResolvedValue(undefined);
    const result = await deleteUserRequest(apiFetch, isApiError, 'u1');
    expect(result).toEqual({});
  });

  it('returns the API error message when apiFetch rejects with a recognized error shape', async () => {
    const apiFetch: ApiFetchLike = vi.fn().mockRejectedValue({ message: 'email already in use' });
    const result = await createUserRequest(apiFetch, isApiError, new FormData());
    expect(result).toEqual({ error: 'email already in use' });
  });

  it('falls back to the generic message for an unrecognized rejection shape', async () => {
    // A rejection that isn't the { message: string } shape isApiError checks for (e.g. a plain
    // string throw, or an object with no `message`) — a real Error's `.message` would actually
    // satisfy isApiError, so it's not a valid "unrecognized" case here.
    const apiFetch: ApiFetchLike = vi.fn().mockRejectedValue('ECONNRESET');
    const result = await deleteUserRequest(apiFetch, isApiError, 'u1');
    expect(result).toEqual({ error: 'Failed to delete user' });
  });

  it('carries through the extra success field for actions that return more than ActionResult', async () => {
    const created = { id: 'k1', key: 'ask_live_abc' };
    const apiFetch: ApiFetchLike = vi.fn().mockResolvedValue(created);
    const result = await createApiKeyRequest(apiFetch, isApiError, new FormData());
    expect(result).toEqual({ created });
  });

  it('does not carry the extra field through on failure', async () => {
    const apiFetch: ApiFetchLike = vi.fn().mockRejectedValue({ message: 'quota exceeded' });
    const result = await createApiKeyRequest(apiFetch, isApiError, new FormData());
    expect(result).toEqual({ error: 'quota exceeded' });
    expect(result.created).toBeUndefined();
  });
});
