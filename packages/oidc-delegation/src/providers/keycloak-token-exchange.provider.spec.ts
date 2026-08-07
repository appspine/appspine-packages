import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OidcDelegationError } from '../errors';
import { KeycloakTokenExchangeProvider } from './keycloak-token-exchange.provider';

const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('KeycloakTokenExchangeProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeProvider() {
    return new KeycloakTokenExchangeProvider({
      tokenEndpoint: 'https://keycloak.invalid/realms/appspine-dev/protocol/openid-connect/token',
      sourceClientId: 'wiki-delegation',
      sourceClientSecret: 'dev-secret-wiki-delegation',
      requestTimeoutMs: 50,
    });
  }

  it('maps request fields per RFC 8693 and does not let the caller override client/audience/scope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'tok',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'Bearer',
        expires_in: 120,
      }),
    );

    const provider = makeProvider();
    await provider.exchange({
      subjectToken: 'subject-token-value',
      targetAudience: 'approve',
      requestedScopes: ['approve:knowledge-document-change:submit'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://keycloak.invalid/realms/appspine-dev/protocol/openid-connect/token');
    expect(init.method).toBe('POST');

    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(body.get('client_id')).toBe('wiki-delegation');
    expect(body.get('client_secret')).toBe('dev-secret-wiki-delegation');
    expect(body.get('subject_token')).toBe('subject-token-value');
    expect(body.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:access_token');
    expect(body.get('requested_token_type')).toBe('urn:ietf:params:oauth:token-type:access_token');
    expect(body.get('audience')).toBe('approve');
    expect(body.get('scope')).toBe('approve:knowledge-document-change:submit');
  });

  it('returns accessToken/expiresInSeconds on a valid success response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'delegated-token',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'Bearer',
        expires_in: 120,
      }),
    );
    const result = await makeProvider().exchange({
      subjectToken: 's',
      targetAudience: 'approve',
      requestedScopes: ['scope'],
    });
    expect(result).toEqual({ accessToken: 'delegated-token', expiresInSeconds: 120 });
  });

  it('rejects a response with an unexpected refresh_token (access-token-only contract)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'tok',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'Bearer',
        expires_in: 120,
        refresh_token: 'should-never-be-here',
      }),
    );
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'malformed_provider_response' });
  });

  it.each([
    [
      'missing access_token',
      { issued_token_type: ACCESS_TOKEN_TYPE, token_type: 'Bearer', expires_in: 120 },
    ],
    [
      'non-Bearer token_type',
      {
        access_token: 'tok',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'MAC',
        expires_in: 120,
      },
    ],
    [
      'zero expires_in',
      {
        access_token: 'tok',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'Bearer',
        expires_in: 0,
      },
    ],
    [
      'negative expires_in',
      {
        access_token: 'tok',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'Bearer',
        expires_in: -1,
      },
    ],
    [
      'absurd expires_in',
      {
        access_token: 'tok',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'Bearer',
        expires_in: 999_999_999,
      },
    ],
    [
      'fractional expires_in',
      {
        access_token: 'tok',
        issued_token_type: ACCESS_TOKEN_TYPE,
        token_type: 'Bearer',
        expires_in: 120.5,
      },
    ],
  ])('rejects a malformed success body: %s', async (_label, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'malformed_provider_response' });
  });

  it.each([
    undefined,
    'urn:ietf:params:oauth:token-type:id_token',
  ])('rejects issued_token_type=%s', async (issuedTokenType) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'tok',
        issued_token_type: issuedTokenType,
        token_type: 'Bearer',
        expires_in: 120,
      }),
    );
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'malformed_provider_response' });
  });

  it('rejects insecure or incomplete provider configuration at construction', () => {
    expect(
      () =>
        new KeycloakTokenExchangeProvider({
          tokenEndpoint: 'http://keycloak.invalid/token',
          sourceClientId: 'wiki-delegation',
          sourceClientSecret: 'secret',
        }),
    ).toThrow(/HTTPS/);
    expect(
      () =>
        new KeycloakTokenExchangeProvider({
          tokenEndpoint: 'https://keycloak.invalid/token',
          sourceClientId: '',
          sourceClientSecret: 'secret',
        }),
    ).toThrow(/sourceClientId/);
  });

  it('maps invalid_grant to invalid_subject_token', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'invalid_grant', error_description: 'token expired' }),
    );
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'invalid_subject_token' });
  });

  it.each(['invalid_scope', 'access_denied'])('maps %s to exchange_denied', async (error) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error, error_description: 'denied' }));
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'exchange_denied' });
  });

  it('maps an invalid_request "not enabled" description to policy_violation', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: 'invalid_request',
        error_description: 'Standard token exchange is not enabled for the requested client',
      }),
    );
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'policy_violation' });
  });

  it('maps other invalid_request variants to exchange_denied', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: 'invalid_request',
        error_description: 'Requested audience not available: chat',
      }),
    );
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'exchange_denied' });
  });

  it('maps a 5xx response to provider_unavailable', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: 'server_error' }));
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
  });

  it('maps a network failure to provider_unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
  });

  it('maps a request timeout to provider_unavailable', async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
  });

  it('maps a non-JSON response body to malformed_provider_response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    await expect(
      makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      }),
    ).rejects.toMatchObject({ category: 'malformed_provider_response' });
  });

  it('never throws a plain (non-OidcDelegationError) error out of exchange()', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'invalid_scope' }));
    try {
      await makeProvider().exchange({
        subjectToken: 's',
        targetAudience: 'approve',
        requestedScopes: ['x'],
      });
      expect.unreachable('expected exchange() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(OidcDelegationError);
    }
  });
});
