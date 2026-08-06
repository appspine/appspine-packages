import { OidcDelegationError } from '../errors';
import type {
  TokenExchangeProvider,
  TokenExchangeProviderParams,
  TokenExchangeProviderResult,
} from '../types';

/**
 * Deterministic in-memory `TokenExchangeProvider` for consumer unit tests — no network,
 * no real IdP, no timing flakiness. Construct it with one of the `create*Fixture` helpers
 * below, or provide a custom `handle` function for bespoke scenarios.
 */
export class FakeOidcDelegationProvider implements TokenExchangeProvider {
  readonly calls: TokenExchangeProviderParams[] = [];

  constructor(
    private readonly handle: (
      params: TokenExchangeProviderParams,
    ) => Promise<TokenExchangeProviderResult>,
  ) {}

  exchange(params: TokenExchangeProviderParams): Promise<TokenExchangeProviderResult> {
    this.calls.push(params);
    return this.handle(params);
  }
}

export function createSuccessFixture(
  overrides: Partial<TokenExchangeProviderResult> = {},
): FakeOidcDelegationProvider {
  return new FakeOidcDelegationProvider(async () => ({
    accessToken: overrides.accessToken ?? 'fake-delegated-access-token',
    expiresInSeconds: overrides.expiresInSeconds ?? 120,
  }));
}

export function createDenyFixture(
  category: OidcDelegationError['category'] = 'exchange_denied',
  message = 'exchange denied (fake provider)',
): FakeOidcDelegationProvider {
  return new FakeOidcDelegationProvider(async () => {
    throw new OidcDelegationError(category, message);
  });
}

export function createTimeoutFixture(): FakeOidcDelegationProvider {
  return new FakeOidcDelegationProvider(async () => {
    throw new OidcDelegationError(
      'provider_unavailable',
      'token exchange request timed out (fake provider)',
    );
  });
}

export function createMalformedFixture(): FakeOidcDelegationProvider {
  return new FakeOidcDelegationProvider(async () => {
    throw new OidcDelegationError(
      'malformed_provider_response',
      'response body was not an object (fake provider)',
    );
  });
}
