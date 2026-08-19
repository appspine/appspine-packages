import { IDENTITY_DELEGATION } from '@appspine/plugin-api';
import { type DynamicModule, Module } from '@nestjs/common';
import { OidcDelegationService } from './oidc-delegation.service';
import type { OidcDelegationModuleOptions } from './types';

export const OIDC_DELEGATION_MODULE_OPTIONS = Symbol('OIDC_DELEGATION_MODULE_OPTIONS');

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose static factory methods.
export class OidcDelegationModule {
  static forRoot(options: OidcDelegationModuleOptions): DynamicModule {
    return {
      module: OidcDelegationModule,
      providers: [
        { provide: OIDC_DELEGATION_MODULE_OPTIONS, useValue: options },
        {
          provide: OidcDelegationService,
          useFactory: () => new OidcDelegationService(options),
        },
        {
          provide: IDENTITY_DELEGATION,
          useExisting: OidcDelegationService,
        },
      ],
      exports: [OidcDelegationService, IDENTITY_DELEGATION],
    };
  }
}
