import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertAccessTokenType,
  assertAllowedClient,
  assertAudience,
  assertScopesAndReturn,
  assertTokenAge,
  normalizeClientId,
  requireExternalSubject,
} from './delegated-claims.util';
import type { DelegatedOidcTrustProfile } from './types';

const profile: DelegatedOidcTrustProfile = {
  expectedIssuer: 'https://issuer.example/realms/appspine-dev',
  requiredAudience: 'approve',
  additionalAllowedAudiences: [],
  allowedClientIds: ['wiki-delegation'],
  requiredScopes: ['approve:knowledge-document-change:submit'],
  delegationScopeNamespace: 'approve:',
  maxTokenAgeSeconds: 120,
  clockToleranceSeconds: 10,
  provisioning: 'never',
};

describe('assertAccessTokenType', () => {
  it('accepts typ: "Bearer"', () => {
    expect(() => assertAccessTokenType({ typ: 'Bearer' })).not.toThrow();
  });

  it('is case-insensitive', () => {
    expect(() => assertAccessTokenType({ typ: 'bearer' })).not.toThrow();
  });

  it('accepts an RFC 9068 at+jwt JOSE header without a payload typ claim', () => {
    expect(() => assertAccessTokenType({}, 'at+jwt')).not.toThrow();
  });

  it('rejects a missing typ claim', () => {
    expect(() => assertAccessTokenType({})).toThrow(UnauthorizedException);
  });

  it('rejects an ID token (typ absent, only id-token-shaped claims present)', () => {
    expect(() => assertAccessTokenType({ nonce: 'abc' })).toThrow(UnauthorizedException);
  });
});

describe('assertAudience', () => {
  it('accepts a scalar aud equal to requiredAudience', () => {
    expect(() => assertAudience({ aud: 'approve' }, profile)).not.toThrow();
  });

  it('accepts an array aud that is a subset of {requiredAudience, ...additionalAllowed}', () => {
    const p = { ...profile, additionalAllowedAudiences: ['technical-audience'] };
    expect(() => assertAudience({ aud: ['approve', 'technical-audience'] }, p)).not.toThrow();
  });

  it('rejects when requiredAudience is entirely absent', () => {
    expect(() => assertAudience({ aud: 'wiki' }, profile)).toThrow(UnauthorizedException);
  });

  it('rejects an empty aud array', () => {
    expect(() => assertAudience({ aud: [] }, profile)).toThrow(UnauthorizedException);
  });

  it('rejects when the audience set contains a value outside the allow-list, even alongside the required one', () => {
    // The known "any overlap passes" pitfall: aud contains approve AND an unexpected extra.
    expect(() => assertAudience({ aud: ['approve', 'chat'] }, profile)).toThrow(
      UnauthorizedException,
    );
  });

  it('treats a non-string/non-array aud as an empty set (fails closed)', () => {
    expect(() => assertAudience({ aud: 42 }, profile)).toThrow(UnauthorizedException);
  });
});

describe('normalizeClientId', () => {
  it('uses azp when only azp is present', () => {
    expect(normalizeClientId({ azp: 'wiki-delegation' })).toBe('wiki-delegation');
  });

  it('uses client_id when only client_id is present (RFC 9068 providers)', () => {
    expect(normalizeClientId({ client_id: 'wiki-delegation' })).toBe('wiki-delegation');
  });

  it('accepts azp and client_id when they agree', () => {
    expect(normalizeClientId({ azp: 'wiki-delegation', client_id: 'wiki-delegation' })).toBe(
      'wiki-delegation',
    );
  });

  it('fails closed when azp and client_id conflict', () => {
    expect(() => normalizeClientId({ azp: 'wiki-delegation', client_id: 'other' })).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when both are absent', () => {
    expect(() => normalizeClientId({})).toThrow(UnauthorizedException);
  });

  it('fails closed on a non-string azp (claim pollution)', () => {
    expect(() => normalizeClientId({ azp: ['wiki-delegation'] })).toThrow(UnauthorizedException);
  });
});

describe('assertAllowedClient', () => {
  it('accepts a client id in allowedClientIds', () => {
    expect(() => assertAllowedClient('wiki-delegation', profile)).not.toThrow();
  });

  it('rejects a client id not in allowedClientIds', () => {
    expect(() => assertAllowedClient('chat', profile)).toThrow(UnauthorizedException);
  });
});

describe('requireExternalSubject', () => {
  it('returns a valid string sub', () => {
    expect(requireExternalSubject({ sub: 'user-123' })).toBe('user-123');
  });

  it('rejects a missing sub', () => {
    expect(() => requireExternalSubject({})).toThrow(UnauthorizedException);
  });

  it('rejects an empty-string sub', () => {
    expect(() => requireExternalSubject({ sub: '' })).toThrow(UnauthorizedException);
  });
});

describe('assertScopesAndReturn', () => {
  it('accepts a token with exactly the required scope plus out-of-namespace scopes', () => {
    const scopes = assertScopesAndReturn(
      { scope: 'openid profile approve:knowledge-document-change:submit' },
      profile,
    );
    expect(scopes).toContain('approve:knowledge-document-change:submit');
  });

  it('rejects when a required scope is missing', () => {
    expect(() => assertScopesAndReturn({ scope: 'openid profile' }, profile)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an in-namespace scope that was not registered as required (upscope)', () => {
    expect(() =>
      assertScopesAndReturn(
        { scope: 'approve:knowledge-document-change:submit approve:admin:full-control' },
        profile,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('ignores out-of-namespace scopes entirely', () => {
    expect(() =>
      assertScopesAndReturn(
        { scope: 'approve:knowledge-document-change:submit web-origins roles' },
        profile,
      ),
    ).not.toThrow();
  });
});

describe('assertTokenAge', () => {
  it('accepts a token within maxTokenAgeSeconds', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => assertTokenAge({ iat: now, exp: now + 100 }, profile)).not.toThrow();
  });

  it('accepts a token exactly at the boundary including clock tolerance', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => assertTokenAge({ iat: now, exp: now + 130 }, profile)).not.toThrow();
  });

  it('rejects a token older than maxTokenAgeSeconds + clockToleranceSeconds', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => assertTokenAge({ iat: now, exp: now + 131 }, profile)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a future iat and an exp that is not after iat', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => assertTokenAge({ iat: now + 3600, exp: now + 3660 }, profile)).toThrow(
      UnauthorizedException,
    );
    expect(() => assertTokenAge({ iat: now + 10, exp: now + 5 }, profile)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token missing iat or exp', () => {
    expect(() => assertTokenAge({ exp: 1000 }, profile)).toThrow(UnauthorizedException);
    expect(() => assertTokenAge({ iat: 1000 }, profile)).toThrow(UnauthorizedException);
  });
});
