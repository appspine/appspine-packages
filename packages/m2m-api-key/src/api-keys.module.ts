import { SCOPE_MATCHER } from '@appspine/plugin-api';
import {
  AppspineAuthInfrastructureModule,
  AuthenticationStrategyRegistry,
} from '@appspine/plugin-host-nest';
import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyMachineStrategy } from './api-key-machine.strategy';
import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyAdminGuard } from './guards/admin.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { ScopeGuard } from './guards/scope.guard';
import { ScopeMatcherService } from './scope-matcher.service';

/**
 * Machine-to-Machine API Keys capability module (051 PL4-03).
 *
 * Provides:
 *  - `appspine.machine-auth-provider`: registers `ApiKeyMachineStrategy` into `AuthenticationStrategyRegistry`.
 *  - `appspine.scope-matcher`: bound to `SCOPE_MATCHER` token via `ScopeMatcherService`.
 *  - Admin key management CRUD endpoints (`ApiKeysController` / `ApiKeysService`).
 *
 * In Phase 4 transition, `@Global()` is retained (and declared as `facets.backend.global: true` in
 * the manifest) so downstream applications relying on global `ApiKeyGuard`/`ScopeGuard`/`JwtOrApiKeyGuard`
 * continue booting without immediate feature-level import changes.
 *
 * @deprecated 051 PL5-13: The `@Global()` decorator on `ApiKeysModule` is a compatibility bridge scheduled for removal in the next major version.
 * In plugin mode, use `@appspine/preset-standard` or import `ApiKeysModule` explicitly in consuming feature modules.
 */
@Global()
@Module({
  imports: [AppspineAuthInfrastructureModule],
  controllers: [ApiKeysController],
  providers: [
    ApiKeysService,
    ApiKeyGuard,
    ApiKeyRateLimiter,
    ApiKeyAdminGuard,
    JwtOrApiKeyGuard,
    ScopeGuard,
    ApiKeyMachineStrategy,
    ScopeMatcherService,
    { provide: SCOPE_MATCHER, useExisting: ScopeMatcherService },
  ],
  exports: [
    ApiKeysService,
    ApiKeyGuard,
    ApiKeyRateLimiter,
    ApiKeyAdminGuard,
    JwtOrApiKeyGuard,
    ScopeGuard,
    ApiKeyMachineStrategy,
    ScopeMatcherService,
    SCOPE_MATCHER,
  ],
})
export class ApiKeysModule implements OnModuleInit {
  constructor(
    @Inject(AuthenticationStrategyRegistry)
    private readonly registry: AuthenticationStrategyRegistry,
    @Inject(ApiKeyMachineStrategy)
    private readonly strategy: ApiKeyMachineStrategy,
  ) {}

  /**
   * Registers the machine strategy with the host (PL1-11, PL4-03).
   */
  onModuleInit(): void {
    if (!this.registry.has(this.strategy.id)) {
      this.registry.register(this.strategy);
    }
  }
}
