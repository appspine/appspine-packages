import { IdentityCoreModule } from '@appspine/identity-core';
import { OidcAuthModule } from '@appspine/oidc-auth';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Global, Module } from '@nestjs/common';

/**
 * Transition-only compatibility module (051 PL1-13).
 *
 * `AuthModule` used to *contain* identity, OIDC verification and Users CRUD. Phase 1 split those
 * into `@appspine/identity-core` and `@appspine/oidc-auth`; this composes the two so an App's
 * existing `imports: [AuthModule]` keeps behaving identically — same controllers, same routes,
 * same exported providers, same global availability.
 *
 * Still `@Global()`, deliberately: the pre-split module was, and a consumer relying on that must
 * not break in the release that gives them the tokens they need in order to stop relying on it.
 * 051 decision 3 removes the globals; 051 decision 6 keeps this package for at least one major
 * transition window. New functionality goes to `identity-core` / `oidc-auth`, never here.
 *
 * `AppspineAuthInfrastructureModule` is imported so an App that has *not* adopted the plugin host
 * still gets the strategy registry and principal context `OidcAuthModule` now depends on. Nest
 * instantiates a module class once, so an App using both wirings shares one registry.
 *
 * @deprecated 051 PL5-13: `AuthModule` is a transition-only compatibility facade scheduled for removal in the next major version.
 * Use `@appspine/identity-core`'s `IdentityCoreModule`, `@appspine/oidc-auth`'s `OidcAuthModule`, or `@appspine/preset-standard` in plugin mode instead.
 */
@Global()
@Module({
  imports: [AppspineAuthInfrastructureModule, IdentityCoreModule, OidcAuthModule],
  exports: [AppspineAuthInfrastructureModule, IdentityCoreModule, OidcAuthModule],
})
export class AuthModule {}
