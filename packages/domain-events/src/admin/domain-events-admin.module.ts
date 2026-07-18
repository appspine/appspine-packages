import { AuthModule } from '@appspine/auth';
import { ApiKeysModule } from '@appspine/m2m-api-key';
import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';

import { DomainEventsAdminController } from './domain-events-admin.controller';
import { DomainEventsAdminService } from './domain-events-admin.service';

type ModuleImport = NonNullable<ModuleMetadata['imports']>[number];

/**
 * `DomainEventRegistry` has no package-level default instance — each app constructs its own via a
 * `useFactory` provider in its own `domain-events.module.ts` (registering that app's own handler
 * classes into it). `forRoot()` takes that app's already-exported registry module as `imports` so
 * `DomainEventsAdminService`'s `DomainEventRegistry` constructor param resolves the normal Nest
 * way — no `useFactory`/`useValue` re-wiring needed here.
 *
 * This is unrelated to the `forRoot({ guards })` design decision 3 rejected — that one made *auth*
 * configurable per app with no precedent, solving a problem that didn't exist (guards are hardcoded
 * on the controller instead). Forwarding the per-app registry module is the standard Nest
 * `imports`-forwarding mechanism (the same shape `ConfigModule.forRootAsync({ imports, ... })`
 * uses) and has no simpler alternative given `DomainEventRegistry` is always app-constructed.
 *
 * Usage (wherever the app composes `DomainEventsModule` today, e.g. `app.module.ts`):
 * ```ts
 * imports: [DomainEventsModule, DomainEventsAdminModule.forRoot(DomainEventsModule)],
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic modules require a class reference (the `module` property of the returned DynamicModule) — mirrors ConfigModule/TypeOrmModule's own forRoot() shape.
export class DomainEventsAdminModule {
  static forRoot(registryModule: ModuleImport): DynamicModule {
    return {
      module: DomainEventsAdminModule,
      // JwtOrApiKeyGuard (@UseGuards() on the controller) is itself a provider owned by
      // ApiKeysModule, and Nest resolves an enhancer referenced by class through the module
      // that declares it — so JwtOrApiKeyGuard's OWN constructor deps (ApiKeyGuard from
      // ApiKeysModule, JwtAuthGuard from AuthModule) must be visible to ApiKeysModule's
      // resolution, not just to DomainEventsAdminModule. @Global() only helps a *consuming*
      // module inject another global module's exports — it does not make ApiKeysModule itself
      // able to see AuthModule's exports, since ApiKeysModule never imports AuthModule on its
      // own. Importing both here (redundant with the app's own top-level imports, but the
      // Nest DI container treats a module class as a singleton regardless of how many places
      // list it) is what actually fixes it — found via a real Nest bootstrap failure, not
      // caught by unit tests that never construct an application.
      imports: [registryModule, ApiKeysModule, AuthModule],
      controllers: [DomainEventsAdminController],
      providers: [DomainEventsAdminService],
    };
  }
}
