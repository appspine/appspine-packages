import { Global, Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';

@Global()
@Module({
  providers: [McpToolRegistry, McpService],
  controllers: [McpController],
  exports: [McpToolRegistry],
})
export class McpModule {}
