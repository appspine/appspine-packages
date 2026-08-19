import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import {
  expectResolutionOk,
  inventoryEntry,
  resolveHarness,
} from '@appspine/plugin-testkit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  PrismaService: class PrismaService {},
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  paginate: () => ({}),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  AuditAction: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  PermissionPolicy: { DENY_ALL: 'DENY_ALL', READ_ALL: 'READ_ALL', ALLOW_ALL: 'ALLOW_ALL' },
  paginationQuerySchema: {},
  ZodValidationPipe: class {},
}));

import {
  RBAC_SCHEMA_DIGEST,
  rbacManifest,
  rbacPlugin,
} from './plugin';

const packageRoot = process.cwd();

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = {
  'appspine.identity-store': {},
  'appspine.prisma': {},
  'appspine.principal-context': {},
};

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(rbacManifest);
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
    expect(result.value.manifest.provides).toEqual(['appspine.rbac-policy']);
  });

  it('records a schema digest that matches the shipped Prisma fragment', () => {
    const raw = readFileSync(path.join(packageRoot, 'prisma', 'role.prisma'), 'utf8');
    const normalized = raw.replace(/\r\n/g, '\n');
    const computed = `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
    expect(computed).toBe(RBAC_SCHEMA_DIGEST);
    expect(rbacManifest.facets?.prisma?.schemaDigest).toBe(computed);
  });
});

describe('resolution', () => {
  it('resolves against a host that supplies identity-store, prisma, and principal-context', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: rbacPlugin }],
        inventory: [inventoryEntry('rbac')],
        hostCapabilities: HOST,
      }),
    );

    expect(graph.providers['appspine.rbac-policy']).toEqual(['rbac']);
  });
});

describe('descriptor', () => {
  it('exposes the backend factory returning RbacModule', () => {
    expect(rbacPlugin.manifest.id).toBe('rbac');
    expect(rbacPlugin.backend?.()).toBeDefined();
  });
});
