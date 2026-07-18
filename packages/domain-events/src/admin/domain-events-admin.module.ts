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
      // ApiKeysModule/AuthModule are both @Global() (their exports, e.g. ApiKeyGuard/JwtAuthGuard,
      // are visible everywhere once registered anywhere in the app) — but a dynamically-built
      // module's own controller still needs its guard classes' constructor deps resolvable within
      // ITS OWN module scope, so ApiKeysModule is imported explicitly here too (redundant with the
      // app's own top-level import, but harmless — Nest modules are singletons in the container).
      imports: [registryModule, ApiKeysModule],
      controllers: [DomainEventsAdminController],
      providers: [DomainEventsAdminService],
    };
  }
}
