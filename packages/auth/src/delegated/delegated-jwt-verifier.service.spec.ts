import { generateKeyPairSync } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { DelegatedJwtVerifierService } from './delegated-jwt-verifier.service';
import type { DelegatedOidcTrustProfile } from './types';

process.env.OIDC_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

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

function signDelegatedToken(claims: Record<string, unknown>, opts: jwt.SignOptions = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      typ: 'Bearer',
      sub: 'external-user-1',
      azp: 'wiki-delegation',
      scope: 'profile email approve:knowledge-document-change:submit',
      email: 'wiki-user@appspine-dev.local',
      email_verified: true,
      iat: now,
      exp: now + 100,
      ...claims,
    },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: 'key-1',
      issuer: profile.expectedIssuer,
      audience: profile.requiredAudience,
      ...opts,
    },
  );
}

function createVerifierWithFakeJwks(): DelegatedJwtVerifierService {
  const service = new DelegatedJwtVerifierService();
  (
    service as unknown as {
      oidcClient: { getSigningKey: (kid: string) => Promise<{ getPublicKey: () => string }> };
    }
  ).oidcClient = {
    getSigningKey: async () => ({ getPublicKey: () => publicKeyPem }),
  };
  return service;
}

describe('DelegatedJwtVerifierService.verify', () => {
  it('accepts a well-formed delegated token and returns claims + identity fields', async () => {
    const token = signDelegatedToken({});
    const result = await createVerifierWithFakeJwks().verify(token, profile);

    expect(result.claims).toEqual({
      issuer: profile.expectedIssuer,
      externalSubject: 'external-user-1',
      sourceClientId: 'wiki-delegation',
      audience: 'approve',
      scopes: ['profile', 'email', 'approve:knowledge-document-change:submit'],
    });
    expect(result.email).toBe('wiki-user@appspine-dev.local');
    expect(result.emailVerified).toBe(true);
  });

  it('rejects a token missing a kid header', async () => {
    const token = jwt.sign({ sub: 'x' }, privateKey, { algorithm: 'RS256' });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed by a different key (bad signature)', async () => {
    const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { typ: 'Bearer', sub: 'x', azp: 'wiki-delegation', scope: '', iat: now, exp: now + 100 },
      otherKey,
      { algorithm: 'RS256', keyid: 'key-1', issuer: profile.expectedIssuer, audience: 'approve' },
    );
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = signDelegatedToken({}, { issuer: 'https://attacker.example' });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signDelegatedToken({ iat: now - 300, exp: now - 200 });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with a future nbf', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signDelegatedToken({ nbf: now + 3600 });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an ID-token-shaped token (no typ: Bearer)', async () => {
    const token = signDelegatedToken({ typ: undefined, nonce: 'abc' });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token whose azp is not in allowedClientIds', async () => {
    const token = signDelegatedToken({ azp: 'chat' });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with conflicting azp/client_id', async () => {
    const token = signDelegatedToken({ azp: 'wiki-delegation', client_id: 'chat' });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token missing the required delegation scope', async () => {
    const token = signDelegatedToken({ scope: 'profile email' });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with an extra in-namespace scope beyond the policy (upscope)', async () => {
    const token = signDelegatedToken({
      scope: 'approve:knowledge-document-change:submit approve:admin:full-control',
    });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token whose audience does not include the required audience', async () => {
    const token = signDelegatedToken({}, { audience: 'chat' });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token older than maxTokenAgeSeconds + clockToleranceSeconds', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signDelegatedToken({ iat: now - 200, exp: now - 200 + 200 });
    await expect(createVerifierWithFakeJwks().verify(token, profile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('never leaks the token itself in a thrown error message', async () => {
    const token = signDelegatedToken({ azp: 'chat' });
    try {
      await createVerifierWithFakeJwks().verify(token, profile);
      expect.unreachable('expected verify() to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(token);
    }
  });
});
