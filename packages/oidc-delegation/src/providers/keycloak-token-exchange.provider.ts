import { OidcDelegationError } from '../errors';
import type {
  TokenExchangeProvider,
  TokenExchangeProviderParams,
  TokenExchangeProviderResult,
} from '../types';

const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const TOKEN_TYPE_ACCESS_TOKEN = 'urn:ietf:params:oauth:token-type:access_token';
const DEFAULT_TIMEOUT_MS = 5000;
// Sanity upper bound on `expires_in` — catches a malformed/garbage response, not a policy
// enforcement (the policy's maxExpiresInSeconds and the inbound maxTokenAgeSeconds are the
// actual TTL controls; see 042-oidc-delegation-package-plan.md §2 decision 16).
const MAX_SANE_EXPIRES_IN_SECONDS = 86_400;

export type KeycloakTokenExchangeProviderConfig = {
  tokenEndpoint: string;
  sourceClientId: string;
  sourceClientSecret: string;
  requestTimeoutMs?: number;
};

export class KeycloakTokenExchangeProvider implements TokenExchangeProvider {
  constructor(private readonly config: KeycloakTokenExchangeProviderConfig) {}

  async exchange(params: TokenExchangeProviderParams): Promise<TokenExchangeProviderResult> {
    const body = new URLSearchParams({
      grant_type: GRANT_TYPE,
      client_id: this.config.sourceClientId,
      client_secret: this.config.sourceClientSecret,
      subject_token: params.subjectToken,
      subject_token_type: TOKEN_TYPE_ACCESS_TOKEN,
      requested_token_type: TOKEN_TYPE_ACCESS_TOKEN,
      audience: params.targetAudience,
      scope: params.requestedScopes.join(' '),
    });

    const controller = new AbortController();
    const timeoutMs = this.config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      throw new OidcDelegationError(
        'provider_unavailable',
        error instanceof Error && error.name === 'AbortError'
          ? 'token exchange request timed out'
          : 'token exchange request failed',
      );
    } finally {
      clearTimeout(timeout);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new OidcDelegationError(
        'malformed_provider_response',
        'token exchange response was not valid JSON',
      );
    }

    if (!response.ok) {
      throw mapErrorResponse(response.status, json);
    }

    return validateSuccessResponse(json);
  }
}

function mapErrorResponse(status: number, body: unknown): OidcDelegationError {
  if (status >= 500) {
    return new OidcDelegationError('provider_unavailable', `provider returned ${status}`);
  }

  const record = isRecord(body) ? body : {};
  const error = typeof record.error === 'string' ? record.error : undefined;
  const description = typeof record.error_description === 'string' ? record.error_description : '';

  if (error === 'invalid_grant') {
    return new OidcDelegationError(
      'invalid_subject_token',
      'subject token was rejected by the provider',
    );
  }
  if (error === 'invalid_scope' || error === 'access_denied') {
    return new OidcDelegationError('exchange_denied', 'exchange was denied by the provider policy');
  }
  if (error === 'invalid_request') {
    // Keycloak conflates deployment misconfiguration ("exchange not enabled for this
    // client") with the policy/audience family of "invalid_request" errors under the same
    // OAuth error code — the description is the only signal distinguishing them.
    if (/not enabled/i.test(description)) {
      return new OidcDelegationError(
        'policy_violation',
        'provider is not configured to allow this exchange',
      );
    }
    return new OidcDelegationError(
      'exchange_denied',
      'exchange request was rejected by the provider',
    );
  }

  return new OidcDelegationError(
    'malformed_provider_response',
    `unrecognized provider error (status ${status})`,
  );
}

function validateSuccessResponse(body: unknown): TokenExchangeProviderResult {
  if (!isRecord(body)) {
    throw new OidcDelegationError('malformed_provider_response', 'response body was not an object');
  }

  const accessToken = body.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new OidcDelegationError(
      'malformed_provider_response',
      'response did not include access_token',
    );
  }

  const tokenType = body.token_type;
  if (typeof tokenType !== 'string' || tokenType.toLowerCase() !== 'bearer') {
    throw new OidcDelegationError(
      'malformed_provider_response',
      'response token_type was not Bearer',
    );
  }

  const expiresIn = body.expires_in;
  if (
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    expiresIn > MAX_SANE_EXPIRES_IN_SECONDS
  ) {
    throw new OidcDelegationError(
      'malformed_provider_response',
      'response expires_in was not a sane positive number',
    );
  }

  // Access-token-only response contract (plan §3.2, §8): a refresh token in the response
  // is fail-closed and its value must never be logged.
  if ('refresh_token' in body && body.refresh_token != null) {
    throw new OidcDelegationError(
      'malformed_provider_response',
      'response unexpectedly included a refresh_token',
    );
  }

  return { accessToken, expiresInSeconds: expiresIn };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
