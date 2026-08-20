import { DOMAIN_EVENTS } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { type DynamicModule, Module, type ModuleMetadata, type Provider } from '@nestjs/common';

import { DomainEventsAdminController } from './admin/domain-events-admin.controller';
import { DomainEventsAdminService } from './admin/domain-events-admin.service';
import { DomainEventDispatcherService } from './domain-event-dispatcher.service';
import { DomainEventRegistry } from './domain-event-registry';
import { DomainEventsService } from './domain-events.service';
import { DomainEventsAdminGuard } from './guards/domain-events-admin.guard';
import { DOMAIN_EVENT_DISPATCHER_OPTIONS, type DomainEventDispatcherOptions } from './types';

type ModuleImport = NonNullable<ModuleMetadata['imports']>[number];

export interface DomainEventsModuleOptions {
  imports?: ModuleImport[];
  dispatcher?: DomainEventDispatcherOptions;
  providers?: Provider[];
}

const DOMAIN_EVENTS_PROVIDERS: Provider[] = [
  DomainEventRegistry,
  DomainEventsService,
  { provide: DOMAIN_EVENTS, useExisting: DomainEventsService },
  DomainEventsAdminService,
  DomainEventsAdminGuard,
  DomainEventDispatcherService,
];

const DOMAIN_EVENTS_EXPORTS = [
  DomainEventRegistry,
  DomainEventsService,
  DOMAIN_EVENTS,
  DomainEventsAdminService,
  DomainEventDispatcherService,
];

/**
 * Standard Capability Module for `@appspine/domain-events`.
 *
 * Provides:
 * - `DomainEventRegistry` (domain-owned event handler and subscriber registry)
 * - `DomainEventsService` and `DOMAIN_EVENTS` capability token
 * - `DomainEventsAdminService` and `DomainEventsAdminController`
 * - `DomainEventDispatcherService` (background outbox worker with lifecycle hooks)
 * - `AppspineAuthInfrastructureModule` (for strategy registry & principal context DI resolution)
 */
@Module({
  imports: [AppspineAuthInfrastructureModule],
  controllers: [DomainEventsAdminController],
  providers: [...DOMAIN_EVENTS_PROVIDERS],
  exports: [...DOMAIN_EVENTS_EXPORTS],
})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose static factory methods.
export class DomainEventsModule {
  static forRoot(options?: DomainEventsModuleOptions): DynamicModule {
    const imports: ModuleImport[] = [AppspineAuthInfrastructureModule];
    if (options?.imports) {
      imports.push(...options.imports);
    }

    const providers = [...DOMAIN_EVENTS_PROVIDERS];

    if (options?.dispatcher) {
      providers.push({
        provide: DOMAIN_EVENT_DISPATCHER_OPTIONS,
        useValue: options.dispatcher,
      });
    }

    if (options?.providers) {
      providers.push(...options.providers);
    }

    return {
      module: DomainEventsModule,
      imports,
      controllers: [DomainEventsAdminController],
      providers,
      exports: [...DOMAIN_EVENTS_EXPORTS],
    };
  }

  static register(options?: DomainEventsModuleOptions): DynamicModule {
    return DomainEventsModule.forRoot(options);
  }
}
