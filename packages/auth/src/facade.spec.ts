import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Keeps `@prisma/client` (no generated client in this workspace) out of the module graph. Every
// re-exported package reaches it through this same module id, so one stub covers them all.
vi.mock('@appspine/common', () => ({
  PrismaService: class PrismaService {},
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  PermissionPolicy: { DENY_ALL: 'DENY_ALL', READ_ALL: 'READ_ALL', ALLOW_ALL: 'ALLOW_ALL' },
  AuditAction: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  paginate: () => ({}),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  paginationQuerySchema: {},
  ZodValidationPipe: class {},
}));

import * as facade from './index';

/**
 * PL1-13's acceptance condition is that every export in the pre-split public API is still present
 * or has an explicit migration conclusion. This list is the *runtime* half of that surface, taken
 * from the 14 `export *` statements `packages/auth/src/index.ts` carried before the split
 * (PL0-04 §3). Type-only exports cannot be asserted at runtime — the compiler enforces those,
 * since this file's own imports would fail to typecheck if one went missing.
 */
const LEGACY_VALUE_EXPORTS = [
  // ./auth.controller, ./auth.module
  'AuthController',
  'AuthModule',
  // ./constants
  'SYSTEM_ADMIN_ROLE',
  'SYSTEM_USER_ROLE',
  // ./decorators/current-user.decorator
  'CurrentUser',
  // ./delegated
  'CurrentDelegatedUser',
  'DELEGATED_AUTH_PROFILES',
  'DELEGATED_PROFILE_KEY',
  'DelegatedAuthGuard',
  'DelegatedAuthModule',
  'DelegatedIdentityMappingError',
  'DelegatedJwtVerifierService',
  'DelegatedPrincipalMapperService',
  'DelegatedProfile',
  // ./guards/*
  'AdminGuard',
  'JwtAuthGuard',
  // ./jwt-verifier.service, ./strategies/oidc.strategy
  'JwtVerifierService',
  'OidcStrategy',
  // ./user-context.util
  'buildUserContext',
  // ./user-identity.util
  'resolveActingUserId',
  // ./users/dto/user.dto
  'createUserSchema',
  'updateRolesSchema',
  'updateUserSchema',
  // ./users/*
  'UsersController',
  'UsersService',
] as const;

/** Type-only exports, asserted by the compiler through this declaration. */
type LegacyTypeExports = {
  apiKeyUser: facade.ApiKeyUser;
  createUser: facade.CreateUserDto;
  currentUserPayload: facade.CurrentUserPayload;
  delegatedProfile: facade.DelegatedOidcTrustProfile;
  delegationContext: facade.DelegationContext;
  jwtPayload: facade.JwtPayload;
  jwtUser: facade.JwtUser;
  roleWithPermissions: facade.RoleWithPermissions;
  updateRoles: facade.UpdateRolesDto;
  updateUser: facade.UpdateUserDto;
  userContext: facade.UserContext;
  verifiedClaims: facade.VerifiedDelegatedClaims;
};

/**
 * Read once through `Object.entries`, not per-name through `facade[name]`: a namespace object is
 * not an ordinary record, and indexing one defeats the bundler's ability to see what is used.
 */
const exported = new Map<string, unknown>(Object.entries(facade));

describe('public API compatibility', () => {
  it.each(LEGACY_VALUE_EXPORTS)('still exports %s', (name) => {
    expect(exported.has(name), `${name} is missing from the facade`).toBe(true);
    expect(exported.get(name), `${name} is exported but undefined`).toBeDefined();
  });

  it('exposes the type-only surface the compiler checks above', () => {
    // The assertion that matters happened at compile time; this keeps the type alive at runtime so
    // an unused-symbol cleanup cannot delete it silently.
    const shape: keyof LegacyTypeExports = 'jwtPayload';
    expect(shape).toBe('jwtPayload');
  });

  it('adds nothing beyond the legacy surface except the audit token bridge', () => {
    // A facade that grows new API defeats the point of a transition package (051 decision 6/7).
    const extra = [...exported.keys()].filter(
      (name) => !(LEGACY_VALUE_EXPORTS as readonly string[]).includes(name),
    );
    expect(extra.sort()).toEqual(['AUTH_AUDIT_LOG']);
  });
});

