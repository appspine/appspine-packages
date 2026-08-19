import { MCP_TOOLS } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Global, Module } from '@nestjs/common';
import { DiscoveryPushService } from './discovery-push.service';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';

/**
 * Model Context Protocol Server capability module (051 PL4-06).
 *
 * In Phase 4 transition, `@Global()` is retained (and declared as `facets.backend.global: true` in
 * the manifest) so downstream applications whose feature modules (`*.mcp.ts`) inject `McpToolRegistry`
 * continue booting without immediate feature-level import changes. True removal of `@Global()` is
 * scheduled for Phase 5 when consumer apps are migrated to explicit module imports / generated composition.
 */
@Global()
@Module({
  imports: [AppspineAuthInfrastructureModule],
  controllers: [McpController],
  providers: [
    McpService,
    McpToolRegistry,
    DiscoveryPushService,
    { provide: MCP_TOOLS, useExisting: McpToolRegistry },
  ],
  exports: [McpService, McpToolRegistry, DiscoveryPushService, MCP_TOOLS],
})
export class McpModule {}
