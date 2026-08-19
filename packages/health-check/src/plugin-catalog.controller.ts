import {
  AppspinePluginHost,
  InteractiveAuthGuard,
  SystemAdminGuard,
} from '@appspine/plugin-host-nest';
import { Controller, Get, Optional, UseGuards } from '@nestjs/common';

/**
 * Controller exposing the plugin catalog and runtime diagnostics to administrators.
 *
 * Protected with InteractiveAuthGuard and SystemAdminGuard so non-administrators
 * receive 403 Forbidden.
 */
@Controller('admin/plugins')
@UseGuards(InteractiveAuthGuard, SystemAdminGuard)
export class PluginCatalogController {
  constructor(@Optional() private readonly host?: AppspinePluginHost) {}

  @Get()
  getCatalog() {
    if (!this.host) {
      return {
        outcome: 'ready',
        order: [],
        shutdownOrder: [],
        resolutionDigest: '',
        plugins: [],
        authenticationStrategies: [],
        hostCapabilities: [],
      };
    }
    return this.host.describe();
  }
}
