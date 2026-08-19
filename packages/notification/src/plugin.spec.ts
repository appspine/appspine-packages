import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import { expectResolutionOk, inventoryEntry, resolveHarness } from '@appspine/plugin-testkit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  PrismaService: class PrismaService {},
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));

import {
  NOTIFICATION_SCHEMA_DIGEST,
  notificationManifest,
  notificationPlugin,
  registerNotificationCleanup,
} from './plugin';

const packageRoot = process.cwd();

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = {
  'appspine.prisma': {},
  'appspine.principal-context': {},
};

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(notificationManifest);
  });

  it('passes the real loader with a strict capability registry', () => {
    const result = parsePluginManifest(manifestFile, {
      packageName: packageJson.name as string,
      packageVersion: packageJson.version as string,
      host: defaultHostEngine({
        frameworks: {
          '@nestjs/common': '11.1.0',
          '@nestjs/core': '11.1.0',
          '@prisma/client': '6.2.0',
        },
      }),
      strictCapabilityRegistry: true,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.manifest.provides).toEqual(['appspine.notification-inbox']);
  });

  it('records a schema digest that matches the shipped prisma fragment', () => {
    const fragment = readFileSync(
      path.join(packageRoot, 'prisma/notification.prisma'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const calculated = `sha256:${createHash('sha256').update(fragment, 'utf8').digest('hex')}`;
    expect(calculated).toBe(NOTIFICATION_SCHEMA_DIGEST);
    expect(notificationManifest.facets.prisma?.schemaDigest).toBe(NOTIFICATION_SCHEMA_DIGEST);
  });

  it('declares all 5 facets: backend, prisma, operations, frontend, permissions', () => {
    expect(notificationManifest.facets.backend).toBeDefined();
    expect(notificationManifest.facets.prisma).toBeDefined();
    expect(notificationManifest.facets.operations).toBeDefined();
    expect(notificationManifest.facets.frontend).toBeDefined();
    expect(notificationManifest.facets.permissions).toBeDefined();

    expect(notificationManifest.facets.backend?.exportName).toBe('NotificationModule');
    expect(notificationManifest.facets.operations?.healthIndicatorId).toBe('notification');
    expect(notificationManifest.facets.operations?.metricsPrefix).toBe('notification');
  });

  it('declares User augmentation for notifications relation', () => {
    const prismaFacet = notificationManifest.facets.prisma as {
      owns: string[];
      augments: Array<{ targetModel: string; field: string; owner: string }>;
    };
    expect(prismaFacet.owns).toEqual(['Notification']);
    expect(prismaFacet.augments).toEqual([
      {
        targetModel: 'User',
        field: 'notifications',
        owner: 'identity-core',
        type: 'Notification[] @relation("NotificationRecipient")',
      },
    ]);
  });
});

describe('resolution', () => {
  it('resolves against a host that supplies prisma and principal-context', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: notificationPlugin }],
        inventory: [inventoryEntry('notification')],
        hostCapabilities: HOST,
      }),
    );

    expect(graph.providers['appspine.notification-inbox']).toEqual(['notification']);
  });
});

describe('lifecycle', () => {
  const dummyContext = (
    capabilities: Record<string, boolean> = {
      'appspine.prisma': true,
      'appspine.principal-context': true,
    },
  ) => ({
    pluginId: 'notification',
    instanceId: 'default',
    key: 'notification#default',
    config: {},
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    capabilities: {
      get: <T>(_name: string): T => ({}) as T,
      getOptional: <T>(_name: string): T | undefined => ({}) as T,
      has: (name: string) => capabilities[name] ?? false,
    },
  });

  it('runs lifecycle: validate -> register -> ready -> shutdown', async () => {
    const context = dummyContext();
    const lifecycle = notificationPlugin.lifecycle;
    expect(lifecycle).toBeDefined();

    // 1. validate
    expect(() => lifecycle?.validate?.(context)).not.toThrow();

    // 2. register
    await lifecycle?.register?.(context);
    expect(context.logger.info).toHaveBeenCalledWith('notification plugin registered');

    // 3. ready
    await lifecycle?.ready?.(context);
    expect(context.logger.info).toHaveBeenCalledWith('notification plugin ready');

    // 4. register a mock resource cleanup
    const cleanupSpy = vi.fn();
    registerNotificationCleanup(cleanupSpy);

    // 5. shutdown
    await lifecycle?.shutdown?.(context);
    expect(context.logger.info).toHaveBeenCalledWith(
      'notification plugin shutting down, cleaning up active resources',
    );
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });

  it('fails validate if required appspine.prisma capability is missing', () => {
    const context = dummyContext({ 'appspine.prisma': false });
    expect(() => notificationPlugin.lifecycle?.validate?.(context)).toThrow(
      'notification plugin requires "appspine.prisma" capability',
    );
  });
});

describe('descriptor and backend factory', () => {
  it('exposes backend module factory that returns NotificationModule', async () => {
    const context = {
      pluginId: 'notification',
      instanceId: 'default',
      key: 'notification#default',
      config: {},
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      capabilities: { get: vi.fn(), getOptional: vi.fn(), has: vi.fn() },
    };
    const mod = await notificationPlugin.backend?.(context);
    expect(mod).toBeDefined();
  });
});
