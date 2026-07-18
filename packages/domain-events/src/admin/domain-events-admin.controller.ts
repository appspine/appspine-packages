import { ZodValidationPipe } from '@appspine/common';
import { JwtOrApiKeyGuard, ScopeGuard, Scopes } from '@appspine/m2m-api-key';
import { PermissionGuard, RequirePermissions } from '@appspine/rbac';
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { DomainEventsAdminService } from './domain-events-admin.service';
import {
  type DomainEventAdminListQuery,
  domainEventAdminListQuerySchema,
} from './dto/domain-event-admin.dto';

// Guard chain + string permission/scope literals mirror @appspine/metadata-schema's MetaController
// precedent (dev_docs 028 §2 decision 3) — RequirePermissions accepts plain strings, so no app
// Permission enum value is required for the default ADMIN-only behavior to apply.
@Controller('domain-events')
@UseGuards(JwtOrApiKeyGuard, PermissionGuard, ScopeGuard)
export class DomainEventsAdminController {
  constructor(private readonly service: DomainEventsAdminService) {}

  // MUST stay declared before findOne()'s `:id` route — Express/Nest resolve routes on the same
  // verb+prefix in declaration order, so `GET /domain-events/catalog` would otherwise be swallowed
  // by `:id` (the same class of bug T-10920 hit in the webhooks controller; see the route-order
  // regression test in the spec file for this controller).
  @Get('catalog')
  @RequirePermissions('DOMAIN_EVENTS_READ')
  @Scopes('domain-events:read')
  getCatalog() {
    return this.service.getCatalog();
  }

  @Get()
  @RequirePermissions('DOMAIN_EVENTS_READ')
  @Scopes('domain-events:read')
  findAll(
    @Query(new ZodValidationPipe(domainEventAdminListQuerySchema)) query: DomainEventAdminListQuery,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('DOMAIN_EVENTS_READ')
  @Scopes('domain-events:read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('deliveries/:id/retry')
  @RequirePermissions('DOMAIN_EVENTS_WRITE')
  @Scopes('domain-events:write')
  retryDelivery(@Param('id') id: string) {
    return this.service.retryDelivery(id);
  }

  @Post('deliveries/:id/ignore')
  @RequirePermissions('DOMAIN_EVENTS_WRITE')
  @Scopes('domain-events:write')
  ignoreDelivery(@Param('id') id: string) {
    return this.service.ignoreDelivery(id);
  }
}
