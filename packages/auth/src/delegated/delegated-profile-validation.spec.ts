import { describe, expect, it } from 'vitest';
import { validateDelegatedProfiles } from './delegated-profile-validation';
import type { DelegatedOidcTrustProfile } from './types';

const validProfile: DelegatedOidcTrustProfile = {
  expectedIssuer: 'https://issuer.example',
  requiredAudience: 'approve',
  additionalAllowedAudiences: [],
  allowedClientIds: ['wiki-delegation'],
  requiredScopes: ['approve:knowledge-document-change:submit'],
  delegationScopeNamespace: 'approve:',
  maxTokenAgeSeconds: 120,
  clockToleranceSeconds: 10,
  provisioning: 'never',
};

describe('validateDelegatedProfiles', () => {
  it('accepts a well-formed profile map', () => {
    expect(() => validateDelegatedProfiles({ submit: validProfile })).not.toThrow();
  });

  it('rejects an empty profile map', () => {
    expect(() => validateDelegatedProfiles({})).toThrow(/at least one profile/);
  });

  it('rejects a profile missing expectedIssuer', () => {
    expect(() =>
      validateDelegatedProfiles({ submit: { ...validProfile, expectedIssuer: '' } }),
    ).toThrow();
  });

  it('rejects a profile with an empty allowedClientIds', () => {
    expect(() =>
      validateDelegatedProfiles({ submit: { ...validProfile, allowedClientIds: [] } }),
    ).toThrow();
  });

  it('rejects a profile with an empty requiredScopes', () => {
    expect(() =>
      validateDelegatedProfiles({ submit: { ...validProfile, requiredScopes: [] } }),
    ).toThrow();
  });

  it.each([0, -1, Number.NaN])('rejects maxTokenAgeSeconds=%s', (maxTokenAgeSeconds) => {
    expect(() =>
      validateDelegatedProfiles({ submit: { ...validProfile, maxTokenAgeSeconds } }),
    ).toThrow();
  });

  it('rejects a negative clockToleranceSeconds', () => {
    expect(() =>
      validateDelegatedProfiles({ submit: { ...validProfile, clockToleranceSeconds: -1 } }),
    ).toThrow();
  });

  it('rejects clockToleranceSeconds >= maxTokenAgeSeconds (tolerance must be small relative to TTL)', () => {
    expect(() =>
      validateDelegatedProfiles({
        submit: { ...validProfile, maxTokenAgeSeconds: 10, clockToleranceSeconds: 10 },
      }),
    ).toThrow();
  });

  it('rejects an invalid provisioning value', () => {
    expect(() =>
      validateDelegatedProfiles({
        submit: { ...validProfile, provisioning: 'always' as never },
      }),
    ).toThrow();
  });

  it('accepts multiple distinct profiles', () => {
    expect(() =>
      validateDelegatedProfiles({
        submit: validProfile,
        withdraw: {
          ...validProfile,
          requiredScopes: ['approve:knowledge-document-change:withdraw'],
        },
      }),
    ).not.toThrow();
  });
});
