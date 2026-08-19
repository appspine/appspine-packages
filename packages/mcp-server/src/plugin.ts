/**
 * `@appspine/mcp-server/plugin` — manifest and plugin descriptor (PL4-06).
 */

import {
  definePlugin,
  MCP_TOOLS,
  type McpToolsPort,
  type PluginManifestV1,
} from '@appspine/plugin-api';
import { McpModule } from './mcp.module';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';

export { MCP_TOOLS, McpModule, McpService, McpToolRegistry, type McpToolsPort };

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const mcpServerManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'mcp-server',
  displayName: 'Model Context Protocol Server',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
      '@prisma/client': '^6.2.0',
      express: '^5.0.0',
      zod: '^4.4.3',
    },
  },
  provides: ['appspine.mcp-tools'],
  requires: ['appspine.principal-context'],
  optionalRequires: [
    'appspine.audit-sink',
    'appspine.machine-auth-provider',
    'appspine.scope-matcher',
  ],
  facets: {
    backend: {
      modulePath: './dist/mcp.module.js',
      exportName: 'McpModule',
      global: true,
      controllerRoutes: ['mcp'],
      providerTokens: ['appspine.mcp-tools'],
    },
    operations: {
      healthIndicatorId: 'mcp-server',
      shutdownTimeoutMs: 5000,
    },
  },
};

export const mcpServerPlugin = definePlugin({
  manifest: mcpServerManifest,
  backend: () => McpModule,
});

export function mcpServer() {
  return mcpServerPlugin;
}

export default mcpServerPlugin;
