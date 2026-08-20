/**
 * PL1-14 clean-consumer checks.
 *
 * Runs inside a temp directory whose `node_modules` came from `npm install <tarball>` — no
 * workspace symlinks, no chance of a package resolving to its own source tree and quietly passing
 * on files it does not actually publish.
 *
 * Four things are being proven, in order:
 *   1. the published `exports` map resolves from both CJS and ESM;
 *   2. each plugin's `appspine.plugin.json` and Prisma fragment are actually in the tarball;
 *   3. a real Nest App boots in *plugin mode* through `createAppspineModule`, with all four
 *      pilots wired, and reports a catalog;
 *   4. v3 no longer publishes the transition-only auth, capability UI, mixed guard, or global
 *      module bridges.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

process.env.OIDC_ISSUER ??= 'https://issuer.example/realms/test';
process.env.OIDC_AUDIENCE ??= 'clean-consumer';
process.env.OIDC_JWKS_URL ??= 'https://issuer.example/realms/test/protocol/openid-connect/certs';

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// --- 1. resolution -----------------------------------------------------------------------------

check('CommonJS require resolves every published entry point', () => {
  const pluginApi = require('@appspine/plugin-api');
  assert.equal(typeof pluginApi.definePlugin, 'function');
  assert.equal(pluginApi.AUDIT_SINK, Symbol.for('appspine.audit-sink'));

  const loader = require('@appspine/plugin-api/loader');
  assert.equal(typeof loader.loadPluginManifest, 'function');
  const resolver = require('@appspine/plugin-api/resolver');
  assert.equal(typeof resolver.resolvePlugins, 'function');
  const runtime = require('@appspine/plugin-api/runtime');
  assert.equal(typeof runtime.PluginLifecycleRunner, 'function');
  const schema = require('@appspine/plugin-api/schema');
  assert.equal(schema.manifestV1Schema.$id, 'https://appspine.dev/schema/appspine.plugin.v1.json');

  for (const name of ['health-check', 'audit-log', 'identity-core', 'oidc-auth']) {
    const plugin = require(`@appspine/${name}/plugin`);
    assert.ok(plugin, `@appspine/${name}/plugin did not resolve`);
  }
});

check('ESM import resolves the same entry points', async () => {
  const pluginApi = await import('@appspine/plugin-api');
  assert.equal(typeof pluginApi.definePlugin, 'function');
  const host = await import('@appspine/plugin-host-nest');
  assert.equal(typeof host.createAppspineModule, 'function');
  const testkit = await import('@appspine/plugin-testkit');
  assert.equal(typeof testkit.buildManifest, 'function');
});

// --- 2. published files ------------------------------------------------------------------------

check('each plugin ships its manifest, and the manifest passes the real loader', () => {
  const {
    loadPluginManifest,
    defaultHostEngine,
    unwrapManifest,
  } = require('@appspine/plugin-api/loader');

  for (const name of ['health-check', 'audit-log', 'identity-core', 'oidc-auth']) {
    const packageDir = path.dirname(require.resolve(`@appspine/${name}/package.json`));
    assert.ok(
      existsSync(path.join(packageDir, 'appspine.plugin.json')),
      `@appspine/${name} tarball is missing appspine.plugin.json`,
    );

    const loaded = unwrapManifest(
      loadPluginManifest(packageDir, {
        host: defaultHostEngine({
          frameworks: {
            '@nestjs/common': require('@nestjs/common/package.json').version,
            '@nestjs/core': require('@nestjs/core/package.json').version,
            '@prisma/client': require('@prisma/client/package.json').version,
          },
        }),
      }),
    );
    assert.equal(loaded.packageName, `@appspine/${name}`);
    assert.ok(loaded.digest.startsWith('sha256:'));

    const fragment = loaded.manifest.facets.prisma?.schemaFragment;
    if (fragment) {
      assert.ok(
        existsSync(path.join(packageDir, fragment)),
        `@appspine/${name} declares ${fragment} but does not publish it`,
      );
    }
  }
});

check('TypeScript declarations are published for every subpath', () => {
  for (const entry of [
    '@appspine/plugin-api',
    '@appspine/plugin-api/loader',
    '@appspine/plugin-api/resolver',
    '@appspine/plugin-api/runtime',
    '@appspine/plugin-host-nest',
    '@appspine/plugin-testkit',
    '@appspine/health-check/plugin',
    '@appspine/audit-log/plugin',
    '@appspine/identity-core/plugin',
    '@appspine/identity-core/frontend',
    '@appspine/oidc-auth/plugin',
    '@appspine/oidc-auth/frontend',
  ]) {
    const js = require.resolve(entry);
    const dts = js.replace(/\.js$/, '.d.ts');
    assert.ok(existsSync(dts), `${entry} resolves to ${js} with no ${path.basename(dts)}`);
  }
});

// --- 3. plugin mode --------------------------------------------------------------------------

check('a real Nest App boots through the plugin host and reports a catalog', async () => {
  await import('reflect-metadata');
  const { Test } = await import('@nestjs/testing');
  const { PrismaModule } = await import('@appspine/common');
  const { createAppspineModule, AppspinePluginHost } = await import('@appspine/plugin-host-nest');
  const { healthCheckPlugin } = await import('@appspine/health-check/plugin');
  const { auditLogPlugin } = await import('@appspine/audit-log/plugin');
  const { identityCorePlugin } = await import('@appspine/identity-core/plugin');
  const { oidcAuthPlugin } = await import('@appspine/oidc-auth/plugin');
  const { rbacPlugin } = await import('@appspine/rbac/plugin');
  const { m2mApiKeyPlugin } = await import('@appspine/m2m-api-key/plugin');
  const { mcpServerPlugin } = await import('@appspine/mcp-server/plugin');
  const { PrismaClient } = require('@prisma/client');

  const appspine = createAppspineModule({
    inventory: [
      { plugin: '@appspine/health-check', instanceId: 'default', enabled: true, required: true },
      { plugin: '@appspine/audit-log', instanceId: 'default', enabled: true, required: true },
      { plugin: '@appspine/identity-core', instanceId: 'default', enabled: true, required: true },
      {
        plugin: '@appspine/oidc-auth',
        instanceId: 'default',
        enabled: true,
        required: true,
        configRef: 'oidc',
      },
      { plugin: '@appspine/rbac', instanceId: 'default', enabled: true, required: true },
      { plugin: '@appspine/m2m-api-key', instanceId: 'default', enabled: true, required: true },
      { plugin: '@appspine/mcp-server', instanceId: 'default', enabled: true, required: true },
    ],
    plugins: [
      {
        plugin: healthCheckPlugin,
        packageVersion: require('@appspine/health-check/package.json').version,
      },
      {
        plugin: auditLogPlugin,
        packageVersion: require('@appspine/audit-log/package.json').version,
      },
      {
        plugin: identityCorePlugin,
        packageVersion: require('@appspine/identity-core/package.json').version,
      },
      {
        plugin: oidcAuthPlugin,
        packageVersion: require('@appspine/oidc-auth/package.json').version,
      },
      {
        plugin: rbacPlugin,
        packageVersion: require('@appspine/rbac/package.json').version,
      },
      {
        plugin: m2mApiKeyPlugin,
        packageVersion: require('@appspine/m2m-api-key/package.json').version,
      },
      {
        plugin: mcpServerPlugin,
        packageVersion: require('@appspine/mcp-server/package.json').version,
      },
    ],
    hostCapabilities: { 'appspine.prisma': new PrismaClient() },
    runtime: {
      oidc: {
        issuer: process.env.OIDC_ISSUER,
        audience: process.env.OIDC_AUDIENCE,
        jwksUrl: process.env.OIDC_JWKS_URL,
      },
    },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, appspine],
  }).compile();
  await moduleRef.init();

  const host = moduleRef.get(AppspinePluginHost);
  const described = host.describe();

  assert.equal(described.outcome, 'ready');
  assert.deepEqual([...described.order].sort(), [
    'audit-log',
    'health-check',
    'identity-core',
    'm2m-api-key',
    'mcp-server',
    'oidc-auth',
    'rbac',
  ]);
  assert.ok(described.order.indexOf('audit-log') < described.order.indexOf('rbac'));
  assert.ok(described.order.indexOf('identity-core') < described.order.indexOf('oidc-auth'));
  assert.ok(described.order.indexOf('rbac') < described.order.indexOf('m2m-api-key'));
  assert.deepEqual(described.shutdownOrder, [...described.order].reverse());
  assert.deepEqual(host.health(), { status: 'ready', degraded: [], failed: [] });

  // The strategy registry is the host-owned capability oidc-auth registered into (PL1-11).
  assert.deepEqual(
    [...described.authenticationStrategies].sort((left, right) => left.id.localeCompare(right.id)),
    [
      { id: 'api-key', kind: 'machine' },
      { id: 'oidc', kind: 'interactive' },
    ],
  );

  // Every plugin reports the version that was actually installed, not a workspace placeholder.
  for (const entry of described.plugins) {
    assert.ok(entry.digest.startsWith('sha256:'), `${entry.key} has no manifest digest`);
    assert.notEqual(entry.package, `${entry.pluginId}@0.0.0-unknown`);
  }

  await moduleRef.close();
});

check('a required plugin whose capability is missing aborts composition', async () => {
  const { createAppspineModule } = await import('@appspine/plugin-host-nest');
  const { oidcAuthPlugin } = await import('@appspine/oidc-auth/plugin');

  assert.throws(
    () =>
      createAppspineModule({
        inventory: [
          { plugin: '@appspine/oidc-auth', instanceId: 'default', enabled: true, required: true },
        ],
        plugins: [{ plugin: oidcAuthPlugin }],
        hostCapabilities: { 'appspine.prisma': {} },
      }),
    /missing-required-capability/,
  );
});

// --- 4. v3 removal boundaries ----------------------------------------------------------------

check('v3 packages expose no transition-only capability surfaces or global bridges', async () => {
  await import('reflect-metadata');
  const frontendShellEntry = require.resolve('@appspine/frontend-shell');
  const frontendShellBarrel = readFileSync(frontendShellEntry, 'utf8');
  for (const removedPath of [
    'users-table',
    'roles-table',
    'api-keys-table',
    'domain-events-table',
    'login-button',
    'auth-error',
    '/notification/',
  ]) {
    assert.equal(
      frontendShellBarrel.includes(removedPath),
      false,
      `frontend-shell still exports ${removedPath}`,
    );
  }
  assert.throws(
    () => require.resolve('@appspine/frontend-shell/notification'),
    /not defined by "exports"|Package subpath/,
  );

  const m2m = await import('@appspine/m2m-api-key');
  assert.equal(m2m.JwtOrApiKeyGuard, undefined);

  const { AuditLogModule } = await import('@appspine/audit-log');
  const { RbacModule } = await import('@appspine/rbac');
  const { ApiKeysModule } = m2m;
  const { McpModule } = await import('@appspine/mcp-server');
  for (const moduleClass of [AuditLogModule, RbacModule, ApiKeysModule, McpModule]) {
    const isGlobal =
      Reflect.getMetadata('__module:global__', moduleClass) ??
      Reflect.getMetadata('global', moduleClass);
    assert.equal(isGlobal, undefined, `${moduleClass.name} is still global`);
  }
});

// --- run ----------------------------------------------------------------------------------------

let failed = 0;
for (const { name, fn } of checks) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}\n      ${error?.message ?? error}`);
  }
}

console.log(`\n${checks.length} clean-consumer checks run, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
