import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';

import { DomainEventsAdminGuard } from '../guards/domain-events-admin.guard';
import { DomainEventsAdminController } from './domain-events-admin.controller';
import { DomainEventsAdminService } from './domain-events-admin.service';

type ModuleImport = NonNullable<ModuleMetadata['imports']>[number];

const ADMIN_CONTROLLERS = [DomainEventsAdminController];
const ADMIN_PROVIDERS = [DomainEventsAdminService, DomainEventsAdminGuard];
const ADMIN_EXPORTS = [DomainEventsAdminService];

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
  controllers: [...ADMIN_CONTROLLERS],
  providers: [...ADMIN_PROVIDERS],
  exports: [...ADMIN_EXPORTS],
})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose static factory methods.
export class DomainEventsAdminModule {
  static forRoot(registryModule?: ModuleImport): DynamicModule {
    const imports: ModuleImport[] = [AppspineAuthInfrastructureModule];
    if (registryModule) {
      imports.push(registryModule);
    }
    return {
      module: DomainEventsAdminModule,
      imports,
      controllers: [...ADMIN_CONTROLLERS],
      providers: [...ADMIN_PROVIDERS],
      exports: [...ADMIN_EXPORTS],
    };
  }
}
