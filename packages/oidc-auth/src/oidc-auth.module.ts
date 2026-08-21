import { AUDIT_SINK } from '@appspine/plugin-api';
import {
  AppspineAuthInfrastructureModule,
  AuthenticationStrategyRegistry,
} from '@appspine/plugin-host-nest';
import { type DynamicModule, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AUTH_AUDIT_LOG } from './auth-audit-log';
import { OIDC_AUTH_CONFIG, type OidcAuthConfig } from './config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtVerifierService } from './jwt-verifier.service';
import { OidcIdentityService } from './oidc-identity.service';
import { OidcInteractiveStrategy } from './oidc-interactive.strategy';
import { OidcStrategy } from './strategies/oidc.strategy';

/**
 * OIDC interactive authentication (PL1-12).
 *
 * Replaces `@appspine/auth`'s `AuthModule`. Two differences that matter:
 *
 *  - Not `@Global()`. The old module was, which is how `AdminGuard` and `CurrentUser` ended up
 *    available everywhere by accident and every capability package grew an implicit dependency on
 *    the auth package (051 decision 3).
 *  - Users CRUD is gone from here entirely — that is `@appspine/identity-core`'s. This module owns
 *    OIDC verification, the identity mapping and the login strategy, nothing else.
 *
 * `AUTH_AUDIT_LOG` is still bound, to `AUDIT_SINK`, so a consumer that injects the old token keeps
 * getting the same object during the transition window.
 */
@Module({
  imports: [AppspineAuthInfrastructureModule, PassportModule],
  controllers: [AuthController],
  providers: [
    OidcIdentityService,
    JwtVerifierService,
    OidcStrategy,
    JwtAuthGuard,
    OidcInteractiveStrategy,
    { provide: AUTH_AUDIT_LOG, useExisting: AUDIT_SINK },
  ],
  exports: [JwtVerifierService, OidcIdentityService, JwtAuthGuard, AUTH_AUDIT_LOG],
})
export class OidcAuthModule implements OnModuleInit {
  static register(config: OidcAuthConfig): DynamicModule {
    return {
      module: OidcAuthModule,
      providers: [{ provide: OIDC_AUTH_CONFIG, useValue: config }],
    };
  }

  constructor(
    @Inject(AuthenticationStrategyRegistry)
    private readonly registry: AuthenticationStrategyRegistry,
    @Inject(OidcInteractiveStrategy) private readonly strategy: OidcInteractiveStrategy,
  ) {}

  /**
   * Registers the interactive strategy with the host (PL1-11). `onModuleInit` rather than the
   * plugin `register` hook so the registration also happens for an App still wiring this module
   * directly, without going through the plugin host.
   */
  onModuleInit(): void {
    if (!this.registry.has(this.strategy.id)) {
      this.registry.register(this.strategy);
    }
  }
}
