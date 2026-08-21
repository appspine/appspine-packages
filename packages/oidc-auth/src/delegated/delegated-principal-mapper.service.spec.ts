import { describe, expect, it, vi } from 'vitest';
import { DelegatedIdentityMappingError } from './delegated-identity-mapping.error';
import { DelegatedPrincipalMapperService } from './delegated-principal-mapper.service';

const fakeJwtUser = {
  sub: 'local-user-1',
  email: 'wiki-user@appspine-dev.local',
  name: 'Wiki User',
  roleName: 'USER',
  roleNames: ['USER'],
  permissionPolicy: 'DENY_ALL',
  permissions: [],
};

function createMapper(overrides: {
  mapVerifiedIdentityToLocalPrincipal?: ReturnType<typeof vi.fn>;
  findLocalPrincipalByVerifiedEmail?: ReturnType<typeof vi.fn>;
}) {
  const jwtVerifier = {
    mapVerifiedIdentityToLocalPrincipal:
      overrides.mapVerifiedIdentityToLocalPrincipal ?? vi.fn().mockResolvedValue(fakeJwtUser),
    findLocalPrincipalByVerifiedEmail:
      overrides.findLocalPrincipalByVerifiedEmail ?? vi.fn().mockResolvedValue(fakeJwtUser),
  };
  return { mapper: new DelegatedPrincipalMapperService(jwtVerifier as never), jwtVerifier };
}

describe('DelegatedPrincipalMapperService', () => {
  it('rejects a missing email before ever touching the database', async () => {
    const { mapper, jwtVerifier } = createMapper({});
    await expect(mapper.mapToLocalPrincipal(undefined, true, 'Name', 'never')).rejects.toThrow(
      DelegatedIdentityMappingError,
    );
    expect(jwtVerifier.findLocalPrincipalByVerifiedEmail).not.toHaveBeenCalled();
    expect(jwtVerifier.mapVerifiedIdentityToLocalPrincipal).not.toHaveBeenCalled();
  });

  it('rejects an unverified email before ever touching the database', async () => {
    const { mapper, jwtVerifier } = createMapper({});
    await expect(
      mapper.mapToLocalPrincipal('user@example.com', false, 'Name', 'never'),
    ).rejects.toThrow(DelegatedIdentityMappingError);
    expect(jwtVerifier.findLocalPrincipalByVerifiedEmail).not.toHaveBeenCalled();
  });

  it("provisioning: 'never' calls the find-only lookup, not JIT provisioning", async () => {
    const { mapper, jwtVerifier } = createMapper({});
    const result = await mapper.mapToLocalPrincipal('user@example.com', true, 'Name', 'never');
    expect(result).toEqual(fakeJwtUser);
    expect(jwtVerifier.findLocalPrincipalByVerifiedEmail).toHaveBeenCalledWith('user@example.com');
    expect(jwtVerifier.mapVerifiedIdentityToLocalPrincipal).not.toHaveBeenCalled();
  });

  it("provisioning: 'never' rejects when no local user is found — and this must be indistinguishable from other identity-mapping failures", async () => {
    const { mapper } = createMapper({
      findLocalPrincipalByVerifiedEmail: vi.fn().mockResolvedValue(null),
    });
    await expect(
      mapper.mapToLocalPrincipal('nobody@example.com', true, 'Name', 'never'),
    ).rejects.toThrow(DelegatedIdentityMappingError);
  });

  it("provisioning: 'jit' calls JIT provisioning, not the find-only lookup", async () => {
    const { mapper, jwtVerifier } = createMapper({});
    const result = await mapper.mapToLocalPrincipal('user@example.com', true, 'Name', 'jit');
    expect(result).toEqual(fakeJwtUser);
    expect(jwtVerifier.mapVerifiedIdentityToLocalPrincipal).toHaveBeenCalledWith(
      'user@example.com',
      'Name',
    );
    expect(jwtVerifier.findLocalPrincipalByVerifiedEmail).not.toHaveBeenCalled();
  });
});
