import { JwtOrApiKeyGuard, ScopeGuard, Scopes } from '@appspine/m2m-api-key';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { MetaService, type SchemaMeta } from './meta.service';

// Readable by any logged-in JWT user, or by an M2M API key with the metadata:read
// scope — external agents without repo access query this at runtime (dev_docs 001
// "Metadata Schema API").
@Controller('metadata')
@UseGuards(JwtOrApiKeyGuard, ScopeGuard)
@Scopes('metadata:read')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('schema')
  schema(): SchemaMeta {
    return this.metaService.buildMeta();
  }
}
