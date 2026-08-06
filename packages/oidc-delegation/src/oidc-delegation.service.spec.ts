import { describe, expect, it, vi } from 'vitest';
import { OidcDelegationError } from './errors';
import { OidcDelegationService } from './oidc-delegation.service';
import {
  createDenyFixture,
  createMalformedFixture,
  createSuccessFixture,
  createTimeoutFixture,
  FakeOidcDelegationProvider,
} from './testing';
import type { OidcDelegationModuleOptions } from './types';

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

const baseOptions: OidcDelegationModuleOptions = {
  provider: 'keycloak',
  tokenEndpoint: 'https://keycloak.invalid/token',
  // Deliberately distinct, mirroring real usage: wiki-delegation performs the exchange call,
  // but subject tokens are issued to end users by wiki, the login client — see T-17000's
  // integration finding (plan §2 decision 4 / §17.2 gate 8) that caught this exact
  // distinction being conflated.
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

const validSubjectToken = fakeJwt({ azp: 'wiki', sub: 'user-1' });

describe('OidcDelegationService', () => {
  it('exchanges successfully through the fake provider (deterministic contract suite)', async () => {
    const provider = createSuccessFixture({ accessToken: 'delegated-tok', expiresInSeconds: 100 });
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });

    const result = await service.exchange({ subjectToken: validSubjectToken, policy: 'submit' });

    expect(result).toEqual({
      accessToken: 'delegated-tok',
      tokenType: 'Bearer',
      expiresInSeconds: 100,
    });
    expect(provider.calls).toEqual([
      {
        subjectToken: validSubjectToken,
        targetAudience: 'approve',
        requestedScopes: ['approve:knowledge-document-change:submit'],
      },
    ]);
  });

  it('fails closed on an unknown policy name without calling the provider', async () => {
    const provider = createSuccessFixture();
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });

    await expect(
      service.exchange({ subjectToken: validSubjectToken, policy: 'does-not-exist' }),
    ).rejects.toMatchObject({ category: 'policy_not_found' });
    expect(provider.calls).toHaveLength(0);
  });

  it('rejects a subject token issued to a different client before calling the provider', async () => {
    // This is the mandatory sanity check from 042-oidc-delegation-package-plan.md §2 decision
    // 13 — T-16610 proved Keycloak alone does not reliably block this.
    const provider = createSuccessFixture();
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });
    const foreignToken = fakeJwt({ azp: 'chat', sub: 'user-1' });

    await expect(
      service.exchange({ subjectToken: foreignToken, policy: 'submit' }),
    ).rejects.toMatchObject({ category: 'invalid_subject_token' });
    expect(provider.calls).toHaveLength(0);
  });

  it('regression: rejects a subject token whose azp is the exchange client itself, not the issuer client', async () => {
    // Caught live by T-17000 against real Keycloak: the sanity check must compare against
    // subjectTokenIssuerClientId ('wiki'), not sourceClientId ('wiki-delegation') — the
    // dedicated exchange-only client never itself issues subject tokens to anyone, so
    // comparing against it makes every real exchange fail closed.
    const provider = createSuccessFixture();
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });
    const tokenFromExchangeClient = fakeJwt({ azp: 'wiki-delegation', sub: 'user-1' });

    await expect(
      service.exchange({ subjectToken: tokenFromExchangeClient, policy: 'submit' }),
    ).rejects.toMatchObject({ category: 'invalid_subject_token' });
    expect(provider.calls).toHaveLength(0);
  });

  it('call-site cannot override source client, audience, or scopes', async () => {
    const provider = createSuccessFixture();
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });

    // The public input type only has subjectToken/policy — this test documents that
    // contract by asserting the provider only ever receives the policy's configured values.
    await service.exchange({ subjectToken: validSubjectToken, policy: 'submit' });
    expect(provider.calls[0].targetAudience).toBe('approve');
    expect(provider.calls[0].requestedScopes).toEqual(['approve:knowledge-document-change:submit']);
  });

  it('propagates a provider deny as exchange_denied', async () => {
    const provider = createDenyFixture('exchange_denied');
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });

    await expect(
      service.exchange({ subjectToken: validSubjectToken, policy: 'submit' }),
    ).rejects.toMatchObject({ category: 'exchange_denied' });
  });

  it('propagates a provider timeout as provider_unavailable (retryable)', async () => {
    const provider = createTimeoutFixture();
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });

    const error = await service
      .exchange({ subjectToken: validSubjectToken, policy: 'submit' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(OidcDelegationError);
    expect(error.category).toBe('provider_unavailable');
    expect(error.retryable).toBe(true);
  });

  it('propagates a malformed provider response as malformed_provider_response (not retryable)', async () => {
    const provider = createMalformedFixture();
    const service = new OidcDelegationService(baseOptions, { provider, logger: { log: vi.fn() } });

    const error = await service
      .exchange({ subjectToken: validSubjectToken, policy: 'submit' })
      .catch((e) => e);
    expect(error.category).toBe('malformed_provider_response');
    expect(error.retryable).toBe(false);
  });

  it('opens the circuit after repeated provider failures and fails fast without calling the provider', async () => {
    const provider = new FakeOidcDelegationProvider(async () => {
      throw new OidcDelegationError('provider_unavailable', 'down');
    });
    const service = new OidcDelegationService(
      { ...baseOptions },
      { provider, logger: { log: vi.fn() } },
    );

    // Default failure threshold is 5 — exhaust it.
    for (let i = 0; i < 5; i++) {
      await service.exchange({ subjectToken: validSubjectToken, policy: 'submit' }).catch(() => {});
    }
    const callsBeforeCircuitOpen = provider.calls.length;

    await expect(
      service.exchange({ subjectToken: validSubjectToken, policy: 'submit' }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
    // The circuit-open rejection must not have reached the provider at all.
    expect(provider.calls.length).toBe(callsBeforeCircuitOpen);
  });

  it('enforces the outbound rate limit per policy', async () => {
    const provider = createSuccessFixture();
    const service = new OidcDelegationService(
      { ...baseOptions, maxExchangesPerMinutePerPolicy: 2 },
      { provider, logger: { log: vi.fn() } },
    );

    await service.exchange({ subjectToken: validSubjectToken, policy: 'submit' });
    await service.exchange({ subjectToken: validSubjectToken, policy: 'submit' });
    await expect(
      service.exchange({ subjectToken: validSubjectToken, policy: 'submit' }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
    expect(provider.calls).toHaveLength(2);
  });

  it('never logs the subject token, delegated access token, or client secret', async () => {
    const logged: string[] = [];
    const logger = { log: (event: unknown) => logged.push(JSON.stringify(event)) };
    const provider = createSuccessFixture({ accessToken: 'super-secret-delegated-token' });
    const service = new OidcDelegationService(baseOptions, { provider, logger });

    await service.exchange({ subjectToken: validSubjectToken, policy: 'submit' });
    await service
      .exchange({ subjectToken: fakeJwt({ azp: 'chat' }), policy: 'submit' })
      .catch(() => {});

    const combined = logged.join('\n');
    expect(combined).not.toContain(validSubjectToken);
    expect(combined).not.toContain('super-secret-delegated-token');
    expect(combined).not.toContain(baseOptions.sourceClientSecret);
  });
});
