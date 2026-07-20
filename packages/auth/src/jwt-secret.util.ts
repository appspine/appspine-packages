/**
 * JWT_SECRET is only load-bearing under AUTH_MODE=local (the default): it signs/verifies
 * the HS256 tokens issued by this package's own login/register endpoints. Under
 * AUTH_MODE=oidc, register/login 404 (auth.controller.ts) and verification goes through
 * verifyOidcJwtToken (RS256 via JWKS), so JWT_SECRET is never read on that path — this
 * function only requires it when local mode is actually reachable, so OIDC-only
 * deployments aren't forced to configure an unused secret.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.AUTH_MODE === 'oidc') {
    return 'unused-under-oidc-mode';
  }

  throw new Error(
    'JWT_SECRET is not set. AUTH_MODE=local (the default) signs and verifies JWTs with ' +
      'this secret — refusing to start with an insecure hardcoded default.',
  );
}
