import { IDENTITY_STORE } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Module } from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard';
import { IdentityStoreService } from './identity-store.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

/**
 * Provider-neutral identity (PL1-10).
 *
 * Not `@Global()`. `@appspine/auth`'s `AuthModule` was, and that is precisely how every capability
 * package ended up depending on it implicitly (051 decision 3). An App or a plugin that needs
 * identity imports this module or injects `IDENTITY_STORE`.
 */
@Module({
  imports: [AppspineAuthInfrastructureModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    IdentityStoreService,
    { provide: IDENTITY_STORE, useExisting: IdentityStoreService },
    AdminGuard,
  ],
  exports: [UsersService, IdentityStoreService, IDENTITY_STORE, AdminGuard],
})
export class IdentityCoreModule {}
