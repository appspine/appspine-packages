import { describe, expect, it } from 'vitest';
import {
  validateDelegatedJwksUrl,
  validateDelegatedProfiles,
} from './delegated-profile-validation';
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
    expect(validateDelegatedProfiles({ submit: validProfile }).submit.provisioning).toBe('never');
  });

  it('rejects an empty profile map', () => {
    expect(() => validateDelegatedProfiles({})).toThrow(/at least one profile/);
  });

  it('rejects a missing profile map with a configuration error', () => {
    expect(() => validateDelegatedProfiles(undefined as never)).toThrow(/profiles must be/);
  });

  it('rejects a non-object profile entry with a configuration error', () => {
    expect(() => validateDelegatedProfiles({ submit: undefined as never })).toThrow(
      /configuration must be an object/,
    );
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

  it('defaults omitted provisioning to never', () => {
    const { provisioning: _provisioning, ...withoutProvisioning } = validProfile;
    const resolved = validateDelegatedProfiles({ submit: withoutProvisioning });
    expect(resolved.submit.provisioning).toBe('never');
  });

  it.each([
    ['non-array additional audiences', { additionalAllowedAudiences: 'chat' as never }],
    ['empty allowed client entry', { allowedClientIds: [''] }],
    [
      'duplicate required scope',
      { requiredScopes: [validProfile.requiredScopes[0], validProfile.requiredScopes[0]] },
    ],
    ['scope outside namespace', { requiredScopes: ['chat:send'] }],
  ])('rejects malformed arrays: %s', (_label, override) => {
    expect(() => validateDelegatedProfiles({ submit: { ...validProfile, ...override } })).toThrow();
  });

  it('requires explicit opt-in for an HTTP issuer', () => {
    const insecure = { ...validProfile, expectedIssuer: 'http://issuer.example' };
    expect(() => validateDelegatedProfiles({ submit: insecure })).toThrow(/HTTPS/);
    expect(() =>
      validateDelegatedProfiles({ submit: { ...insecure, allowInsecureHttp: true } }),
    ).not.toThrow();
  });

  it('returns immutable profile and array copies', () => {
    const sourceAudiences: string[] = [];
    const resolved = validateDelegatedProfiles({
      submit: { ...validProfile, additionalAllowedAudiences: sourceAudiences },
    });
    sourceAudiences.push('chat');
    expect(resolved.submit.additionalAllowedAudiences).toEqual([]);
    expect(Object.isFrozen(resolved.submit)).toBe(true);
    expect(Object.isFrozen(resolved.submit.requiredScopes)).toBe(true);
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

  it('requires a secure JWKS URL unless every profile explicitly opts into HTTP', () => {
    const secure = validateDelegatedProfiles({ submit: validProfile });
    expect(() => validateDelegatedJwksUrl(undefined, secure)).toThrow(/OIDC_JWKS_URL/);
    expect(() => validateDelegatedJwksUrl('http://issuer.example/certs', secure)).toThrow(/HTTPS/);

    const development = validateDelegatedProfiles({
      submit: { ...validProfile, expectedIssuer: 'http://issuer.example', allowInsecureHttp: true },
    });
    expect(() =>
      validateDelegatedJwksUrl('http://issuer.example/certs', development),
    ).not.toThrow();
  });
});
