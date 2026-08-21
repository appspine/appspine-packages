/**
 * `@appspine/oidc-delegation/plugin` — manifest and plugin descriptor (PL4-07).
 */

import {
  definePlugin,
  IDENTITY_DELEGATION,
  type IdentityDelegationPort,
  type PluginManifestV1,
} from '@appspine/plugin-api';
import {
  OIDC_DELEGATION_CONFIG,
  type OidcDelegationConfig,
  oidcDelegationConfigSchema,
} from './config';
import { OIDC_DELEGATION_MODULE_OPTIONS, OidcDelegationModule } from './oidc-delegation.module';
import { OidcDelegationService } from './oidc-delegation.service';
import type { OidcDelegationModuleOptions } from './types';

export {
  IDENTITY_DELEGATION,
  type IdentityDelegationPort,
  OIDC_DELEGATION_CONFIG,
  OIDC_DELEGATION_MODULE_OPTIONS,
  type OidcDelegationConfig,
  OidcDelegationModule,
  OidcDelegationService,
  oidcDelegationConfigSchema,
};

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const oidcDelegationManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'oidc-delegation',
  displayName: 'OIDC Token Delegation',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
    },
  },
  provides: ['appspine.identity-delegation'],
  requires: [],
  configSchema: { configRef: 'oidcDelegation' },
  environment: [
    {
      key: 'OIDC_DELEGATION_ENDPOINT',
      required: false,
      secret: false,
      description: 'Token endpoint URL for RFC 8693 token exchange.',
    },
    {
      key: 'OIDC_DELEGATION_SOURCE_CLIENT_ID',
      required: false,
      secret: false,
      description: 'Confidential client ID used to perform token exchange.',
    },
    {
      key: 'OIDC_DELEGATION_SOURCE_CLIENT_SECRET',
      required: false,
      secret: true,
      description: 'Client secret for the delegation client.',
    },
    {
      key: 'OIDC_DELEGATION_ISSUER_CLIENT_ID',
      required: false,
      secret: false,
      description: 'Client ID that issued the subject token.',
    },
  ],
  facets: {
    backend: {
      modulePath: './dist/oidc-delegation.module.js',
      exportName: 'OidcDelegationModule',
      providerTokens: ['appspine.identity-delegation'],
    },
    operations: {
      healthIndicatorId: 'oidc-delegation',
      metricsPrefix: 'oidc_delegation',
      shutdownTimeoutMs: 5000,
    },
  },
  integrationContracts: [
    {
      contractId: 'approve.submit-knowledge-document-change',
      version: '1.0.0',
      role: 'delegation-transport',
    },
    {
      contractId: 'wiki-to-approve.submit-knowledge-document-change',
      version: '1.0.0',
      role: 'delegation-client',
    },
  ],
};

export const oidcDelegationPlugin = definePlugin({
  manifest: oidcDelegationManifest,
  configSchema: oidcDelegationConfigSchema,
  backend: (ctx) => {
    const rawConfig = ctx?.config as Partial<OidcDelegationModuleOptions> | undefined;
    const options: OidcDelegationModuleOptions = {
      provider: 'keycloak',
      tokenEndpoint:
        rawConfig?.tokenEndpoint ??
        process.env.OIDC_DELEGATION_ENDPOINT ??
        process.env.OIDC_DELEGATION_TOKEN_ENDPOINT ??
        '',
      sourceClientId:
        rawConfig?.sourceClientId ?? process.env.OIDC_DELEGATION_SOURCE_CLIENT_ID ?? '',
      sourceClientSecret:
        rawConfig?.sourceClientSecret ?? process.env.OIDC_DELEGATION_SOURCE_CLIENT_SECRET ?? '',
      subjectTokenIssuerClientId:
        rawConfig?.subjectTokenIssuerClientId ??
        process.env.OIDC_DELEGATION_ISSUER_CLIENT_ID ??
        process.env.OIDC_DELEGATION_SUBJECT_TOKEN_ISSUER_CLIENT_ID ??
        '',
      allowInsecureTokenEndpoint:
        rawConfig?.allowInsecureTokenEndpoint ??
        process.env.OIDC_DELEGATION_ALLOW_INSECURE_HTTP === 'true',
      requestTimeoutMs: rawConfig?.requestTimeoutMs,
      maxExchangesPerMinutePerPolicy: rawConfig?.maxExchangesPerMinutePerPolicy,
      policies: rawConfig?.policies ?? {},
    };

    return {
      module: OidcDelegationModule,
      providers: [
        {
          provide: OIDC_DELEGATION_MODULE_OPTIONS,
          useValue: options,
        },
        {
          provide: OidcDelegationService,
          useFactory: () => new OidcDelegationService(options),
        },
        {
          provide: IDENTITY_DELEGATION,
          useExisting: OidcDelegationService,
        },
      ],
      exports: [OidcDelegationService, IDENTITY_DELEGATION],
    };
  },
});

export function oidcDelegation() {
  return oidcDelegationPlugin;
}

export default oidcDelegationPlugin;
