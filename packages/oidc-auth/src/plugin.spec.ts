import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultHostEngine, parsePluginManifest } from '@appspine/plugin-api/loader';
import {
  AuthenticationStrategyRegistry,
  DuplicateAuthStrategyError,
} from '@appspine/plugin-host-nest';
import {
  bootHarness,
  buildManifest,
  expectBootOutcome,
  expectResolutionError,
  expectResolutionOk,
  inventoryEntry,
  resolveHarness,
} from '@appspine/plugin-testkit';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({ PrismaService: class PrismaService {} }));

import { oidcAuthConfigSchema } from './config';
import { OidcInteractiveStrategy } from './oidc-interactive.strategy';
import { OIDC_AUTH_SCHEMA_DIGEST, oidcAuth, oidcAuthManifest, oidcAuthPlugin } from './plugin';

const packageRoot = process.cwd();
const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Record<string, unknown>;
const manifestFile = JSON.parse(
  readFileSync(path.join(packageRoot, 'appspine.plugin.json'), 'utf8'),
) as Record<string, unknown>;

const HOST = {
  'appspine.prisma': {},
  'appspine.audit-sink': { record: async () => undefined },
  'appspine.principal-context': {},
  'appspine.authentication-strategy-registry': {},
};

const identityCore = buildManifest({
  id: 'identity-core',
  provides: ['appspine.identity-store'],
  requires: ['appspine.prisma', 'appspine.principal-context'],
});

