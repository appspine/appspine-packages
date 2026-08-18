import type { IdentityCoreFrontendContribution } from '@appspine/identity-core/frontend';
import { oidcAuthConfigSchema } from '@appspine/oidc-auth';
import type { OidcAuthFrontendContribution } from '@appspine/oidc-auth/frontend';
import type { PluginManifestV1 } from '@appspine/plugin-api';
import { createAppspineModule } from '@appspine/plugin-host-nest';

const config = oidcAuthConfigSchema.parse({
  issuer: 'https://issuer.example/realms/test',
  audience: 'clean-consumer',
  jwksUrl: 'https://issuer.example/realms/test/protocol/openid-connect/certs',
});

export function acceptsPublishedTypes(
  manifest: PluginManifestV1,
  identityFrontend?: IdentityCoreFrontendContribution,
  oidcFrontend?: OidcAuthFrontendContribution,
) {
  void identityFrontend;
  void oidcFrontend;
  void createAppspineModule;
  return { config, pluginId: manifest.id };
}
