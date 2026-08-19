import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';

import { DomainEventsAdminGuard } from '../guards/domain-events-admin.guard';
import { DomainEventsAdminController } from './domain-events-admin.controller';
import { DomainEventsAdminService } from './domain-events-admin.service';

type ModuleImport = NonNullable<ModuleMetadata['imports']>[number];

/**
 * Backward-compatible Admin Module for `@appspine/domain-events`.
 *
 * Usage:
 * ```ts
 * imports: [DomainEventsModule, DomainEventsAdminModule.forRoot(DomainEventsModule)],
 * ```
 * or standalone:
 * ```ts
 * imports: [DomainEventsAdminModule],
 * ```
 */
@Module({
  imports: [AppspineAuthInfrastructureModule],
  controllers: [DomainEventsAdminController],
  providers: [DomainEventsAdminService, DomainEventsAdminGuard],
  exports: [DomainEventsAdminService],
})
export class DomainEventsAdminModule {
  static forRoot(registryModule?: ModuleImport): DynamicModule {
    const imports: ModuleImport[] = [AppspineAuthInfrastructureModule];
    if (registryModule) {
      imports.push(registryModule);
    }
    return {
      module: DomainEventsAdminModule,
      imports,
      controllers: [DomainEventsAdminController],
      providers: [DomainEventsAdminService, DomainEventsAdminGuard],
      exports: [DomainEventsAdminService],
    };
  }
}
