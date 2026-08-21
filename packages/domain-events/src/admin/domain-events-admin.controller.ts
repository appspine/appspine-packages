import { ZodValidationPipe } from '@appspine/common';
import { AppspineAuthGuard, CurrentUser } from '@appspine/plugin-host-nest';
import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DomainEventsAdminGuard, Scopes } from '../guards/domain-events-admin.guard';
import { DomainEventsAdminService } from './domain-events-admin.service';
import {
  type DomainEventAdminListQuery,
  domainEventAdminListQuerySchema,
} from './dto/domain-event-admin.dto';
import type { DomainEventsAdminActor } from './types';

// The shared frontend mounts this under admin navigation, so the backend enforces the same
// contract: callers must be ADMIN, and API-key callers must also hold the matching scope.
@Controller('domain-events')
@UseGuards(AppspineAuthGuard, DomainEventsAdminGuard)
export class DomainEventsAdminController {
  constructor(
    @Inject(DomainEventsAdminService) private readonly service: DomainEventsAdminService,
  ) {}

  // MUST stay declared before findOne()'s `:id` route. Express/Nest resolve routes on the same
  // verb+prefix in declaration order, so `GET /domain-events/catalog` would otherwise be swallowed
  // by `:id`.
  @Get('catalog')
  @Scopes('domain-events:read')
  getCatalog() {
    return this.service.getCatalog();
  }

  @Get()
  @Scopes('domain-events:read')
  findAll(
    @Query(new ZodValidationPipe(domainEventAdminListQuerySchema)) query: DomainEventAdminListQuery,
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Scopes('domain-events:read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('deliveries/:id/retry')
  @Scopes('domain-events:write')
  retryDelivery(@Param('id') id: string, @CurrentUser() actor: DomainEventsAdminActor) {
    return this.service.retryDelivery(id, actor);
  }

  @Post('deliveries/:id/ignore')
  @Scopes('domain-events:write')
  ignoreDelivery(@Param('id') id: string, @CurrentUser() actor: DomainEventsAdminActor) {
    return this.service.ignoreDelivery(id, actor);
  }
}
