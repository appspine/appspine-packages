import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createApiFetch, toQueryString } from './api-client.js';

describe('toQueryString', () => {
  it('returns an empty string for undefined params', () => {
    expect(toQueryString(undefined)).toBe('');
  });

  it('omits undefined and empty-string values', () => {
    expect(toQueryString({ page: 1, search: '', sortField: undefined })).toBe('?page=1');
  });

  it('serializes every provided field', () => {
    expect(toQueryString({ page: 2, limit: 20, sortOrder: 'DESC' })).toBe(
      '?page=2&limit=20&sortOrder=DESC',
    );
  });
});

describe('createApiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the bearer token and base URL, and parses a 204 as undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    const apiFetch = createApiFetch({
      getAccessToken: async () => 'token-123',
      getBaseUrl: () => 'https://api.example.test',
    });

    const result = await apiFetch('/users');

    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/users',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('omits the Authorization header when there is no access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    const apiFetch = createApiFetch({
      getAccessToken: async () => undefined,
      getBaseUrl: () => 'https://api.example.test',
    });

    await apiFetch('/users');

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws an ApiError built from the response body on a non-ok response', async () => {
    const errorBody = {
      statusCode: 409,
      message: 'email already in use',
      traceId: 'trace-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      path: '/users',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, json: async () => errorBody });
    vi.stubGlobal('fetch', fetchMock);

    const apiFetch = createApiFetch({
      getAccessToken: async () => undefined,
      getBaseUrl: () => 'https://api.example.test',
    });

    await expect(apiFetch('/users')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'email already in use',
      statusCode: 409,
      traceId: 'trace-1',
    });
  });

  it('reads NEXT_PUBLIC_API_URL when getBaseUrl is not provided, and throws when it is unset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    const apiFetch = createApiFetch({ getAccessToken: async () => undefined });

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://env.example.test');
    await apiFetch('/ping');
    expect(fetchMock).toHaveBeenCalledWith('https://env.example.test/ping', expect.anything());

    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    await expect(apiFetch('/ping')).rejects.toThrow('Missing required environment variable');
  });

  it('falls back to a synthesized ApiError when the error response body is not valid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const apiFetch = createApiFetch({
      getAccessToken: async () => undefined,
      getBaseUrl: () => 'https://api.example.test',
    });

    await expect(apiFetch('/flaky')).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/flaky')).rejects.toMatchObject({
      statusCode: 502,
      message: 'Bad Gateway',
    });
  });
});
