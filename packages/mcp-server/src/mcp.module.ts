import { MCP_TOOLS } from '@appspine/plugin-api';
import { AppspineAuthInfrastructureModule } from '@appspine/plugin-host-nest';
import { Module } from '@nestjs/common';
import { DiscoveryPushService } from './discovery-push.service';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';

/**
 * Model Context Protocol Server capability module (051 PL4-06).
 *
 * The module is deliberately scoped. Feature modules that inject `McpToolRegistry` must import it
 * explicitly or import a generated plugin composition module that exports it.
 */
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