describe('AuthModule', () => {
  it('composes identity-core, oidc-auth and the host auth infrastructure', () => {
    const imports = Reflect.getMetadata('imports', facade.AuthModule) as { name?: string }[];
    expect(imports.map((entry) => entry.name)).toEqual([
      'AppspineAuthInfrastructureModule',
      'IdentityCoreModule',
      'OidcAuthModule',
    ]);
  });

  it('re-exports them, so an existing `imports: [AuthModule]` still sees their providers', () => {
    const exports = Reflect.getMetadata('exports', facade.AuthModule) as { name?: string }[];
    expect(exports.map((entry) => entry.name)).toEqual([
      'AppspineAuthInfrastructureModule',
      'IdentityCoreModule',
      'OidcAuthModule',
    ]);
  });

  it('stays global, exactly as the pre-split module was', () => {
    // 051 decision 3 removes the globals, but not in the release that splits the package: an App
    // relying on the global must not break before it has the tokens to stop relying on it.
    expect(Reflect.getMetadata('__module:global__', facade.AuthModule)).toBe(true);
  });
});

describe('legacy Prisma fragment', () => {
  const fragment = readFileSync(path.join(process.cwd(), 'prisma/user.prisma'), 'utf8');

  it('is unchanged, so an App that already copied it needs no migration', () => {
    // identity-core ships the split-out fragment without these relations; this one keeps them,
    // because every App's schema currently contains exactly this text (PL0-04 §4.1 "expand").
    expect(fragment).toContain('model User {');
    expect(fragment).toContain('userRoles UserRole[]');
    expect(fragment).toContain('actingApiKeys ApiKey[] @relation("ApiKeyActingUser")');
    expect(fragment).toContain('password  String?');
  });

  it('is still published under the subpath consumers reference', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { exports: Record<string, unknown>; files: string[] };
    expect(packageJson.exports['./prisma/user.prisma']).toBe('./prisma/user.prisma');
    expect(packageJson.files).toContain('prisma');
  });
});

describe('PL0-02 frozen baseline', () => {
  /**
   * PL1-13's acceptance is measured against the *pre-split* public API, which is what
   * `fixtures/051-pl0-baseline/snapshot.json` froze. Gate G1's independent review found that file
   * had been regenerated in place during Phase 1, which silently removed the thing the acceptance
   * compares to. It has been restored and the generator now refuses to overwrite it; this test is
   * what makes it load-bearing again rather than merely present.
   *
   * Symbol-level coverage is `LEGACY_VALUE_EXPORTS` above — the snapshot records entry points, not
   * exported names, so the two checks cover different halves of the same promise.
   */
  const baseline = JSON.parse(
    readFileSync(path.join(process.cwd(), '../../fixtures/051-pl0-baseline/snapshot.json'), 'utf8'),
  ) as { packages: Record<string, { exports: Record<string, unknown>; version: string }> };
  const frozen = baseline.packages['@appspine/auth'];
  const current = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
  };

  it('describes the pre-split package, not the post-split one', () => {
    // A canary: if this ever reads 15 packages including `identity-core`, the baseline has been
    // regenerated again and every assertion below became circular.
    expect(Object.keys(baseline.packages)).not.toContain('@appspine/identity-core');
    expect(Object.keys(baseline.packages)).not.toContain('@appspine/oidc-auth');
    expect(frozen.version).toBe('6.2.2');
  });

  it('still publishes every entry point the frozen baseline recorded', () => {
    for (const subpath of Object.keys(frozen.exports)) {
      expect(current.exports[subpath]).toBeDefined();
    }
  });
});
