import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyAdminGuard } from './guards/admin.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { ScopeGuard } from './guards/scope.guard';

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
  ],
  exports: [ApiKeysService, ApiKeyGuard, ApiKeyRateLimiter, JwtOrApiKeyGuard, ScopeGuard],
})
export class ApiKeysModule {}
