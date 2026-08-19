import { AppspineAuthGuard } from '@appspine/plugin-host-nest';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { MetaService, type SchemaMeta } from './meta.service';
import { MetadataScopeGuard } from './meta-scope.guard';

// Readable by any logged-in interactive (JWT) user, or by an M2M API key with the metadata:read
// scope — external agents without repo access query this at runtime (dev_docs 001
// "Metadata Schema API").
@Controller('metadata')
@UseGuards(AppspineAuthGuard, MetadataScopeGuard)
export class MetaController {
  constructor(@Inject(MetaService) private readonly metaService: MetaService) {}

  @Get('schema')
  schema(): SchemaMeta {
    return this.metaService.buildMeta();
  }
}
