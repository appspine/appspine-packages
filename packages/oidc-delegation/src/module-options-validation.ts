import { PolicyConfigurationError } from './policy-registry';
import type { OidcDelegationModuleOptions } from './types';

const MAX_REQUEST_TIMEOUT_MS = 60_000;
const MAX_EXCHANGES_PER_MINUTE = 10_000;

export function validateOidcDelegationModuleOptions(options: OidcDelegationModuleOptions): void {
  if (!options || typeof options !== 'object') {
    throw new PolicyConfigurationError('OIDC delegation options must be configured');
  }
  if (options.provider !== 'keycloak') {
    throw new PolicyConfigurationError('OIDC delegation provider must be keycloak');
  }

  assertTokenEndpoint(options.tokenEndpoint, options.allowInsecureTokenEndpoint === true);
  assertIdentifier(options.sourceClientId, 'sourceClientId');
  assertNonEmptyString(options.sourceClientSecret, 'sourceClientSecret');
  assertIdentifier(options.subjectTokenIssuerClientId, 'subjectTokenIssuerClientId');
  if (
    !options.policies ||
    typeof options.policies !== 'object' ||
    Array.isArray(options.policies) ||
    Object.keys(options.policies).length === 0
  ) {
    throw new PolicyConfigurationError('At least one delegation policy must be configured');
  }

  if (
    options.requestTimeoutMs !== undefined &&
    (!Number.isInteger(options.requestTimeoutMs) ||
      options.requestTimeoutMs <= 0 ||
      options.requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS)
  ) {
    throw new PolicyConfigurationError(
      `requestTimeoutMs must be a positive integer <= ${MAX_REQUEST_TIMEOUT_MS}`,
    );
  }
  if (
    options.maxExchangesPerMinutePerPolicy !== undefined &&
    (!Number.isInteger(options.maxExchangesPerMinutePerPolicy) ||
      options.maxExchangesPerMinutePerPolicy <= 0 ||
      options.maxExchangesPerMinutePerPolicy > MAX_EXCHANGES_PER_MINUTE)
  ) {
    throw new PolicyConfigurationError(
      `maxExchangesPerMinutePerPolicy must be a positive integer <= ${MAX_EXCHANGES_PER_MINUTE}`,
    );
  }
}

export function assertTokenEndpoint(tokenEndpoint: string, allowInsecureHttp: boolean): void {
  assertNonEmptyString(tokenEndpoint, 'tokenEndpoint');

  let url: URL;
  try {
    url = new URL(tokenEndpoint);
  } catch {
    throw new PolicyConfigurationError('tokenEndpoint must be an absolute URL');
  }

  if (url.username || url.password) {
    throw new PolicyConfigurationError('tokenEndpoint must not contain embedded credentials');
  }
  if (url.protocol !== 'https:' && !(allowInsecureHttp && url.protocol === 'http:')) {
    throw new PolicyConfigurationError(
      'tokenEndpoint must use HTTPS unless allowInsecureTokenEndpoint is explicitly enabled',
    );
  }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PolicyConfigurationError(`${name} must be a non-empty string`);
  }
}

function assertIdentifier(value: unknown, name: string): asserts value is string {
  assertNonEmptyString(value, name);
  if (/\s/.test(value)) {
    throw new PolicyConfigurationError(`${name} must not contain whitespace`);
  }
}
