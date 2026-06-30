import { AdminGuard, CurrentUser } from '@appspine/auth';
import type { PaginationQuery } from '@appspine/common';
import { paginationQuerySchema, ZodValidationPipe } from '@appspine/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import type { CreateApiKeyDto, UpdateApiKeyDto } from './dto/api-key.dto';
import { createApiKeySchema, updateApiKeySchema } from './dto/api-key.dto';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';

// API key management is ADMIN-only per user requirement.
@Controller('api-keys')
@UseGuards(JwtOrApiKeyGuard, AdminGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createApiKeySchema)) dto: CreateApiKeyDto,
    // The caller may be JWT (has email) or another API key (only `sub`); fall back accordingly.
    @CurrentUser() actor: { sub: string; email?: string },
  ) {
    return this.apiKeysService.create(dto, actor.email ?? `api-key:${actor.sub}`);
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.apiKeysService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.apiKeysService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApiKeySchema)) dto: UpdateApiKeyDto,
  ) {
    return this.apiKeysService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.apiKeysService.remove(id);
  }
}
