export { CurrentDelegatedUser } from './decorators/current-delegated-user.decorator';
export { DELEGATED_PROFILE_KEY, DelegatedProfile } from './decorators/delegated-profile.decorator';
export { DELEGATED_AUTH_PROFILES } from './delegated-auth.constants';
export { DelegatedAuthGuard } from './delegated-auth.guard';
export { DelegatedAuthModule, type DelegatedAuthModuleOptions } from './delegated-auth.module';
export { DelegatedIdentityMappingError } from './delegated-identity-mapping.error';
export { DelegatedJwtVerifierService } from './delegated-jwt-verifier.service';
export { DelegatedPrincipalMapperService } from './delegated-principal-mapper.service';
export type {
  DelegatedOidcTrustProfile,
  DelegatedTokenVerificationResult,
  DelegationContext,
  VerifiedDelegatedClaims,
} from './types';
