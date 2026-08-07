import { describe, expect, it } from 'vitest';
import { validateOidcDelegationModuleOptions } from './module-options-validation';
import type { OidcDelegationModuleOptions } from './types';

const options: OidcDelegationModuleOptions = {
  provider: 'keycloak',
  tokenEndpoint: 'https://keycloak.invalid/token',
  sourceClientId: 'wiki-delegation',
  sourceClientSecret: 'secret',
  subjectTokenIssuerClientId: 'wiki',
  policies: {
    submit: {
      targetAudience: 'approve',
      requestedScopes: ['approve:knowledge-document-change:submit'],
      maxExpiresInSeconds: 120,
    },
  },
};

describe('validateOidcDelegationModuleOptions', () => {
  it('accepts secure complete options', () => {
    expect(() => validateOidcDelegationModuleOptions(options)).not.toThrow();
  });

  it('requires an explicit opt-in for an HTTP token endpoint', () => {
    const insecure = { ...options, tokenEndpoint: 'http://keycloak.invalid/token' };
    expect(() => validateOidcDelegationModuleOptions(insecure)).toThrow(/HTTPS/);
    expect(() =>
      validateOidcDelegationModuleOptions({
        ...insecure,
        allowInsecureTokenEndpoint: true,
      }),
    ).not.toThrow();
  });

  it.each([
    ['sourceClientId', { sourceClientId: '' }],
    ['sourceClientId whitespace', { sourceClientId: 'wiki delegation' }],
    ['sourceClientSecret', { sourceClientSecret: '' }],
    ['subjectTokenIssuerClientId', { subjectTokenIssuerClientId: '' }],
    ['subjectTokenIssuerClientId whitespace', { subjectTokenIssuerClientId: 'wiki login' }],
    ['requestTimeoutMs', { requestTimeoutMs: 0 }],
    ['maxExchangesPerMinutePerPolicy', { maxExchangesPerMinutePerPolicy: -1 }],
  ])('rejects invalid %s', (_label, override) => {
    expect(() => validateOidcDelegationModuleOptions({ ...options, ...override })).toThrow();
  });

  it('rejects a missing policy map with a configuration error', () => {
    expect(() =>
      validateOidcDelegationModuleOptions({ ...options, policies: undefined as never }),
    ).toThrow(/delegation policy/i);
  });
});
