import { InteractiveAuthGuard, SystemAdminGuard } from '@appspine/plugin-host-nest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { PluginCatalogController } from './plugin-catalog.controller';

describe('PluginCatalogController', () => {
  it('guards the controller with InteractiveAuthGuard and SystemAdminGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PluginCatalogController) as unknown[];

    expect(guards).toBeDefined();
    expect(guards).toContain(InteractiveAuthGuard);
    expect(guards).toContain(SystemAdminGuard);
  });

  it('delegates to AppspinePluginHost.describe() to return redacted catalog', () => {
    const mockDescribe = {
      outcome: 'ready' as const,
      order: ['identity-core', 'health-check'],
      shutdownOrder: ['health-check', 'identity-core'],
      resolutionDigest: 'sha256:testdigest',
      authenticationStrategies: [],
      hostCapabilities: ['appspine.prisma'],
      plugins: [
        {
          key: 'identity-core',
          pluginId: 'identity-core',
          instanceId: 'default',
          package: '@appspine/identity-core@1.0.0',
          digest: 'sha256:abc',
          status: 'ready' as const,
          required: true,
          provides: ['appspine.identity-store'],
          requires: ['appspine.prisma'],
          unresolvedOptional: [],
          startupMs: 15,
          config: {
            clientId: 'test-app',
            clientSecret: '[REDACTED]',
          },
        },
      ],
      disabled: [],
    };

    const mockHost = {
      describe: () => mockDescribe,
    };

    const controller = new PluginCatalogController(mockHost as never);
    const result = controller.getCatalog();

    expect(result).toEqual(mockDescribe);
    expect((result.plugins[0].config as { clientSecret: string }).clientSecret).toBe('[REDACTED]');
  });

  it('returns fallback empty catalog when host is not injected', () => {
    const controller = new PluginCatalogController();
    const result = controller.getCatalog();
    expect(result.outcome).toBe('ready');
    expect(result.plugins).toEqual([]);
  });
});
