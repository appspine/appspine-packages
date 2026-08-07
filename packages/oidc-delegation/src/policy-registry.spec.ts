import { describe, expect, it } from 'vitest';
import { PolicyConfigurationError, PolicyNotFoundError, PolicyRegistry } from './policy-registry';

const validPolicy = {
  targetAudience: 'approve',
  requestedScopes: ['approve:knowledge-document-change:submit'],
  maxExpiresInSeconds: 120,
};

describe('PolicyRegistry', () => {
  it('resolves a registered policy by name', () => {
    const registry = new PolicyRegistry({ submit: validPolicy });
    expect(registry.resolve('submit')).toEqual(validPolicy);
  });

  it('fails closed on an unregistered policy name', () => {
    const registry = new PolicyRegistry({ submit: validPolicy });
    expect(() => registry.resolve('does-not-exist')).toThrow(PolicyNotFoundError);
  });

  it('rejects an empty policy map at construction', () => {
    expect(() => new PolicyRegistry({})).toThrow(PolicyConfigurationError);
  });

  it('rejects a policy with an empty targetAudience', () => {
    expect(() => new PolicyRegistry({ submit: { ...validPolicy, targetAudience: '' } })).toThrow(
      PolicyConfigurationError,
    );
  });

  it('rejects a policy with no requestedScopes', () => {
    expect(() => new PolicyRegistry({ submit: { ...validPolicy, requestedScopes: [] } })).toThrow(
      PolicyConfigurationError,
    );
  });

  it('rejects a policy with an empty-string scope entry', () => {
    expect(
      () => new PolicyRegistry({ submit: { ...validPolicy, requestedScopes: ['ok', ''] } }),
    ).toThrow(PolicyConfigurationError);
  });

  it.each([
    ['offline access', ['offline_access']],
    ['embedded whitespace', ['approve:submit extra']],
    ['duplicate scopes', ['approve:submit', 'approve:submit']],
  ])('rejects unsafe requested scopes: %s', (_label, requestedScopes) => {
    expect(() => new PolicyRegistry({ submit: { ...validPolicy, requestedScopes } })).toThrow(
      PolicyConfigurationError,
    );
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    3601,
  ])('rejects maxExpiresInSeconds=%s (out of bounds)', (maxExpiresInSeconds) => {
    expect(() => new PolicyRegistry({ submit: { ...validPolicy, maxExpiresInSeconds } })).toThrow(
      PolicyConfigurationError,
    );
  });

  it('accepts multiple distinct policies', () => {
    const registry = new PolicyRegistry({
      submit: validPolicy,
      withdraw: { ...validPolicy, requestedScopes: ['approve:knowledge-document-change:withdraw'] },
    });
    expect(registry.has('submit')).toBe(true);
    expect(registry.has('withdraw')).toBe(true);
    expect(registry.has('unknown')).toBe(false);
  });
});
