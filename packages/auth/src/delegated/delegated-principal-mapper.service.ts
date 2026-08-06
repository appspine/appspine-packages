import { Injectable } from '@nestjs/common';
import type { JwtUser } from '../decorators/current-user.decorator';
import { JwtVerifierService } from '../jwt-verifier.service';
import { DelegatedIdentityMappingError } from './delegated-identity-mapping.error';

/**
 * Maps a verified delegated identity (email + name extracted from the delegated token by
 * DelegatedJwtVerifierService) to a local principal. Reuses JwtVerifierService's existing
 * verified-email/JIT mapping (`mapVerifiedIdentityToLocalPrincipal`) for `provisioning:
 * 'jit'`, and its find-only lookup (`findLocalPrincipalByVerifiedEmail`) for the default
 * `provisioning: 'never'` — never reruns or bypasses cryptographic verification, which has
 * already happened by the time this runs. See 042-oidc-delegation-package-plan.md §9 step 8.
 */
@Injectable()
export class DelegatedPrincipalMapperService {
  constructor(private readonly jwtVerifier: JwtVerifierService) {}

  async mapToLocalPrincipal(
    email: string | undefined,
    emailVerified: boolean,
    name: string | undefined,
    provisioning: 'never' | 'jit',
  ): Promise<JwtUser> {
    if (!email) {
      throw new DelegatedIdentityMappingError('delegated token is missing an email claim');
    }
    if (!emailVerified) {
      throw new DelegatedIdentityMappingError('delegated token email is not verified');
    }

    if (provisioning === 'jit') {
      return this.jwtVerifier.mapVerifiedIdentityToLocalPrincipal(email, name);
    }

    const principal = await this.jwtVerifier.findLocalPrincipalByVerifiedEmail(email);
    if (!principal) {
      throw new DelegatedIdentityMappingError(
        'no active local account for this delegated identity',
      );
    }
    return principal;
  }
}
