import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PluginCatalogController } from './plugin-catalog.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, PluginCatalogController],
})
export class HealthModule {}
