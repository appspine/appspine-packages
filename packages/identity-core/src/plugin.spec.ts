import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import {
  bootHarness,
  buildManifest,
  expectBootOutcome,
  expectCatalogStatus,
  expectResolutionError,
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
  paginationQuerySchema: {},
  ZodValidationPipe: class {},
}));

import {
  IDENTITY_CORE_SCHEMA_DIGEST,
  identityCore,
  identityCoreManifest,
  identityCorePlugin,
} from './plugin';

const packageRoot = process.cwd();

/**
 * The source-text bans below must match *code*, not prose. `users.service.ts` documents the split
 * by naming the `prisma.role.findUnique(...)` call it no longer makes, and a raw-text scan reads
 * that explanation as the violation it warns about. Strip comments first, so the only way to
 * satisfy the ban is to not do the thing — not to delete the doc that explains the boundary.
 */
/** Every shipped `.ts` under `src`, excluding tests — the files a consumer actually installs. */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    if (!entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name)) return [];
    return [full];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;
const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

/** What every App supplies plus the two host-owned capabilities the host injects for itself. */
const HOST = {
  'appspine.prisma': {},
  'appspine.principal-context': {},
  'appspine.authentication-strategy-registry': {},
};

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(identityCoreManifest);
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
    expect(result.value.manifest.provides).toEqual(['appspine.identity-store']);
  });

  it('records a schema digest that still matches the shipped Prisma fragment', () => {
    const fragment = readFileSync(path.join(packageRoot, 'prisma/user.prisma'), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    expect(`sha256:${createHash('sha256').update(fragment, 'utf8').digest('hex')}`).toBe(
      IDENTITY_CORE_SCHEMA_DIGEST,
    );
  });

  it('owns User without declaring the relations optional plugins contribute', () => {
    const fragment = readFileSync(path.join(packageRoot, 'prisma/user.prisma'), 'utf8');
    expect(fragment).toContain('model User {');
    // PL0-04 §2: identity-core must not reverse-depend on RBAC, API keys, or notifications. These fields come back
    // as Prisma augmentations from the plugins that own them.
    expect(fragment).not.toMatch(/userRoles\s+UserRole\[]/);
    expect(fragment).not.toMatch(/actingApiKeys\s+ApiKey\[]/);
    expect(fragment).not.toMatch(/notifications\s+Notification\[]/);
    // ...and the manifest says who will add them, so the composer has something to check against.
    expect((identityCoreManifest.facets.prisma as { augmentedBy: unknown[] }).augmentedBy).toEqual([
      { plugin: 'rbac', field: 'userRoles' },
      { plugin: 'm2m-api-key', field: 'actingApiKeys' },
      { plugin: 'notification', field: 'notifications' },
    ]);
  });

  it('keeps the password column but never reads it (PL0-04 §2: Phase 1 must not drop it)', () => {
    const fragment = readFileSync(path.join(packageRoot, 'prisma/user.prisma'), 'utf8');
    expect(fragment).toMatch(/password\s+String\?/);

    // Every shipped source file, not a hand-maintained list of four: Gate G1's review pointed out
    // that `identity-core.module.ts`, `index.ts` and `constants.ts` were outside the ban, so a
    // password read or an RBAC query added there would have gone unnoticed.
    const byFile = new Map(
      listSourceFiles(path.join(packageRoot, 'src')).map((file) => [
        path.relative(packageRoot, file).split(path.sep).join('/'),
        stripComments(readFileSync(file, 'utf8')),
      ]),
    );
    const sources = [...byFile.values()].join('\n');

    // The column is carried, not used: no comparison, no hashing, no selection of the hash.
    expect(sources).not.toMatch(/bcrypt|compare\(|hash\(/);

    // Exactly one file may even name the field, and only to reject it. Gate G1's review (S4)
    // caught the first attempt at this boundary: dropping `password` from the zod schema made a
    // caller's credential silently disappear, because zod strips unknown keys. Rejecting is loud;
    // stripping is not. Every *other* file must still be unable to mention it at all.
    for (const [file, source] of byFile) {
      if (file === 'src/users/dto/user.dto.ts') continue;
      expect(source, `${file} must not mention password`).not.toMatch(/password/);
    }
    expect(byFile.size).toBeGreaterThan(4);
    // In the one file that may, it appears exactly once as a key — declared to be rejected, never
    // read, assigned or persisted. (The rejection message names it too; that is prose, not a field.)
    const dto = byFile.get('src/users/dto/user.dto.ts') ?? '';
    expect(dto.match(/^\s*password:/gm)).toHaveLength(1);
    expect(dto).toMatch(/password:\s*z\s*$/m);
    // RBAC's augmentation must remain absent from identity's Prisma reads and writes too.
    // `plugin.ts` is the one exception: its manifest *declares* which plugin contributes the
    // `userRoles` field, which is the opposite of reading it.
    for (const [file, source] of byFile) {
      if (file === 'src/plugin.ts') continue;
      expect(source, `${file} must not touch RBAC's tables`).not.toMatch(
        /userRoles|prisma\.role|prisma\.userRole/,
      );
    }
    // Even there it may only *declare* the augmentation, never query it.
    expect(byFile.get('src/plugin.ts')).not.toMatch(/prisma\.role|prisma\.userRole/);
  });

  it('declares audit as optional, not required', () => {
    expect(identityCoreManifest.optionalRequires).toEqual(['appspine.audit-sink']);
    expect(identityCoreManifest.requires).not.toContain('appspine.audit-sink');
  });
});

describe('resolution', () => {
  it('resolves against a host that supplies Prisma and the principal context', () => {
    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: identityCorePlugin }],
        inventory: [inventoryEntry('identity-core')],
        hostCapabilities: HOST,
      }),
    );
    expect(graph.providers['appspine.identity-store']).toEqual(['identity-core']);
  });

  it('runs without audit-sink, reporting the unresolved optional capability rather than hiding it', async () => {
    const { catalog } = await bootHarness({
      plugins: [{ plugin: identityCorePlugin }],
      inventory: [inventoryEntry('identity-core')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expectCatalogStatus(catalog, { 'identity-core': 'ready' });
    expect(catalog.byKey['identity-core'].unresolvedOptional).toEqual(['appspine.audit-sink']);
  });

  it('registers as a dependency of anything that needs identity', () => {
    const consumer = buildManifest({
      id: 'oidc-auth',
      provides: ['appspine.interactive-auth-provider'],
      requires: ['appspine.identity-store'],
      conflicts: ['local-auth'],
    });

    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [{ plugin: identityCorePlugin }, { plugin: { manifest: consumer } }],
        inventory: [inventoryEntry('oidc-auth'), inventoryEntry('identity-core')],
        hostCapabilities: HOST,
      }),
    );

    expect(graph.order).toEqual(['identity-core', 'oidc-auth']);
    expect(graph.instances[1].dependsOn).toEqual(['identity-core']);
  });

  it('fails without the host principal context it requires', () => {
    const result = resolveHarness({
      plugins: [{ plugin: identityCorePlugin }],
      inventory: [inventoryEntry('identity-core')],
      hostCapabilities: { 'appspine.prisma': {} },
    });
    expectResolutionError(result, 'missing-required-capability');
  });
});

describe('descriptor', () => {
  it('exposes the module through both the constant and the factory', () => {
    expect(identityCore()).toBe(identityCorePlugin);
    expect(identityCorePlugin.id).toBe('identity-core');
  });
});