describe('manifest', () => {
  it('matches the appspine.plugin.json shipped in the package', () => {
    expect(manifestFile).toEqual(oidcAuthManifest);
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
    expect(result.value.manifest.provides).toEqual([
      'appspine.interactive-auth-provider',
      'appspine.delegated-identity-verifier',
    ]);
  });

  it('declares the local-auth conflict 051 decision 8 requires of an interactive provider', () => {
    expect(oidcAuthManifest.conflicts).toEqual(['local-auth']);

    // Without it the manifest is rejected outright — the loader will not let an interactive
    // provider ship without saying what it excludes.
    const withoutConflicts = { ...manifestFile, conflicts: [] };
    const result = parsePluginManifest(withoutConflicts, {
      packageName: packageJson.name as string,
      packageVersion: packageJson.version as string,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((entry) => entry.code)).toContain(
      'interactive-provider-without-conflicts',
    );
  });

  it('declares its three OIDC environment keys, none of them a secret', () => {
    expect(oidcAuthManifest.environment?.map((entry) => entry.key)).toEqual([
      'OIDC_ISSUER',
      'OIDC_AUDIENCE',
      'OIDC_JWKS_URL',
    ]);
    // Issuer, audience and a JWKS URL are public metadata — marking them secret would hide values
    // an operator needs in diagnostics for no security benefit.
    expect(oidcAuthManifest.environment?.every((entry) => entry.secret === false)).toBe(true);
    expect(oidcAuthManifest.environment?.every((entry) => entry.required)).toBe(true);
  });

  it('publishes a config parser that fails closed before Nest bootstrap', () => {
    expect(
      oidcAuthConfigSchema.parse({
        issuer: 'https://issuer.example/realms/staff',
        audience: 'appspine-app',
        jwksUrl: 'https://issuer.example/realms/staff/protocol/openid-connect/certs',
      }),
    ).toMatchObject({ audience: 'appspine-app' });
    expect(() => oidcAuthConfigSchema.parse({ audience: 'missing-urls' })).toThrow();
  });

  it('records a schema digest that still matches the shipped Prisma fragment', () => {
    const fragment = readFileSync(
      path.join(packageRoot, 'prisma/oidc-identity.prisma'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(`sha256:${createHash('sha256').update(fragment, 'utf8').digest('hex')}`).toBe(
      OIDC_AUTH_SCHEMA_DIGEST,
    );
  });

  it('owns OidcIdentity keyed on (issuer, subject), with no FK back into User', () => {
    const fragment = readFileSync(path.join(packageRoot, 'prisma/oidc-identity.prisma'), 'utf8');
    expect(fragment).toContain('@@unique([issuer, subject])');
    expect(fragment).toContain('userId    String   @map("user_id")');
    // A relation would force identity-core's User to carry a back-relation for an optional plugin.
    expect(fragment).not.toMatch(/@relation/);
    expect(fragment).not.toMatch(/model User/);
  });

  it('requires identity, audit and the strategy registry, while treating RBAC as optional', () => {
    expect(oidcAuthManifest.requires).toContain('appspine.identity-store');
    expect(oidcAuthManifest.requires).toContain('appspine.authentication-strategy-registry');
    expect(oidcAuthManifest.requires).toContain('appspine.audit-sink');
    expect(oidcAuthManifest.optionalRequires).toEqual(['appspine.rbac-policy']);
  });
});

describe('resolution', () => {
  it('boots after identity-core, which it depends on', async () => {
    const { harness, catalog } = await bootHarness({
      plugins: [{ plugin: oidcAuthPlugin }, { plugin: { manifest: identityCore } }],
      inventory: [inventoryEntry('oidc-auth'), inventoryEntry('identity-core')],
      hostCapabilities: HOST,
    });

    expectBootOutcome(catalog, 'ready');
    expect(harness.graph.order).toEqual(['identity-core', 'oidc-auth']);
  });

  it('fails without an identity store rather than falling back to its own user table', () => {
    const result = resolveHarness({
      plugins: [{ plugin: oidcAuthPlugin }],
      inventory: [inventoryEntry('oidc-auth')],
      hostCapabilities: HOST,
    });
    expect(expectResolutionError(result, 'missing-required-capability').pluginId).toBe('oidc-auth');
  });

  it('refuses to coexist with a second interactive provider', () => {
    const localAuth = buildManifest({
      id: 'local-auth',
      provides: ['appspine.interactive-auth-provider'],
      requires: ['appspine.identity-store'],
      conflicts: ['oidc-auth'],
    });

    const result = resolveHarness({
      plugins: [
        { plugin: oidcAuthPlugin },
        { plugin: { manifest: identityCore } },
        { plugin: { manifest: localAuth } },
      ],
      inventory: [
        inventoryEntry('oidc-auth'),
        inventoryEntry('identity-core'),
        inventoryEntry('local-auth'),
      ],
      hostCapabilities: HOST,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((entry) => entry.code);
    expect(codes).toContain('plugin-conflict');
    expect(codes).toContain('duplicate-capability-provider');
  });

  it('coexists with a machine auth provider — they are different capabilities', () => {
    const apiKeys = buildManifest({
      id: 'm2m-api-key',
      provides: ['appspine.machine-auth-provider', 'appspine.scope-matcher'],
      requires: ['appspine.prisma', 'appspine.identity-store'],
    });

    const graph = expectResolutionOk(
      resolveHarness({
        plugins: [
          { plugin: oidcAuthPlugin },
          { plugin: { manifest: identityCore } },
          { plugin: { manifest: apiKeys } },
        ],
        inventory: [
          inventoryEntry('oidc-auth'),
          inventoryEntry('identity-core'),
          inventoryEntry('m2m-api-key'),
        ],
        hostCapabilities: HOST,
      }),
    );

    expect(graph.order).toContain('oidc-auth');
    expect(graph.order).toContain('m2m-api-key');
  });
});

describe('interactive strategy registration', () => {
  function contextWith(authorization?: string | string[]): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
    } as unknown as ExecutionContext;
  }

  function strategyWith(verify: (token: string) => Promise<unknown>) {
    return new OidcInteractiveStrategy({ verifyJwtToken: verify } as never);
  }

  it('registers as the single interactive provider for the App', () => {
    const registry = new AuthenticationStrategyRegistry();
    const strategy = strategyWith(async () => ({ sub: 'user-1' }));

    registry.register(strategy);
    expect(registry.describe()).toEqual([{ id: 'oidc', kind: 'interactive' }]);
    expect(() =>
      registry.register({ id: 'local-auth', kind: 'interactive', authenticate: async () => null }),
    ).toThrowError(DuplicateAuthStrategyError);
  });

  it('ignores a request with no bearer token so another strategy can try', async () => {
    const verify = vi.fn();
    const strategy = strategyWith(verify);

    await expect(strategy.authenticate(contextWith(undefined))).resolves.toBeNull();
    await expect(strategy.authenticate(contextWith('ApiKey abc'))).resolves.toBeNull();
    // Duplicate Authorization headers arrive as an array; picking one is not a guard's decision.
    await expect(strategy.authenticate(contextWith(['Bearer a', 'Bearer b']))).resolves.toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token instead of falling through to a weaker strategy', async () => {
    const strategy = strategyWith(async () => {
      throw new UnauthorizedException('token expired');
    });

    await expect(strategy.authenticate(contextWith('Bearer expired'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns the verified principal for a valid bearer token', async () => {
    const principal = { sub: 'user-1', email: 'a@b.c' };
    const strategy = strategyWith(async (token) => {
      expect(token).toBe('good-token');
      return principal;
    });

    await expect(strategy.authenticate(contextWith('Bearer good-token'))).resolves.toBe(principal);
  });
});

describe('descriptor', () => {
  it('exposes the module through both the constant and the factory', () => {
    expect(oidcAuth()).toBe(oidcAuthPlugin);
    expect(oidcAuthPlugin.id).toBe('oidc-auth');
  });
});
