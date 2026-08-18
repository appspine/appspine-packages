/**
 * `@appspine/oidc-auth/plugin` — third pilot, second half (PL1-12).
 *
 * The shape that actually stresses the contract: it requires two capabilities from other plugins,
 * provides one that is mutually exclusive with a future plugin, contributes a Prisma model, and
 * registers a strategy with the host. If manifest v1 could not express this one, it could not
 * express identity at all.
 */

import { definePlugin, type PluginManifestV1 } from '@appspine/plugin-api';
import { oidcAuthConfigSchema } from './config';
import { OidcAuthModule } from './oidc-auth.module';

/** SHA-256 of `prisma/oidc-identity.prisma` with LF endings; `plugin.spec.ts` recomputes it. */
export const OIDC_AUTH_SCHEMA_DIGEST =
  'sha256:7f0cf0f5f74e87021cd49c654856223b0a1df7518cb53cac5a848cf9039dc45e';

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const oidcAuthManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'oidc-auth',
  displayName: 'OIDC Authentication',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
      '@prisma/client': '^6.2.0',
    },
  },
  provides: ['appspine.interactive-auth-provider', 'appspine.delegated-identity-verifier'],
  requires: [
    'appspine.identity-store',
    'appspine.authentication-strategy-registry',
    'appspine.principal-context',
    'appspine.prisma',
    'appspine.audit-sink',
  ],
  // Authorization can degrade to deny-all, but identity linking may never omit its audit record.
  optionalRequires: ['appspine.rbac-policy'],
  // 051 decision 8: exactly one interactive provider per App until an account-linking plan exists.
  conflicts: ['local-auth'],
  configSchema: { configRef: 'oidc' },
  environment: [
    { key: 'OIDC_ISSUER', required: true, secret: false },
    { key: 'OIDC_AUDIENCE', required: true, secret: false },
    { key: 'OIDC_JWKS_URL', required: true, secret: false },
  ],
  facets: {
    backend: {
      modulePath: './dist/oidc-auth.module.js',
      exportName: 'OidcAuthModule',
      controllerRoutes: ['auth'],
    },
    prisma: {
      owns: ['OidcIdentity'],
      schemaFragment: 'prisma/oidc-identity.prisma',
      schemaDigest: 'sha256:7f0cf0f5f74e87021cd49c654856223b0a1df7518cb53cac5a848cf9039dc45e',
    },
  },
};

export const oidcAuthPlugin = definePlugin({
  manifest: oidcAuthManifest,
  configSchema: oidcAuthConfigSchema,
  backend: (context) => OidcAuthModule.register(context.config),
});

export function oidcAuth() {
  return oidcAuthPlugin;
}

export { JwtVerifierService } from './jwt-verifier.service';
export { OidcAuthModule } from './oidc-auth.module';
export { OidcIdentityService } from './oidc-identity.service';
