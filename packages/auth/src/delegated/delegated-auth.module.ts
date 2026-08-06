import { type DynamicModule, Module } from '@nestjs/common';
import { DELEGATED_AUTH_PROFILES } from './delegated-auth.constants';
import { DelegatedAuthGuard } from './delegated-auth.guard';
import { DelegatedJwtVerifierService } from './delegated-jwt-verifier.service';
import { DelegatedPrincipalMapperService } from './delegated-principal-mapper.service';
import { validateDelegatedProfiles } from './delegated-profile-validation';
import type { DelegatedOidcTrustProfile } from './types';

export type DelegatedAuthModuleOptions = {
  profiles: Record<string, DelegatedOidcTrustProfile>;
};

/**
 * Independent module for the delegated (Token Exchange) inbound trust profile — does not
 * modify `AuthModule` or `OidcStrategy` in any way, and a consumer that never imports this
 * module sees no change in behavior or startup requirements. See
 * 042-oidc-delegation-package-plan.md §9.1 for the intended wiring shape.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose static factory methods.
export class DelegatedAuthModule {
  static forFeature(options: DelegatedAuthModuleOptions): DynamicModule {
    validateDelegatedProfiles(options.profiles);

    return {
      module: DelegatedAuthModule,
      providers: [
        { provide: DELEGATED_AUTH_PROFILES, useValue: options.profiles },
        DelegatedJwtVerifierService,
        DelegatedPrincipalMapperService,
        DelegatedAuthGuard,
      ],
      exports: [DelegatedAuthGuard],
    };
  }
}
