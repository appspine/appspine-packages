import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { DelegatedAuthGuard } from './delegated-auth.guard';
import { DelegatedIdentityMappingError } from './delegated-identity-mapping.error';
import type { DelegatedOidcTrustProfile } from './types';

const profile: DelegatedOidcTrustProfile = {
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

const verifiedResult = {
  claims: {
    issuer: profile.expectedIssuer,
    externalSubject: 'external-user-1',
    sourceClientId: 'wiki-delegation',
    audience: 'approve',
    scopes: ['approve:knowledge-document-change:submit'],
  },
  email: 'wiki-user@appspine-dev.local',
  emailVerified: true,
  name: 'Wiki User',
};

const mappedPrincipal = {
  sub: 'local-user-1',
  email: 'wiki-user@appspine-dev.local',
  name: 'Wiki User',
  roleName: 'USER',
  roleNames: ['USER'],
  permissionPolicy: 'DENY_ALL',
  permissions: [],
};

function createContext(profileName: string | undefined, request: Record<string, unknown>) {
  const reflector = { get: vi.fn().mockReturnValue(profileName) } as unknown as Reflector;
  const ctx = {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { reflector, ctx };
}

function createGuard(opts: {
  reflector: Reflector;
  verify?: ReturnType<typeof vi.fn>;
  mapToLocalPrincipal?: ReturnType<typeof vi.fn>;
  profiles?: Record<string, DelegatedOidcTrustProfile>;
  recordRejection?: ReturnType<typeof vi.fn>;
}) {
  const verifier = { verify: opts.verify ?? vi.fn().mockResolvedValue(verifiedResult) };
  const mapper = {
    mapToLocalPrincipal: opts.mapToLocalPrincipal ?? vi.fn().mockResolvedValue(mappedPrincipal),
  };
  return new DelegatedAuthGuard(
    opts.reflector,
    verifier as never,
    mapper as never,
    { recordRejection: opts.recordRejection ?? vi.fn() } as never,
    (opts.profiles ?? { submit: profile }) as never,
  );
}

describe('DelegatedAuthGuard', () => {
  it('rejects a request to an endpoint with no @DelegatedProfile() at all', async () => {
    const { reflector, ctx } = createContext(undefined, { headers: {} });
    const guard = createGuard({ reflector });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws (fails fast) when the decorated profile name is not configured', async () => {
    const { reflector, ctx } = createContext('does-not-exist', {
      headers: { authorization: 'Bearer sometoken' },
    });
    const guard = createGuard({ reflector, profiles: { submit: profile } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/not configured/);
  });

  it('rejects a request with no Authorization header', async () => {
    const { reflector, ctx } = createContext('submit', { headers: {} });
    const guard = createGuard({ reflector });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const { reflector, ctx } = createContext('submit', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    const guard = createGuard({ reflector });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('on success, attaches request.user (JwtUser shape) and request.delegationContext separately', async () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer sometoken' },
    };
    const { reflector, ctx } = createContext('submit', request);
    const guard = createGuard({ reflector });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(mappedPrincipal);
    expect(request.delegationContext).toEqual(verifiedResult.claims);
  });

  it('converts a crypto/claim verification failure into a unified opaque 401', async () => {
    const { reflector, ctx } = createContext('submit', {
      headers: { authorization: 'Bearer sometoken' },
    });
    const recordRejection = vi.fn();
    const guard = createGuard({
      reflector,
      verify: vi.fn().mockRejectedValue(new UnauthorizedException('wrong audience: chat')),
      recordRejection,
    });

    const error = await guard.canActivate(ctx).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.message).toBe('Invalid delegated token');
    expect(error.message).not.toContain('wrong audience');
    expect(recordRejection).toHaveBeenCalledWith('submit', expect.any(UnauthorizedException));
  });

  it('converts an identity-mapping failure into the same unified opaque 401 (not distinguishable)', async () => {
    const { reflector, ctx } = createContext('submit', {
      headers: { authorization: 'Bearer sometoken' },
    });
    const guard = createGuard({
      reflector,
      mapToLocalPrincipal: vi
        .fn()
        .mockRejectedValue(new DelegatedIdentityMappingError('no active local account')),
    });

    const error = await guard.canActivate(ctx).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.message).toBe('Invalid delegated token');
  });

  it('does not attach request.user or request.delegationContext on failure', async () => {
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer sometoken' } };
    const { reflector, ctx } = createContext('submit', request);
    const guard = createGuard({
      reflector,
      verify: vi.fn().mockRejectedValue(new UnauthorizedException()),
    });

    await guard.canActivate(ctx).catch(() => {});
    expect(request.user).toBeUndefined();
    expect(request.delegationContext).toBeUndefined();
  });
});
