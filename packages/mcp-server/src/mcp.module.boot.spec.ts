import { MCP_TOOLS, SCOPE_MATCHER, type ScopeMatcherPort } from '@appspine/plugin-api';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { DiscoveryPushService } from './discovery-push.service';
import { McpController } from './mcp.controller';
import { McpModule } from './mcp.module';
import { McpService } from './mcp.service';
import { McpToolRegistry } from './mcp-tool.registry';

describe('McpModule real Nest DI boot verification', () => {
  it('successfully boots a real Nest application with McpModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [McpModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const registry = app.get(McpToolRegistry);
    const mcpToolsToken = app.get(MCP_TOOLS);
    const mcpService = app.get(McpService);
    const pushService = app.get(DiscoveryPushService);
    const controller = app.get(McpController);

    expect(registry).toBeDefined();
    expect(mcpToolsToken).toBe(registry);
    expect(mcpService).toBeDefined();
    expect(pushService).toBeDefined();
    expect(controller).toBeDefined();

    await app.close();
  }, 15000);

  it('allows a downstream feature module with an explicit McpModule import to inject McpToolRegistry', async () => {
    // Models downstream feature modules that own MCP providers after the v3 global bridge removal.
    @Injectable()
    class FeatureEventsMcp {
      constructor(@Inject(McpToolRegistry) public readonly registry: McpToolRegistry) {}
    }

    @Module({
      imports: [McpModule],
      providers: [FeatureEventsMcp],
    })
    class FeatureEventsModule {}

    @Module({
      imports: [FeatureEventsModule],
    })
    class RootAppModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [RootAppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const featureMcp = app.get(FeatureEventsMcp);
    expect(featureMcp).toBeDefined();
    expect(featureMcp.registry).toBe(app.get(McpToolRegistry));

    await app.close();
  });

  it('successfully boots a real Nest application with a host providing SCOPE_MATCHER', async () => {
    const mockScopeMatcher: ScopeMatcherPort = {
      matches: (granted, required) => granted.includes(required),
    };

    @Module({
      providers: [
        {
          provide: SCOPE_MATCHER,
          useValue: mockScopeMatcher,
        },
      ],
      exports: [SCOPE_MATCHER],
    })
    class HostScopeMatcherModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [HostScopeMatcherModule, McpModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const registry = app.get(McpToolRegistry);
    expect(registry).toBeDefined();

    // Verify injected scope matcher works through registry
    registry.registerTool({
      name: 'test_tool',
      description: 'test',
      inputSchema: {} as never,
      requiredScopes: ['custom:read'],
      handler: async () => ({}),
    });

    const matching = registry.listTools({
      scopes: ['custom:read'],
      isApiKey: true,
      roleNames: [],
      actingUserId: null,
      sub: 'key',
      workflowId: null,
    });
    expect(matching).toHaveLength(1);

    const nonMatching = registry.listTools({
      scopes: ['other:read'],
      isApiKey: true,
      roleNames: [],
      actingUserId: null,
      sub: 'key',
      workflowId: null,
    });
    expect(nonMatching).toHaveLength(0);

    await app.close();
  });
});
