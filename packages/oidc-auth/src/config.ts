import { z } from 'zod';

export const OIDC_AUTH_CONFIG = Symbol.for('appspine.oidc-auth.config');

export const oidcAuthConfigSchema = z.object({
  issuer: z.string().url(),
  audience: z.string().min(1),
  jwksUrl: z.string().url(),
});

export type OidcAuthConfig = z.infer<typeof oidcAuthConfigSchema>;

/** Compatibility path for Apps still importing `AuthModule` instead of the plugin descriptor. */
export function oidcAuthConfigFromEnvironment(): OidcAuthConfig {
  const input = {
    issuer: process.env.OIDC_ISSUER,
    audience: process.env.OIDC_AUDIENCE,
    jwksUrl: process.env.OIDC_JWKS_URL,
  };
  if (!input.issuer || !input.audience || !input.jwksUrl) {
    throw new Error(
      'OIDC_JWKS_URL, OIDC_ISSUER and OIDC_AUDIENCE must all be set to start under AUTH_MODE=oidc.',
    );
  }
  return oidcAuthConfigSchema.parse(input);
}
