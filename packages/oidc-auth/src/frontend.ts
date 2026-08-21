/**
 * Phase 3 frontend facet exports for `@appspine/oidc-auth/frontend` (PL3-04).
 */
export interface OidcAuthFrontendContribution {
  readonly kind: 'appspine.oidc-auth.frontend';
}

// Named re-exports, not `export * from`: see frontend/index.ts for why -- a `for...in`-based
// re-export silently drops anything backed by an RSC client-reference proxy.
export { isNextRedirectError, LoginButton, mapAuthErrorKey } from './frontend/index.js';
export type { AuthErrorKey, LoginButtonProps } from './frontend/index.js';
