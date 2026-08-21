import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AUDIT_SINK, type AuditSinkPort } from '@appspine/plugin-api';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import {
  bootHarness,
  expectBootOutcome,
  expectCatalogStatus,
  expectRedacted,
  expectResolutionError,
  expectResolutionOk,
  inventoryEntry,
  resolveHarness,
} from '@appspine/plugin-testkit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  PrismaService: class PrismaService {},
  AuditAction: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

import { AuditLogModule } from './audit-log.module';
import { AuditLogService } from './audit-log.service';
import { AUDIT_LOG_SCHEMA_DIGEST, auditLog, auditLogManifest, auditLogPlugin } from './plugin';

const packageRoot = process.cwd();
const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;
const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = { 'appspine.prisma': {} };

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(auditLogManifest);
    expect(auditLogManifest.facets.backend?.global).toBeUndefined();
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
    expect(result.value.manifest.provides).toEqual(['appspine.audit-sink']);
  });

  it('records a schema digest that still matches the shipped Prisma fragment', () => {
    // A drifted fragment with a stale digest is exactly the failure PL2-06's composer will rely on
    // catching, so the digest has to be checked here rather than assumed.
    const fragment = readFileSync(
      path.join(packageRoot, 'prisma/audit-log.prisma'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const digest = `sha256:${createHash('sha256').update(fragment, 'utf8').digest('hex')}`;
    expect(digest).toBe(AUDIT_LOG_SCHEMA_DIGEST);
    expect((auditLogManifest.facets.prisma as { schemaDigest: string }).schemaDigest).toBe(digest);
  });

  it('declares the models and enum it actually owns', () => {
    const fragment = readFileSync(path.join(packageRoot, 'prisma/audit-log.prisma'), 'utf8');
    const prisma = auditLogManifest.facets.prisma as { owns: string[]; ownsEnums: string[] };
    for (const model of prisma.owns) expect(fragment).toContain(`model ${model} {`);
    for (const enumName of prisma.ownsEnums) expect(fragment).toContain(`enum ${enumName} {`);
  });

  it('ships the Prisma fragment and the plugin subpath', () => {
    expect(packageJson.files).toContain('prisma');
    expect((packageJson.exports as Record<string, unknown>)['./plugin']).toBeDefined();
    expect(
      (packageJson.exports as Record<string, unknown>)['./prisma/audit-log.prisma'],
    ).toBeDefined();
  });
});

describe('audit token inversion', () => {
  it('binds AUDIT_SINK to the same instance as the concrete service', () => {
    const providers = Reflect.getMetadata('providers', AuditLogModule) as unknown[];
    const exports = Reflect.getMetadata('exports', AuditLogModule) as unknown[];

    expect(providers).toContainEqual({ provide: AUDIT_SINK, useExisting: AuditLogService });
    expect(exports).toContain(AUDIT_SINK);
    // Concrete imports remain supported when the consumer explicitly imports this module.
    expect(exports).toContain(AuditLogService);
  });

  it('satisfies the AuditSinkPort contract structurally', async () => {
    const created: unknown[] = [];
    const prisma = { auditLog: { create: async (args: unknown) => void created.push(args) } };
    const sink: AuditSinkPort = new AuditLogService(prisma as never);

    await sink.record({
      entityType: 'User',
      entityId: 'u1',
      action: 'CREATE',
      actorId: 'u1',
      actorEmail: 'a@b.c',
      appName: 'test',
    });

    expect(created).toHaveLength(1);
  });

  it('contributes the very same Nest module the package root exports', () => {
    const produced = auditLogPlugin.backend?.({
      pluginId: 'audit-log',
      instanceId: 'default',
      key: 'audit-log',
      config: {},
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      capabilities: {
        get: () => undefined as never,
        getOptional: () => undefined,
        has: () => false,
      },
    });
    expect(produced).toBe(AuditLogModule);
    expect(auditLog()).toBe(auditLogPlugin);
  });
});

describe('resolution behaviour', () => {
  it('resolves on its own and advertises the audit sink', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: auditLogPlugin }],
        inventory: [inventoryEntry('audit-log')],
        hostCapabilities: HOST,
      }),
    );
    expect(graph.providers['appspine.audit-sink']).toEqual(['audit-log']);
  });

  it('fails when the App provides no database capability', () => {
    const result = resolveHarness({
      plugins: [{ plugin: auditLogPlugin }],
      inventory: [inventoryEntry('audit-log')],
      hostCapabilities: {},
    });
    expect(expectResolutionError(result, 'missing-required-capability').pluginId).toBe('audit-log');
  });

  it('boots ready and leaks nothing sensitive into the catalog', async () => {
    const { catalog } = await bootHarness({
      plugins: [{ plugin: auditLogPlugin, packageVersion: packageJson.version as string }],
      inventory: [inventoryEntry('audit-log')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, { 'audit-log': 'ready' });
    expectRedacted(catalog.entries, 'sha256:deadbeef');
    expect(catalog.byKey['audit-log'].provides).toEqual(['appspine.audit-sink']);
  });
});

describe('audit failure semantics', () => {
  it('propagates a write failure rather than swallowing it', async () => {
    const prisma = {
      auditLog: {
        create: async () => {
          throw new Error('database unavailable');
        },
      },
    };
    const sink: AuditSinkPort = new AuditLogService(prisma as never);

    await expect(
      sink.record({
        entityType: 'User',
        entityId: 'u1',
        action: 'CREATE',
        actorId: 'u1',
        actorEmail: 'a@b.c',
        appName: 'test',
      }),
    ).rejects.toThrow(/database unavailable/);
  });
});
