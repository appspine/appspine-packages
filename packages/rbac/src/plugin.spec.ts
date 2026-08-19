import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import { expectResolutionOk, inventoryEntry, resolveHarness } from '@appspine/plugin-testkit';
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
  RBAC_POLICY,
  RBAC_SCHEMA_DIGEST,
  rbacManifest,
  rbacPlugin,
  SYSTEM_ADMIN_ROLE,
  SYSTEM_USER_ROLE,
} from './plugin';
import { RbacModule } from './rbac.module';

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

  it('declares 4 major facets: backend, frontend, prisma, permissions', () => {
    const facets = rbacManifest.facets;
    expect(facets).toBeDefined();

    // Backend facet
    expect(facets?.backend?.modulePath).toBe('./dist/rbac.module.js');
    expect(facets?.backend?.exportName).toBe('RbacModule');
    expect(facets?.backend?.global).toBe(true);
    expect(facets?.backend?.controllerRoutes).toEqual(['roles']);
    expect(facets?.backend?.providerTokens).toEqual(['appspine.rbac-policy']);

    // Frontend facet
    expect(facets?.frontend?.adminPages).toHaveLength(1);
    const adminPage = facets?.frontend?.adminPages?.[0];
    expect(
      typeof adminPage === 'object' && adminPage !== null && 'id' in adminPage && adminPage.id,
    ).toBe('roles');
    const navItem = facets?.frontend?.navigationItems?.[0];
    expect(typeof navItem === 'object' && navItem !== null && 'id' in navItem && navItem.id).toBe(
      'roles',
    );
    expect(facets?.frontend?.i18nNamespace).toBe('rbac');

    // Prisma facet
    expect(facets?.prisma?.augments).toEqual([
      {
        targetModel: 'User',
        field: 'userRoles',
        owner: 'identity-core',
        type: 'UserRole[]',
      },
    ]);

    // Permissions facet
    expect(facets?.permissions?.definitions).toEqual([
      'rbac:role:create',
      'rbac:role:update',
      'rbac:role:delete',
      'rbac:role:read',
    ]);
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

  it('resolves cleanly with optional audit-sink present in host', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: rbacPlugin }],
        inventory: [inventoryEntry('rbac')],
        hostCapabilities: {
          ...HOST,
          'appspine.audit-sink': {},
        },
      }),
    );

    expect(graph.providers['appspine.rbac-policy']).toEqual(['rbac']);
  });
});

describe('descriptor', () => {
  it('exposes the backend factory returning RbacModule', () => {
    expect(rbacPlugin.manifest.id).toBe('rbac');
    expect(
      rbacPlugin.backend?.({} as unknown as import('@appspine/plugin-api').PluginRuntimeContext),
    ).toBe(RbacModule);
  });

  it('exports stable authorization tokens and system role constants', () => {
    expect(RBAC_POLICY).toBe(Symbol.for('appspine.rbac-policy'));
    expect(SYSTEM_ADMIN_ROLE).toBe('ADMIN');
    expect(SYSTEM_USER_ROLE).toBe('USER');
  });
});
