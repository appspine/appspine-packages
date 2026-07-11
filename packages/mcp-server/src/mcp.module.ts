import { Global, Module } from '@nestjs/common';
import { DiscoveryPushService } from './discovery-push.service';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';

@Global()
@Module({
  providers: [McpToolRegistry, McpService, DiscoveryPushService],
  controllers: [McpController],
  exports: [McpToolRegistry],
})
export class McpModule {}
