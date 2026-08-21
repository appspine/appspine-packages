import { METADATA_SCHEMA } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';
import { MetadataScopeGuard } from './meta-scope.guard';

/**
 * Provides the metadata schema introspection service both as a concrete class and behind
 * the stable `METADATA_SCHEMA` capability token (PL4-04).
 */
@Module({
  imports: [AppspineAuthInfrastructureModule],
  controllers: [MetaController],
  providers: [
    MetaService,
    MetadataScopeGuard,
    { provide: METADATA_SCHEMA, useExisting: MetaService },
  ],
  exports: [MetaService, METADATA_SCHEMA, MetadataScopeGuard],
})
export class MetaModule {}
