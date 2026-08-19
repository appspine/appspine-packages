import { AUTHENTICATION_STRATEGY_REGISTRY, PRINCIPAL_CONTEXT } from '@appspine/plugin-api';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppspineAuthGuard, InteractiveAuthGuard, MachineAuthGuard } from './guards';
import { PrincipalContextInterceptor, PrincipalContextService } from './principal-context';
import { AuthenticationStrategyRegistry } from './strategy-registry';

/**
 * The two host-owned auth capabilities, as an ordinary Nest module (PL1-11).
 *
 * Separate from the dynamic host module for one specific reason: an App can be wired either
 * through `createAppspineModule()` *or* through the legacy `@appspine/auth` compatibility module,
 * and both need the same single strategy registry. Nest instantiates a module class once per
 * application, so importing this from both places yields one registry — whereas duplicating the
 * providers would give an App two registries and let "only one interactive provider" silently
 * become "one per registry".
 *
 * The principal-context interceptor is registered here for the same reason.
 */
@Global()
@Module({
  providers: [
    AuthenticationStrategyRegistry,
    PrincipalContextService,
    AppspineAuthGuard,
    InteractiveAuthGuard,
    MachineAuthGuard,
    { provide: PRINCIPAL_CONTEXT, useExisting: PrincipalContextService },
    { provide: AUTHENTICATION_STRATEGY_REGISTRY, useExisting: AuthenticationStrategyRegistry },
    { provide: APP_INTERCEPTOR, useClass: PrincipalContextInterceptor },
  ],
  exports: [
    AuthenticationStrategyRegistry,
    PrincipalContextService,
    AppspineAuthGuard,
    InteractiveAuthGuard,
    MachineAuthGuard,
    PRINCIPAL_CONTEXT,
    AUTHENTICATION_STRATEGY_REGISTRY,
  ],
})
export class AppspineAuthInfrastructureModule {}
